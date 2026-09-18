BEGIN;

CREATE TABLE public.agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  agreement_kind text NOT NULL CHECK (agreement_kind IN ('SERVICE_AGREEMENT','CASE_MANAGEMENT_PERMISSION')),
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  body_text text NOT NULL CHECK (length(btrim(body_text)) BETWEEN 20 AND 50000),
  scope_text text NOT NULL CHECK (length(btrim(scope_text)) BETWEEN 10 AND 5000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{32}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agreement_versions_case_kind_number_idx
  ON public.agreement_versions(case_id, agreement_kind, version_number) WHERE case_id IS NOT NULL;
CREATE UNIQUE INDEX agreement_versions_nocase_kind_number_idx
  ON public.agreement_versions(customer_id, business_id, agreement_kind, version_number) WHERE case_id IS NULL;
CREATE INDEX agreement_versions_case_idx ON public.agreement_versions(case_id, agreement_kind, version_number DESC);

CREATE TABLE public.authorization_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_version_id uuid NOT NULL REFERENCES public.agreement_versions(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  authorization_kind text NOT NULL CHECK (authorization_kind IN ('SERVICE_AGREEMENT','CASE_MANAGEMENT_PERMISSION')),
  status text NOT NULL CHECK (status IN ('ACTIVE','REVIEW_REQUIRED','REVOKED')),
  accepted_by_auth_user_id uuid NOT NULL,
  accepted_email_snapshot text NOT NULL,
  accepted_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source = 'CUSTOMER_OTP'),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text NOT NULL DEFAULT '',
  record_version integer NOT NULL DEFAULT 1,
  CHECK (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(btrim(revocation_reason)) BETWEEN 10 AND 2000))
);
CREATE UNIQUE INDEX authorization_records_one_active_idx
  ON public.authorization_records(case_id, authorization_kind) WHERE status = 'ACTIVE' AND case_id IS NOT NULL;
CREATE INDEX authorization_records_case_idx ON public.authorization_records(case_id, authorization_kind);

CREATE TABLE public.authorization_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  authorization_id uuid NOT NULL REFERENCES public.authorization_records(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('AUTHORIZATION_ACCEPTED','AUTHORIZATION_REVOKED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX authorization_events_auth_idx ON public.authorization_events(authorization_id, id DESC);

CREATE TABLE public.customer_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  agreement_version_id uuid REFERENCES public.agreement_versions(id) ON DELETE RESTRICT,
  authorization_id uuid REFERENCES public.authorization_records(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('AGREEMENT_ACCEPTANCE','AUTHORIZATION_REVOCATION')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','DECLINED','REVOKED')),
  secret_hash text NOT NULL UNIQUE CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  expected_email_snapshot text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  revoked_at timestamptz,
  record_version integer NOT NULL DEFAULT 1,
  CHECK (kind <> 'AGREEMENT_ACCEPTANCE' OR agreement_version_id IS NOT NULL),
  CHECK (kind <> 'AUTHORIZATION_REVOCATION' OR authorization_id IS NOT NULL),
  CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),
  CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)
);
CREATE INDEX customer_actions_case_idx ON public.customer_actions(case_id, created_at DESC);
CREATE INDEX customer_actions_customer_idx ON public.customer_actions(customer_id, status);
CREATE UNIQUE INDEX customer_actions_one_open_kind_idx
  ON public.customer_actions(case_id, kind, coalesce(agreement_version_id, authorization_id))
  WHERE status = 'OPEN' AND case_id IS NOT NULL;

CREATE TABLE public.customer_action_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN (
    'ACTION_CREATED','ACTION_EXCHANGED','OTP_SENT','ACTION_COMPLETED','ACTION_DECLINED','ACTION_REVOKED'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_action_events_action_idx ON public.customer_action_events(action_id, id DESC);

CREATE TABLE public.location_manager_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL UNIQUE REFERENCES public.locations(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('VERIFIED','REVOKED')),
  access_level text NOT NULL CHECK (access_level IN ('MANAGER','OWNER')),
  verified_at timestamptz,
  verified_by uuid,
  evidence text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 10 AND 1000),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text NOT NULL DEFAULT '',
  record_version integer NOT NULL DEFAULT 1,
  CHECK (status <> 'VERIFIED' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)),
  CHECK (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(btrim(revocation_reason)) BETWEEN 10 AND 2000))
);
CREATE INDEX location_manager_access_business_idx ON public.location_manager_access(business_id);

CREATE TABLE public.location_manager_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manager_access_id uuid NOT NULL REFERENCES public.location_manager_access(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('MANAGER_ACCESS_VERIFIED','MANAGER_ACCESS_REVOKED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.customer_action_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  action_id uuid NOT NULL REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX customer_action_sessions_action_idx ON admin_private.customer_action_sessions(action_id);

CREATE TABLE admin_private.customer_action_challenges (
  action_id uuid PRIMARY KEY REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  pending_hash text NOT NULL UNIQUE CHECK (pending_hash ~ '^[a-f0-9]{64}$'),
  last_sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  challenge_expires_at timestamptz,
  pending_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.authorization_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_private.customer_action_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agreement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_action_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_manager_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_manager_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.customer_action_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.customer_action_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.authorization_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.customer_action_command_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agreement_versions, public.authorization_records, public.authorization_events,
  public.customer_actions, public.customer_action_events, public.location_manager_access, public.location_manager_access_events,
  admin_private.customer_action_sessions, admin_private.customer_action_challenges,
  admin_private.authorization_command_receipts, admin_private.customer_action_command_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.authorization_events_id_seq, public.customer_action_events_id_seq, public.location_manager_access_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.reject_agreement_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Agreement versions are immutable'; END; $$;
CREATE TRIGGER agreement_versions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.agreement_versions
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_agreement_mutation_v1();

CREATE FUNCTION admin_private.reject_authz_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Authorization events are append-only'; END; $$;
CREATE TRIGGER authorization_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.authorization_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_authz_event_change_v1();

CREATE FUNCTION admin_private.reject_action_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Customer action events are append-only'; END; $$;
CREATE TRIGGER customer_action_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.customer_action_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_action_event_change_v1();

CREATE FUNCTION admin_private.reject_manager_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Manager access events are append-only'; END; $$;
CREATE TRIGGER location_manager_access_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.location_manager_access_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_manager_event_change_v1();

CREATE FUNCTION admin_private.protect_authorization_acceptance_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
    OR NEW.accepted_by_auth_user_id IS DISTINCT FROM OLD.accepted_by_auth_user_id
    OR NEW.accepted_email_snapshot IS DISTINCT FROM OLD.accepted_email_snapshot
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.authorization_kind IS DISTINCT FROM OLD.authorization_kind
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
  THEN RAISE EXCEPTION 'Authorization acceptance fields are immutable'; END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER authorization_records_protect BEFORE UPDATE ON public.authorization_records
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_authorization_acceptance_v1();

CREATE FUNCTION admin_private.bump_customer_action_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_version := OLD.record_version + 1; RETURN NEW; END; $$;
CREATE TRIGGER customer_actions_record_version BEFORE UPDATE ON public.customer_actions
FOR EACH ROW EXECUTE FUNCTION admin_private.bump_customer_action_version_v1();

CREATE FUNCTION admin_private.bump_manager_access_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_version := OLD.record_version + 1; RETURN NEW; END; $$;
CREATE TRIGGER location_manager_access_record_version BEFORE UPDATE ON public.location_manager_access
FOR EACH ROW EXECUTE FUNCTION admin_private.bump_manager_access_version_v1();

CREATE FUNCTION admin_private.mask_email_v1(p_email text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' IN p_email) < 2 THEN '***'
    ELSE substr(split_part(lower(p_email), '@', 1), 1, 1) || '***@' || split_part(lower(p_email), '@', 2)
  END;
$$;

CREATE FUNCTION admin_private.customer_action_eligible_v1(p_action public.customer_actions) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE c public.customers; b public.businesses; loc public.locations; cs public.cases;
BEGIN
  IF p_action.id IS NULL OR p_action.status <> 'OPEN' OR p_action.expires_at <= now() THEN RETURN false; END IF;
  IF lower(p_action.expected_email_snapshot) = 'admin@profilerelaunch.com' THEN RETURN false; END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_action.customer_id;
  IF c.id IS NULL OR lower(c.email) IS DISTINCT FROM lower(p_action.expected_email_snapshot) THEN RETURN false; END IF;
  IF NOT admin_private.contact_verified_v1(c.id, 'email') THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'verified'
  ) THEN RETURN false; END IF;
  SELECT * INTO b FROM public.businesses WHERE id = p_action.business_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF p_action.location_id IS NOT NULL THEN
    SELECT * INTO loc FROM public.locations WHERE id = p_action.location_id;
    IF loc.id IS NULL OR loc.business_id <> p_action.business_id THEN RETURN false; END IF;
  END IF;
  IF p_action.case_id IS NOT NULL THEN
    SELECT * INTO cs FROM public.cases WHERE id = p_action.case_id;
    IF cs.id IS NULL OR cs.customer_id <> p_action.customer_id OR cs.business_id <> p_action.business_id THEN RETURN false; END IF;
    IF p_action.location_id IS NOT NULL AND cs.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF cs.status IN ('CLOSED','CANCELLED') THEN RETURN false; END IF;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.revoke_open_customer_actions_v1(p_customer uuid, p_business uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions;
BEGIN
  FOR a IN
    SELECT * FROM public.customer_actions
    WHERE status = 'OPEN' AND customer_id = p_customer AND (p_business IS NULL OR business_id = p_business)
    FOR UPDATE
  LOOP
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
    VALUES (a.id, a.case_id, a.created_by, 'ACTION_REVOKED', jsonb_build_object('source', 'TRUSTED_FACT_CHANGED', 'reason', left(p_reason, 200)));
    DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
    DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
  END LOOP;
END; $$;

CREATE FUNCTION admin_private.revoke_actions_on_customer_email_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF lower(OLD.email) IS DISTINCT FROM lower(NEW.email) THEN
    PERFORM admin_private.revoke_open_customer_actions_v1(NEW.id, NULL, 'Customer email changed.');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER customers_revoke_open_actions AFTER UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION admin_private.revoke_actions_on_customer_email_v1();

CREATE FUNCTION admin_private.revoke_actions_on_membership_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'verified' THEN
    PERFORM admin_private.revoke_open_customer_actions_v1(NEW.customer_id, NEW.business_id, 'Business authority is no longer verified.');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER business_memberships_revoke_open_actions AFTER UPDATE ON public.business_memberships
FOR EACH ROW EXECUTE FUNCTION admin_private.revoke_actions_on_membership_v1();

CREATE FUNCTION admin_private.authz_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.authorization_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.authorization_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict'); END IF;
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.customer_action_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.customer_action_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.customer_action_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict'); END IF;
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.case_authorization_readiness_v1(p_case uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE cs public.cases;
  business_ok boolean := false; email_ok boolean := false; service_ok boolean := false;
  permission_ok boolean := false; manager_ok boolean := false;
BEGIN
  SELECT * INTO cs FROM public.cases WHERE id = p_case;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  business_ok := EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
  );
  email_ok := admin_private.contact_verified_v1(cs.customer_id, 'email');
  service_ok := EXISTS (
    SELECT 1 FROM public.authorization_records r
    WHERE r.case_id = cs.id AND r.authorization_kind = 'SERVICE_AGREEMENT' AND r.status = 'ACTIVE'
  );
  permission_ok := EXISTS (
    SELECT 1 FROM public.authorization_records r
    WHERE r.case_id = cs.id AND r.authorization_kind = 'CASE_MANAGEMENT_PERMISSION' AND r.status = 'ACTIVE'
  );
  manager_ok := cs.location_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.location_manager_access a
    WHERE a.location_id = cs.location_id AND a.business_id = cs.business_id AND a.status = 'VERIFIED'
  );
  RETURN jsonb_build_object(
    'businessAuthorityVerified', business_ok,
    'customerEmailVerified', email_ok,
    'serviceAgreementAccepted', service_ok,
    'caseManagementPermissionActive', permission_ok,
    'managerAccessVerified', manager_ok,
    'authorizationReady', business_ok AND email_ok AND service_ok AND permission_ok AND manager_ok
  );
END; $$;

CREATE FUNCTION public.admin_case_authorization_readiness_v1(p_token text, p_case uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  RETURN admin_private.case_authorization_readiness_v1(p_case);
END; $$;

CREATE FUNCTION public.admin_case_authorization_v1(p_token text, p_case uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cs public.cases; c public.customers; result jsonb; ready jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = p_case;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT * INTO c FROM public.customers WHERE id = cs.customer_id;
  ready := admin_private.case_authorization_readiness_v1(p_case);
  SELECT jsonb_build_object(
    'caseId', cs.id,
    'reference', cs.public_ref,
    'customerId', cs.customer_id,
    'businessId', cs.business_id,
    'locationId', cs.location_id,
    'track', cs.service_track,
    'stage', cs.work_stage,
    'emailMasked', admin_private.mask_email_v1(c.email),
    'membershipStatus', coalesce((SELECT m.status FROM public.business_memberships m WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id), 'missing'),
    'readiness', ready,
    'readinessNote', 'Authorisation readiness is not payment, quote acceptance, permission to submit, or a workflow transition.',
    'agreements', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'kind', v.agreement_kind, 'versionNumber', v.version_number, 'title', v.title,
        'scope', v.scope_text, 'contentHash', v.content_hash, 'createdAt', v.created_at
      ) ORDER BY v.agreement_kind, v.version_number DESC)
      FROM public.agreement_versions v WHERE v.case_id = cs.id
    ), '[]'::jsonb),
    'authorizations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.authorization_kind, 'status', r.status, 'acceptedAt', r.accepted_at,
        'acceptedEmailMasked', admin_private.mask_email_v1(r.accepted_email_snapshot),
        'source', r.source, 'agreementVersionId', r.agreement_version_id, 'recordVersion', r.record_version,
        'revokedAt', r.revoked_at
      ) ORDER BY r.accepted_at DESC)
      FROM public.authorization_records r WHERE r.case_id = cs.id
    ), '[]'::jsonb),
    'actions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'kind', a.kind, 'status', a.status, 'expiresAt', a.expires_at, 'createdAt', a.created_at,
        'agreementVersionId', a.agreement_version_id, 'authorizationId', a.authorization_id, 'recordVersion', a.record_version
      ) ORDER BY a.created_at DESC)
      FROM (SELECT * FROM public.customer_actions WHERE case_id = cs.id ORDER BY created_at DESC LIMIT 20) a
    ), '[]'::jsonb),
    'managerAccess', (
      SELECT jsonb_build_object(
        'id', x.id, 'status', x.status, 'accessLevel', x.access_level, 'verifiedAt', x.verified_at,
        'evidence', x.evidence, 'recordVersion', x.record_version, 'revokedAt', x.revoked_at
      ) FROM public.location_manager_access x
      WHERE x.location_id = cs.location_id AND x.business_id = cs.business_id
    )
  ) INTO result;
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_authorization_command_v1(
  p_token text, p_request uuid, p_case uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; cs public.cases; c public.customers; loc public.locations; fp text; cached jsonb; result jsonb;
  data jsonb; p_kind text; title text; body text; scope text; expires timestamptz; next_no integer;
  v public.agreement_versions; a public.customer_actions; auth public.authorization_records; note text; secret text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL
    OR p_operation NOT IN ('create_agreement_action','revoke_action','create_revocation_action','admin_revoke_authorization')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 65536
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  secret := data->>'secretHash';
  data := data - 'secretHash';
  fp := md5(jsonb_build_array(p_case, p_operation, data)::text);
  cached := admin_private.authz_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = p_case FOR UPDATE;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF cs.status IN ('CLOSED','CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO c FROM public.customers WHERE id = cs.customer_id;
  IF p_operation = 'create_agreement_action' THEN
    p_kind := data->>'kind';
    title := btrim(coalesce(data->>'title', ''));
    body := btrim(coalesce(data->>'bodyText', ''));
    scope := btrim(coalesce(data->>'scopeText', ''));
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF p_kind IS NULL OR p_kind NOT IN ('SERVICE_AGREEMENT','CASE_MANAGEMENT_PERMISSION')
      OR length(title) NOT BETWEEN 1 AND 200 OR length(body) NOT BETWEEN 20 AND 50000 OR length(scope) NOT BETWEEN 10 AND 5000
      OR expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF cs.location_id IS NOT NULL THEN
      SELECT * INTO loc FROM public.locations WHERE id = cs.location_id;
      IF loc.id IS NULL OR loc.business_id <> cs.business_id THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.customer_actions x
      WHERE x.case_id = cs.id AND x.kind = 'AGREEMENT_ACCEPTANCE' AND x.status = 'OPEN'
        AND x.agreement_version_id IN (SELECT id FROM public.agreement_versions WHERE case_id = cs.id AND agreement_kind = p_kind)
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    SELECT coalesce(max(version_number), 0) + 1 INTO next_no FROM public.agreement_versions WHERE case_id = cs.id AND agreement_kind = p_kind;
    INSERT INTO public.agreement_versions(case_id, customer_id, business_id, location_id, agreement_kind, version_number, title, body_text, scope_text, content_hash, created_by)
    VALUES (cs.id, cs.customer_id, cs.business_id, cs.location_id, p_kind, next_no, title, body, scope,
      md5(jsonb_build_array(p_kind, title, body, scope)::text), actor)
    RETURNING * INTO v;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, agreement_version_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, v.id, 'AGREEMENT_ACCEPTANCE', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
    VALUES (a.id, cs.id, actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind, 'agreementKind', p_kind, 'versionNumber', v.version_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer agreement action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id, 'kind', p_kind));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'agreementVersionId', v.id, 'versionNumber', v.version_number, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'revoke_action' THEN
    IF jsonb_typeof(data->'actionId') <> 'string' OR data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'reason', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN SELECT * INTO a FROM public.customer_actions WHERE id = (data->>'actionId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF a.id IS NULL OR a.case_id IS DISTINCT FROM cs.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF a.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
    VALUES (a.id, cs.id, actor, 'ACTION_REVOKED', jsonb_build_object('source', 'ADMIN', 'reason', left(note, 200)));
    DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
    DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer action revoked',
      jsonb_build_object('operation', p_operation, 'actionId', a.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'actionStatus', a.status);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'create_revocation_action' THEN
    IF jsonb_typeof(data->'authorizationId') <> 'string' OR secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN SELECT * INTO auth FROM public.authorization_records WHERE id = (data->>'authorizationId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM cs.id OR auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, authorization_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, auth.id, 'AUTHORIZATION_REVOCATION', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
    VALUES (a.id, cs.id, actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind, 'authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Authorization revocation action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'admin_revoke_authorization' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    IF jsonb_typeof(data->'authorizationId') <> 'string' OR data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'reason', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN SELECT * INTO auth FROM public.authorization_records WHERE id = (data->>'authorizationId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM cs.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF jsonb_typeof(data->'recordVersion') = 'number' AND (data->>'recordVersion')::integer IS DISTINCT FROM auth.record_version THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    IF auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.authorization_records
      SET status = 'REVOKED', revoked_at = now(), revoked_by = actor, revocation_reason = note
      WHERE id = auth.id RETURNING * INTO auth;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_id, event, details)
    VALUES (auth.id, cs.id, actor, 'AUTHORIZATION_REVOKED', jsonb_build_object('source', 'ADMIN_RECORDED_REVOCATION'));
    PERFORM admin_private.revoke_open_customer_actions_v1(cs.customer_id, cs.business_id, 'Related authorization was revoked.');
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Authorization revoked by Admin',
      jsonb_build_object('operation', p_operation, 'authorizationId', auth.id));
    result := jsonb_build_object('status', 'success', 'id', auth.id, 'authorizationStatus', auth.status, 'recordVersion', auth.record_version);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  RETURN jsonb_build_object('status', 'invalid');
END; $$;

CREATE FUNCTION public.admin_manager_access_command_v1(
  p_token text, p_request uuid, p_case uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; cs public.cases; loc public.locations; fp text; cached jsonb; result jsonb; data jsonb;
  evidence text; note text; level text; row public.location_manager_access;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL OR p_operation NOT IN ('verify','revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_case, p_operation, data)::text);
  cached := admin_private.authz_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = p_case FOR UPDATE;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF cs.location_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO loc FROM public.locations WHERE id = cs.location_id;
  IF loc.id IS NULL OR loc.business_id <> cs.business_id THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF p_operation = 'verify' THEN
    IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    level := data->>'accessLevel';
    evidence := btrim(coalesce(data->>'evidence', ''));
    IF level IS NULL OR level NOT IN ('MANAGER','OWNER') OR length(evidence) NOT BETWEEN 10 AND 1000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO row FROM public.location_manager_access WHERE location_id = loc.id FOR UPDATE;
    IF row.id IS NULL THEN
      INSERT INTO public.location_manager_access(business_id, location_id, status, access_level, verified_at, verified_by, evidence)
      VALUES (cs.business_id, loc.id, 'VERIFIED', level, now(), actor, evidence) RETURNING * INTO row;
    ELSE
      UPDATE public.location_manager_access
        SET status = 'VERIFIED', access_level = level, verified_at = now(), verified_by = actor, evidence = evidence,
            revoked_at = NULL, revoked_by = NULL, revocation_reason = ''
        WHERE id = row.id RETURNING * INTO row;
    END IF;
    INSERT INTO public.location_manager_access_events(manager_access_id, location_id, actor_id, event, details)
    VALUES (row.id, loc.id, actor, 'MANAGER_ACCESS_VERIFIED', jsonb_build_object('accessLevel', level));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Google Manager access verified',
      jsonb_build_object('operation', p_operation, 'locationId', loc.id, 'accessLevel', level));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'managerStatus', row.status, 'recordVersion', row.record_version);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  note := btrim(coalesce(data->>'reason', ''));
  IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO row FROM public.location_manager_access WHERE location_id = loc.id FOR UPDATE;
  IF row.id IS NULL OR row.status <> 'VERIFIED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  UPDATE public.location_manager_access
    SET status = 'REVOKED', revoked_at = now(), revoked_by = actor, revocation_reason = note
    WHERE id = row.id RETURNING * INTO row;
  INSERT INTO public.location_manager_access_events(manager_access_id, location_id, actor_id, event, details)
  VALUES (row.id, loc.id, actor, 'MANAGER_ACCESS_REVOKED', jsonb_build_object('reason', left(note, 200)));
  PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Google Manager access revoked',
    jsonb_build_object('operation', p_operation, 'locationId', loc.id));
  result := jsonb_build_object('status', 'success', 'id', row.id, 'managerStatus', row.status, 'recordVersion', row.record_version);
  INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.customer_action_exchange_v1(p_action uuid, p_secret_hash text, p_pending_hash text) RETURNS jsonb
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
  ON CONFLICT (action_id) DO UPDATE SET pending_hash = EXCLUDED.pending_hash, pending_expires_at = EXCLUDED.pending_expires_at,
    last_sent_at = NULL, attempts = 0, challenge_expires_at = NULL;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
  VALUES (a.id, a.case_id, a.created_by, 'ACTION_EXCHANGED', jsonb_build_object('kind', a.kind));
  RETURN jsonb_build_object('status', 'ok', 'kind', a.kind, 'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot));
END; $$;

CREATE FUNCTION public.customer_action_begin_otp_v1(p_pending_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ch admin_private.customer_action_challenges; a public.customer_actions;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO ch FROM admin_private.customer_action_challenges WHERE pending_hash = p_pending_hash FOR UPDATE;
  IF ch.action_id IS NULL OR ch.pending_expires_at <= now() THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = ch.action_id FOR UPDATE;
  IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF ch.last_sent_at IS NOT NULL AND ch.last_sent_at > now() - interval '60 seconds' THEN RETURN jsonb_build_object('status', 'rate_limited'); END IF;
  UPDATE admin_private.customer_action_challenges
    SET last_sent_at = now(), attempts = 0, challenge_expires_at = now() + interval '10 minutes'
    WHERE action_id = a.id;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
  VALUES (a.id, a.case_id, a.created_by, 'OTP_SENT', jsonb_build_object('kind', a.kind));
  RETURN jsonb_build_object('status', 'ok', 'email', a.expected_email_snapshot, 'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot));
END; $$;

CREATE FUNCTION public.customer_action_attempt_otp_v1(p_pending_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ch admin_private.customer_action_challenges; a public.customer_actions;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO ch FROM admin_private.customer_action_challenges WHERE pending_hash = p_pending_hash FOR UPDATE;
  IF ch.action_id IS NULL OR ch.pending_expires_at <= now() OR ch.challenge_expires_at IS NULL OR ch.challenge_expires_at <= now()
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = ch.action_id FOR UPDATE;
  IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF ch.attempts >= 5 THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  UPDATE admin_private.customer_action_challenges SET attempts = attempts + 1 WHERE action_id = a.id RETURNING * INTO ch;
  IF ch.attempts > 5 THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  RETURN jsonb_build_object('status', 'ok', 'actionId', a.id, 'email', a.expected_email_snapshot);
END; $$;

CREATE FUNCTION public.customer_action_finish_otp_v1(p_pending_hash text, p_session_hash text, p_auth_user uuid, p_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ch admin_private.customer_action_challenges; a public.customer_actions; uid uuid;
BEGIN
  IF p_pending_hash IS NULL OR p_pending_hash !~ '^[a-f0-9]{64}$' OR p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$'
    OR p_auth_user IS NULL OR p_email IS NULL
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF lower(p_email) = 'admin@profilerelaunch.com' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO ch FROM admin_private.customer_action_challenges WHERE pending_hash = p_pending_hash FOR UPDATE;
  IF ch.action_id IS NULL OR ch.pending_expires_at <= now() OR ch.challenge_expires_at IS NULL OR ch.challenge_expires_at <= now()
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = ch.action_id FOR UPDATE;
  IF NOT admin_private.customer_action_eligible_v1(a) OR lower(p_email) IS DISTINCT FROM lower(a.expected_email_snapshot)
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

CREATE FUNCTION public.customer_action_session_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; cs public.cases; b public.businesses; loc public.locations;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  IF a.agreement_version_id IS NOT NULL THEN SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id; END IF;
  IF a.authorization_id IS NOT NULL THEN SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id; END IF;
  RETURN jsonb_build_object(
    'actionId', a.id,
    'kind', a.kind,
    'status', a.status,
    'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
    'caseReference', cs.public_ref,
    'businessName', b.display_name,
    'locationName', loc.location_name,
    'agreement', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v.id, 'kind', v.agreement_kind, 'title', v.title, 'body', v.body_text, 'scope', v.scope_text, 'versionNumber', v.version_number
    ) END,
    'authorization', CASE WHEN auth.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', auth.id, 'kind', auth.authorization_kind, 'status', auth.status
    ) END
  );
END; $$;

CREATE FUNCTION public.customer_action_command_v1(p_token_hash text, p_request uuid, p_operation text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; fp text; cached jsonb; result jsonb; data jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('accept','decline','revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(sess.action_id, p_operation, data)::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation IN ('accept','decline') THEN
    IF a.kind <> 'AGREEMENT_ACCEPTANCE' OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id;
    IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF p_operation = 'decline' THEN
      UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
      INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
      VALUES (a.id, a.case_id, sess.auth_user_id, 'ACTION_DECLINED', jsonb_build_object('kind', v.agreement_kind));
      PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer declined an agreement action',
        jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id));
      result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.authorization_records r
      WHERE r.case_id = a.case_id AND r.authorization_kind = v.agreement_kind AND r.status = 'ACTIVE'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.authorization_records(
      agreement_version_id, case_id, customer_id, business_id, location_id, authorization_kind, status,
      accepted_by_auth_user_id, accepted_email_snapshot, accepted_at, source
    ) VALUES (
      v.id, a.case_id, a.customer_id, a.business_id, a.location_id, v.agreement_kind, 'ACTIVE',
      sess.auth_user_id, a.expected_email_snapshot, now(), 'CUSTOMER_OTP'
    ) RETURNING * INTO auth;
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_id, event, details)
    VALUES (auth.id, a.case_id, sess.auth_user_id, 'AUTHORIZATION_ACCEPTED', jsonb_build_object('source', 'CUSTOMER_OTP', 'actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
    VALUES (a.id, a.case_id, sess.auth_user_id, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer accepted an agreement',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'kind', v.agreement_kind));
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationId', auth.id, 'authorizationStatus', auth.status);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF a.kind <> 'AUTHORIZATION_REVOCATION' OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id FOR UPDATE;
  IF auth.id IS NULL OR auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  UPDATE public.authorization_records
    SET status = 'REVOKED', revoked_at = now(), revoked_by = sess.auth_user_id,
        revocation_reason = 'Customer revoked this authorisation through a verified action.'
    WHERE id = auth.id RETURNING * INTO auth;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
  INSERT INTO public.authorization_events(authorization_id, case_id, actor_id, event, details)
  VALUES (auth.id, a.case_id, sess.auth_user_id, 'AUTHORIZATION_REVOKED', jsonb_build_object('source', 'CUSTOMER_OTP', 'actionId', a.id));
  INSERT INTO public.customer_action_events(action_id, case_id, actor_id, event, details)
  VALUES (a.id, a.case_id, sess.auth_user_id, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
  PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer revoked an authorisation',
    jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id));
  result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationStatus', auth.status);
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
  RETURN result;
END; $$;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED','AUTHORIZATION_CHANGED'
));
CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED','AUTHORIZATION_CHANGED'))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION admin_private.reject_agreement_mutation_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.reject_authz_event_change_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.reject_action_event_change_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.reject_manager_event_change_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_authorization_acceptance_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.bump_customer_action_version_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.bump_manager_access_version_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.mask_email_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_action_eligible_v1(public.customer_actions) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.revoke_open_customer_actions_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.revoke_actions_on_customer_email_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.revoke_actions_on_membership_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.authz_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_action_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.case_authorization_readiness_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_case_authorization_readiness_v1(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_case_authorization_v1(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_authorization_command_v1(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_manager_access_command_v1(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_exchange_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_begin_otp_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_attempt_otp_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_finish_otp_v1(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_session_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_case_authorization_readiness_v1(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_authorization_v1(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_authorization_command_v1(text, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_manager_access_command_v1(text, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_exchange_v1(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_begin_otp_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_attempt_otp_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_finish_otp_v1(text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) TO service_role;

COMMIT;
