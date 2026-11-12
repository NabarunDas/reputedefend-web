BEGIN;
-- Telloya admin journey records for an offline demonstration and later offer versions.
-- Do not apply this file to DEV or Production.
-- It does not call Retell, send email, create a Stripe object, or change an enquiry row.
-- Offer rows are included here so a later phase does not add a second unapplied migration.
-- No offer is inserted by this file.

CREATE TABLE admin_private.telloya_admin_demos (
  enquiry_id uuid PRIMARY KEY REFERENCES public.enquiries(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('NOT_BOOKED','BOOKED','COMPLETED')),
  scheduled_at timestamptz,
  timezone text NOT NULL DEFAULT '' CHECK (length(timezone) <= 80),
  completed_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  idempotency_key text NOT NULL DEFAULT '' CHECK (length(idempotency_key) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'BOOKED') = (scheduled_at IS NOT NULL) OR status = 'COMPLETED'),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK (status <> 'NOT_BOOKED' OR (scheduled_at IS NULL AND completed_at IS NULL))
);

CREATE TABLE admin_private.telloya_admin_demo_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.telloya_admin_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL CHECK (status IN ('DRAFT','SENT','SUPERSEDED','ACCEPTED','PREVIEW')),
  is_current boolean NOT NULL DEFAULT false,
  plan_code text NOT NULL CHECK (plan_code IN ('basic','growth','pro','custom')),
  currency_code text NOT NULL DEFAULT 'GBP' CHECK (currency_code = 'GBP'),
  cadence text NOT NULL DEFAULT 'MONTH' CHECK (cadence = 'MONTH'),
  plan_amount_pence integer CHECK (plan_amount_pence IS NULL OR plan_amount_pence >= 0),
  included_minutes integer CHECK (included_minutes IS NULL OR included_minutes >= 0),
  guard_locations integer NOT NULL DEFAULT 0 CHECK (guard_locations >= 0 AND guard_locations <= 50),
  guard_amount_pence integer NOT NULL DEFAULT 0 CHECK (guard_amount_pence >= 0),
  monthly_total_pence integer CHECK (monthly_total_pence IS NULL OR monthly_total_pence >= 0),
  voice_locations integer NOT NULL DEFAULT 1 CHECK (voice_locations >= 1),
  phone_numbers integer NOT NULL DEFAULT 1 CHECK (phone_numbers >= 1),
  overage_opt_in boolean NOT NULL DEFAULT false,
  overage_cap_pence integer CHECK (overage_cap_pence IS NULL OR overage_cap_pence > 0),
  terms_hash text NOT NULL DEFAULT '' CHECK (length(terms_hash) <= 128),
  fixture boolean NOT NULL DEFAULT false,
  record_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enquiry_id, version_number),
  CHECK (overage_opt_in = false OR overage_cap_pence IS NOT NULL),
  CHECK (plan_code = 'custom' OR (voice_locations = 1 AND phone_numbers = 1))
);

CREATE UNIQUE INDEX telloya_admin_offers_one_current
  ON admin_private.telloya_admin_offers (enquiry_id)
  WHERE is_current;

ALTER TABLE admin_private.telloya_admin_demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_admin_demo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_admin_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.telloya_admin_demos, admin_private.telloya_admin_demo_events, admin_private.telloya_admin_offers FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.telloya_admin_demo_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.telloya_admin_demo_transition_v1(
  p_enquiry_id uuid,
  p_actor_id uuid,
  p_expected_version integer,
  p_status text,
  p_at timestamptz,
  p_timezone text,
  p_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_status text;
  v_version integer;
  v_key text;
  v_scheduled timestamptz;
  v_completed timestamptz;
  v_note text := coalesce(p_note, '');
  v_zone text := coalesce(p_timezone, '');
BEGIN
  IF p_enquiry_id IS NULL OR p_actor_id IS NULL OR p_expected_version IS NULL OR p_status IS NULL
     OR length(coalesce(p_idempotency_key, '')) < 8 OR length(p_idempotency_key) > 120
     OR length(v_note) > 500 OR length(v_zone) > 80 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_status NOT IN ('NOT_BOOKED', 'BOOKED', 'COMPLETED') THEN
    RETURN jsonb_build_object('status', 'invalid_transition');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_enquiry_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.enquiries WHERE id = p_enquiry_id) THEN
    RETURN jsonb_build_object('status', 'missing_enquiry');
  END IF;
  SELECT status, record_version, idempotency_key, scheduled_at, completed_at
    INTO v_status, v_version, v_key, v_scheduled, v_completed
  FROM admin_private.telloya_admin_demos
  WHERE enquiry_id = p_enquiry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    v_status := 'NOT_BOOKED';
    v_version := 0;
    v_key := '';
  END IF;
  IF v_key <> '' AND v_key = p_idempotency_key THEN
    RETURN jsonb_build_object('status', 'replay', 'demo_status', v_status, 'version', v_version);
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('status', 'stale_version', 'version', v_version);
  END IF;
  IF NOT (
    (v_status = 'NOT_BOOKED' AND p_status = 'BOOKED' AND p_at IS NOT NULL)
    OR (v_status = 'BOOKED' AND p_status = 'COMPLETED' AND p_at IS NOT NULL)
    OR (v_status = 'BOOKED' AND p_status = 'NOT_BOOKED')
  ) THEN
    RETURN jsonb_build_object('status', 'invalid_transition', 'demo_status', v_status);
  END IF;
  IF p_status = 'BOOKED' THEN
    v_scheduled := p_at;
    v_completed := NULL;
  ELSIF p_status = 'COMPLETED' THEN
    v_completed := p_at;
  ELSE
    v_scheduled := NULL;
    v_completed := NULL;
    v_zone := '';
  END IF;
  IF v_version = 0 THEN
    INSERT INTO admin_private.telloya_admin_demos(
      enquiry_id, status, scheduled_at, timezone, completed_at, note, record_version, idempotency_key
    ) VALUES (
      p_enquiry_id, p_status, v_scheduled, v_zone, v_completed, v_note, 1, p_idempotency_key
    );
  ELSE
    UPDATE admin_private.telloya_admin_demos
    SET status = p_status,
        scheduled_at = v_scheduled,
        timezone = CASE WHEN p_status = 'NOT_BOOKED' THEN '' ELSE v_zone END,
        completed_at = v_completed,
        note = v_note,
        record_version = record_version + 1,
        idempotency_key = p_idempotency_key,
        updated_at = now()
    WHERE enquiry_id = p_enquiry_id;
  END IF;
  INSERT INTO admin_private.telloya_admin_demo_events(enquiry_id, actor_id, previous_status, new_status, note)
  VALUES (p_enquiry_id, p_actor_id, v_status, p_status, v_note);
  RETURN jsonb_build_object('status', 'recorded', 'demo_status', p_status, 'version', v_version + 1, 'previous_status', v_status);
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_admin_demo_transition_v1(uuid, uuid, integer, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.telloya_admin_demo_transition_v1(
  p_enquiry_id uuid,
  p_actor_id uuid,
  p_expected_version integer,
  p_status text,
  p_at timestamptz,
  p_timezone text,
  p_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_admin_demo_transition_v1(
    p_enquiry_id, p_actor_id, p_expected_version, p_status, p_at, p_timezone, p_note, p_idempotency_key
  );
$fn$;

REVOKE ALL ON FUNCTION public.telloya_admin_demo_transition_v1(uuid, uuid, integer, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_admin_demo_transition_v1(uuid, uuid, integer, text, timestamptz, text, text, text) TO service_role;

COMMIT;
