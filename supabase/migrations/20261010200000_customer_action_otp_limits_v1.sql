BEGIN;

-- SEC-02. OTP send and verification budgets belong to the customer action.
-- The pending token is only a lookup key and can be rotated by exchange.
--
-- Lock order in every function that touches both rows is
-- public.customer_actions, then admin_private.customer_action_challenges.
--
-- Rules, all decided while those locks are held:
--   * Exchange updates pending_hash and pending_expires_at only.
--   * attempts is the verification budget: at most 5 per action, including
--     across resends and re-exchanges. Begin does not clear it. The row is
--     kept after lockout so a later exchange cannot insert a fresh budget.
--   * A begin inside 60 seconds of last_attempt_at returns rate_limited and
--     does not consume a send slot or move the cooldown.
--   * otp_send_attempts records each accepted begin. At most 5 timestamps in
--     any rolling 30-minute window are accepted; a full window returns
--     rate_limited and writes nothing.
--   * Once attempts has reached 5, further begins return unavailable.
--   * An action that is not eligible (expired, completed, revoked, or
--     otherwise closed) returns unavailable and does not gain a new row.

ALTER TABLE admin_private.customer_action_challenges
  ADD COLUMN otp_send_attempts timestamptz[] NOT NULL DEFAULT '{}';

ALTER TABLE admin_private.customer_action_challenges
  ADD CONSTRAINT customer_action_challenges_otp_send_attempts_size
  CHECK (cardinality(otp_send_attempts) <= 5);

CREATE FUNCTION admin_private.customer_action_lock_pending_v1(p_pending_hash text)
RETURNS TABLE(action_row public.customer_actions, challenge_row admin_private.customer_action_challenges)
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  v_action uuid;
  a public.customer_actions;
  ch admin_private.customer_action_challenges;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN;
  END IF;
  -- Read the action id without locking the challenge. The action row is locked
  -- first so this cannot invert the order used by exchange.
  SELECT c.action_id INTO v_action
  FROM admin_private.customer_action_challenges c
  WHERE c.pending_hash = p_pending_hash;
  IF v_action IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = v_action FOR UPDATE;
  IF a.id IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO ch FROM admin_private.customer_action_challenges WHERE action_id = a.id FOR UPDATE;
  IF ch.action_id IS NULL OR ch.pending_hash IS DISTINCT FROM p_pending_hash THEN
    RETURN;
  END IF;
  action_row := a;
  challenge_row := ch;
  RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_exchange_v1(p_action uuid, p_secret_hash text, p_pending_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions;
BEGIN
  IF p_action IS NULL OR p_secret_hash IS NULL OR p_secret_hash !~ '^[a-f0-9]{64}$'
    OR p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = p_action FOR UPDATE;
  IF a.id IS NULL OR a.secret_hash IS DISTINCT FROM p_secret_hash OR NOT admin_private.customer_action_eligible_v1(a)
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  INSERT INTO admin_private.customer_action_challenges(action_id, pending_hash, pending_expires_at)
  VALUES (a.id, p_pending_hash, now() + interval '10 minutes')
  ON CONFLICT (action_id) DO UPDATE
    SET pending_hash = EXCLUDED.pending_hash,
        pending_expires_at = EXCLUDED.pending_expires_at;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'PRE_AUTH', NULL, 'ACTION_EXCHANGED', jsonb_build_object('kind', a.kind));
  RETURN jsonb_build_object('status', 'ok', 'kind', a.kind, 'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot));
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_begin_otp_v1(p_pending_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  locked record;
  a public.customer_actions;
  ch admin_private.customer_action_challenges;
  recent timestamptz[];
BEGIN
  SELECT pending.action_row, pending.challenge_row INTO locked
  FROM admin_private.customer_action_lock_pending_v1(p_pending_hash) AS pending;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  a := locked.action_row;
  ch := locked.challenge_row;
  IF a.id IS NULL OR ch.action_id IS NULL
    OR ch.pending_expires_at <= now()
    OR NOT admin_private.customer_action_eligible_v1(a)
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF ch.attempts >= 5 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF ch.last_attempt_at IS NOT NULL AND ch.last_attempt_at > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;
  SELECT coalesce(array_agg(ts ORDER BY ts), ARRAY[]::timestamptz[]) INTO recent
  FROM unnest(ch.otp_send_attempts) AS ts
  WHERE ts > now() - interval '30 minutes';
  IF coalesce(cardinality(recent), 0) >= 5 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;
  UPDATE admin_private.customer_action_challenges
    SET last_attempt_at = now(),
        sent_at = NULL,
        challenge_expires_at = now() + interval '10 minutes',
        otp_send_attempts = array_append(recent, now())
    WHERE action_id = a.id;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'PRE_AUTH', NULL, 'OTP_REQUESTED', jsonb_build_object('kind', a.kind));
  RETURN jsonb_build_object('status', 'ok', 'email', a.expected_email_snapshot, 'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot));
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_confirm_otp_sent_v1(p_pending_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE locked record; a public.customer_actions; ch admin_private.customer_action_challenges;
BEGIN
  SELECT pending.action_row, pending.challenge_row INTO locked
  FROM admin_private.customer_action_lock_pending_v1(p_pending_hash) AS pending;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  a := locked.action_row;
  ch := locked.challenge_row;
  IF a.id IS NULL OR ch.action_id IS NULL
    OR ch.pending_expires_at <= now()
    OR ch.challenge_expires_at IS NULL OR ch.challenge_expires_at <= now()
    OR ch.last_attempt_at IS NULL
    OR NOT admin_private.customer_action_eligible_v1(a)
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF ch.sent_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'ok'); END IF;
  UPDATE admin_private.customer_action_challenges SET sent_at = now() WHERE action_id = a.id;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'PRE_AUTH', NULL, 'OTP_SENT', jsonb_build_object('kind', a.kind));
  RETURN jsonb_build_object('status', 'ok');
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_attempt_otp_v1(p_pending_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE locked record; a public.customer_actions; ch admin_private.customer_action_challenges; v_attempts integer;
BEGIN
  SELECT pending.action_row, pending.challenge_row INTO locked
  FROM admin_private.customer_action_lock_pending_v1(p_pending_hash) AS pending;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  a := locked.action_row;
  ch := locked.challenge_row;
  IF a.id IS NULL OR ch.action_id IS NULL
    OR ch.pending_expires_at <= now()
    OR ch.challenge_expires_at IS NULL OR ch.challenge_expires_at <= now()
    OR ch.sent_at IS NULL
    OR NOT admin_private.customer_action_eligible_v1(a)
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  UPDATE admin_private.customer_action_challenges
    SET attempts = attempts + 1
    WHERE action_id = a.id AND attempts < 5
    RETURNING attempts INTO v_attempts;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  RETURN jsonb_build_object('status', 'ok', 'actionId', a.id, 'email', a.expected_email_snapshot);
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_finish_otp_v1(p_pending_hash text, p_session_hash text, p_auth_user uuid, p_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE locked record; a public.customer_actions; ch admin_private.customer_action_challenges; uid uuid;
BEGIN
  IF p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$' OR p_auth_user IS NULL OR p_email IS NULL
    OR lower(p_email) = 'admin@profilerelaunch.com'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT pending.action_row, pending.challenge_row INTO locked
  FROM admin_private.customer_action_lock_pending_v1(p_pending_hash) AS pending;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  a := locked.action_row;
  ch := locked.challenge_row;
  IF a.id IS NULL OR ch.action_id IS NULL
    OR ch.pending_expires_at <= now()
    OR ch.challenge_expires_at IS NULL OR ch.challenge_expires_at <= now()
    OR ch.sent_at IS NULL
    OR NOT admin_private.customer_action_eligible_v1(a)
    OR lower(p_email) IS DISTINCT FROM lower(a.expected_email_snapshot)
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT id INTO uid FROM auth.users WHERE id = p_auth_user AND lower(email) = lower(p_email)
    AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND banned_until IS NULL;
  IF uid IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF public.admin_identity_id_v1() IS NOT DISTINCT FROM uid THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  INSERT INTO admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
  VALUES (p_session_hash, a.id, uid, now() + interval '15 minutes');
  DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
  RETURN jsonb_build_object('status', 'ok', 'actionId', a.id, 'kind', a.kind);
END; $$;

REVOKE ALL ON FUNCTION admin_private.customer_action_lock_pending_v1(text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_action_exchange_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_begin_otp_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_confirm_otp_sent_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_attempt_otp_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_finish_otp_v1(text, text, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_action_exchange_v1(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_begin_otp_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_confirm_otp_sent_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_attempt_otp_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_finish_otp_v1(text, text, uuid, text) TO service_role;

COMMIT;
