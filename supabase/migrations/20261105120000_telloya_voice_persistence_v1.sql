-- Telloya voice persistence for a local database only.
-- Schema and functions. No seeds, no backfill, and no change to commercial
-- settlement, service provision state, enquiries, or customer portal reads.
-- service_provisions.state = LIVE stays rejected by service_provisions_live_closed.
-- This file is not applied to hosted DEV or Production.
-- No retention period is chosen and no deletion job is created.
-- No Stripe object, usage meter, or overage charge is created.

BEGIN;

CREATE TABLE public.telloya_voice_number_bindings (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  inbound_to_number text NOT NULL CHECK (inbound_to_number ~ '^\+[0-9]{8,15}$'),
  agent_id text NOT NULL CHECK (agent_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telloya_voice_bindings_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX telloya_voice_bindings_active_number_idx
  ON public.telloya_voice_number_bindings (environment, inbound_to_number)
  WHERE active;

CREATE TABLE public.telloya_voice_event_receipts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  provider_call_ref text NOT NULL CHECK (provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  event_type text NOT NULL CHECK (event_type IN ('call_started', 'call_ended', 'call_analyzed')),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text NOT NULL CHECK (processing_status IN ('accepted', 'conflict', 'ignored_tenant')),
  conflict_hashes text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telloya_voice_receipts_identity UNIQUE (environment, event_type, provider_call_ref),
  CONSTRAINT telloya_voice_receipts_conflict_hashes CHECK (
    conflict_hashes = '{}'::text[]
    OR conflict_hashes::text ~ '^\{([0-9a-f]{64})(,[0-9a-f]{64})*\}$'
  )
);

CREATE TABLE public.telloya_voice_leads (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  provider_call_ref text NOT NULL CHECK (provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  callback_number text CHECK (callback_number IS NULL OR callback_number ~ '^\+[0-9]{8,15}$'),
  caller_name text CHECK (caller_name IS NULL OR char_length(caller_name) BETWEEN 1 AND 120),
  service_requested text CHECK (service_requested IS NULL OR char_length(service_requested) BETWEEN 1 AND 280),
  job_location text CHECK (job_location IS NULL OR char_length(job_location) BETWEEN 1 AND 280),
  callback_window text CHECK (callback_window IS NULL OR char_length(callback_window) BETWEEN 1 AND 120),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 600),
  incomplete boolean NOT NULL,
  call_status text NOT NULL CHECK (call_status IN ('completed', 'incomplete', 'failed', 'rejected')),
  finalised boolean NOT NULL,
  finalised_by text CHECK (finalised_by IS NULL OR finalised_by IN ('analysis', 'fallback')),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  disconnection_reason text CHECK (disconnection_reason IS NULL OR disconnection_reason ~ '^[a-z0-9_]{1,64}$'),
  provider_error boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telloya_voice_leads_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT,
  CONSTRAINT telloya_voice_leads_call UNIQUE (environment, provider_call_ref),
  CONSTRAINT telloya_voice_leads_location_call UNIQUE (location_id, provider_call_ref),
  CONSTRAINT telloya_voice_leads_finalised_shape CHECK (
    (finalised = false AND finalised_by IS NULL)
    OR (finalised = true AND finalised_by IS NOT NULL)
  )
);

CREATE TABLE public.telloya_voice_notification_outbox (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.telloya_voice_leads (id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (
    idempotency_key ~ '^lead_(dev|production)_[0-9a-f-]{36}_[A-Za-z0-9_-]{1,128}-business$'
  ),
  delivery_status text NOT NULL CHECK (delivery_status IN ('pending', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX telloya_voice_leads_business_env_idx
  ON public.telloya_voice_leads (environment, business_id, created_at);

ALTER TABLE public.telloya_voice_number_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telloya_voice_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telloya_voice_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telloya_voice_notification_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.telloya_voice_number_bindings,
  public.telloya_voice_event_receipts,
  public.telloya_voice_leads,
  public.telloya_voice_notification_outbox
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.telloya_voice_reject_v1()
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'telloya_voice_rejected' USING ERRCODE = '22023';
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_optional_text_v1(p_event jsonb, p_key text, p_max integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
  raw jsonb;
  value text;
BEGIN
  raw := p_event -> p_key;
  IF raw IS NULL OR raw = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(raw) <> 'string' THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  value := btrim(raw #>> '{}');
  IF value = '' THEN
    RETURN NULL;
  END IF;
  IF char_length(value) > p_max THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  RETURN value;
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_phone_v1(p_event jsonb, p_key text, p_required boolean)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
  value text;
BEGIN
  value := admin_private.telloya_voice_optional_text_v1(p_event, p_key, 32);
  IF value IS NULL THEN
    IF p_required THEN
      PERFORM admin_private.telloya_voice_reject_v1();
    END IF;
    RETURN NULL;
  END IF;
  IF value !~ '^\+[0-9]{8,15}$' THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  RETURN value;
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_bool_v1(p_event jsonb, p_key text, p_default boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
  raw jsonb;
BEGIN
  raw := p_event -> p_key;
  IF raw IS NULL OR raw = 'null'::jsonb THEN
    RETURN p_default;
  END IF;
  IF jsonb_typeof(raw) <> 'boolean' THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  RETURN (raw #>> '{}')::boolean;
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_duration_v1(p_event jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
  raw jsonb;
  text_value text;
BEGIN
  raw := p_event -> 'durationSeconds';
  IF raw IS NULL OR raw = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  text_value := raw #>> '{}';
  IF text_value !~ '^[0-9]+$' OR text_value::numeric > 86400 THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  RETURN text_value::integer;
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_require_keys_v1(p_event jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
BEGIN
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_event) AS key
    WHERE key NOT IN (
      'environment', 'event', 'callId', 'bodySha256', 'toNumber', 'agentId',
      'durationSeconds', 'disconnectionReason', 'providerError',
      'callerName', 'callbackNumber', 'serviceRequested', 'jobLocation', 'callbackWindow',
      'summary', 'incomplete', 'callStatus', 'finalised', 'finalisedBy', 'notificationStatus', 'createdAt'
    )
  ) THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_lead_json_v1(p_lead public.telloya_voice_leads)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'tenantBusinessId', p_lead.business_id,
    'tenantLocationId', p_lead.location_id,
    'providerCallRef', p_lead.provider_call_ref,
    'callbackNumber', p_lead.callback_number,
    'callerName', p_lead.caller_name,
    'serviceRequested', p_lead.service_requested,
    'jobLocation', p_lead.job_location,
    'callbackWindow', p_lead.callback_window,
    'summary', p_lead.summary,
    'incomplete', p_lead.incomplete,
    'callStatus', p_lead.call_status,
    'createdAt', p_lead.created_at
  );
$fn$;

CREATE FUNCTION admin_private.telloya_voice_bind_number_v1(
  p_environment text,
  p_inbound_to_number text,
  p_agent_id text,
  p_business_id uuid,
  p_location_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_environment NOT IN ('dev', 'production')
    OR p_inbound_to_number !~ '^\+[0-9]{8,15}$'
    OR p_agent_id !~ '^[A-Za-z0-9_-]{1,128}$'
    OR p_business_id IS NULL
    OR p_location_id IS NULL
  THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = p_location_id AND business_id = p_business_id
  ) THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.telloya_voice_number_bindings
    WHERE environment = p_environment
      AND active
      AND agent_id = p_agent_id
      AND location_id IS DISTINCT FROM p_location_id
  ) THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  BEGIN
    INSERT INTO public.telloya_voice_number_bindings (
      environment, inbound_to_number, agent_id, business_id, location_id, active
    ) VALUES (
      p_environment, p_inbound_to_number, p_agent_id, p_business_id, p_location_id, true
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      PERFORM admin_private.telloya_voice_reject_v1();
  END;
  RETURN v_id;
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_lane_snapshot_v1(p_environment text, p_call_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_lead public.telloya_voice_leads;
  v_notice public.telloya_voice_notification_outbox;
BEGIN
  IF p_environment NOT IN ('dev', 'production') OR p_call_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  SELECT * INTO v_lead
  FROM public.telloya_voice_leads
  WHERE environment = p_environment AND provider_call_ref = p_call_id;
  IF v_lead.id IS NOT NULL THEN
    SELECT * INTO v_notice FROM public.telloya_voice_notification_outbox WHERE lead_id = v_lead.id;
  END IF;
  RETURN jsonb_build_object(
    'bindings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'inboundToNumber', inbound_to_number,
        'agentId', agent_id,
        'businessId', business_id,
        'locationId', location_id,
        'environment', environment,
        'active', active
      ) ORDER BY created_at)
      FROM public.telloya_voice_number_bindings
    ), '[]'::jsonb),
    'receipts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'environment', environment,
        'event', event_type,
        'callId', provider_call_ref,
        'rawBodyHash', body_sha256,
        'conflicts', to_jsonb(conflict_hashes)
      ))
      FROM public.telloya_voice_event_receipts
      WHERE environment = p_environment AND provider_call_ref = p_call_id
    ), '[]'::jsonb),
    'lead', CASE WHEN v_lead.id IS NULL THEN NULL ELSE jsonb_build_object(
      'environment', v_lead.environment,
      'lead', admin_private.telloya_voice_lead_json_v1(v_lead),
      'finalised', v_lead.finalised,
      'finalisedBy', v_lead.finalised_by,
      'durationSeconds', v_lead.duration_seconds,
      'disconnectionReason', v_lead.disconnection_reason,
      'providerError', v_lead.provider_error,
      'notification', CASE WHEN v_notice.id IS NULL THEN NULL ELSE jsonb_build_object(
        'leadId', 'lead_' || v_lead.environment || '_' || v_lead.location_id::text || '_' || v_lead.provider_call_ref,
        'idempotencyKey', v_notice.idempotency_key,
        'status', v_notice.delivery_status
      ) END
    ) END
  );
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_commit_event_v1(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_environment text;
  v_event text;
  v_call_id text;
  v_hash text;
  v_to_number text;
  v_agent_id text;
  v_reason text;
  v_duration integer;
  v_provider_error boolean;
  v_caller_name text;
  v_callback text;
  v_service text;
  v_place text;
  v_window text;
  v_summary text;
  v_incomplete boolean;
  v_status text;
  v_finalised boolean;
  v_finalised_by text;
  v_notice text;
  v_created timestamptz;
  v_binding public.telloya_voice_number_bindings;
  v_binding_count integer;
  v_receipt public.telloya_voice_event_receipts;
  v_lead public.telloya_voice_leads;
  v_key text;
BEGIN
  PERFORM admin_private.telloya_voice_require_keys_v1(p_event);
  v_environment := admin_private.telloya_voice_optional_text_v1(p_event, 'environment', 16);
  v_event := admin_private.telloya_voice_optional_text_v1(p_event, 'event', 32);
  v_call_id := admin_private.telloya_voice_optional_text_v1(p_event, 'callId', 128);
  v_hash := admin_private.telloya_voice_optional_text_v1(p_event, 'bodySha256', 64);
  v_to_number := admin_private.telloya_voice_phone_v1(p_event, 'toNumber', true);
  v_agent_id := admin_private.telloya_voice_optional_text_v1(p_event, 'agentId', 128);
  IF v_environment NOT IN ('dev', 'production')
    OR v_event NOT IN ('call_started', 'call_ended', 'call_analyzed')
    OR v_call_id !~ '^[A-Za-z0-9_-]{1,128}$'
    OR v_hash !~ '^[0-9a-f]{64}$'
    OR v_agent_id !~ '^[A-Za-z0-9_-]{1,128}$'
  THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_environment || ':' || v_call_id)::bigint);
  SELECT * INTO v_receipt
  FROM public.telloya_voice_event_receipts
  WHERE environment = v_environment AND event_type = v_event AND provider_call_ref = v_call_id
  FOR UPDATE;
  IF v_receipt.id IS NOT NULL AND v_receipt.body_sha256 = v_hash THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;
  IF v_receipt.id IS NOT NULL THEN
    UPDATE public.telloya_voice_event_receipts
      SET conflict_hashes = conflict_hashes || ARRAY[v_hash]::text[],
          processing_status = 'conflict',
          updated_at = now()
      WHERE id = v_receipt.id
        AND NOT (v_hash = ANY(conflict_hashes));
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  SELECT count(*)::integer INTO v_binding_count
  FROM public.telloya_voice_number_bindings
  WHERE environment = v_environment AND active AND inbound_to_number = v_to_number AND agent_id = v_agent_id;
  IF v_binding_count = 1 THEN
    SELECT * INTO v_binding
    FROM public.telloya_voice_number_bindings
    WHERE environment = v_environment AND active AND inbound_to_number = v_to_number AND agent_id = v_agent_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.telloya_voice_number_bindings
    WHERE environment = v_environment AND active AND agent_id = v_agent_id
      AND (v_binding.id IS NULL OR location_id IS DISTINCT FROM v_binding.location_id)
  ) OR v_binding_count <> 1 THEN
    INSERT INTO public.telloya_voice_event_receipts (
      environment, provider_call_ref, event_type, body_sha256, processing_status
    ) VALUES (
      v_environment, v_call_id, v_event, v_hash, 'ignored_tenant'
    );
    RETURN jsonb_build_object('outcome', 'unknown_tenant');
  END IF;

  SELECT * INTO v_lead
  FROM public.telloya_voice_leads
  WHERE environment = v_environment AND provider_call_ref = v_call_id
  FOR UPDATE;
  IF v_lead.id IS NOT NULL AND (
    v_lead.business_id IS DISTINCT FROM v_binding.business_id
    OR v_lead.location_id IS DISTINCT FROM v_binding.location_id
  ) THEN
    INSERT INTO public.telloya_voice_event_receipts (
      environment, provider_call_ref, event_type, body_sha256, processing_status
    ) VALUES (
      v_environment, v_call_id, v_event, v_hash, 'ignored_tenant'
    );
    RETURN jsonb_build_object('outcome', 'unknown_tenant');
  END IF;

  IF v_event <> 'call_started' THEN
    v_reason := admin_private.telloya_voice_optional_text_v1(p_event, 'disconnectionReason', 64);
    IF v_reason IS NOT NULL AND v_reason !~ '^[a-z0-9_]{1,64}$' THEN
      PERFORM admin_private.telloya_voice_reject_v1();
    END IF;
    v_duration := admin_private.telloya_voice_duration_v1(p_event);
    v_provider_error := admin_private.telloya_voice_bool_v1(p_event, 'providerError', false);
    v_caller_name := admin_private.telloya_voice_optional_text_v1(p_event, 'callerName', 120);
    v_callback := admin_private.telloya_voice_phone_v1(p_event, 'callbackNumber', false);
    v_service := admin_private.telloya_voice_optional_text_v1(p_event, 'serviceRequested', 280);
    v_place := admin_private.telloya_voice_optional_text_v1(p_event, 'jobLocation', 280);
    v_window := admin_private.telloya_voice_optional_text_v1(p_event, 'callbackWindow', 120);
    v_summary := admin_private.telloya_voice_optional_text_v1(p_event, 'summary', 600);
    v_incomplete := admin_private.telloya_voice_bool_v1(p_event, 'incomplete', true);
    v_status := admin_private.telloya_voice_optional_text_v1(p_event, 'callStatus', 16);
    v_finalised := admin_private.telloya_voice_bool_v1(p_event, 'finalised', false);
    v_finalised_by := admin_private.telloya_voice_optional_text_v1(p_event, 'finalisedBy', 16);
    v_notice := admin_private.telloya_voice_optional_text_v1(p_event, 'notificationStatus', 16);
    v_created := COALESCE((p_event ->> 'createdAt')::timestamptz, now());
    IF v_summary IS NULL
      OR v_status NOT IN ('completed', 'incomplete', 'failed', 'rejected')
      OR (v_finalised AND v_finalised_by NOT IN ('analysis', 'fallback'))
      OR (NOT v_finalised AND v_finalised_by IS NOT NULL)
      OR (v_notice IS NOT NULL AND v_notice NOT IN ('pending', 'failed', 'skipped'))
    THEN
      PERFORM admin_private.telloya_voice_reject_v1();
    END IF;
    IF v_lead.id IS NULL THEN
      INSERT INTO public.telloya_voice_leads (
        environment, business_id, location_id, provider_call_ref,
        callback_number, caller_name, service_requested, job_location, callback_window,
        summary, incomplete, call_status, finalised, finalised_by,
        duration_seconds, disconnection_reason, provider_error, created_at
      ) VALUES (
        v_environment, v_binding.business_id, v_binding.location_id, v_call_id,
        v_callback, v_caller_name, v_service, v_place, v_window,
        v_summary, v_incomplete, v_status, v_finalised, v_finalised_by,
        v_duration, v_reason, v_provider_error, v_created
      )
      RETURNING * INTO v_lead;
    ELSIF v_lead.finalised AND v_event = 'call_ended' THEN
      UPDATE public.telloya_voice_leads
        SET duration_seconds = COALESCE(duration_seconds, v_duration),
            disconnection_reason = COALESCE(disconnection_reason, v_reason),
            provider_error = provider_error OR v_provider_error,
            updated_at = now()
        WHERE id = v_lead.id
        RETURNING * INTO v_lead;
    ELSE
      UPDATE public.telloya_voice_leads
        SET callback_number = v_callback,
            caller_name = v_caller_name,
            service_requested = v_service,
            job_location = v_place,
            callback_window = v_window,
            summary = v_summary,
            incomplete = v_incomplete,
            call_status = v_status,
            finalised = v_finalised,
            finalised_by = v_finalised_by,
            duration_seconds = COALESCE(duration_seconds, v_duration),
            disconnection_reason = COALESCE(disconnection_reason, v_reason),
            provider_error = provider_error OR v_provider_error,
            updated_at = now()
        WHERE id = v_lead.id
        RETURNING * INTO v_lead;
    END IF;
    IF v_lead.finalised AND v_notice = 'pending' AND NOT EXISTS (
      SELECT 1 FROM public.telloya_voice_notification_outbox WHERE lead_id = v_lead.id
    ) THEN
      v_key := 'lead_' || v_lead.environment || '_' || v_lead.location_id::text || '_' || v_lead.provider_call_ref || '-business';
      INSERT INTO public.telloya_voice_notification_outbox (lead_id, idempotency_key, delivery_status)
      VALUES (v_lead.id, v_key, 'pending');
    END IF;
  END IF;

  INSERT INTO public.telloya_voice_event_receipts (
    environment, provider_call_ref, event_type, body_sha256, processing_status
  ) VALUES (
    v_environment, v_call_id, v_event, v_hash, 'accepted'
  );
  RETURN jsonb_build_object('outcome', 'accepted');
EXCEPTION
  WHEN unique_violation OR invalid_datetime_format OR invalid_text_representation THEN
    PERFORM admin_private.telloya_voice_reject_v1();
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_list_leads_v1(
  p_environment text,
  p_business_id uuid,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_environment NOT IN ('dev', 'production') OR p_business_id IS NULL OR p_customer_id IS NULL THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships
    WHERE customer_id = p_customer_id
      AND business_id = p_business_id
      AND status = 'verified'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(admin_private.telloya_voice_lead_json_v1(lead) ORDER BY lead.created_at, lead.provider_call_ref)
    FROM public.telloya_voice_leads lead
    WHERE lead.environment = p_environment AND lead.business_id = p_business_id
  ), '[]'::jsonb);
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_finalise_fallback_v1(p_environment text, p_call_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_lead public.telloya_voice_leads;
  v_key text;
  v_summary text;
BEGIN
  IF p_environment NOT IN ('dev', 'production') OR p_call_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_environment || ':' || p_call_id)::bigint);
  SELECT * INTO v_lead
  FROM public.telloya_voice_leads
  WHERE environment = p_environment AND provider_call_ref = p_call_id
  FOR UPDATE;
  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF v_lead.finalised THEN
    RETURN jsonb_build_object('outcome', 'already_finalised');
  END IF;
  v_summary := CASE
    WHEN v_lead.summary = 'Awaiting analysis.' AND v_lead.provider_error THEN 'The provider reported a failed call.'
    WHEN v_lead.summary = 'Awaiting analysis.' THEN 'No caller details were collected.'
    ELSE v_lead.summary
  END;
  UPDATE public.telloya_voice_leads
    SET summary = v_summary,
        incomplete = true,
        call_status = CASE WHEN provider_error THEN 'failed' ELSE 'incomplete' END,
        finalised = true,
        finalised_by = 'fallback',
        updated_at = now()
    WHERE id = v_lead.id
    RETURNING * INTO v_lead;
  IF NOT EXISTS (SELECT 1 FROM public.telloya_voice_notification_outbox WHERE lead_id = v_lead.id) THEN
    v_key := 'lead_' || v_lead.environment || '_' || v_lead.location_id::text || '_' || v_lead.provider_call_ref || '-business';
    INSERT INTO public.telloya_voice_notification_outbox (lead_id, idempotency_key, delivery_status)
    VALUES (v_lead.id, v_key, 'pending');
  END IF;
  RETURN jsonb_build_object('outcome', 'finalised');
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_mark_notification_failed_v1(
  p_environment text,
  p_call_id text,
  p_error_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_lead_id uuid;
  v_count integer;
BEGIN
  IF p_environment NOT IN ('dev', 'production')
    OR p_call_id !~ '^[A-Za-z0-9_-]{1,128}$'
    OR p_error_code !~ '^[a-z0-9_]{1,64}$'
  THEN
    PERFORM admin_private.telloya_voice_reject_v1();
  END IF;
  SELECT id INTO v_lead_id
  FROM public.telloya_voice_leads
  WHERE environment = p_environment AND provider_call_ref = p_call_id;
  IF v_lead_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  UPDATE public.telloya_voice_notification_outbox
    SET delivery_status = 'failed',
        attempt_count = attempt_count + 1,
        last_error_code = p_error_code,
        updated_at = now()
    WHERE lead_id = v_lead_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  RETURN jsonb_build_object('outcome', 'failed');
END;
$fn$;

CREATE FUNCTION public.telloya_voice_bind_number_v1(text, text, text, uuid, uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_bind_number_v1($1, $2, $3, $4, $5);
$fn$;

CREATE FUNCTION public.telloya_voice_lane_snapshot_v1(text, text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_lane_snapshot_v1($1, $2);
$fn$;

CREATE FUNCTION public.telloya_voice_commit_event_v1(jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_commit_event_v1($1);
$fn$;

CREATE FUNCTION public.telloya_voice_list_leads_v1(text, uuid, uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_list_leads_v1($1, $2, $3);
$fn$;

CREATE FUNCTION public.telloya_voice_finalise_fallback_v1(text, text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_finalise_fallback_v1($1, $2);
$fn$;

CREATE FUNCTION public.telloya_voice_mark_notification_failed_v1(text, text, text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_mark_notification_failed_v1($1, $2, $3);
$fn$;

REVOKE ALL ON FUNCTION
  admin_private.telloya_voice_reject_v1(),
  admin_private.telloya_voice_optional_text_v1(jsonb, text, integer),
  admin_private.telloya_voice_phone_v1(jsonb, text, boolean),
  admin_private.telloya_voice_bool_v1(jsonb, text, boolean),
  admin_private.telloya_voice_duration_v1(jsonb),
  admin_private.telloya_voice_require_keys_v1(jsonb),
  admin_private.telloya_voice_lead_json_v1(public.telloya_voice_leads),
  admin_private.telloya_voice_bind_number_v1(text, text, text, uuid, uuid),
  admin_private.telloya_voice_lane_snapshot_v1(text, text),
  admin_private.telloya_voice_commit_event_v1(jsonb),
  admin_private.telloya_voice_list_leads_v1(text, uuid, uuid),
  admin_private.telloya_voice_finalise_fallback_v1(text, text),
  admin_private.telloya_voice_mark_notification_failed_v1(text, text, text),
  public.telloya_voice_bind_number_v1(text, text, text, uuid, uuid),
  public.telloya_voice_lane_snapshot_v1(text, text),
  public.telloya_voice_commit_event_v1(jsonb),
  public.telloya_voice_list_leads_v1(text, uuid, uuid),
  public.telloya_voice_finalise_fallback_v1(text, text),
  public.telloya_voice_mark_notification_failed_v1(text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.telloya_voice_bind_number_v1(text, text, text, uuid, uuid),
  public.telloya_voice_lane_snapshot_v1(text, text),
  public.telloya_voice_commit_event_v1(jsonb),
  public.telloya_voice_list_leads_v1(text, uuid, uuid),
  public.telloya_voice_finalise_fallback_v1(text, text),
  public.telloya_voice_mark_notification_failed_v1(text, text, text)
TO service_role;

COMMENT ON TABLE public.telloya_voice_leads IS
  'Minimal Telloya caller lead. No audio, transcript, recording URL, raw webhook body, or network caller id.';
COMMENT ON TABLE public.telloya_voice_event_receipts IS
  'One receipt per environment, event type, and provider call. The raw body is not stored.';
COMMENT ON TABLE public.telloya_voice_number_bindings IS
  'Server-side inbound number and agent map. One active number per environment.';
COMMENT ON TABLE public.telloya_voice_notification_outbox IS
  'One notification intent per lead. No recipient address is stored and nothing is sent.';

COMMIT;
