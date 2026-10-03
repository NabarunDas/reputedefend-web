-- Case communications workspace reads, plus the one admin reconciliation
-- the outgoing-mail model did not already expose.
--
-- admin_communication_list_v1 can filter by case, but it stops at 50 rows and
-- 8 events with no signal that anything was left out. admin_conversation_list_v1
-- has no case parameter at all, so a case page cannot use it without reading
-- every conversation and dropping the rest in the application. Neither is a
-- safe case history.
--
-- canReplace copies the address, case, suppression and open-request checks
-- resend_draft already applies. It does not decide that a template is approved.
-- The draft command still does that, and it checks the rule again.
--
-- There is also no admin command that can record a provider message id after
-- ACCEPTANCE_UNKNOWN. The worker refuses a second provider call once the
-- 23-hour idempotency window has closed, and nothing in this migration opens
-- that window, clears the status so a new send can start, or lets an operator
-- mark the message delivered. Delivery still changes only when a stored
-- provider webhook is applied by the existing private reconcile function.
--
-- A provider message id already stored on another communication is refused
-- before the update, so the unique index is not the operator's error. Neither
-- row is changed.
--
-- The historical command functions are not edited. This migration renames each
-- one, moves that core into admin_private, and puts a closed-case guard in
-- front of it. service_role can execute only the public wrappers. A
-- communication linked to a CLOSED or CANCELLED case cannot newly become
-- QUEUED. contact_recovery cannot create a task for such a case. Cancelling an
-- unsent draft is left to the existing command.

BEGIN;

CREATE FUNCTION public.admin_case_communications_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.cases;
  verified text;
  verified_suppressed boolean := false;
  total_count integer := 0;
  items jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_case IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO target FROM public.cases WHERE id = p_case;
  IF target.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;

  SELECT verified_value INTO verified
    FROM public.customer_contact_verifications
    WHERE customer_id = target.customer_id AND channel = 'email';
  SELECT EXISTS (
    SELECT 1 FROM admin_private.email_suppressions s
    WHERE s.address_normalized = admin_private.normalize_email_v1(verified)
  ) INTO verified_suppressed;

  SELECT count(*)::integer INTO total_count FROM public.communications WHERE case_id = target.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'caseId', c.case_id,
    'caseReference', target.public_ref,
    'evidenceRequestId', c.evidence_request_id,
    'communicationType', c.communication_type,
    'templateKey', c.template_key,
    'templateVersion', c.template_version,
    'lifecycle', c.lifecycle,
    'deliveryStatus', c.delivery_status,
    'legacyStatus', CASE WHEN c.lifecycle IS NULL THEN c.status ELSE NULL END,
    'recipient', c.recipient,
    'subject', c.subject,
    'bodyText', c.body_text,
    'provider', c.provider,
    'providerMessageId', c.provider_message_id,
    'lastError', c.error_message,
    'contentLocked', c.content_locked,
    'contentVersion', c.content_version,
    'version', c.record_version,
    'draftedAt', c.created_at,
    'reviewedAt', c.reviewed_at,
    'queuedAt', c.queued_at,
    'firstProviderAttemptAt', c.first_provider_attempt_at,
    'providerAcceptedAt', c.provider_accepted_at,
    'deliveredAt', c.delivered_at,
    'failedAt', c.failed_at,
    'cancelledAt', c.cancelled_at,
    'supersededBy', c.superseded_by,
    'canReplace', (
      c.lifecycle IS NOT NULL
      AND c.delivery_status IN ('BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED')
      AND target.status NOT IN ('CLOSED', 'CANCELLED')
      AND verified IS NOT NULL
      AND admin_private.normalize_email_v1(verified) LIKE '%_@_%.%'
      AND admin_private.normalize_email_v1(verified) <> admin_private.normalize_email_v1(c.recipient)
      AND NOT verified_suppressed
      AND (
        c.template_key IS DISTINCT FROM 'EVIDENCE_REQUEST'
        OR EXISTS (
          SELECT 1 FROM public.evidence_requests er
          WHERE er.id = c.evidence_request_id AND er.case_id = target.id AND er.status = 'OPEN'
        )
      )
    ),
    'eventsTruncated', (
      SELECT count(*) > 24 FROM admin_private.communication_delivery_events de
      WHERE de.communication_id = c.id
    ),
    'events', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'eventType', e.event_type,
        'occurredAt', e.occurred_at,
        'summary', e.summary,
        'providerMessageId', e.provider_message_id
      ) ORDER BY e.occurred_at DESC, e.id DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM admin_private.communication_delivery_events de
        WHERE de.communication_id = c.id
        ORDER BY de.occurred_at DESC, de.id DESC
        LIMIT 24
      ) e
    )
  ) ORDER BY c.updated_at DESC, c.id DESC), '[]'::jsonb) INTO items
  FROM (
    SELECT * FROM public.communications
    WHERE case_id = target.id
    ORDER BY updated_at DESC, id DESC
    LIMIT 100
  ) c;

  RETURN jsonb_build_object(
    'status', 'success',
    'complete', total_count <= 100,
    'total', total_count,
    'returned', jsonb_array_length(items),
    'verifiedEmail', verified,
    'verifiedEmailSuppressed', verified_suppressed,
    'communications', items
  );
END;
$$;

CREATE FUNCTION public.admin_case_conversations_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total_count integer := 0;
  items jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_case IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cases WHERE id = p_case) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT count(*)::integer INTO total_count FROM public.conversations WHERE case_id = p_case;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'state', c.state,
    'subject', c.subject,
    'sender', m.sender_address,
    'receivedAt', coalesce(m.received_at, c.last_activity_at),
    'caseId', c.case_id,
    'caseReference', cs.public_ref,
    'senderMatch', coalesce(m.sender_match, 'NONE'),
    'hasAttachment', EXISTS (SELECT 1 FROM public.conversation_attachments a WHERE a.conversation_id = c.id),
    'assignedAdminId', c.assigned_admin_id,
    'needsAttention', c.needs_attention,
    'version', c.record_version
  ) ORDER BY c.last_activity_at DESC, c.id DESC), '[]'::jsonb) INTO items
  FROM (
    SELECT * FROM public.conversations
    WHERE case_id = p_case
    ORDER BY last_activity_at DESC, id DESC
    LIMIT 100
  ) c
  LEFT JOIN public.cases cs ON cs.id = c.case_id
  LEFT JOIN LATERAL (
    SELECT sender_address, sender_match, received_at
    FROM public.conversation_messages
    WHERE conversation_id = c.id AND kind = 'INBOUND_EMAIL'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  ) m ON true;

  RETURN jsonb_build_object(
    'status', 'success',
    'complete', total_count <= 100,
    'total', total_count,
    'returned', jsonb_array_length(items),
    'conversations', items
  );
END;
$$;

-- Records that the provider accepted a queued message whose acceptance was
-- unknown. It never writes DELIVERED itself. A stored provider webhook may
-- still be applied afterwards by communication_reconcile_webhooks_v1, which
-- is the only way this call can end on delivery.
CREATE FUNCTION public.admin_communication_reconcile_acceptance_v1(
  p_token text,
  p_request uuid,
  p_case uuid,
  p_communication uuid,
  p_version integer,
  p_provider_message_id text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  result jsonb;
  row public.communications;
  message text;
  reason text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_communication IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  message := left(btrim(coalesce(p_provider_message_id, '')), 200);
  reason := btrim(coalesce(p_reason, ''));
  IF message = '' OR length(message) > 200 OR length(reason) NOT BETWEEN 10 AND 500 OR reason ~* '<[^>]+>' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fp := md5(jsonb_build_array('reconcile_acceptance', p_case, p_communication, p_version, message, reason)::text);
  cached := admin_private.communication_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL OR row.case_id IS DISTINCT FROM p_case OR row.lifecycle IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF row.record_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF row.lifecycle <> 'QUEUED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.communications other
    WHERE other.id <> row.id
      AND other.lifecycle IS NOT NULL
      AND other.provider = 'resend'
      AND other.provider_message_id = message
  ) THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  IF row.delivery_status = 'PROVIDER_ACCEPTED' AND row.provider_message_id = message THEN
    PERFORM admin_private.communication_reconcile_webhooks_v1(row.id, 'resend', message);
    SELECT * INTO row FROM public.communications WHERE id = row.id;
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'deliveryStatus', row.delivery_status, 'replay', true);
    INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.delivery_status IS DISTINCT FROM 'ACCEPTANCE_UNKNOWN' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  BEGIN
    UPDATE public.communications
      SET status = 'SENT',
          delivery_status = 'PROVIDER_ACCEPTED',
          provider = 'resend',
          provider_message_id = message,
          provider_accepted_at = now(),
          first_provider_attempt_at = coalesce(first_provider_attempt_at, now()),
          delivery_occurred_at = coalesce(delivery_occurred_at, now()),
          sent_at = coalesce(sent_at, now()),
          error_message = NULL,
          updated_at = now(),
          record_version = row.record_version + 1
      WHERE id = row.id AND delivery_status = 'ACCEPTANCE_UNKNOWN' AND record_version = p_version
      RETURNING * INTO row;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'denied');
  END;

  PERFORM admin_private.append_delivery_event_v1(
    row.id, 'PROVIDER_ACCEPTED', 'Email provider accepted the message', 'resend', NULL, message, now()
  );
  PERFORM admin_private.communication_reconcile_webhooks_v1(row.id, 'resend', message);
  SELECT * INTO row FROM public.communications WHERE id = row.id;
  result := jsonb_build_object(
    'status', 'success', 'id', row.id, 'version', row.record_version,
    'deliveryStatus', row.delivery_status, 'replay', false
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
    'Recorded provider acceptance during reconciliation. This is not delivery.',
    jsonb_build_object('operation', 'reconcile_acceptance', 'providerMessageId', message, 'reason', reason, 'deliveryStatus', row.delivery_status)
  );
  INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_case_communications_v1(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_case_conversations_v1(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_communication_reconcile_acceptance_v1(text, uuid, uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_case_communications_v1(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_conversations_v1(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_communication_reconcile_acceptance_v1(text, uuid, uuid, uuid, integer, text, text) TO service_role;

-- Newly entering the customer-send path. An already queued message can still
-- receive provider events. Cancelling a draft does not come through here.
CREATE FUNCTION admin_private.refuse_closed_case_customer_send_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  case_status text;
BEGIN
  IF NEW.lifecycle IS DISTINCT FROM 'QUEUED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.lifecycle = 'QUEUED' THEN RETURN NEW; END IF;
  SELECT status INTO case_status FROM public.cases WHERE id = NEW.case_id;
  IF case_status IN ('CLOSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'closed_case_send_refused' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.refuse_closed_case_customer_send_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER communications_refuse_closed_case_send
  BEFORE INSERT OR UPDATE OF lifecycle ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.refuse_closed_case_customer_send_v1();

ALTER FUNCTION public.admin_communication_command_v1(text, uuid, text, jsonb, integer)
  RENAME TO admin_communication_command_core_v1;
ALTER FUNCTION public.admin_communication_command_core_v1(text, uuid, text, jsonb, integer)
  SET SCHEMA admin_private;

CREATE FUNCTION public.admin_communication_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  case_status text;
  result jsonb;
BEGIN
  IF btrim(coalesce(p_operation, '')) = 'queue'
    AND p_payload IS NOT NULL
    AND jsonb_typeof(p_payload) = 'object'
    AND NULLIF(p_payload->>'communicationId', '') IS NOT NULL
  THEN
    SELECT c.status INTO case_status
      FROM public.communications m
      JOIN public.cases c ON c.id = m.case_id
      WHERE m.id = NULLIF(p_payload->>'communicationId', '')::uuid
      FOR UPDATE OF c;
    IF case_status IN ('CLOSED', 'CANCELLED') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  END IF;
  BEGIN
    result := admin_private.admin_communication_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
    RETURN result;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'closed_case_send_refused' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    RAISE;
  END;
END;
$$;

ALTER FUNCTION public.admin_conversation_command_v1(text, uuid, text, jsonb, integer)
  RENAME TO admin_conversation_command_core_v1;
ALTER FUNCTION public.admin_conversation_command_core_v1(text, uuid, text, jsonb, integer)
  SET SCHEMA admin_private;

CREATE FUNCTION public.admin_conversation_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  case_status text;
  result jsonb;
BEGIN
  IF btrim(coalesce(p_operation, '')) = 'contact_recovery'
    AND p_payload IS NOT NULL
    AND jsonb_typeof(p_payload) = 'object'
    AND NULLIF(p_payload->>'conversationId', '') IS NOT NULL
  THEN
    SELECT c.status INTO case_status
      FROM public.conversations v
      JOIN public.cases c ON c.id = v.case_id
      WHERE v.id = NULLIF(p_payload->>'conversationId', '')::uuid
      FOR UPDATE OF c;
    IF case_status IN ('CLOSED', 'CANCELLED') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  END IF;
  result := admin_private.admin_conversation_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.admin_communication_command_core_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.admin_conversation_command_core_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_communication_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_conversation_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_communication_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_conversation_command_v1(text, uuid, text, jsonb, integer) TO service_role;

COMMIT;
