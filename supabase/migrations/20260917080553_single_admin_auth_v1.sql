-- Apply once after existing migrations. No customer policies are changed.
BEGIN;
CREATE TABLE public.admin_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT false,
  challenge_hash text,
  challenge_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  send_window timestamptz NOT NULL DEFAULT now(),
  sends integer NOT NULL DEFAULT 0,
  verify_window timestamptz NOT NULL DEFAULT now(),
  verifications integer NOT NULL DEFAULT 0
);
INSERT INTO public.admin_identity(singleton) VALUES (true);
CREATE TABLE public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text UNIQUE NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours',
  revoked_at timestamptz
);
CREATE TABLE public.admin_auth_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id uuid,
  event text NOT NULL CHECK (event IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_auth_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_identity, public.admin_sessions, public.admin_auth_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_auth_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
-- No browser policies. Only narrow server RPCs use these tables.
REVOKE ALL ON public.admin_identity, public.admin_sessions, public.admin_auth_events FROM service_role;

CREATE FUNCTION public.admin_identity_id_v1() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.auth_user_id FROM public.admin_identity i JOIN auth.users u ON u.id=i.auth_user_id
  WHERE i.singleton AND i.enabled AND lower(u.email)='admin@profilerelaunch.com'
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now());
$$;

CREATE FUNCTION public.admin_begin_otp_v1(p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.admin_identity; uid uuid;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v FROM public.admin_identity WHERE singleton FOR UPDATE;
  uid := public.admin_identity_id_v1();
  IF uid IS NULL THEN RETURN NULL; END IF;
  IF v.last_sent_at > now()-interval '60 seconds' THEN RETURN NULL; END IF;
  IF v.send_window <= now()-interval '1 hour' THEN v.sends:=0; v.send_window:=now(); END IF;
  IF v.sends >= 10 THEN RETURN NULL; END IF;
  UPDATE public.admin_identity SET challenge_hash=p_hash, challenge_expires_at=now()+interval '10 minutes',
    attempts=0, last_sent_at=now(), sends=v.sends+1, send_window=v.send_window WHERE singleton;
  -- Bounded retention of expired sessions; event retention is a separate operations policy.
  DELETE FROM public.admin_sessions WHERE expires_at < now()-interval '30 days';
  RETURN uid;
END;
$$;

CREATE FUNCTION public.admin_attempt_otp_v1(p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.admin_identity; uid uuid;
BEGIN
  SELECT * INTO v FROM public.admin_identity WHERE singleton FOR UPDATE;
  uid := public.admin_identity_id_v1();
  IF uid IS NULL OR p_hash IS NULL OR v.challenge_hash IS DISTINCT FROM p_hash
     OR v.challenge_expires_at <= now() OR v.attempts >= 5 THEN RETURN NULL; END IF;
  IF v.verify_window <= now()-interval '10 minutes' THEN v.verifications:=0; v.verify_window:=now(); END IF;
  IF v.verifications >= 20 THEN RETURN NULL; END IF;
  UPDATE public.admin_identity SET attempts=attempts+1, verifications=v.verifications+1,
    verify_window=v.verify_window WHERE singleton;
  RETURN uid;
END;
$$;

CREATE FUNCTION public.admin_finish_otp_v1(p_challenge text, p_token text, p_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.admin_identity;
BEGIN
  SELECT * INTO v FROM public.admin_identity WHERE singleton FOR UPDATE;
  IF p_user IS NULL OR public.admin_identity_id_v1() IS DISTINCT FROM p_user
     OR p_challenge IS NULL OR v.challenge_hash IS DISTINCT FROM p_challenge
     OR v.challenge_expires_at <= now() OR v.attempts < 1
     OR p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  UPDATE public.admin_identity SET challenge_hash=NULL, challenge_expires_at=NULL WHERE singleton;
  INSERT INTO public.admin_sessions(token_hash,auth_user_id) VALUES (p_token,p_user);
  INSERT INTO public.admin_auth_events(auth_user_id,event) VALUES (p_user,'SIGNED_IN');
  RETURN true;
END;
$$;

CREATE FUNCTION public.admin_session_v1(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.admin_sessions;
BEGIN
  UPDATE public.admin_sessions SET last_seen_at=now()
  WHERE token_hash=p_token AND auth_user_id=public.admin_identity_id_v1()
    AND revoked_at IS NULL AND expires_at > now() AND last_seen_at > now()-interval '30 minutes'
  RETURNING * INTO s;
  IF s.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',s.id,'userId',s.auth_user_id,'createdAt',s.created_at,'expiresAt',s.expires_at);
END;
$$;

CREATE FUNCTION public.admin_revoke_sessions_v1(p_token text, p_all boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.admin_sessions;
BEGIN
  SELECT * INTO s FROM public.admin_sessions WHERE token_hash=p_token AND revoked_at IS NULL;
  IF s.id IS NULL THEN RETURN false; END IF;
  -- Current token can always be revoked, even when the identity has been disabled.
  IF p_all AND (s.auth_user_id IS DISTINCT FROM public.admin_identity_id_v1()
    OR s.expires_at <= now() OR s.last_seen_at <= now()-interval '30 minutes') THEN RETURN false; END IF;
  UPDATE public.admin_sessions SET revoked_at=now() WHERE revoked_at IS NULL
    AND (id=s.id OR (p_all AND auth_user_id=s.auth_user_id));
  IF p_all THEN
    UPDATE public.admin_identity SET challenge_hash=NULL,challenge_expires_at=NULL WHERE singleton;
  END IF;
  INSERT INTO public.admin_auth_events(auth_user_id,event)
    VALUES (s.auth_user_id,CASE WHEN p_all THEN 'SIGNED_OUT_ALL' ELSE 'SIGNED_OUT' END);
  RETURN true;
END;
$$;

CREATE FUNCTION public.admin_list_sessions_v1(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_session jsonb;
BEGIN
  current_session:=public.admin_session_v1(p_token);
  IF current_session IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,
    'lastSeenAt',s.last_seen_at,'expiresAt',s.expires_at,'current',s.id::text=current_session->>'id')
    ORDER BY s.created_at DESC),'[]'::jsonb)
    FROM public.admin_sessions s WHERE s.auth_user_id=(current_session->>'userId')::uuid
      AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_identity_id_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_begin_otp_v1(text), public.admin_attempt_otp_v1(text),
 public.admin_finish_otp_v1(text,text,uuid), public.admin_session_v1(text),
 public.admin_revoke_sessions_v1(text,boolean), public.admin_list_sessions_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_begin_otp_v1(text), public.admin_attempt_otp_v1(text),
 public.admin_finish_otp_v1(text,text,uuid), public.admin_session_v1(text),
 public.admin_revoke_sessions_v1(text,boolean), public.admin_list_sessions_v1(text) TO service_role;
COMMIT;
