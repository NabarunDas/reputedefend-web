BEGIN;

-- UX-10I. Customer-safe reads for messages that already exist, and for the
-- authenticated customer's own identity. This migration adds no table, no
-- message state, and no account-edit command. Portal composition stays
-- unavailable: the existing model has no customer-authored portal message.
--
-- Outbound content is visible only after it has left draft and review, the
-- snapshot is locked, and delivery is PROVIDER_ACCEPTED or DELIVERED.
-- PROVIDER_ACCEPTED is not described as delivered. Inbound email is visible
-- only on a case the portal customer owns, and only when the sender is that
-- customer's current verified email. A matching sender address is not
-- authentication, so the portal does not call that mail "You". Thread titles
-- come only from customer-visible entries, never from conversations.subject.
-- An outbound row is shown inside a case conversation only when its canonical
-- case parent is that conversation's case. Phone notes, loops, and rejected
-- imports stay internal. Attachments are not exposed.
--
-- Rollback: DROP the functions created below. Do not edit applied migrations.
-- Forward fix: a later migration may CREATE OR REPLACE these functions.
-- No new index: selectors are computed. This migration is source review
-- only. Do not apply it from this change.

CREATE FUNCTION admin_private.customer_portal_message_selector_v1(p_prefix text, p_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=''
AS $$
  SELECT p_prefix || encode(extensions.digest(p_id::text, 'sha256'), 'hex')
  WHERE p_prefix IN ('mc-', 'mm-') AND p_id IS NOT NULL;
$$;

-- Queued, locked, and accepted or delivered. Draft, reviewed, cancelled,
-- unknown, bounced, and failed rows stay out. Ownership follows the existing
-- parent: the case, the Guard alert, or the monitoring request.
CREATE FUNCTION admin_private.customer_portal_outbound_visible_v1(
  p_communication public.communications,
  p_customer uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=''
AS $$
  SELECT p_customer IS NOT NULL
    AND p_communication.direction = 'OUTBOUND'
    AND p_communication.lifecycle = 'QUEUED'
    AND p_communication.content_locked IS TRUE
    AND p_communication.delivery_status IN ('PROVIDER_ACCEPTED', 'DELIVERED')
    AND p_communication.body_text IS NOT NULL
    AND length(btrim(p_communication.body_text)) > 0
    AND (p_communication.customer_id IS NULL OR p_communication.customer_id = p_customer)
    AND (
      EXISTS (
        SELECT 1 FROM public.cases parent_case
        WHERE parent_case.id = p_communication.case_id
          AND parent_case.customer_id = p_customer
      )
      OR EXISTS (
        SELECT 1 FROM public.guard_alerts alert
        WHERE alert.id = p_communication.guard_alert_id
          AND alert.customer_id = p_customer
      )
      OR EXISTS (
        SELECT 1 FROM public.monitoring_requests request
        WHERE request.id = p_communication.monitoring_request_id
          AND request.customer_id = p_customer
      )
    );
$$;

-- The stored sender-match flag is not authority. The sender address has to
-- be this customer's current verified email, on a case that customer owns.
CREATE FUNCTION admin_private.customer_portal_inbound_visible_v1(
  p_message public.conversation_messages,
  p_customer uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=''
AS $$
  SELECT p_customer IS NOT NULL
    AND p_message.kind = 'INBOUND_EMAIL'
    AND p_message.import_status = 'IMPORTED'
    AND p_message.loop_class = 'NONE'
    AND p_message.body_text IS NOT NULL
    AND length(btrim(p_message.body_text)) > 0
    AND p_message.sender_address IS NOT NULL
    AND lower(p_message.sender_address) = admin_private.verified_current_email_v1(p_customer)
    AND EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.cases parent_case ON parent_case.id = conv.case_id
      WHERE conv.id = p_message.conversation_id
        AND conv.state IN ('OPEN', 'CLOSED')
        AND parent_case.customer_id = p_customer
        AND (conv.customer_id IS NULL OR conv.customer_id = p_customer)
    );
$$;

CREATE FUNCTION admin_private.customer_portal_message_threads_v1(p_customer uuid)
RETURNS TABLE (
  selector text,
  subject text,
  case_reference text,
  business_name text,
  location_name text,
  activity_at timestamptz,
  state_label text,
  preview text
)
LANGUAGE sql
STABLE
SET search_path=''
AS $$
  WITH visible_outbound AS (
    SELECT
      comm.id,
      comm.conversation_id,
      comm.case_id,
      comm.subject,
      comm.body_text,
      coalesce(comm.delivered_at, comm.provider_accepted_at, comm.queued_at, comm.created_at) AS activity_at
    FROM public.communications comm
    WHERE admin_private.customer_portal_outbound_visible_v1(comm, p_customer) IS TRUE
  ),
  visible_inbound AS (
    SELECT
      msg.id,
      msg.conversation_id,
      msg.subject,
      msg.body_text,
      coalesce(msg.received_at, msg.created_at) AS activity_at
    FROM public.conversation_messages msg
    WHERE admin_private.customer_portal_inbound_visible_v1(msg, p_customer) IS TRUE
  ),
  conversation_threads AS (
    SELECT
      admin_private.customer_portal_message_selector_v1('mc-', conv.id) AS selector,
      coalesce(nullif(btrim(latest.subject), ''), 'Message') AS subject,
      parent_case.public_ref AS case_reference,
      biz.display_name AS business_name,
      loc.location_name AS location_name,
      latest.activity_at,
      CASE conv.state
        WHEN 'OPEN' THEN 'Open conversation'
        ELSE 'Previous conversation'
      END AS state_label,
      left(btrim(regexp_replace(latest.body_text, '[[:space:]]+', ' ', 'g')), 180) AS preview
    FROM public.conversations conv
    JOIN public.cases parent_case ON parent_case.id = conv.case_id AND parent_case.customer_id = p_customer
    JOIN public.businesses biz ON biz.id = parent_case.business_id
    JOIN public.locations loc ON loc.id = parent_case.location_id AND loc.business_id = parent_case.business_id
    JOIN LATERAL (
      SELECT entry.activity_at, entry.subject, entry.body_text
      FROM (
        SELECT outbound.activity_at, outbound.subject, outbound.body_text, outbound.id
        FROM visible_outbound outbound
        WHERE outbound.conversation_id = conv.id
          AND outbound.case_id = conv.case_id
        UNION ALL
        SELECT inbound.activity_at, inbound.subject, inbound.body_text, inbound.id
        FROM visible_inbound inbound
        WHERE inbound.conversation_id = conv.id
      ) entry
      ORDER BY entry.activity_at DESC, entry.id DESC
      LIMIT 1
    ) latest ON true
    WHERE conv.state IN ('OPEN', 'CLOSED')
      AND (conv.customer_id IS NULL OR conv.customer_id = p_customer)
  ),
  standalone AS (
    SELECT
      admin_private.customer_portal_message_selector_v1('mm-', outbound.id) AS selector,
      coalesce(nullif(btrim(outbound.subject), ''), 'Message') AS subject,
      parent_case.public_ref AS case_reference,
      biz.display_name AS business_name,
      loc.location_name AS location_name,
      outbound.activity_at,
      'Message from ProfileRelaunch'::text AS state_label,
      left(btrim(regexp_replace(outbound.body_text, '[[:space:]]+', ' ', 'g')), 180) AS preview
    FROM visible_outbound outbound
    LEFT JOIN public.cases parent_case ON parent_case.id = outbound.case_id AND parent_case.customer_id = p_customer
    LEFT JOIN public.businesses biz ON biz.id = parent_case.business_id
    LEFT JOIN public.locations loc ON loc.id = parent_case.location_id AND loc.business_id = parent_case.business_id
    WHERE outbound.conversation_id IS NULL
  )
  SELECT * FROM conversation_threads
  UNION ALL
  SELECT * FROM standalone;
$$;

CREATE FUNCTION admin_private.customer_portal_message_entries_v1(
  p_customer uuid,
  p_conversation uuid,
  p_communication uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=''
AS $$
  WITH raw AS (
    SELECT
      comm.id AS entry_id,
      'ProfileRelaunch'::text AS role,
      coalesce(comm.delivered_at, comm.provider_accepted_at, comm.queued_at, comm.created_at) AS activity_at,
      nullif(btrim(comm.subject), '') AS subject,
      comm.body_text AS body,
      CASE comm.delivery_status
        WHEN 'DELIVERED' THEN 'Delivered by email'
        WHEN 'PROVIDER_ACCEPTED' THEN 'Accepted by the email provider. Delivery is not confirmed.'
        ELSE NULL
      END AS delivery
    FROM public.communications comm
    WHERE admin_private.customer_portal_outbound_visible_v1(comm, p_customer) IS TRUE
      AND (
        (
          p_conversation IS NOT NULL
          AND comm.conversation_id = p_conversation
          AND comm.case_id = (
            SELECT conv.case_id FROM public.conversations conv WHERE conv.id = p_conversation
          )
        )
        OR (p_communication IS NOT NULL AND comm.id = p_communication AND comm.conversation_id IS NULL)
      )
    UNION ALL
    SELECT
      msg.id,
      'From your verified email address'::text,
      coalesce(msg.received_at, msg.created_at),
      nullif(btrim(msg.subject), ''),
      msg.body_text,
      NULL::text
    FROM public.conversation_messages msg
    WHERE p_conversation IS NOT NULL
      AND msg.conversation_id = p_conversation
      AND admin_private.customer_portal_inbound_visible_v1(msg, p_customer) IS TRUE
  ),
  ranked AS (
    SELECT *, row_number() OVER (ORDER BY activity_at DESC, entry_id DESC) AS rn, count(*) OVER () AS total
    FROM raw
  ),
  page AS (
    SELECT * FROM ranked WHERE rn <= 50
  )
  SELECT jsonb_build_object(
    'entries', coalesce((
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'role', role,
          'at', activity_at,
          'subject', subject,
          'body', body,
          'delivery', delivery
        ))
        ORDER BY activity_at ASC, entry_id ASC
      )
      FROM page
    ), '[]'::jsonb),
    'complete', coalesce((SELECT bool_and(total <= 50) FROM page), true)
  );
$$;

CREATE FUNCTION public.customer_portal_messages_v1(
  p_token_hash text,
  p_before_time timestamptz,
  p_before_selector text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $list$
DECLARE
  v_customer uuid;
  result jsonb;
BEGIN
  SELECT customer_id INTO v_customer FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL THEN RETURN NULL; END IF;
  IF (p_before_time IS NULL) IS DISTINCT FROM (p_before_selector IS NULL) THEN RETURN NULL; END IF;
  IF p_before_selector IS NOT NULL AND p_before_selector !~ '^(mc|mm)-[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  WITH page AS (
    SELECT
      thread.selector,
      thread.subject,
      thread.case_reference,
      thread.business_name,
      thread.location_name,
      thread.activity_at,
      thread.state_label,
      thread.preview,
      row_number() OVER (ORDER BY thread.activity_at DESC, thread.selector DESC) AS rn,
      count(*) OVER () AS total
    FROM admin_private.customer_portal_message_threads_v1(v_customer) thread
    WHERE p_before_time IS NULL
      OR (thread.activity_at, thread.selector) < (p_before_time, p_before_selector)
    ORDER BY thread.activity_at DESC, thread.selector DESC
    LIMIT 21
  )
  SELECT jsonb_build_object(
    'threads', coalesce((
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'selector', selector,
          'subject', subject,
          'caseReference', case_reference,
          'businessName', business_name,
          'locationName', location_name,
          'activityAt', activity_at,
          'state', state_label,
          'preview', preview
        ))
        ORDER BY rn
      )
      FROM page
      WHERE rn <= 20
    ), '[]'::jsonb),
    'complete', NOT EXISTS (SELECT 1 FROM page WHERE rn = 21),
    'nextCursor', (
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM page WHERE rn = 21)
          THEN jsonb_build_object('activityAt', activity_at, 'selector', selector)
        ELSE NULL
      END
      FROM page
      WHERE rn = 20
    )
  ) INTO result;
  RETURN jsonb_strip_nulls(result);
END;
$list$;

CREATE FUNCTION public.customer_portal_message_v1(p_token_hash text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $one$
DECLARE
  v_customer uuid;
  conv_id uuid;
  comm_id uuid;
  header record;
  entries jsonb;
BEGIN
  SELECT customer_id INTO v_customer FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL THEN RETURN NULL; END IF;
  IF p_selector IS NULL OR p_selector !~ '^(mc|mm)-[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF p_selector LIKE 'mc-%' THEN
    SELECT conv.id INTO conv_id
    FROM public.conversations conv
    JOIN public.cases parent_case ON parent_case.id = conv.case_id
    WHERE parent_case.customer_id = v_customer
      AND conv.state IN ('OPEN', 'CLOSED')
      AND (conv.customer_id IS NULL OR conv.customer_id = v_customer)
      AND admin_private.customer_portal_message_selector_v1('mc-', conv.id) = p_selector;
  ELSE
    SELECT comm.id INTO comm_id
    FROM public.communications comm
    WHERE comm.conversation_id IS NULL
      AND admin_private.customer_portal_outbound_visible_v1(comm, v_customer) IS TRUE
      AND admin_private.customer_portal_message_selector_v1('mm-', comm.id) = p_selector;
  END IF;
  IF conv_id IS NULL AND comm_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT * INTO header
  FROM admin_private.customer_portal_message_threads_v1(v_customer) thread
  WHERE thread.selector = p_selector;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  entries := admin_private.customer_portal_message_entries_v1(v_customer, conv_id, comm_id);
  RETURN jsonb_build_object(
    'found', true,
    'thread', jsonb_strip_nulls(jsonb_build_object(
      'selector', header.selector,
      'subject', header.subject,
      'caseReference', header.case_reference,
      'businessName', header.business_name,
      'locationName', header.location_name,
      'activityAt', header.activity_at,
      'state', header.state_label,
      'preview', header.preview,
      'entries', entries->'entries',
      'complete', coalesce((entries->>'complete')::boolean, false)
    ))
  );
END;
$one$;

CREATE FUNCTION public.customer_portal_account_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $account$
DECLARE
  v_customer uuid;
  v_email text;
  cust public.customers;
BEGIN
  SELECT customer_id, email INTO v_customer, v_email FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF admin_private.verified_current_email_v1(v_customer) IS DISTINCT FROM v_email THEN RETURN NULL; END IF;
  SELECT * INTO cust FROM public.customers WHERE id = v_customer AND lower(email) = v_email;
  IF cust.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'name', cust.full_name,
    'email', v_email,
    'phone', nullif(btrim(cust.phone), ''),
    'emailVerified', true,
    'phoneVerified', admin_private.contact_verified_v1(v_customer, 'phone') IS TRUE
  ));
END;
$account$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_message_selector_v1(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_outbound_visible_v1(public.communications, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_inbound_visible_v1(public.conversation_messages, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_message_threads_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_message_entries_v1(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_messages_v1(text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_message_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_account_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_messages_v1(text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_message_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_account_v1(text) TO service_role;

COMMIT;
