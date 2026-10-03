BEGIN;

-- UX-10A Customer Portal authentication foundation.
--
-- A portal session proves only that this browser completed email OTP for one
-- ProfileRelaunch customer's currently verified email and holds an unexpired,
-- unrevoked opaque token. It is not a customer-action session and it does not
-- authorise case access, evidence, quotes, payments, Guard, business
-- membership, or any other record. Action sessions stay on their own tables
-- and keep the existing 15-minute lifetime.

CREATE TABLE admin_private.customer_portal_login_rate (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE RESTRICT,
  window_started_at timestamptz NOT NULL,
  send_count integer NOT NULL,
  last_requested_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_portal_login_rate_count_check CHECK (send_count BETWEEN 0 AND 5),
  CONSTRAINT customer_portal_login_rate_window_check CHECK (window_started_at <= last_requested_at)
);

CREATE TABLE admin_private.customer_portal_login_challenges (
  pending_hash text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  expected_email_snapshot text NOT NULL,
  requested_at timestamptz NOT NULL,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT customer_portal_login_challenges_hash_check CHECK (pending_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT customer_portal_login_challenges_email_check CHECK (
    expected_email_snapshot = lower(expected_email_snapshot)
    AND length(expected_email_snapshot) BETWEEN 3 AND 320
    AND expected_email_snapshot <> 'admin@profilerelaunch.com'
    AND expected_email_snapshot !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_portal_login_challenges_attempts_check CHECK (attempts BETWEEN 0 AND 5),
  CONSTRAINT customer_portal_login_challenges_expiry_check CHECK (expires_at > requested_at),
  CONSTRAINT customer_portal_login_challenges_sent_check CHECK (sent_at IS NULL OR sent_at >= requested_at),
  CONSTRAINT customer_portal_login_challenges_consumed_check CHECK (
    consumed_at IS NULL OR (sent_at IS NOT NULL AND consumed_at >= sent_at)
  )
);

CREATE INDEX customer_portal_login_challenges_customer_idx
  ON admin_private.customer_portal_login_challenges (customer_id);

CREATE TABLE admin_private.customer_portal_sessions (
  token_hash text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL,
  email_snapshot text NOT NULL,
  authenticated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text NOT NULL DEFAULT '',
  CONSTRAINT customer_portal_sessions_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT customer_portal_sessions_email_check CHECK (
    email_snapshot = lower(email_snapshot)
    AND length(email_snapshot) BETWEEN 3 AND 320
    AND email_snapshot <> 'admin@profilerelaunch.com'
    AND email_snapshot !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_portal_sessions_lifetime_check CHECK (
    expires_at > authenticated_at
    AND expires_at <= authenticated_at + interval '8 hours'
    AND created_at <= authenticated_at + interval '1 minute'
    AND created_at >= authenticated_at - interval '1 minute'
  ),
  CONSTRAINT customer_portal_sessions_revoked_check CHECK (revoked_at IS NULL OR revoked_at >= authenticated_at),
  CONSTRAINT customer_portal_sessions_reason_check CHECK (length(revocation_reason) <= 200)
);

CREATE INDEX customer_portal_sessions_customer_idx
  ON admin_private.customer_portal_sessions (customer_id);

ALTER TABLE admin_private.customer_portal_login_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.customer_portal_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.customer_portal_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON admin_private.customer_portal_login_rate FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON admin_private.customer_portal_login_challenges FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON admin_private.customer_portal_sessions FROM PUBLIC, anon, authenticated, service_role;

-- True only when the snapshot is still this customer's current verified email.
-- customers.email alone, an Auth user, or email_confirmed_at is not enough.
CREATE FUNCTION admin_private.customer_portal_email_current_v1(p_customer uuid, p_snapshot text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT p_customer IS NOT NULL
    AND p_snapshot IS NOT NULL
    AND p_snapshot <> 'admin@profilerelaunch.com'
    AND EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = p_customer
        AND lower(c.email) = p_snapshot
        AND lower(c.email) <> 'admin@profilerelaunch.com'
    )
    AND admin_private.verified_current_email_v1(p_customer) IS NOT DISTINCT FROM p_snapshot;
$$;

-- Customer-level send reservation. Cookie clearing cannot reset this.
-- A failed provider call still consumes the reservation because the row is
-- updated before the provider is contacted. Concurrent callers take the same
-- advisory lock and then the rate row, so they cannot both pass the limit.
CREATE FUNCTION admin_private.customer_portal_reserve_send_v1(p_customer uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  rate admin_private.customer_portal_login_rate;
BEGIN
  IF p_customer IS NULL THEN RETURN 'invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('customer_portal_login'), hashtext(p_customer::text));
  INSERT INTO admin_private.customer_portal_login_rate (
    customer_id, window_started_at, send_count, last_requested_at, updated_at
  ) VALUES (
    p_customer, now() - interval '31 minutes', 0, now() - interval '31 minutes', now()
  )
  ON CONFLICT (customer_id) DO NOTHING;
  SELECT * INTO rate
  FROM admin_private.customer_portal_login_rate
  WHERE customer_id = p_customer
  FOR UPDATE;
  IF rate.customer_id IS NULL THEN RETURN 'invalid'; END IF;
  IF rate.last_requested_at > now() - interval '60 seconds' THEN
    RETURN 'rate_limited';
  END IF;
  IF rate.window_started_at > now() - interval '30 minutes' AND rate.send_count >= 5 THEN
    RETURN 'rate_limited';
  END IF;
  IF rate.window_started_at <= now() - interval '30 minutes' THEN
    UPDATE admin_private.customer_portal_login_rate
      SET window_started_at = now(), send_count = 1, last_requested_at = now(), updated_at = now()
      WHERE customer_id = p_customer;
  ELSE
    UPDATE admin_private.customer_portal_login_rate
      SET send_count = send_count + 1, last_requested_at = now(), updated_at = now()
      WHERE customer_id = p_customer;
  END IF;
  RETURN 'ok';
END;
$$;

CREATE FUNCTION admin_private.customer_portal_begin_login_v1(p_email text, p_pending_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  customer public.customers;
  verified text;
  reserved text;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_email IS NULL OR length(p_email) > 320 OR length(p_email) < 3
    OR p_email <> lower(btrim(p_email))
    OR p_email ~ '[[:cntrl:]]'
    OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_email = 'admin@profilerelaunch.com' THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  SELECT * INTO customer FROM public.customers WHERE lower(email) = p_email FOR UPDATE;
  IF customer.id IS NULL OR lower(customer.email) = 'admin@profilerelaunch.com' THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  verified := admin_private.verified_current_email_v1(customer.id);
  IF verified IS DISTINCT FROM p_email OR verified IS DISTINCT FROM lower(customer.email) THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  reserved := admin_private.customer_portal_reserve_send_v1(customer.id);
  IF reserved <> 'ok' THEN
    RETURN jsonb_build_object('status', reserved);
  END IF;
  INSERT INTO admin_private.customer_portal_login_challenges (
    pending_hash, customer_id, expected_email_snapshot, requested_at, sent_at, attempts, expires_at, consumed_at
  ) VALUES (
    p_pending_hash, customer.id, verified, now(), NULL, 0, now() + interval '10 minutes', NULL
  );
  RETURN jsonb_build_object('status', 'ok', 'customerId', customer.id, 'email', verified);
END;
$$;

CREATE FUNCTION admin_private.customer_portal_confirm_otp_sent_v1(p_pending_hash text)
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

CREATE FUNCTION admin_private.customer_portal_begin_resend_v1(p_pending_hash text)
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
  IF NOT admin_private.customer_portal_email_current_v1(challenge.customer_id, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  reserved := admin_private.customer_portal_reserve_send_v1(challenge.customer_id);
  IF reserved <> 'ok' THEN
    RETURN jsonb_build_object('status', reserved);
  END IF;
  -- The previous send is no longer a successful OTP fact until the provider
  -- accepts this resend and confirm records sent_at again.
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

CREATE FUNCTION admin_private.customer_portal_attempt_otp_v1(p_pending_hash text)
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

CREATE FUNCTION admin_private.customer_portal_finish_otp_v1(
  p_pending_hash text, p_session_hash text, p_auth_user uuid, p_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  challenge admin_private.customer_portal_login_challenges;
  uid uuid;
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
  IF NOT admin_private.customer_portal_email_current_v1(challenge.customer_id, challenge.expected_email_snapshot) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT id INTO uid
  FROM auth.users
  WHERE id = p_auth_user
    AND lower(email) = lower(p_email)
    AND email_confirmed_at IS NOT NULL
    AND deleted_at IS NULL
    AND banned_until IS NULL;
  IF uid IS NULL OR public.admin_identity_id_v1() IS NOT DISTINCT FROM uid THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  authenticated_at := now();
  UPDATE admin_private.customer_portal_login_challenges
    SET consumed_at = authenticated_at
    WHERE pending_hash = p_pending_hash;
  INSERT INTO admin_private.customer_portal_sessions (
    token_hash, customer_id, auth_user_id, email_snapshot, authenticated_at, created_at, expires_at, revoked_at, revocation_reason
  ) VALUES (
    p_session_hash, challenge.customer_id, uid, challenge.expected_email_snapshot,
    authenticated_at, authenticated_at, authenticated_at + interval '8 hours', NULL, ''
  );
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE FUNCTION admin_private.customer_portal_session_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  sess admin_private.customer_portal_sessions;
  verified text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess
  FROM admin_private.customer_portal_sessions
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL
    AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = sess.customer_id) THEN RETURN NULL; END IF;
  verified := admin_private.verified_current_email_v1(sess.customer_id);
  IF verified IS NULL OR verified IS DISTINCT FROM sess.email_snapshot THEN RETURN NULL; END IF;
  IF NOT admin_private.customer_portal_email_current_v1(sess.customer_id, sess.email_snapshot) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'customerId', sess.customer_id,
    'authUserId', sess.auth_user_id,
    'email', sess.email_snapshot,
    'authenticatedAt', sess.authenticated_at,
    'expiresAt', sess.expires_at
  );
END;
$$;

CREATE FUNCTION admin_private.customer_portal_sign_out_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;
  UPDATE admin_private.customer_portal_sessions
    SET revoked_at = coalesce(revoked_at, now()),
        revocation_reason = CASE WHEN revoked_at IS NULL THEN 'sign_out' ELSE revocation_reason END
    WHERE token_hash = p_token_hash;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE FUNCTION public.customer_portal_begin_login_v1(p_email text, p_pending_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_begin_login_v1(p_email, p_pending_hash);
$$;

CREATE FUNCTION public.customer_portal_confirm_otp_sent_v1(p_pending_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_confirm_otp_sent_v1(p_pending_hash);
$$;

CREATE FUNCTION public.customer_portal_begin_resend_v1(p_pending_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_begin_resend_v1(p_pending_hash);
$$;

CREATE FUNCTION public.customer_portal_attempt_otp_v1(p_pending_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_attempt_otp_v1(p_pending_hash);
$$;

CREATE FUNCTION public.customer_portal_finish_otp_v1(
  p_pending_hash text, p_session_hash text, p_auth_user uuid, p_email text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_finish_otp_v1(p_pending_hash, p_session_hash, p_auth_user, p_email);
$$;

CREATE FUNCTION public.customer_portal_session_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_session_v1(p_token_hash);
$$;

CREATE FUNCTION public.customer_portal_sign_out_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_sign_out_v1(p_token_hash);
$$;

COMMENT ON FUNCTION public.customer_portal_session_v1(text) IS
  'Opaque Customer Portal session. Not a customer-action session and not case, payment, Guard, or business authorisation.';

REVOKE ALL ON FUNCTION admin_private.customer_portal_email_current_v1(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_reserve_send_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_begin_login_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_confirm_otp_sent_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_begin_resend_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_attempt_otp_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_finish_otp_v1(text, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_session_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_sign_out_v1(text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_begin_login_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_confirm_otp_sent_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_begin_resend_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_attempt_otp_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_finish_otp_v1(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_session_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_sign_out_v1(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_portal_begin_login_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_confirm_otp_sent_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_begin_resend_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_attempt_otp_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_finish_otp_v1(text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_sign_out_v1(text) TO service_role;

COMMIT;
