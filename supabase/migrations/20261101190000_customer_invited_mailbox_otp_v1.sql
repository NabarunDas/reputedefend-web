BEGIN;

-- CUSTOMER-PLATFORM-02C-AUTH. Repository source only. Not applied to DEV.
-- Do not apply this file to Production. Do not replay it.
--
-- Mailbox proof for one invited customer. Existing verification rows stay
-- ADMIN_RECORDED. This file does not mark an unverified customer verified,
-- does not send an invitation, and does not grant a membership, entitlement,
-- subscription, or payment. send_count stays 0.

ALTER TABLE public.customer_contact_verifications
  ADD COLUMN proof_kind text NOT NULL DEFAULT 'ADMIN_RECORDED';

ALTER TABLE public.customer_contact_verifications
  ALTER COLUMN verified_by DROP NOT NULL;

ALTER TABLE public.customer_contact_verifications
  ADD CONSTRAINT customer_contact_verifications_proof_check CHECK (
    (
      proof_kind = 'ADMIN_RECORDED'
      AND verified_by IS NOT NULL
    )
    OR (
      proof_kind = 'MAILBOX_OTP'
      AND verified_by IS NULL
      AND channel = 'email'
      AND evidence ~ '^[a-f0-9]{64}$'
    )
  );

COMMENT ON COLUMN public.customer_contact_verifications.proof_kind IS
  'ADMIN_RECORDED is an administrator or existing link record. MAILBOX_OTP is written only by customer_portal_finish_invited_otp_v1 after Supabase verifies the mailbox.';

-- A later admin or link confirmation sets verified_by. That row is recorded
-- proof, not a second mailbox OTP. MAILBOX_OTP itself stays verified_by null.
CREATE FUNCTION admin_private.customer_contact_verification_proof_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.verified_by IS NOT NULL AND NEW.proof_kind IS DISTINCT FROM 'ADMIN_RECORDED' THEN
    NEW.proof_kind := 'ADMIN_RECORDED';
  END IF;
  IF NEW.proof_kind = 'MAILBOX_OTP' THEN
    -- Set only by customer_portal_finish_invited_otp_v1, for this transaction.
    IF current_setting('admin_private.mailbox_otp', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'mailbox proof is not authorised';
    END IF;
    IF NEW.channel IS DISTINCT FROM 'email'
      OR NEW.verified_by IS NOT NULL
      OR NEW.evidence !~ '^[a-f0-9]{64}$'
    THEN
      RAISE EXCEPTION 'mailbox proof is incomplete';
    END IF;
  END IF;
  IF NEW.proof_kind IS DISTINCT FROM 'ADMIN_RECORDED' AND NEW.proof_kind IS DISTINCT FROM 'MAILBOX_OTP' THEN
    RAISE EXCEPTION 'proof kind is not recognised';
  END IF;
  IF NEW.proof_kind = 'ADMIN_RECORDED' AND NEW.verified_by IS NULL THEN
    RAISE EXCEPTION 'recorded proof needs an actor';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_contact_verification_proof_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER customer_contact_verifications_proof
  BEFORE INSERT OR UPDATE ON public.customer_contact_verifications
  FOR EACH ROW EXECUTE FUNCTION admin_private.customer_contact_verification_proof_v1();

-- public.admin_contact_verify_v1 from 20261024085235_admin_recent_signin_30m_v1.sql
-- The audit call is unchanged. The write remains ADMIN_RECORDED.
CREATE OR REPLACE FUNCTION public.admin_contact_verify_v1(p_token text,p_customer uuid,p_version integer,p_channel text,p_evidence text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.customers; value text; outcome text:='success';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_channel IS NULL OR p_channel NOT IN ('email','phone') OR p_request IS NULL OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 10 AND 1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT * INTO c FROM public.customers WHERE id=p_customer FOR UPDATE;
 IF c.id IS NULL OR c.record_version IS DISTINCT FROM p_version THEN outcome:='conflict';
 ELSIF (s->>'createdAt')::timestamptz<now()-interval '30 minutes' THEN outcome:='reauth_required';
 ELSE
 value:=CASE p_channel WHEN 'email' THEN lower(c.email) ELSE c.phone END;
 IF value IS NULL OR value='' THEN outcome:='denied';
 ELSE
 INSERT INTO public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence,proof_kind) VALUES(p_customer,p_channel,value,(s->>'userId')::uuid,btrim(p_evidence),'ADMIN_RECORDED')
 ON CONFLICT(customer_id,channel) DO UPDATE SET verified_value=excluded.verified_value,verified_by=excluded.verified_by,verified_at=now(),evidence=excluded.evidence,proof_kind='ADMIN_RECORDED';
 UPDATE public.customers SET record_version=record_version WHERE id=p_customer;
 END IF;
 END IF;
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'CONTACT_VERIFIED',outcome,p_customer,p_request,'client',btrim(p_evidence),jsonb_build_object('channel',p_channel,'previousVersion',p_version));
 RETURN jsonb_build_object('status',outcome,'id',p_customer);
END;
$$;

ALTER TABLE admin_private.customer_portal_login_challenges
  ADD COLUMN invitation_hash text;

ALTER TABLE admin_private.customer_portal_login_challenges
  ADD CONSTRAINT customer_portal_login_challenges_invitation_check
  CHECK (invitation_hash IS NULL OR invitation_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE admin_private.customer_portal_login_challenges
  ADD CONSTRAINT customer_portal_login_challenges_invitation_fk
  FOREIGN KEY (invitation_hash)
  REFERENCES admin_private.onboarding_invitations (token_hash)
  ON DELETE RESTRICT;

COMMENT ON COLUMN admin_private.customer_portal_login_challenges.invitation_hash IS
  'Null for an ordinary verified-email login. Set only for a challenge created from one open invitation hash.';

-- Consumption is allowed once. Sending stays disabled: send_count must remain 0.
ALTER TABLE admin_private.onboarding_invitations
  DROP CONSTRAINT onboarding_invitations_unused;

ALTER TABLE admin_private.onboarding_invitations
  ADD CONSTRAINT onboarding_invitations_single_use CHECK (
    (consumed_at IS NULL AND mailbox_proved_at IS NULL)
    OR (
      consumed_at IS NOT NULL
      AND mailbox_proved_at = consumed_at
      AND consumed_at >= created_at
    )
  );

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
  IF NEW.send_count IS DISTINCT FROM 0 THEN
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
    THEN
      RAISE EXCEPTION 'invitation identity is fixed';
    END IF;
    IF OLD.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'invitation is already used';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.consumed_at IS NOT NULL OR NEW.mailbox_proved_at IS NOT NULL) THEN
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
  RETURN NEW;
END;
$$;

-- One generic miss. The caller turns a null into unavailable and returns no
-- customer, business, or email. Already-verified mailboxes miss as well.
CREATE FUNCTION admin_private.customer_portal_open_invitation_v1(p_invitation_hash text)
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
    OR invitation.expires_at <= now()
    OR invitation.send_count IS DISTINCT FROM 0
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
  RETURN invitation;
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.customer_portal_confirm_otp_sent_v1(p_pending_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO challenge
  FROM admin_private.customer_portal_login_challenges
  WHERE pending_hash = p_pending_hash
  FOR UPDATE;
  IF challenge.pending_hash IS NULL OR challenge.consumed_at IS NOT NULL OR challenge.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF challenge.invitation_hash IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_portal_email_current_v1(challenge.customer_id, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  IF challenge.sent_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;
  UPDATE admin_private.customer_portal_login_challenges
    SET sent_at = now(), expires_at = now() + interval '10 minutes'
    WHERE pending_hash = p_pending_hash;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.customer_portal_begin_resend_v1(p_pending_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
  reserved text;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO challenge
  FROM admin_private.customer_portal_login_challenges
  WHERE pending_hash = p_pending_hash
  FOR UPDATE;
  IF challenge.pending_hash IS NULL OR challenge.consumed_at IS NOT NULL OR challenge.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF challenge.invitation_hash IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_portal_email_current_v1(challenge.customer_id, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  reserved := admin_private.customer_portal_reserve_send_v1(challenge.customer_id);
  IF reserved <> 'ok' THEN
    RETURN jsonb_build_object('status', reserved);
  END IF;
  UPDATE admin_private.customer_portal_login_challenges
    SET sent_at = NULL, attempts = 0, requested_at = now(), expires_at = now() + interval '10 minutes'
    WHERE pending_hash = p_pending_hash;
  RETURN jsonb_build_object(
    'status', 'ok',
    'customerId', challenge.customer_id,
    'email', challenge.expected_email_snapshot
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.customer_portal_attempt_otp_v1(p_pending_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO challenge
  FROM admin_private.customer_portal_login_challenges
  WHERE pending_hash = p_pending_hash
  FOR UPDATE;
  IF challenge.pending_hash IS NULL
    OR challenge.consumed_at IS NOT NULL
    OR challenge.sent_at IS NULL
    OR challenge.expires_at <= now()
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF challenge.invitation_hash IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_portal_email_current_v1(challenge.customer_id, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  IF challenge.attempts >= 5 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  UPDATE admin_private.customer_portal_login_challenges
    SET attempts = attempts + 1
    WHERE pending_hash = p_pending_hash
    RETURNING * INTO challenge;
  IF challenge.attempts > 5 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'customerId', challenge.customer_id,
    'email', challenge.expected_email_snapshot
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.customer_portal_finish_otp_v1(
  p_pending_hash text, p_session_hash text, p_auth_user uuid, p_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
  authenticated_at timestamptz;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$'
    OR p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$'
    OR p_pending_hash = p_session_hash
    OR p_auth_user IS NULL
    OR p_email IS NULL OR length(p_email) > 320 OR p_email <> lower(btrim(p_email))
    OR p_email ~ '[[:cntrl:]]'
    OR p_email = 'admin@profilerelaunch.com'
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO challenge
  FROM admin_private.customer_portal_login_challenges
  WHERE pending_hash = p_pending_hash
  FOR UPDATE;
  IF challenge.pending_hash IS NULL
    OR challenge.consumed_at IS NOT NULL
    OR challenge.sent_at IS NULL
    OR challenge.expires_at <= now()
    OR lower(p_email) IS DISTINCT FROM challenge.expected_email_snapshot
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF challenge.invitation_hash IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_portal_email_current_v1(challenge.customer_id, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_portal_auth_identity_current_v1(p_auth_user, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  authenticated_at := now();
  UPDATE admin_private.customer_portal_login_challenges
    SET consumed_at = authenticated_at
    WHERE pending_hash = p_pending_hash;
  INSERT INTO admin_private.customer_portal_sessions (
    token_hash, customer_id, auth_user_id, email_snapshot, authenticated_at, created_at, expires_at, revoked_at, revocation_reason
  ) VALUES (
    p_session_hash, challenge.customer_id, p_auth_user, challenge.expected_email_snapshot,
    authenticated_at, authenticated_at, authenticated_at + interval '8 hours', NULL, ''
  );
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE FUNCTION admin_private.customer_portal_begin_invited_login_v1(p_invitation_hash text, p_pending_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation admin_private.onboarding_invitations;
  reserved text;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$'
    OR p_invitation_hash IS NULL OR p_invitation_hash !~ '^[a-f0-9]{64}$'
    OR p_pending_hash = p_invitation_hash
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  invitation := admin_private.customer_portal_open_invitation_v1(p_invitation_hash);
  IF invitation IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  reserved := admin_private.customer_portal_reserve_send_v1(invitation.customer_id);
  IF reserved <> 'ok' THEN
    RETURN jsonb_build_object('status', reserved);
  END IF;
  BEGIN
    INSERT INTO admin_private.customer_portal_login_challenges (
      pending_hash, customer_id, expected_email_snapshot, requested_at, sent_at, attempts, expires_at, consumed_at, invitation_hash
    ) VALUES (
      p_pending_hash, invitation.customer_id, invitation.email_snapshot, now(), NULL, 0, now() + interval '10 minutes', NULL, invitation.token_hash
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END;
  RETURN jsonb_build_object('status', 'ok', 'customerId', invitation.customer_id, 'email', invitation.email_snapshot);
END;
$$;

CREATE FUNCTION admin_private.customer_portal_invited_challenge_v1(p_pending_hash text, p_invitation_hash text)
RETURNS admin_private.customer_portal_login_challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
  invitation admin_private.onboarding_invitations;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$'
    OR p_invitation_hash IS NULL OR p_invitation_hash !~ '^[a-f0-9]{64}$'
  THEN
    RETURN NULL;
  END IF;
  SELECT * INTO challenge
  FROM admin_private.customer_portal_login_challenges
  WHERE pending_hash = p_pending_hash
  FOR UPDATE;
  IF challenge.pending_hash IS NULL
    OR challenge.invitation_hash IS NULL
    OR challenge.invitation_hash IS DISTINCT FROM p_invitation_hash
    OR challenge.consumed_at IS NOT NULL
    OR challenge.expires_at <= now()
  THEN
    RETURN NULL;
  END IF;
  invitation := admin_private.customer_portal_open_invitation_v1(p_invitation_hash);
  IF invitation IS NULL
    OR invitation.customer_id IS DISTINCT FROM challenge.customer_id
    OR invitation.email_snapshot IS DISTINCT FROM challenge.expected_email_snapshot
  THEN
    RETURN NULL;
  END IF;
  RETURN challenge;
END;
$$;

CREATE FUNCTION admin_private.customer_portal_confirm_invited_otp_sent_v1(p_pending_hash text, p_invitation_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
BEGIN
  challenge := admin_private.customer_portal_invited_challenge_v1(p_pending_hash, p_invitation_hash);
  IF challenge IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF challenge.sent_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;
  UPDATE admin_private.customer_portal_login_challenges
    SET sent_at = now(), expires_at = now() + interval '10 minutes'
    WHERE pending_hash = p_pending_hash
      AND invitation_hash = p_invitation_hash
      AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE FUNCTION admin_private.customer_portal_begin_invited_resend_v1(p_pending_hash text, p_invitation_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
  reserved text;
BEGIN
  challenge := admin_private.customer_portal_invited_challenge_v1(p_pending_hash, p_invitation_hash);
  IF challenge IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  reserved := admin_private.customer_portal_reserve_send_v1(challenge.customer_id);
  IF reserved <> 'ok' THEN
    RETURN jsonb_build_object('status', reserved);
  END IF;
  UPDATE admin_private.customer_portal_login_challenges
    SET sent_at = NULL, attempts = 0, requested_at = now(), expires_at = now() + interval '10 minutes'
    WHERE pending_hash = p_pending_hash
      AND invitation_hash = p_invitation_hash
      AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'customerId', challenge.customer_id,
    'email', challenge.expected_email_snapshot
  );
END;
$$;

CREATE FUNCTION admin_private.customer_portal_attempt_invited_otp_v1(p_pending_hash text, p_invitation_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
BEGIN
  challenge := admin_private.customer_portal_invited_challenge_v1(p_pending_hash, p_invitation_hash);
  IF challenge IS NULL OR challenge.sent_at IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF challenge.attempts >= 5 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  UPDATE admin_private.customer_portal_login_challenges
    SET attempts = attempts + 1
    WHERE pending_hash = p_pending_hash
      AND invitation_hash = p_invitation_hash
      AND consumed_at IS NULL
      AND sent_at IS NOT NULL
      AND attempts < 5
    RETURNING * INTO challenge;
  IF NOT FOUND OR challenge.attempts > 5 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'customerId', challenge.customer_id,
    'email', challenge.expected_email_snapshot
  );
END;
$$;

CREATE FUNCTION admin_private.customer_portal_finish_invited_otp_v1(
  p_pending_hash text,
  p_session_hash text,
  p_auth_user uuid,
  p_email text,
  p_invitation_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
  invitation admin_private.onboarding_invitations;
  authenticated_at timestamptz;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$'
    OR p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$'
    OR p_invitation_hash IS NULL OR p_invitation_hash !~ '^[a-f0-9]{64}$'
    OR p_pending_hash = p_session_hash
    OR p_pending_hash = p_invitation_hash
    OR p_session_hash = p_invitation_hash
    OR p_auth_user IS NULL
    OR p_email IS NULL OR length(p_email) > 320 OR p_email <> lower(btrim(p_email))
    OR p_email ~ '[[:cntrl:]]'
    OR p_email = 'admin@profilerelaunch.com'
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO challenge
  FROM admin_private.customer_portal_login_challenges
  WHERE pending_hash = p_pending_hash
  FOR UPDATE;
  IF challenge.pending_hash IS NULL
    OR challenge.invitation_hash IS NULL
    OR challenge.invitation_hash IS DISTINCT FROM p_invitation_hash
    OR challenge.consumed_at IS NOT NULL
    OR challenge.sent_at IS NULL
    OR challenge.expires_at <= now()
    OR lower(p_email) IS DISTINCT FROM challenge.expected_email_snapshot
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  invitation := admin_private.customer_portal_open_invitation_v1(p_invitation_hash);
  IF invitation IS NULL
    OR invitation.customer_id IS DISTINCT FROM challenge.customer_id
    OR invitation.email_snapshot IS DISTINCT FROM challenge.expected_email_snapshot
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_portal_auth_identity_current_v1(p_auth_user, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF admin_private.verified_current_email_v1(challenge.customer_id) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  authenticated_at := now();
  PERFORM set_config('admin_private.mailbox_otp', '1', true);
  INSERT INTO public.customer_contact_verifications (
    customer_id, channel, verified_value, verified_at, verified_by, evidence, proof_kind
  ) VALUES (
    challenge.customer_id, 'email', challenge.expected_email_snapshot, authenticated_at, NULL, p_pending_hash, 'MAILBOX_OTP'
  );
  UPDATE admin_private.customer_portal_login_challenges
    SET consumed_at = authenticated_at
    WHERE pending_hash = p_pending_hash
      AND invitation_hash = p_invitation_hash
      AND consumed_at IS NULL
      AND sent_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invited challenge was not consumed';
  END IF;
  UPDATE admin_private.onboarding_invitations
    SET consumed_at = authenticated_at, mailbox_proved_at = authenticated_at
    WHERE token_hash = p_invitation_hash
      AND consumed_at IS NULL
      AND mailbox_proved_at IS NULL
      AND expires_at > authenticated_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation was not consumed';
  END IF;
  INSERT INTO admin_private.customer_portal_sessions (
    token_hash, customer_id, auth_user_id, email_snapshot, authenticated_at, created_at, expires_at, revoked_at, revocation_reason
  ) VALUES (
    p_session_hash, challenge.customer_id, p_auth_user, challenge.expected_email_snapshot,
    authenticated_at, authenticated_at, authenticated_at + interval '8 hours', NULL, ''
  );
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE FUNCTION public.customer_portal_begin_invited_login_v1(p_invitation_hash text, p_pending_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT admin_private.customer_portal_begin_invited_login_v1(p_invitation_hash, p_pending_hash);
$$;

CREATE FUNCTION public.customer_portal_confirm_invited_otp_sent_v1(p_pending_hash text, p_invitation_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT admin_private.customer_portal_confirm_invited_otp_sent_v1(p_pending_hash, p_invitation_hash);
$$;

CREATE FUNCTION public.customer_portal_begin_invited_resend_v1(p_pending_hash text, p_invitation_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT admin_private.customer_portal_begin_invited_resend_v1(p_pending_hash, p_invitation_hash);
$$;

CREATE FUNCTION public.customer_portal_attempt_invited_otp_v1(p_pending_hash text, p_invitation_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT admin_private.customer_portal_attempt_invited_otp_v1(p_pending_hash, p_invitation_hash);
$$;

CREATE FUNCTION public.customer_portal_finish_invited_otp_v1(
  p_pending_hash text,
  p_session_hash text,
  p_auth_user uuid,
  p_email text,
  p_invitation_hash text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT admin_private.customer_portal_finish_invited_otp_v1(
    p_pending_hash, p_session_hash, p_auth_user, p_email, p_invitation_hash
  );
$$;

COMMENT ON FUNCTION public.customer_portal_begin_invited_login_v1(text, text) IS
  'Starts one Customer Portal OTP for an unconsumed invitation. An invitation hash alone does not create a session. Unknown, expired, consumed, mismatched, declined, and already-verified invitations return unavailable.';

COMMENT ON FUNCTION public.customer_portal_finish_invited_otp_v1(text, text, uuid, text, text) IS
  'After Supabase verifyOtp, records MAILBOX_OTP, consumes that invitation, and inserts a normal Customer Portal session. It does not verify a membership or grant a product.';

REVOKE ALL ON FUNCTION admin_private.customer_portal_open_invitation_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_invited_challenge_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_begin_invited_login_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_confirm_invited_otp_sent_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_begin_invited_resend_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_attempt_invited_otp_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_finish_invited_otp_v1(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_begin_invited_login_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_confirm_invited_otp_sent_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_begin_invited_resend_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_attempt_invited_otp_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_finish_invited_otp_v1(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_portal_begin_invited_login_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_confirm_invited_otp_sent_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_begin_invited_resend_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_attempt_invited_otp_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_finish_invited_otp_v1(text, text, uuid, text, text) TO service_role;

COMMIT;
