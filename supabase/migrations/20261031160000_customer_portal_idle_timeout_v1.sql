BEGIN;

-- CUSTOMER-AUTH-IDLE-01. Repository source only. Do not apply this file to
-- Production. ChatGPT applies it to DEV before the Customer app deploy.
--
-- Existing rows receive last_activity_at = authenticated_at. A DEV session
-- whose OTP verification is already more than 30 minutes old becomes
-- idle-expired as soon as this migration commits, even when expires_at is
-- still inside the original eight hours. Those customers need a new email
-- OTP. Sessions younger than 30 minutes stay valid until 30 minutes after
-- authenticated_at, until the new app records genuine activity.
-- Do not backfill last_activity_at to now(): that would grant every open
-- session a fresh 30 minutes.
--
-- This initialises a new column and session functions. It does not send
-- mail, take a payment, or change customer, case, message, or quotation rows.
-- safeToReplay is false.

ALTER TABLE admin_private.customer_portal_sessions
  ADD COLUMN last_activity_at timestamptz;

COMMENT ON COLUMN admin_private.customer_portal_sessions.last_activity_at IS
  'Last genuine Customer Portal activity. Idle expiry is 30 minutes after this instant. It never moves expires_at.';

-- Keeps direct inserts and test updates inside [authenticated_at, expires_at].
-- A null activity instant becomes the OTP time. Activity after absolute
-- expiry is clamped back to expires_at, so a write cannot outlive the session.
CREATE FUNCTION admin_private.customer_portal_session_activity_row_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF NEW.last_activity_at IS NULL OR NEW.last_activity_at < NEW.authenticated_at THEN
    NEW.last_activity_at := NEW.authenticated_at;
  END IF;
  IF NEW.last_activity_at > NEW.expires_at THEN
    NEW.last_activity_at := NEW.expires_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_session_activity_row_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER customer_portal_sessions_activity_v1
  BEFORE INSERT OR UPDATE ON admin_private.customer_portal_sessions
  FOR EACH ROW EXECUTE FUNCTION admin_private.customer_portal_session_activity_row_v1();

UPDATE admin_private.customer_portal_sessions
  SET last_activity_at = authenticated_at
  WHERE last_activity_at IS NULL;

ALTER TABLE admin_private.customer_portal_sessions
  ADD CONSTRAINT customer_portal_sessions_activity_check
  CHECK (
    last_activity_at IS NOT NULL
    AND last_activity_at >= authenticated_at
    AND last_activity_at <= expires_at
  );

-- Read-only. Callers, prefetch, and polling must not extend the idle window.
CREATE OR REPLACE FUNCTION admin_private.customer_portal_session_v1(p_token_hash text)
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
    AND expires_at > now()
    AND last_activity_at IS NOT NULL
    AND last_activity_at + interval '30 minutes' > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = sess.customer_id) THEN RETURN NULL; END IF;
  verified := admin_private.verified_current_email_v1(sess.customer_id);
  IF verified IS NULL OR verified IS DISTINCT FROM sess.email_snapshot THEN RETURN NULL; END IF;
  IF NOT admin_private.customer_portal_email_current_v1(sess.customer_id, sess.email_snapshot) THEN RETURN NULL; END IF;
  IF NOT admin_private.customer_portal_auth_identity_current_v1(sess.auth_user_id, sess.email_snapshot) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'customerId', sess.customer_id,
    'authUserId', sess.auth_user_id,
    'email', sess.email_snapshot,
    'authenticatedAt', sess.authenticated_at,
    'expiresAt', sess.expires_at,
    'lastActivityAt', sess.last_activity_at,
    'idleExpiresAt', sess.last_activity_at + interval '30 minutes'
  );
END;
$$;

-- The only writer of last_activity_at. A locked, conditional update refuses
-- idle, absolute, and revoked rows, so a late or repeated call cannot revive
-- one. A session already touched in the last minute is confirmed and not
-- rewritten. expires_at is never assigned.
CREATE FUNCTION admin_private.customer_portal_touch_session_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  sess admin_private.customer_portal_sessions;
  touched timestamptz;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT * INTO sess
  FROM admin_private.customer_portal_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF sess.token_hash IS NULL
    OR sess.revoked_at IS NOT NULL
    OR sess.expires_at <= now()
    OR sess.last_activity_at IS NULL
    OR sess.last_activity_at + interval '30 minutes' <= now()
    OR NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = sess.customer_id)
    OR admin_private.verified_current_email_v1(sess.customer_id) IS DISTINCT FROM sess.email_snapshot
    OR NOT admin_private.customer_portal_email_current_v1(sess.customer_id, sess.email_snapshot)
    OR NOT admin_private.customer_portal_auth_identity_current_v1(sess.auth_user_id, sess.email_snapshot)
  THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  IF sess.last_activity_at > now() - interval '1 minute' THEN
    RETURN jsonb_build_object(
      'status', 'ok',
      'unchanged', true,
      'authenticatedAt', sess.authenticated_at,
      'expiresAt', sess.expires_at,
      'lastActivityAt', sess.last_activity_at,
      'idleExpiresAt', sess.last_activity_at + interval '30 minutes'
    );
  END IF;

  touched := now();
  UPDATE admin_private.customer_portal_sessions
    SET last_activity_at = touched
    WHERE token_hash = p_token_hash
      AND revoked_at IS NULL
      AND expires_at > touched
      AND last_activity_at IS NOT NULL
      AND last_activity_at + interval '30 minutes' > touched
      AND last_activity_at <= touched;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'unchanged', false,
    'authenticatedAt', sess.authenticated_at,
    'expiresAt', sess.expires_at,
    'lastActivityAt', touched,
    'idleExpiresAt', touched + interval '30 minutes'
  );
END;
$$;

CREATE FUNCTION public.customer_portal_touch_session_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT admin_private.customer_portal_touch_session_v1(p_token_hash);
$$;

COMMENT ON FUNCTION public.customer_portal_session_v1(text) IS
  'Opaque Customer Portal session. Rejects revoked, idle (30 minutes), and absolutely expired (8 hours) tokens. Does not update last_activity_at.';

COMMENT ON FUNCTION public.customer_portal_touch_session_v1(text) IS
  'Records genuine Customer Portal activity for a session that is still valid. Does not move expires_at and does not revive an idle, expired, or revoked session. At most one write a minute.';

REVOKE ALL ON FUNCTION admin_private.customer_portal_touch_session_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.customer_portal_touch_session_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_touch_session_v1(text) TO service_role;

COMMIT;
