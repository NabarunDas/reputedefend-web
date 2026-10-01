-- Google Business Profile integration readiness (Step 21).
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / GOOGLE API ACCESS DISABLED
-- Generated with: npx supabase migration new google_integration_readiness_v1
-- Do not apply from this PR. Do not request Google or Supabase credentials.
-- Do not replay or modify applied migrations (Steps 10-20).
-- Additive only: new tables, new functions, and one widened audit action check.
-- GOOGLE_BUSINESS_PROFILE_API_ENABLED remains unset. Provider mode remains manual.
-- No token plaintext is stored here and no encryption key is stored here.
--
-- Nothing in this file can be reached in this build. The connection flow has no
-- token exchange and no transport, which is a property of the code rather than
-- of configuration, so these functions exist for a later activation step.

BEGIN;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED',
  'PAYMENT_CHANGED','GUARD_CHANGED','REPORT_CHANGED','SETTINGS_CHANGED','TEMPLATE_CHANGED','PRIVACY_CHANGED',
  'COMPLAINT_CHANGED','INCIDENT_CHANGED','INTEGRATION_CHANGED'
));

-- OAuth state. Only the SHA-256 hash of the state is kept, so a reader of this
-- table cannot replay an authorization. Single use is enforced by consumed_at.
--
-- customer_id is NOT NULL because an authorization that cannot be attributed
-- to one customer could later attach a Google grant to nothing in particular.
-- A location always implies a business, and the function boundary below checks
-- that the business and location genuinely belong to that customer.
CREATE TABLE public.provider_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('GOOGLE_BUSINESS_PROFILE')),
  state_hash text NOT NULL UNIQUE CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid NOT NULL,
  session_binding text NOT NULL CHECK (session_binding ~ '^[0-9a-f]{64}$'),
  redirect_uri text NOT NULL CHECK (redirect_uri ~ '^https://'),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  outcome text CHECK (outcome IN ('ACCEPTED','REJECTED','CANCELLED')),
  -- A fixed vocabulary, never free text. Browser input and Google error
  -- bodies are classified in code and only the classification is stored.
  rejection_reason text CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'access_denied','authorization_failed','cancelled_by_admin','code_missing',
    'state_malformed','state_unknown','state_expired','state_replayed','context_mismatch','redirect_mismatch'
  )),
  CONSTRAINT provider_oauth_state_window CHECK (expires_at > created_at),
  CONSTRAINT provider_oauth_state_consumed CHECK ((consumed_at IS NULL) = (outcome IS NULL)),
  CONSTRAINT provider_oauth_state_scope CHECK (location_id IS NULL OR business_id IS NOT NULL)
);
CREATE INDEX provider_oauth_states_expiry ON public.provider_oauth_states(expires_at) WHERE consumed_at IS NULL;
ALTER TABLE public.provider_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_oauth_states FROM PUBLIC, anon, authenticated, service_role;

-- Encrypted provider tokens. The ciphertext is AES-256-GCM and the key lives
-- only in the server process, never in this table or any RPC response.
CREATE TABLE public.provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('GOOGLE_BUSINESS_PROFILE')),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  account_ref text CHECK (account_ref IS NULL OR length(account_ref) <= 200),
  status text NOT NULL DEFAULT 'CONNECTED'
    CHECK (status IN ('CONNECTED','REVOKED','EXPIRED','AUTH_REQUIRED')),
  token_ciphertext text NOT NULL CHECK (length(token_ciphertext) BETWEEN 1 AND 8000),
  token_iv text NOT NULL CHECK (length(token_iv) BETWEEN 1 AND 64),
  token_auth_tag text NOT NULL CHECK (length(token_auth_tag) BETWEEN 1 AND 64),
  encryption_key_version text NOT NULL CHECK (length(encryption_key_version) BETWEEN 1 AND 20),
  granted_scopes text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_success_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code IN (
    'CONFIGURATION_MISSING','AUTH_REVOKED','INSUFFICIENT_SCOPE','PERMISSION_DENIED','ACCOUNT_INACCESSIBLE',
    'LOCATION_UNAVAILABLE','QUOTA_EXCEEDED','TRANSIENT_FAILURE','MALFORMED_RESPONSE','PROVIDER_DISABLED'
  )),
  last_error_at timestamptz,
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  -- Ciphertext must never be a readable token. A value carrying an OAuth token
  -- prefix is rejected outright rather than silently stored.
  CONSTRAINT provider_connection_ciphertext_opaque CHECK (
    token_ciphertext NOT LIKE 'ya29.%' AND token_ciphertext NOT LIKE '1//%'
  ),
  CONSTRAINT provider_connection_revoked CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL)),
  CONSTRAINT provider_connection_error_pair CHECK ((last_error_code IS NULL) = (last_error_at IS NULL)),
  CONSTRAINT provider_connection_scope CHECK (location_id IS NULL OR business_id IS NOT NULL)
);
-- One live connection per provider and location.
CREATE UNIQUE INDEX provider_connections_live
  ON public.provider_connections(provider, coalesce(location_id, business_id, customer_id))
  WHERE status <> 'REVOKED';
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_connections FROM PUBLIC, anon, authenticated, service_role;

-- Connection history is append-only so a revocation cannot be erased.
CREATE TABLE public.provider_connection_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connection_id uuid REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('GOOGLE_BUSINESS_PROFILE')),
  kind text NOT NULL CHECK (kind IN (
    'CONNECTION_INITIATED','CALLBACK_REJECTED','CONNECTION_ESTABLISHED','AUTHORIZATION_REVOKED',
    'REAUTHORIZATION_REQUIRED','PROVIDER_FALLBACK_ACTIVATED','CONNECTION_DISCONNECTED'
  )),
  -- Classifications only. There is no path for an arbitrary string to land
  -- here, so a browser reason or a Google error body cannot become history.
  detail text CHECK (detail IS NULL OR detail IN (
    'connect_requested','authorization_stored','authorization_revoked','disconnected_by_admin',
    'access_denied','authorization_failed','cancelled_by_admin','code_missing',
    'state_malformed','state_unknown','state_expired','state_replayed','context_mismatch','redirect_mismatch',
    'CONFIGURATION_MISSING','AUTH_REVOKED','INSUFFICIENT_SCOPE','PERMISSION_DENIED','ACCOUNT_INACCESSIBLE',
    'LOCATION_UNAVAILABLE','QUOTA_EXCEEDED','TRANSIENT_FAILURE','MALFORMED_RESPONSE','PROVIDER_DISABLED'
  )),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_connection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_connection_events FROM PUBLIC, anon, authenticated, service_role;

-- A connection row is a record of one authorization, so everything that
-- identifies that authorization is write-once: who it is for, which Google
-- account answered, what was granted, when the grant runs out, and the
-- encrypted material itself. Only lifecycle status and the last normalised
-- error may move. A new authorization means a new row, which
-- provider_connection_store_v1 creates after revoking the previous one.
--
-- granted_scopes and token_expires_at are deliberately immutable rather than
-- lifecycle metadata. Refreshing a token would change token_expires_at, and a
-- re-consent would change granted_scopes, but this build has no token
-- exchange, so no refresh can happen. Leaving them writable now would mean
-- shipping an unaudited mutation path before there is anything to mutate. At
-- live activation they get an explicit refresh operation with its own allowed
-- transitions, record-version concurrency check and normalised audit event,
-- rather than an arbitrary UPDATE.
CREATE FUNCTION admin_private.protect_provider_connection_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Provider connections are not deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.account_ref IS DISTINCT FROM OLD.account_ref
      OR NEW.granted_scopes IS DISTINCT FROM OLD.granted_scopes
      OR NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
      OR NEW.token_ciphertext IS DISTINCT FROM OLD.token_ciphertext
      OR NEW.token_iv IS DISTINCT FROM OLD.token_iv
      OR NEW.token_auth_tag IS DISTINCT FROM OLD.token_auth_tag
      OR NEW.encryption_key_version IS DISTINCT FROM OLD.encryption_key_version
      OR NEW.connected_at IS DISTINCT FROM OLD.connected_at
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN RAISE EXCEPTION 'Provider connection facts are immutable'; END IF;
    IF OLD.status = 'REVOKED' AND NEW.status IS DISTINCT FROM 'REVOKED' THEN
      RAISE EXCEPTION 'A revoked provider connection cannot be reopened';
    END IF;
    IF NEW.record_version IS DISTINCT FROM OLD.record_version + 1 THEN
      RAISE EXCEPTION 'Provider connection version increment is required';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER provider_connections_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.provider_connections
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_provider_connection_v1();

CREATE FUNCTION admin_private.protect_provider_connection_event_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Provider connection events are append-only';
END; $$;
CREATE TRIGGER provider_connection_events_protect
  BEFORE UPDATE OR DELETE ON public.provider_connection_events
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_provider_connection_event_v1();

-- An OAuth state row is single use. Once consumed it cannot be rewritten, so a
-- replayed callback can never be made to look fresh.
CREATE FUNCTION admin_private.protect_provider_oauth_state_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.consumed_at IS NULL AND OLD.expires_at > now() THEN
      RAISE EXCEPTION 'A live OAuth state cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'OAuth state is single use'; END IF;
    IF NEW.state_hash IS DISTINCT FROM OLD.state_hash
      OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
      OR NEW.session_binding IS DISTINCT FROM OLD.session_binding
      OR NEW.redirect_uri IS DISTINCT FROM OLD.redirect_uri
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN RAISE EXCEPTION 'OAuth state facts are immutable'; END IF;
    IF NEW.consumed_at IS NULL THEN RAISE EXCEPTION 'An OAuth state update must consume it'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER provider_oauth_states_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.provider_oauth_states
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_provider_oauth_state_v1();

-- Admin-safe projection. Deliberately omits ciphertext, IV, auth tag and key
-- version so no RPC can return token material even by accident.
CREATE FUNCTION admin_private.provider_connection_public_json_v1(p_row public.provider_connections)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT CASE WHEN p_row.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p_row.id,
    'provider', p_row.provider,
    'status', p_row.status,
    'customerId', p_row.customer_id,
    'businessId', p_row.business_id,
    'locationId', p_row.location_id,
    'grantedScopes', to_jsonb(p_row.granted_scopes),
    'tokenExpiresAt', p_row.token_expires_at,
    'connectedAt', p_row.connected_at,
    'revokedAt', p_row.revoked_at,
    'lastSuccessAt', p_row.last_success_at,
    'lastErrorCode', p_row.last_error_code,
    'lastErrorAt', p_row.last_error_at,
    'recordVersion', p_row.record_version
  ) END;
$$;

-- The customer/business/location chain a Google authorization may be attached
-- to, checked against the existing ProfileRelaunch model rather than trusted
-- from an Admin form. business_memberships links a customer to a business and
-- locations.business_id links a business to a location, so a business from
-- another customer or a location from another business is refused here, before
-- any state row or encrypted token can exist. Returns NULL when the scope is
-- consistent and a fixed classification otherwise.
CREATE FUNCTION admin_private.provider_scope_fault_v1(
  p_customer uuid, p_business uuid, p_location uuid
) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF p_customer IS NULL THEN RETURN 'scope_customer_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p_customer) THEN
    RETURN 'scope_customer_unknown';
  END IF;
  IF p_location IS NOT NULL AND p_business IS NULL THEN
    RETURN 'scope_location_requires_business';
  END IF;
  -- Only a verified membership counts. A pending or revoked one is not
  -- evidence that this customer may authorise anything for that business.
  IF p_business IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = p_customer AND m.business_id = p_business AND m.status = 'verified'
  ) THEN RETURN 'scope_business_mismatch'; END IF;
  IF p_location IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.locations l WHERE l.id = p_location AND l.business_id = p_business
  ) THEN RETURN 'scope_location_mismatch'; END IF;
  RETURN NULL;
END; $$;

-- Begins a connect attempt by recording the state hash. This never contacts
-- Google; the caller only proceeds when the live gate is open.
CREATE FUNCTION admin_private.provider_oauth_begin_v1(
  p_actor uuid, p_state_hash text, p_session_binding text, p_redirect_uri text,
  p_customer uuid, p_business uuid, p_location uuid, p_expires timestamptz
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  row public.provider_oauth_states;
  scope_fault text;
BEGIN
  IF p_state_hash !~ '^[0-9a-f]{64}$' OR p_session_binding !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF p_redirect_uri IS NULL OR p_redirect_uri !~ '^https://' THEN
    RETURN jsonb_build_object('status','invalid','reason','redirect_uri');
  END IF;
  IF p_expires IS NULL OR p_expires <= now() OR p_expires > now() + interval '1 hour' THEN
    RETURN jsonb_build_object('status','invalid','reason','expiry');
  END IF;
  scope_fault := admin_private.provider_scope_fault_v1(p_customer, p_business, p_location);
  IF scope_fault IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','reason', scope_fault);
  END IF;
  INSERT INTO public.provider_oauth_states(
    provider, state_hash, actor_id, session_binding, redirect_uri,
    customer_id, business_id, location_id, expires_at
  ) VALUES (
    'GOOGLE_BUSINESS_PROFILE', p_state_hash, p_actor, p_session_binding, p_redirect_uri,
    p_customer, p_business, p_location, p_expires
  ) RETURNING * INTO row;
  INSERT INTO public.provider_connection_events(provider, kind, detail, actor_id)
  VALUES ('GOOGLE_BUSINESS_PROFILE', 'CONNECTION_INITIATED', 'connect_requested', p_actor);
  RETURN jsonb_build_object('status','success','id', row.id, 'expiresAt', row.expires_at);
END; $$;

-- The single terminal operation for an OAuth attempt. The callback route calls
-- it for every outcome that names a real attempt, not only for a successful
-- one, so a denial or a codeless redirect leaves the attempt used up instead
-- of alive until expiry.
--
-- p_reason is NULL when a code arrived and an exchange could be attempted, and
-- otherwise one of four fixed terminal classifications. It does not affect who
-- may end the attempt. Context binding is authoritative: actor, initiating
-- session binding and exact redirect URI are proved before any terminal
-- mutation, and a caller that fails any of them never touches the row,
-- whatever its callback carried. Only the session that began an attempt may
-- finish or abandon it, so one Admin session cannot consume, cancel or burn
-- another's, and a failed attack leaves the rightful session able to carry on.
CREATE FUNCTION admin_private.provider_oauth_consume_v1(
  p_actor uuid, p_state_hash text, p_session_binding text, p_redirect_uri text, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  row public.provider_oauth_states;
  mismatch text;
  reason text;
BEGIN
  IF p_reason IS NOT NULL AND p_reason NOT IN
    ('access_denied','authorization_failed','cancelled_by_admin','code_missing')
  THEN RETURN jsonb_build_object('status','invalid','reason','reason_not_normalised'); END IF;
  IF p_state_hash IS NULL OR p_state_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status','rejected','reason','state_malformed');
  END IF;
  SELECT * INTO row FROM public.provider_oauth_states s
  WHERE s.state_hash = p_state_hash FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status','rejected','reason','state_unknown'); END IF;
  IF row.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','rejected','reason','state_replayed');
  END IF;
  mismatch := CASE
    WHEN row.actor_id IS DISTINCT FROM p_actor THEN 'context_mismatch'
    WHEN row.session_binding IS DISTINCT FROM p_session_binding THEN 'context_mismatch'
    WHEN row.redirect_uri IS DISTINCT FROM p_redirect_uri THEN 'redirect_mismatch'
    ELSE NULL
  END;
  -- Nothing is written and no event is recorded for an attempt the caller
  -- cannot prove is theirs. An expired state is no exception: expiry is not a
  -- licence for the wrong context to mutate it.
  IF mismatch IS NOT NULL THEN
    RETURN jsonb_build_object('status','rejected','reason', mismatch);
  END IF;
  reason := CASE WHEN row.expires_at <= now() THEN 'state_expired' ELSE p_reason END;
  UPDATE public.provider_oauth_states SET
    consumed_at = now(),
    outcome = CASE
      WHEN reason IS NULL THEN 'ACCEPTED'
      WHEN reason IS NOT DISTINCT FROM p_reason THEN 'CANCELLED'
      ELSE 'REJECTED'
    END,
    rejection_reason = reason
  WHERE id = row.id RETURNING * INTO row;
  IF reason IS NOT NULL THEN
    INSERT INTO public.provider_connection_events(provider, kind, detail, actor_id)
    VALUES ('GOOGLE_BUSINESS_PROFILE', 'CALLBACK_REJECTED', reason, p_actor);
    RETURN jsonb_build_object(
      'status', CASE WHEN row.outcome = 'CANCELLED' THEN 'cancelled' ELSE 'rejected' END,
      'reason', reason
    );
  END IF;
  RETURN jsonb_build_object(
    'status','accepted','id', row.id,
    'customerId', row.customer_id, 'businessId', row.business_id, 'locationId', row.location_id
  );
END; $$;

-- An Admin abandoning their own connect attempt. It is the same context-bound
-- single-use operation as the callback, with the one reason this surface may
-- ever record, so a cancellation cannot be aimed at another session's attempt
-- and cannot carry text of its own.
CREATE FUNCTION admin_private.provider_oauth_cancel_v1(
  p_actor uuid, p_state_hash text, p_session_binding text, p_redirect_uri text
) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
  SELECT admin_private.provider_oauth_consume_v1(
    p_actor, p_state_hash, p_session_binding, p_redirect_uri, 'cancelled_by_admin'
  );
$$;

-- Stores an already encrypted token payload. The caller encrypts in the server
-- process; this function never sees a plaintext token or the encryption key.
CREATE FUNCTION admin_private.provider_connection_store_v1(
  p_actor uuid, p_customer uuid, p_business uuid, p_location uuid, p_account text,
  p_ciphertext text, p_iv text, p_auth_tag text, p_key_version text,
  p_scopes text[], p_expires timestamptz
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  row public.provider_connections;
  scope_fault text;
BEGIN
  IF coalesce(p_ciphertext,'') = '' OR coalesce(p_iv,'') = '' OR coalesce(p_auth_tag,'') = ''
    OR coalesce(p_key_version,'') = ''
  THEN RETURN jsonb_build_object('status','invalid','reason','encrypted_payload_required'); END IF;
  IF coalesce(array_length(p_scopes, 1), 0) = 0 THEN
    RETURN jsonb_build_object('status','invalid','reason','scopes_required');
  END IF;
  -- The same chain the OAuth state had to satisfy, re-proved here so a stored
  -- token can never be attached across customers even if a caller skipped the
  -- state entirely.
  scope_fault := admin_private.provider_scope_fault_v1(p_customer, p_business, p_location);
  IF scope_fault IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','reason', scope_fault);
  END IF;
  -- Supersede any live connection for the same target before inserting.
  UPDATE public.provider_connections SET
    status = 'REVOKED', revoked_at = now(), record_version = record_version + 1
  WHERE provider = 'GOOGLE_BUSINESS_PROFILE' AND status <> 'REVOKED'
    AND coalesce(location_id, business_id, customer_id) IS NOT DISTINCT FROM coalesce(p_location, p_business, p_customer);
  INSERT INTO public.provider_connections(
    provider, customer_id, business_id, location_id, account_ref,
    token_ciphertext, token_iv, token_auth_tag, encryption_key_version,
    granted_scopes, token_expires_at, created_by
  ) VALUES (
    'GOOGLE_BUSINESS_PROFILE', p_customer, p_business, p_location, p_account,
    p_ciphertext, p_iv, p_auth_tag, p_key_version, p_scopes, p_expires, p_actor
  ) RETURNING * INTO row;
  INSERT INTO public.provider_connection_events(connection_id, provider, kind, detail, actor_id)
  VALUES (row.id, 'GOOGLE_BUSINESS_PROFILE', 'CONNECTION_ESTABLISHED', 'authorization_stored', p_actor);
  RETURN jsonb_build_object('status','success','connection', admin_private.provider_connection_public_json_v1(row));
END; $$;

CREATE FUNCTION admin_private.provider_connection_revoke_v1(
  p_actor uuid, p_connection uuid, p_version integer, p_disconnect boolean
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row public.provider_connections;
BEGIN
  SELECT * INTO row FROM public.provider_connections c WHERE c.id = p_connection FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS NULL OR row.record_version IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  IF row.status = 'REVOKED' THEN
    RETURN jsonb_build_object('status','success','connection', admin_private.provider_connection_public_json_v1(row));
  END IF;
  UPDATE public.provider_connections SET
    status = 'REVOKED', revoked_at = now(), record_version = row.record_version + 1
  WHERE id = row.id RETURNING * INTO row;
  INSERT INTO public.provider_connection_events(connection_id, provider, kind, detail, actor_id)
  VALUES (
    row.id, 'GOOGLE_BUSINESS_PROFILE',
    CASE WHEN p_disconnect THEN 'CONNECTION_DISCONNECTED' ELSE 'AUTHORIZATION_REVOKED' END,
    CASE WHEN p_disconnect THEN 'disconnected_by_admin' ELSE 'authorization_revoked' END,
    p_actor
  );
  RETURN jsonb_build_object('status','success','connection', admin_private.provider_connection_public_json_v1(row));
END; $$;

-- Records a normalised provider failure. Only the classification is kept, never
-- a provider message or body.
CREATE FUNCTION admin_private.provider_connection_fault_v1(
  p_actor uuid, p_connection uuid, p_code text
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row public.provider_connections;
BEGIN
  SELECT * INTO row FROM public.provider_connections c WHERE c.id = p_connection FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF row.status = 'REVOKED' THEN
    RETURN jsonb_build_object('status','success','connection', admin_private.provider_connection_public_json_v1(row));
  END IF;
  UPDATE public.provider_connections SET
    last_error_code = p_code,
    last_error_at = now(),
    status = CASE
      WHEN p_code = 'AUTH_REVOKED' THEN 'REVOKED'
      WHEN p_code IN ('INSUFFICIENT_SCOPE','PERMISSION_DENIED') THEN 'AUTH_REQUIRED'
      ELSE row.status
    END,
    revoked_at = CASE WHEN p_code = 'AUTH_REVOKED' THEN now() ELSE row.revoked_at END,
    record_version = row.record_version + 1
  WHERE id = row.id RETURNING * INTO row;
  INSERT INTO public.provider_connection_events(connection_id, provider, kind, detail, actor_id)
  VALUES (
    row.id, 'GOOGLE_BUSINESS_PROFILE',
    CASE
      WHEN p_code = 'AUTH_REVOKED' THEN 'AUTHORIZATION_REVOKED'
      WHEN p_code IN ('INSUFFICIENT_SCOPE','PERMISSION_DENIED') THEN 'REAUTHORIZATION_REQUIRED'
      ELSE 'PROVIDER_FALLBACK_ACTIVATED'
    END,
    p_code, p_actor
  );
  RETURN jsonb_build_object('status','success','connection', admin_private.provider_connection_public_json_v1(row));
END; $$;

-- Admin-facing integration health. Returns classifications and timestamps only.
CREATE FUNCTION public.admin_integration_status_v1(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'provider', 'GOOGLE_BUSINESS_PROFILE',
    'connections', coalesce((
      SELECT jsonb_agg(admin_private.provider_connection_public_json_v1(c) ORDER BY c.connected_at DESC)
      FROM public.provider_connections c
      WHERE c.provider = 'GOOGLE_BUSINESS_PROFILE'
    ), '[]'::jsonb),
    'liveConnections', (
      SELECT count(*)::int FROM public.provider_connections c
      WHERE c.provider = 'GOOGLE_BUSINESS_PROFILE' AND c.status = 'CONNECTED'
    ),
    'pendingConnects', (
      SELECT count(*)::int FROM public.provider_oauth_states o
      WHERE o.consumed_at IS NULL AND o.expires_at > now()
    ),
    'lastSuccessAt', (
      SELECT max(c.last_success_at) FROM public.provider_connections c
      WHERE c.provider = 'GOOGLE_BUSINESS_PROFILE'
    ),
    'recentEvents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', e.kind, 'detail', e.detail, 'createdAt', e.created_at
      ) ORDER BY e.created_at DESC)
      FROM (
        SELECT * FROM public.provider_connection_events x
        WHERE x.provider = 'GOOGLE_BUSINESS_PROFILE'
        ORDER BY x.created_at DESC LIMIT 20
      ) e
    ), '[]'::jsonb)
  );
END; $$;

CREATE FUNCTION public.admin_integration_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  actor uuid;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF NOT admin_private.settings_reauth_ok_v1(p_token) THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;

  IF p_operation = 'begin_connect' THEN
    result := admin_private.provider_oauth_begin_v1(
      actor, p_payload->>'stateHash', p_payload->>'sessionBinding', p_payload->>'redirectUri',
      admin_private.settings_uuid_v1(p_payload->>'customerId'),
      admin_private.settings_uuid_v1(p_payload->>'businessId'),
      admin_private.settings_uuid_v1(p_payload->>'locationId'),
      nullif(p_payload->>'expiresAt','')::timestamptz
    );
  ELSIF p_operation = 'consume_state' THEN
    result := admin_private.provider_oauth_consume_v1(
      actor, p_payload->>'stateHash', p_payload->>'sessionBinding', p_payload->>'redirectUri',
      p_payload->>'reason'
    );
  ELSIF p_operation = 'cancel_connect' THEN
    result := admin_private.provider_oauth_cancel_v1(
      actor, p_payload->>'stateHash', p_payload->>'sessionBinding', p_payload->>'redirectUri'
    );
  ELSIF p_operation = 'store_connection' THEN
    result := admin_private.provider_connection_store_v1(
      actor,
      admin_private.settings_uuid_v1(p_payload->>'customerId'),
      admin_private.settings_uuid_v1(p_payload->>'businessId'),
      admin_private.settings_uuid_v1(p_payload->>'locationId'),
      nullif(p_payload->>'accountRef',''),
      p_payload->>'ciphertext', p_payload->>'iv', p_payload->>'authTag', p_payload->>'keyVersion',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'scopes','[]'::jsonb))),
      nullif(p_payload->>'tokenExpiresAt','')::timestamptz
    );
  ELSIF p_operation IN ('revoke_connection','disconnect_connection') THEN
    result := admin_private.provider_connection_revoke_v1(
      actor, admin_private.settings_uuid_v1(p_payload->>'id'),
      nullif(p_payload->>'version','')::integer, p_operation = 'disconnect_connection'
    );
  ELSIF p_operation = 'record_fault' THEN
    result := admin_private.provider_connection_fault_v1(
      actor, admin_private.settings_uuid_v1(p_payload->>'id'), p_payload->>'code'
    );
  ELSE
    RETURN jsonb_build_object('status','invalid');
  END IF;

  -- Audit records the operation and outcome only. No code, token, ciphertext or
  -- provider body is ever written here. Integration statuses are mapped onto
  -- the existing audit outcome vocabulary rather than widening it.
  --
  -- The reason is written only when it is one of the classifications these
  -- functions produce. Anything else is dropped rather than audited, so even a
  -- future caller that invented its own wording could not get it in here.
  PERFORM admin_private.write_record_audit_v1(
    actor, 'INTEGRATION_CHANGED',
    CASE result->>'status'
      WHEN 'success' THEN 'success'
      WHEN 'accepted' THEN 'success'
      WHEN 'conflict' THEN 'conflict'
      ELSE 'denied'
    END,
    admin_private.settings_uuid_v1(result#>>'{connection,id}'), p_request, 'provider_integration',
    left(p_operation, 80),
    jsonb_build_object('operation', p_operation, 'provider', 'GOOGLE_BUSINESS_PROFILE')
      || CASE WHEN result->>'reason' IN (
        'access_denied','authorization_failed','cancelled_by_admin','code_missing',
        'state_malformed','state_unknown','state_expired','state_replayed','context_mismatch','redirect_mismatch',
        'reason_not_normalised','redirect_uri','expiry','encrypted_payload_required','scopes_required',
        'scope_customer_required','scope_customer_unknown','scope_business_mismatch',
        'scope_location_requires_business','scope_location_mismatch'
      ) THEN jsonb_build_object('reason', result->>'reason') ELSE '{}'::jsonb END
  );
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION
  admin_private.protect_provider_connection_v1(),
  admin_private.protect_provider_connection_event_v1(),
  admin_private.protect_provider_oauth_state_v1(),
  admin_private.provider_connection_public_json_v1(public.provider_connections),
  admin_private.provider_scope_fault_v1(uuid, uuid, uuid),
  admin_private.provider_oauth_begin_v1(uuid, text, text, text, uuid, uuid, uuid, timestamptz),
  admin_private.provider_oauth_consume_v1(uuid, text, text, text, text),
  admin_private.provider_oauth_cancel_v1(uuid, text, text, text),
  admin_private.provider_connection_store_v1(uuid, uuid, uuid, uuid, text, text, text, text, text, text[], timestamptz),
  admin_private.provider_connection_revoke_v1(uuid, uuid, integer, boolean),
  admin_private.provider_connection_fault_v1(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.admin_integration_status_v1(text),
  public.admin_integration_command_v1(text, uuid, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.admin_integration_status_v1(text),
  public.admin_integration_command_v1(text, uuid, text, jsonb)
TO service_role;

COMMIT;
