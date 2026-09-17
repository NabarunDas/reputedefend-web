BEGIN;
CREATE SCHEMA IF NOT EXISTS admin_private;
REVOKE ALL ON SCHEMA admin_private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE public.admin_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED')),
  outcome text NOT NULL CHECK (outcome IN ('success','denied','conflict','reauth_required')),
  target_id uuid,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_event_id bigint UNIQUE
);
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_audit_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX admin_audit_action_id_idx ON public.admin_audit_events(action,id DESC);
CREATE INDEX admin_audit_outcome_id_idx ON public.admin_audit_events(outcome,id DESC);

-- No JSON payloads, tokens, email bodies, or customer data can enter this writer.
CREATE FUNCTION admin_private.write_audit_v1(p_actor uuid,p_action text,p_outcome text,p_target uuid,p_request uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.admin_audit_events(actor_id,action,outcome,target_id,request_id)
  VALUES(p_actor,p_action,p_outcome,p_target,p_request);
$$;
CREATE FUNCTION admin_private.reject_audit_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Admin audit records are append-only'; END;
$$;
CREATE TRIGGER admin_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.admin_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_audit_change_v1();

-- Keep existing login/logout RPCs compatible. Auth and audit writes commit together.
CREATE FUNCTION admin_private.audit_auth_event_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.admin_audit_events(actor_id,action,outcome,created_at,auth_event_id)
  VALUES(NEW.auth_user_id,NEW.event,'success',NEW.created_at,NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER admin_auth_audit AFTER INSERT ON public.admin_auth_events
FOR EACH ROW EXECUTE FUNCTION admin_private.audit_auth_event_v1();
INSERT INTO public.admin_audit_events(actor_id,action,outcome,created_at,auth_event_id)
SELECT auth_user_id,event,'success',created_at,id FROM public.admin_auth_events ORDER BY id;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA admin_private FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_audit_list_v1(p_token text,p_before bigint DEFAULT NULL,p_action text DEFAULT NULL,p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s jsonb; result jsonb;
BEGIN
  s:=public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before<1)
    OR (p_action IS NOT NULL AND p_action NOT IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED'))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'createdAt',e.created_at,
    'action',e.action,'outcome',e.outcome,'targetId',e.target_id,'requestId',e.request_id) ORDER BY e.id DESC),'[]'::jsonb)
  INTO result FROM (SELECT id,created_at,action,outcome,target_id,request_id FROM public.admin_audit_events
    WHERE (p_before IS NULL OR id<p_before) AND (p_action IS NULL OR action=p_action)
      AND (p_outcome IS NULL OR outcome=p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END;
$$;

-- A concrete scoped command. Actor and permissions come from the live session, never the payload.
CREATE FUNCTION public.admin_revoke_session_v1(p_token text,p_target uuid,p_request uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s jsonb; outcome text;
BEGIN
  IF p_request IS NULL OR p_target IS NULL THEN RETURN 'invalid'; END IF;
  -- Stable lock order prevents two devices ending each other from deadlocking.
  PERFORM id FROM public.admin_sessions WHERE token_hash=p_token OR id=p_target ORDER BY id FOR UPDATE;
  s:=public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN 'unauthorized'; END IF;
  IF (s->>'createdAt')::timestamptz < now()-interval '5 minutes' THEN outcome:='reauth_required';
  ELSIF p_target=(s->>'id')::uuid THEN outcome:='denied';
  ELSE
    -- Compare-and-set: a stale/replayed action cannot modify an ended or unrelated session.
    UPDATE public.admin_sessions SET revoked_at=now() WHERE id=p_target
      AND auth_user_id=(s->>'userId')::uuid AND revoked_at IS NULL
      AND expires_at>now() AND last_seen_at>now()-interval '30 minutes';
    IF FOUND THEN outcome:='success'; ELSE outcome:='conflict'; END IF;
  END IF;
  PERFORM admin_private.write_audit_v1((s->>'userId')::uuid,'SESSION_REVOKED',outcome,p_target,p_request);
  RETURN outcome;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_audit_list_v1(text,bigint,text,text),public.admin_revoke_session_v1(text,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_audit_list_v1(text,bigint,text,text),public.admin_revoke_session_v1(text,uuid,uuid) TO service_role;
COMMIT;
