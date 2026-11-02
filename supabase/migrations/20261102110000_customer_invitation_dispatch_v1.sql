-- Phase 02E customer invitation dispatch.
-- Forward-only. This file is not applied to DEV or Production.
-- Do not apply it from this pull request. Do not replay an already-applied file.
-- Schema and functions only. No customer, invitation, communication, entitlement,
-- subscription, payment, session, or provision rows are inserted by this file.
-- An invitation token is never stored. The queued email keeps a placeholder
-- address. The worker replaces that placeholder only in the provider payload.

BEGIN;

ALTER TABLE admin_private.onboarding_invitations
  DROP CONSTRAINT onboarding_invitations_send_count_check;

ALTER TABLE admin_private.onboarding_invitations
  ADD CONSTRAINT onboarding_invitations_send_count_check CHECK (send_count BETWEEN 0 AND 1);

ALTER TABLE admin_private.onboarding_invitations
  ADD COLUMN generation integer NOT NULL DEFAULT 0,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN link_key_version integer,
  ADD COLUMN communication_id uuid;

ALTER TABLE admin_private.onboarding_invitations
  ADD CONSTRAINT onboarding_invitations_generation_check CHECK (generation BETWEEN 0 AND 3),
  ADD CONSTRAINT onboarding_invitations_link_version_check CHECK (link_key_version IS NULL OR link_key_version >= 1),
  ADD CONSTRAINT onboarding_invitations_dispatch_shape CHECK (
    (send_count = 0 AND generation = 0 AND link_key_version IS NULL AND communication_id IS NULL)
    OR (send_count = 1 AND generation BETWEEN 1 AND 3 AND link_key_version >= 1 AND communication_id IS NOT NULL)
  );

ALTER TABLE admin_private.onboarding_invitations
  ADD CONSTRAINT onboarding_invitations_communication_fk
  FOREIGN KEY (communication_id) REFERENCES public.communications (id) ON DELETE RESTRICT;

DROP INDEX admin_private.onboarding_invitations_one_unconsumed_idx;

CREATE UNIQUE INDEX onboarding_invitations_one_open_idx
  ON admin_private.onboarding_invitations (onboarding_request_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX onboarding_invitations_generation_idx
  ON admin_private.onboarding_invitations (onboarding_request_id, generation)
  WHERE generation > 0;

ALTER TABLE admin_private.onboarding_request_events
  DROP CONSTRAINT onboarding_request_events_operation_check;

ALTER TABLE admin_private.onboarding_request_events
  ADD CONSTRAINT onboarding_request_events_operation_check CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer',
    'issue_invitation', 'resend_invitation', 'revoke_invitation'
  ));

ALTER TABLE public.communications
  ADD COLUMN invitation_request_id uuid,
  ADD COLUMN invitation_generation integer;

ALTER TABLE public.communications
  ADD CONSTRAINT communications_invitation_request_fk
  FOREIGN KEY (invitation_request_id) REFERENCES public.onboarding_requests (id) ON DELETE RESTRICT;

ALTER TABLE public.communications ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE public.communications
  ADD CONSTRAINT communications_invitation_case_check CHECK (
    (
      template_key IS DISTINCT FROM 'CUSTOMER_PORTAL_INVITATION'
      AND case_id IS NOT NULL
      AND invitation_request_id IS NULL
      AND invitation_generation IS NULL
    )
    OR (
      template_key = 'CUSTOMER_PORTAL_INVITATION'
      AND case_id IS NULL
      AND customer_id IS NOT NULL
      AND invitation_request_id IS NOT NULL
      AND invitation_generation BETWEEN 1 AND 3
      AND link_key_version >= 1
    )
  );

CREATE UNIQUE INDEX communications_one_invitation_generation_idx
  ON public.communications (invitation_request_id, invitation_generation)
  WHERE template_key = 'CUSTOMER_PORTAL_INVITATION' AND lifecycle IS DISTINCT FROM 'CANCELLED';

ALTER TABLE public.communications DROP CONSTRAINT communications_exactly_one_parent;
ALTER TABLE public.communications ADD CONSTRAINT communications_exactly_one_parent CHECK (
  (
    template_key IS DISTINCT FROM 'CUSTOMER_PORTAL_INVITATION'
    AND num_nonnulls(case_id, monitoring_request_id, guard_alert_id) = 1
  )
  OR (
    template_key = 'CUSTOMER_PORTAL_INVITATION'
    AND num_nonnulls(case_id, monitoring_request_id, guard_alert_id) = 0
    AND invitation_request_id IS NOT NULL
  )
);

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION',
    'CUSTOMER_PORTAL_INVITATION'
  ) AND template_version >= 1)
);

ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION',
    'CUSTOMER_PORTAL_INVITATION'
  ));

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES (
  'CUSTOMER_PORTAL_INVITATION', 1, 'Customer portal invitation',
  'Your ProfileRelaunch Customer Portal invitation',
  'The live invitation email is composed by the server.',
  'DRAFT',
  'Catalogue row for the server-composed customer portal invitation.'
);

UPDATE admin_private.communication_templates
SET status = 'APPROVED', approval_source = 'MIGRATED_EXISTING',
    reason = 'Server-composed snapshot. The approved row documents the key and is not the live email.',
    record_version = record_version + 1
WHERE template_key = 'CUSTOMER_PORTAL_INVITATION' AND version = 1 AND status = 'DRAFT';

CREATE TABLE admin_private.customer_invitation_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_private.customer_invitation_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.customer_invitation_command_receipts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.guard_onboarding_invitation_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  request_email text;
  request_customer uuid;
  request_state text;
  current_email text;
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('admin.invitation_maintenance', true) = 'on' THEN
    IF NEW.revoked_at IS NOT NULL
      AND OLD.revoked_at IS NULL
      AND NEW.token_hash IS NOT DISTINCT FROM OLD.token_hash
      AND NEW.onboarding_request_id IS NOT DISTINCT FROM OLD.onboarding_request_id
      AND NEW.email_snapshot IS NOT DISTINCT FROM OLD.email_snapshot
      AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
      AND NEW.send_count IS NOT DISTINCT FROM OLD.send_count
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
      AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
      AND NEW.consumed_at IS NOT DISTINCT FROM OLD.consumed_at
      AND NEW.mailbox_proved_at IS NOT DISTINCT FROM OLD.mailbox_proved_at
      AND NEW.generation IS NOT DISTINCT FROM OLD.generation
      AND NEW.link_key_version IS NOT DISTINCT FROM OLD.link_key_version
      AND NEW.communication_id IS NOT DISTINCT FROM OLD.communication_id
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'invitation maintenance is limited';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF current_setting('admin.invitation_dispatch', true) = 'on' THEN
      IF NEW.send_count IS DISTINCT FROM 1 OR NEW.generation NOT BETWEEN 1 AND 3 OR NEW.link_key_version IS NULL OR NEW.link_key_version < 1 THEN
        RAISE EXCEPTION 'invitation email is not enabled';
      END IF;
    ELSIF NEW.send_count IS DISTINCT FROM 0 OR NEW.generation IS DISTINCT FROM 0 OR NEW.link_key_version IS NOT NULL OR NEW.communication_id IS NOT NULL THEN
      RAISE EXCEPTION 'invitation email is not enabled';
    END IF;
  ELSIF NEW.send_count IS DISTINCT FROM OLD.send_count THEN
    RAISE EXCEPTION 'invitation email is not enabled';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.token_hash IS DISTINCT FROM OLD.token_hash
      OR NEW.onboarding_request_id IS DISTINCT FROM OLD.onboarding_request_id
      OR NEW.email_snapshot IS DISTINCT FROM OLD.email_snapshot
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.send_count IS DISTINCT FROM OLD.send_count
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.generation IS DISTINCT FROM OLD.generation
      OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
      OR NEW.communication_id IS DISTINCT FROM OLD.communication_id
      OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    THEN
      RAISE EXCEPTION 'invitation identity is fixed';
    END IF;
    IF OLD.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'invitation is already used';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.consumed_at IS NOT NULL OR NEW.mailbox_proved_at IS NOT NULL OR NEW.revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invitation starts unused';
  END IF;
  SELECT email_snapshot, customer_id, state
    INTO request_email, request_customer, request_state
  FROM public.onboarding_requests
  WHERE id = NEW.onboarding_request_id;
  IF request_email IS DISTINCT FROM NEW.email_snapshot OR request_customer IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'invitation must match the onboarding request';
  END IF;
  IF request_customer IS NULL THEN
    RAISE EXCEPTION 'unmatched address cannot be invited';
  END IF;
  IF request_state IN ('DECLINED', 'CLOSED') THEN
    RAISE EXCEPTION 'invitation request is closed';
  END IF;
  SELECT lower(email) INTO current_email
  FROM public.customers
  WHERE id = NEW.customer_id;
  IF current_email IS DISTINCT FROM NEW.email_snapshot OR current_email = 'admin@profilerelaunch.com' THEN
    RAISE EXCEPTION 'invitation email must match the customer';
  END IF;
  IF NEW.consumed_at IS NOT NULL AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'invitation is expired';
  END IF;
  IF NOT admin_private.customer_portal_invitation_ready_v1(NEW.onboarding_request_id) THEN
    RAISE EXCEPTION 'invitation is not ready';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.customer_portal_open_invitation_v1(p_invitation_hash text)
RETURNS admin_private.onboarding_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation admin_private.onboarding_invitations;
  request public.onboarding_requests;
  customer public.customers;
BEGIN
  IF p_invitation_hash IS NULL OR p_invitation_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('customer_portal_invitation'), hashtext(p_invitation_hash));
  SELECT * INTO invitation
  FROM admin_private.onboarding_invitations
  WHERE token_hash = p_invitation_hash
  FOR UPDATE;
  IF invitation.token_hash IS NULL
    OR invitation.consumed_at IS NOT NULL
    OR invitation.mailbox_proved_at IS NOT NULL
    OR invitation.revoked_at IS NOT NULL
    OR invitation.expires_at <= now()
  THEN
    RETURN NULL;
  END IF;
  SELECT * INTO request
  FROM public.onboarding_requests
  WHERE id = invitation.onboarding_request_id
  FOR UPDATE;
  IF request.id IS NULL
    OR request.state IN ('DECLINED', 'CLOSED')
    OR request.customer_id IS NULL
    OR request.customer_id IS DISTINCT FROM invitation.customer_id
    OR request.email_snapshot IS DISTINCT FROM invitation.email_snapshot
  THEN
    RETURN NULL;
  END IF;
  SELECT * INTO customer
  FROM public.customers
  WHERE id = invitation.customer_id
  FOR UPDATE;
  IF customer.id IS NULL
    OR lower(customer.email) IS DISTINCT FROM invitation.email_snapshot
    OR lower(customer.email) = 'admin@profilerelaunch.com'
  THEN
    RETURN NULL;
  END IF;
  IF admin_private.verified_current_email_v1(customer.id) IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF NOT admin_private.customer_portal_invitation_ready_v1(request.id) THEN
    RETURN NULL;
  END IF;
  RETURN invitation;
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.protect_communication_snapshot_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.lifecycle IS NULL THEN RETURN NEW; END IF;
  IF OLD.content_locked IS TRUE AND NEW.content_locked IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Reviewed communication snapshot is immutable';
  END IF;
  IF OLD.rfc_message_id IS NOT NULL AND NEW.rfc_message_id IS DISTINCT FROM OLD.rfc_message_id THEN
    RAISE EXCEPTION 'Provider RFC Message-ID is immutable once set';
  END IF;
  IF OLD.content_locked IS TRUE THEN
    IF NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.monitoring_request_id IS DISTINCT FROM OLD.monitoring_request_id
      OR NEW.guard_alert_id IS DISTINCT FROM OLD.guard_alert_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
      OR NEW.customer_action_id IS DISTINCT FROM OLD.customer_action_id
      OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
      OR NEW.communication_type IS DISTINCT FROM OLD.communication_type
      OR NEW.direction IS DISTINCT FROM OLD.direction
      OR NEW.recipient IS DISTINCT FROM OLD.recipient
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.body_text IS DISTINCT FROM OLD.body_text
      OR NEW.body_html IS DISTINCT FROM OLD.body_html
      OR NEW.template_key IS DISTINCT FROM OLD.template_key
      OR NEW.template_version IS DISTINCT FROM OLD.template_version
      OR NEW.content_version IS DISTINCT FROM OLD.content_version
      OR NEW.sender_address IS DISTINCT FROM OLD.sender_address
      OR NEW.reply_to_address IS DISTINCT FROM OLD.reply_to_address
      OR NEW.in_reply_to IS DISTINCT FROM OLD.in_reply_to
      OR NEW.references_header IS DISTINCT FROM OLD.references_header
      OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
      OR NEW.author_id IS DISTINCT FROM OLD.author_id
      OR NEW.invitation_request_id IS DISTINCT FROM OLD.invitation_request_id
      OR NEW.invitation_generation IS DISTINCT FROM OLD.invitation_generation
    THEN RAISE EXCEPTION 'Reviewed communication snapshot is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.invitation_placeholder_count_v1(p_body text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_body IS NULL THEN 0
    ELSE (length(p_body) - length(replace(p_body, '/login/invite/ready', ''))) / length('/login/invite/ready')
  END;
$$;

CREATE FUNCTION admin_private.invitation_body_reason_v1(
  p_origin text,
  p_subject text,
  p_text text,
  p_html text,
  p_reference text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  combined text := coalesce(p_text, '') || ' ' || coalesce(p_html, '');
BEGIN
  IF p_origin IS NULL OR p_origin !~ '^https://[A-Za-z0-9.-]+$' THEN RETURN 'origin'; END IF;
  IF p_subject IS DISTINCT FROM 'Your ProfileRelaunch Customer Portal invitation' THEN RETURN 'subject'; END IF;
  IF char_length(p_subject) > 200 OR char_length(coalesce(p_text, '')) NOT BETWEEN 20 AND 20000
    OR char_length(coalesce(p_html, '')) NOT BETWEEN 20 AND 100000
  THEN RETURN 'body'; END IF;
  IF admin_private.invitation_placeholder_count_v1(p_text) IS DISTINCT FROM 1
    OR admin_private.invitation_placeholder_count_v1(p_html) IS DISTINCT FROM 1
    OR position(p_origin || '/login/invite/ready' IN p_text) = 0
    OR position(p_origin || '/login/invite/ready' IN p_html) = 0
  THEN RETURN 'link'; END IF;
  IF position('#t=' IN combined) > 0 OR combined ~ '/login/invite/[a-f0-9]{64}' OR position('entitlement' IN lower(combined)) > 0 THEN
    RETURN 'secret';
  END IF;
  IF position('Telloya — a ProfileRelaunch company' IN p_text) = 0
    OR position('Telloya — a ProfileRelaunch company' IN p_html) = 0
    OR position('ProfileRelaunch Ltd' IN p_text) = 0
    OR position('ProfileRelaunch Ltd' IN p_html) = 0
    OR position('verification code' IN p_text) = 0
    OR position('verification code' IN p_html) = 0
    OR position('Customer Portal' IN p_text) = 0
    OR position('Customer Portal' IN p_html) = 0
  THEN RETURN 'wording'; END IF;
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    IF position('Reference:' IN combined) > 0 THEN RETURN 'reference'; END IF;
  ELSE
    IF p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN RETURN 'reference'; END IF;
    IF position('Reference: ' || p_reference IN p_text) = 0 OR position('Reference: ' || p_reference IN p_html) = 0 THEN
      RETURN 'reference';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION admin_private.revoke_unusable_invitations_v1(p_request uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_request IS NULL OR admin_private.customer_portal_invitation_ready_v1(p_request) THEN
    RETURN;
  END IF;
  PERFORM set_config('admin.invitation_maintenance', 'on', true);
  UPDATE admin_private.onboarding_invitations
  SET revoked_at = now()
  WHERE onboarding_request_id = p_request
    AND consumed_at IS NULL
    AND revoked_at IS NULL;
  PERFORM set_config('admin.invitation_maintenance', 'off', true);
  UPDATE public.communications
  SET lifecycle = 'CANCELLED', cancelled_at = now(), updated_at = now(), record_version = record_version + 1
  WHERE invitation_request_id = p_request
    AND template_key = 'CUSTOMER_PORTAL_INVITATION'
    AND lifecycle = 'QUEUED'
    AND first_provider_attempt_at IS NULL;
END;
$$;

CREATE FUNCTION admin_private.revoke_invitations_after_request_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM admin_private.revoke_unusable_invitations_v1(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER onboarding_requests_revoke_invitations
  AFTER UPDATE OF state, customer_id, business_id, email_snapshot ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION admin_private.revoke_invitations_after_request_v1();

CREATE FUNCTION admin_private.revoke_invitations_after_locations_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM admin_private.revoke_unusable_invitations_v1(coalesce(NEW.onboarding_request_id, OLD.onboarding_request_id));
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER onboarding_request_locations_revoke_invitations
  AFTER INSERT OR UPDATE OR DELETE ON admin_private.onboarding_request_locations
  FOR EACH ROW EXECUTE FUNCTION admin_private.revoke_invitations_after_locations_v1();

CREATE FUNCTION admin_private.revoke_invitations_after_membership_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM 'revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
    FOR req IN
      SELECT id FROM public.onboarding_requests
      WHERE customer_id = NEW.customer_id AND business_id = NEW.business_id
    LOOP
      PERFORM admin_private.revoke_unusable_invitations_v1(req);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_memberships_revoke_invitations
  AFTER UPDATE OF status ON public.business_memberships
  FOR EACH ROW EXECUTE FUNCTION admin_private.revoke_invitations_after_membership_v1();

CREATE FUNCTION admin_private.customer_invitation_cancel_queued_v1(p_communication uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.communications
  SET lifecycle = 'CANCELLED', cancelled_at = now(), updated_at = now(), record_version = record_version + 1
  WHERE id = p_communication
    AND template_key = 'CUSTOMER_PORTAL_INVITATION'
    AND lifecycle = 'QUEUED'
    AND first_provider_attempt_at IS NULL;
END;
$$;

CREATE FUNCTION admin_private.customer_invitation_queue_v1(
  p_actor uuid,
  p_request uuid,
  p_onboarding uuid,
  p_customer uuid,
  p_business uuid,
  p_email text,
  p_generation integer,
  p_hash text,
  p_origin text,
  p_sender text,
  p_subject text,
  p_text text,
  p_html text,
  p_link_key_version integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  comm public.communications;
BEGIN
  INSERT INTO public.communications(
    case_id, customer_id, business_id, invitation_request_id, invitation_generation,
    channel, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version,
    author_id, reviewer_id, reviewed_at, queued_at, sender_address, reply_to_address,
    content_version, record_version, content_locked, link_key_version
  ) VALUES (
    NULL, p_customer, p_business, p_onboarding, p_generation,
    'EMAIL', 'CUSTOMER_PORTAL_INVITATION', 'OUTBOUND', p_email, p_subject, p_text, p_html,
    'PENDING', 'QUEUED', 'NONE', 'CUSTOMER_PORTAL_INVITATION', 1,
    p_actor, p_actor, now(), now(), p_sender, p_sender,
    1, 1, true, p_link_key_version
  ) RETURNING * INTO comm;
  PERFORM set_config('admin.invitation_dispatch', 'on', true);
  INSERT INTO admin_private.onboarding_invitations(
    token_hash, onboarding_request_id, email_snapshot, expires_at, customer_id,
    send_count, generation, link_key_version, communication_id
  ) VALUES (
    p_hash, p_onboarding, p_email, now() + interval '7 days', p_customer,
    1, p_generation, p_link_key_version, comm.id
  );
  PERFORM set_config('admin.invitation_dispatch', 'off', true);
  PERFORM admin_private.enqueue_outbox_v1(
    'send-email:' || comm.id::text || ':v' || comm.content_version::text,
    'SEND_EMAIL',
    'communication',
    comm.id,
    jsonb_build_object('communicationId', comm.id, 'contentVersion', comm.content_version),
    now()
  );
  PERFORM admin_private.append_delivery_event_v1(
    comm.id, 'QUEUED', 'Customer invitation queued for the provider. Queued is not delivered.'
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'COMMUNICATION_CHANGED', 'success', comm.id, p_request, 'communication',
    'Queued a customer portal invitation. The provider has not accepted it.',
    jsonb_build_object('operation', 'queue_customer_invitation', 'generation', p_generation)
  );
  RETURN comm.id;
END;
$$;

CREATE FUNCTION public.admin_customer_invitation_command_v1(
  p_token text,
  p_request uuid,
  p_operation text,
  p_enquiry uuid,
  p_version integer,
  p_reason text,
  p_hashes text[],
  p_origin text,
  p_sender text,
  p_subject text,
  p_body_text text,
  p_body_html text,
  p_link_key_version integer,
  p_reference text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fingerprint text;
  receipt admin_private.customer_invitation_command_receipts;
  enquiry public.enquiries;
  req public.onboarding_requests;
  note text;
  open_row admin_private.onboarding_invitations;
  next_generation integer;
  chosen_hash text;
  body_reason text;
  case_ref text;
  sender text;
  mailbox text;
  comm_id uuid;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_enquiry IS NULL OR p_version IS NULL OR p_version < 0
    OR p_operation NOT IN ('issue_invitation', 'resend_invitation', 'revoke_invitation')
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 1000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  note := btrim(p_reason);
  fingerprint := md5(p_operation || ':' || p_enquiry::text || ':' || p_version::text || ':' || note);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO receipt FROM admin_private.customer_invitation_command_receipts WHERE request_id = p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.fingerprint = fingerprint THEN RETURN receipt.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF (s->>'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('onboarding:' || p_enquiry::text, 0));
  SELECT * INTO enquiry FROM public.enquiries WHERE id = p_enquiry FOR UPDATE;
  IF enquiry.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF req.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'declined');
  END IF;
  IF req.record_version IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  IF req.state IN ('DECLINED', 'CLOSED') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'declined');
  END IF;
  IF NOT admin_private.customer_portal_invitation_ready_v1(req.id) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;
  SELECT lower(email) INTO mailbox FROM public.customers WHERE id = req.customer_id;
  IF mailbox IS NULL OR mailbox IS DISTINCT FROM req.email_snapshot OR mailbox = 'admin@profilerelaunch.com' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;
  IF admin_private.verified_current_email_v1(req.customer_id) IS NOT NULL
    OR admin_private.contact_verified_v1(req.customer_id, 'email')
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_verified');
  END IF;
  SELECT * INTO open_row FROM admin_private.onboarding_invitations
  WHERE onboarding_request_id = req.id AND consumed_at IS NULL AND revoked_at IS NULL
  FOR UPDATE;
  IF p_operation = 'revoke_invitation' THEN
    IF open_row.token_hash IS NULL THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'missing');
    END IF;
    PERFORM set_config('admin.invitation_maintenance', 'on', true);
    UPDATE admin_private.onboarding_invitations SET revoked_at = now() WHERE token_hash = open_row.token_hash;
    PERFORM set_config('admin.invitation_maintenance', 'off', true);
    PERFORM admin_private.customer_invitation_cancel_queued_v1(open_row.communication_id);
    PERFORM admin_private.onboarding_event_v1(
      req.id, actor, p_request, 'revoke_invitation', req.state, req.state, note,
      jsonb_build_object('invitationQueued', false, 'generation', open_row.generation)
    );
    UPDATE public.onboarding_requests SET updated_at = pg_catalog.now() WHERE id = req.id RETURNING * INTO req;
    result := jsonb_build_object('status', 'success', 'operation', 'revoke_invitation', 'generation', open_row.generation, 'replay', false);
    INSERT INTO admin_private.customer_invitation_command_receipts(request_id, actor_id, fingerprint, response)
    VALUES (p_request, actor, fingerprint, result);
    RETURN result;
  END IF;
  IF p_operation = 'issue_invitation' AND open_row.token_hash IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'duplicate');
  END IF;
  IF p_operation = 'resend_invitation' AND open_row.token_hash IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing');
  END IF;
  sender := lower(btrim(coalesce(p_sender, '')));
  IF sender !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR char_length(sender) > 254 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_link_key_version IS NULL OR p_link_key_version < 1 OR p_link_key_version > 100 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_hashes IS NULL OR cardinality(p_hashes) IS DISTINCT FROM 3
    OR EXISTS (SELECT 1 FROM unnest(p_hashes) AS hash WHERE hash !~ '^[a-f0-9]{64}$')
    OR (SELECT count(DISTINCT hash) FROM unnest(p_hashes) AS hash) IS DISTINCT FROM 3
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT cs.public_ref INTO case_ref
  FROM public.cases cs
  WHERE enquiry.case_id IS NOT NULL AND cs.id = enquiry.case_id
    AND cs.public_ref ~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$';
  IF coalesce(p_reference, '') IS DISTINCT FROM coalesce(case_ref, '') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'reference');
  END IF;
  body_reason := admin_private.invitation_body_reason_v1(p_origin, p_subject, p_body_text, p_body_html, case_ref);
  IF body_reason IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', body_reason);
  END IF;
  SELECT coalesce(max(generation), 0) + 1 INTO next_generation
  FROM admin_private.onboarding_invitations
  WHERE onboarding_request_id = req.id;
  IF next_generation > 3 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'cap');
  END IF;
  chosen_hash := p_hashes[next_generation];
  IF chosen_hash IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_operation = 'resend_invitation' THEN
    PERFORM set_config('admin.invitation_maintenance', 'on', true);
    UPDATE admin_private.onboarding_invitations SET revoked_at = now() WHERE token_hash = open_row.token_hash;
    PERFORM set_config('admin.invitation_maintenance', 'off', true);
    PERFORM admin_private.customer_invitation_cancel_queued_v1(open_row.communication_id);
  END IF;
  comm_id := admin_private.customer_invitation_queue_v1(
    actor, p_request, req.id, req.customer_id, req.business_id, mailbox, next_generation, chosen_hash,
    p_origin, sender, p_subject, p_body_text, p_body_html, p_link_key_version
  );
  PERFORM admin_private.onboarding_event_v1(
    req.id, actor, p_request, p_operation, req.state, req.state, note,
    jsonb_build_object('invitationQueued', true, 'generation', next_generation)
  );
  UPDATE public.onboarding_requests SET updated_at = pg_catalog.now() WHERE id = req.id RETURNING * INTO req;
  result := jsonb_build_object(
    'status', 'success',
    'operation', p_operation,
    'generation', next_generation,
    'id', comm_id,
    'lifecycle', 'QUEUED',
    'deliveryStatus', 'NONE',
    'replay', false
  );
  INSERT INTO admin_private.customer_invitation_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.admin_customer_invitation_view_v1(p_token text, p_enquiry uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.onboarding_requests;
  row admin_private.onboarding_invitations;
  comm public.communications;
  ready boolean := false;
  verified boolean := false;
  holding boolean := false;
  max_generation integer := 0;
  status text := 'none';
  detail text := 'No customer invitation has been sent.';
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_enquiry IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = p_enquiry AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC LIMIT 1;
  IF req.id IS NULL THEN
    SELECT * INTO req FROM public.onboarding_requests
    WHERE enquiry_id = p_enquiry AND state = 'DECLINED'
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF req.id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'none', 'detail', detail, 'canSend', false, 'canResend', false, 'canRevoke', false
    );
  END IF;
  ready := admin_private.customer_portal_invitation_ready_v1(req.id);
  verified := admin_private.verified_current_email_v1(req.customer_id) IS NOT NULL
    OR admin_private.contact_verified_v1(req.customer_id, 'email');
  SELECT coalesce(max(generation), 0) INTO max_generation
  FROM admin_private.onboarding_invitations WHERE onboarding_request_id = req.id;
  SELECT EXISTS (
    SELECT 1 FROM admin_private.onboarding_invitations held
    WHERE held.onboarding_request_id = req.id AND held.consumed_at IS NULL AND held.revoked_at IS NULL
  ) INTO holding;
  SELECT * INTO row FROM admin_private.onboarding_invitations
  WHERE onboarding_request_id = req.id
  ORDER BY generation DESC, created_at DESC
  LIMIT 1;
  IF row.token_hash IS NOT NULL THEN
    SELECT * INTO comm FROM public.communications WHERE id = row.communication_id;
    IF row.consumed_at IS NOT NULL THEN
      status := 'used';
      detail := 'This invitation has been used. Mailbox proof is separate from business authority.';
    ELSIF row.revoked_at IS NOT NULL THEN
      status := 'revoked';
      detail := 'This invitation was withdrawn. The link can no longer be used.';
    ELSIF row.expires_at <= now() THEN
      status := 'expired';
      detail := 'This invitation has expired. The link can no longer be used.';
    ELSIF comm.delivery_status = 'DELIVERED' THEN
      status := 'delivered';
      detail := 'Delivered.';
    ELSIF comm.delivery_status = 'PROVIDER_ACCEPTED' THEN
      status := 'accepted';
      detail := 'Accepted by the email provider. Accepted by the provider is not delivered.';
    ELSIF comm.delivery_status IN ('FAILED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'PROVIDER_REJECTED')
      OR comm.lifecycle = 'CANCELLED'
    THEN
      status := 'attention';
      detail := 'The invitation email needs review. It has not been sent again.';
    ELSE
      status := 'queued';
      detail := 'Queued for sending. The email provider has not accepted it, and queued is not delivered.';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'status', status,
    'detail', detail,
    'canSend', ready AND NOT verified AND NOT holding AND max_generation < 3,
    'canResend', ready AND NOT verified AND holding AND max_generation < 3,
    'canRevoke', holding
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.communication_load_send_v1(p_communication uuid, p_content_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  row public.communications;
  origin text;
  upload text;
  invitation_hash text;
  result jsonb;
BEGIN
  IF p_communication IS NULL OR p_content_version IS NULL OR p_content_version < 1 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication;
  IF row.id IS NULL OR row.lifecycle IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.lifecycle <> 'QUEUED' OR row.content_locked IS NOT TRUE OR row.content_version <> p_content_version
    OR btrim(coalesce(row.recipient, '')) = '' OR btrim(coalesce(row.subject, '')) = ''
    OR btrim(coalesce(row.body_text, '')) = '' OR btrim(coalesce(row.sender_address, '')) = ''
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.template_key IN ('EVIDENCE_REQUEST', 'QUOTE_OFFER') THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f-]{36}');
    IF upload IS NULL OR position('#t=' in row.body_text) > 0 OR position('#t=' in coalesce(row.body_html, '')) > 0 THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    origin := regexp_replace(upload, '/action/.*$', '');
  ELSIF row.template_key = 'GUIDED_PAYMENT_REQUEST' THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/payments');
    IF upload IS NULL
      OR position('#t=' in row.body_text) > 0
      OR position('#t=' in coalesce(row.body_html, '')) > 0
      OR position('/action/' in row.body_text) > 0
      OR position('/action/' in coalesce(row.body_html, '')) > 0
    THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    origin := regexp_replace(upload, '/portal/cases/.*$', '');
  ELSIF row.template_key IN ('PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION') THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    IF upload IS NULL OR position('#t=' in row.body_text) > 0 OR position('#t=' in coalesce(row.body_html, '')) > 0
      OR position('/action/' in row.body_text) > 0 OR position('/action/' in coalesce(row.body_html, '')) > 0
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    origin := regexp_replace(upload, '/portal/cases/.*$', '');
  ELSIF row.template_key = 'CUSTOMER_PORTAL_INVITATION' THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/login/invite/ready');
    IF upload IS NULL
      OR position('#t=' in row.body_text) > 0
      OR position('#t=' in coalesce(row.body_html, '')) > 0
      OR row.body_text ~ '/login/invite/[a-f0-9]{64}'
      OR coalesce(row.body_html, '') ~ '/login/invite/[a-f0-9]{64}'
      OR admin_private.invitation_placeholder_count_v1(row.body_text) IS DISTINCT FROM 1
      OR admin_private.invitation_placeholder_count_v1(row.body_html) IS DISTINCT FROM 1
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    origin := regexp_replace(upload, '/login/invite/ready$', '');
    SELECT token_hash INTO invitation_hash
    FROM admin_private.onboarding_invitations
    WHERE communication_id = row.id
      AND revoked_at IS NULL
      AND consumed_at IS NULL
      AND expires_at > now();
    IF invitation_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  END IF;
  result := jsonb_build_object(
    'status', 'success',
    'communicationId', row.id,
    'lifecycle', row.lifecycle,
    'deliveryStatus', coalesce(row.delivery_status, 'NONE'),
    'contentVersion', row.content_version,
    'contentLocked', row.content_locked,
    'recipient', row.recipient,
    'subject', row.subject,
    'bodyText', row.body_text,
    'bodyHtml', row.body_html,
    'templateKey', row.template_key,
    'customerActionId', row.customer_action_id,
    'customerOrigin', origin,
    'senderAddress', row.sender_address,
    'replyToAddress', row.reply_to_address,
    'inReplyTo', row.in_reply_to,
    'referencesHeader', row.references_header,
    'rfcMessageId', row.rfc_message_id,
    'linkKeyVersion', row.link_key_version,
    'firstProviderAttemptAt', row.first_provider_attempt_at,
    'suppressed', EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(row.recipient)
    )
  );
  IF row.template_key = 'CUSTOMER_PORTAL_INVITATION' THEN
    result := result || jsonb_build_object(
      'invitationRequestId', row.invitation_request_id,
      'invitationGeneration', row.invitation_generation,
      'invitationTokenHash', invitation_hash
    );
  END IF;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.communication_load_send_v1(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.communication_load_send_v1(uuid, integer) TO service_role;

CREATE FUNCTION public.dev_mail_dispatch_claim_invitation_v1(
  p_request uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
  comm public.communications;
  outbox admin_private.job_outbox;
  row admin_private.jobs;
  token uuid;
  attempt_no integer;
  v_key text;
  placeholder text;
BEGIN
  IF p_request IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT response INTO receipt
  FROM admin_private.customer_invitation_command_receipts
  WHERE request_id = p_request;
  IF receipt IS NULL OR receipt->>'status' IS DISTINCT FROM 'success' OR receipt->>'id' IS NULL
    OR receipt->>'lifecycle' IS DISTINCT FROM 'QUEUED'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  BEGIN
    SELECT * INTO comm FROM public.communications
      WHERE id = (receipt->>'id')::uuid
      FOR UPDATE SKIP LOCKED;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.communications WHERE id = (receipt->>'id')::uuid) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF comm.lifecycle IS DISTINCT FROM 'QUEUED' OR comm.content_locked IS NOT TRUE
    OR comm.template_key IS DISTINCT FROM 'CUSTOMER_PORTAL_INVITATION'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  placeholder := p_customer_origin || '/login/invite/ready';
  IF position('#t=' IN coalesce(comm.body_text, '')) > 0
    OR position('#t=' IN coalesce(comm.body_html, '')) > 0
    OR coalesce(comm.body_text, '') ~ '/login/invite/[a-f0-9]{64}'
    OR coalesce(comm.body_html, '') ~ '/login/invite/[a-f0-9]{64}'
    OR admin_private.invitation_placeholder_count_v1(comm.body_text) IS DISTINCT FROM 1
    OR admin_private.invitation_placeholder_count_v1(comm.body_html) IS DISTINCT FROM 1
    OR position(placeholder IN comm.body_text) = 0
    OR position(placeholder IN comm.body_html) = 0
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  IF comm.delivery_status IN (
    'PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE',
    'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed');
  END IF;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions s
    WHERE s.address_normalized = admin_private.normalize_email_v1(comm.recipient)
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'suppressed');
  END IF;
  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = v_key FOR UPDATE;
  IF NOT FOUND OR outbox.topic IS DISTINCT FROM 'SEND_EMAIL' OR outbox.aggregate_id IS DISTINCT FROM comm.id THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id AND j.job_type = 'SEND_EMAIL' AND j.status = 'RUNNING'
      AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at >= now()
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id AND j.job_type = 'SEND_EMAIL' AND j.status = 'DEAD_LETTER'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter');
  END IF;
  IF outbox.promoted_at IS NULL THEN
    INSERT INTO admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
    VALUES (outbox.id, 'SEND_EMAIL', outbox.event_key, outbox.payload, 'PENDING', outbox.available_at)
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox
      SET promoted_at = now(), last_error = NULL
      WHERE id = outbox.id AND promoted_at IS NULL;
  END IF;
  SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id FOR UPDATE;
  IF row.id IS NULL OR row.job_type IS DISTINCT FROM 'SEND_EMAIL' OR row.status NOT IN ('PENDING', 'RETRY', 'RUNNING') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'jobId', row.id);
  END IF;
  token := extensions.gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING', claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-mail-dispatch', lease_token = token,
        attempts = row.attempts + 1, updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id
    RETURNING * INTO row;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-mail-dispatch', token, NULL);
  RETURN jsonb_build_object(
    'status', 'success',
    'replay', false,
    'jobId', row.id,
    'jobType', row.job_type,
    'idempotencyKey', row.idempotency_key,
    'payload', row.payload,
    'leaseToken', token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_customer_invitation_command_v1(text, uuid, text, uuid, integer, text, text[], text, text, text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_invitation_command_v1(text, uuid, text, uuid, integer, text, text[], text, text, text, text, text, integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_customer_invitation_view_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_invitation_view_v1(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_invitation_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_invitation_v1(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION admin_private.invitation_placeholder_count_v1(text),
  admin_private.invitation_body_reason_v1(text, text, text, text, text),
  admin_private.revoke_unusable_invitations_v1(uuid),
  admin_private.customer_invitation_cancel_queued_v1(uuid),
  admin_private.customer_invitation_queue_v1(uuid, uuid, uuid, uuid, uuid, text, integer, text, text, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
