-- Core Data Foundation v1
-- Source-controlled baseline for customers, businesses, locations, cases,
-- case_events and communications.
--
-- Do not execute this file automatically from application code.
-- The development project already received this baseline through the SQL Editor.
-- Do not re-run it against that existing development database.
-- A future production project should be created from these migrations.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_case_public_ref(p_case_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  prefix text;
  yy text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  token text;
  candidate text;
  i integer;
  attempts integer := 0;
BEGIN
  IF p_case_type = 'PROFILE_RECOVERY' THEN
    prefix := 'PR';
  ELSIF p_case_type = 'REVIEW_PROTECTION' THEN
    prefix := 'RV';
  ELSE
    RAISE EXCEPTION 'unsupported case_type';
  END IF;

  yy := to_char(timezone('utc', now()), 'YY');

  LOOP
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'could not generate a unique public case reference';
    END IF;

    bytes := gen_random_bytes(6);
    token := '';
    FOR i IN 0..5 LOOP
      token := token || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;

    candidate := prefix || '-' || yy || '-' || token;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.cases
      WHERE public_ref = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.cases_assign_public_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.public_ref IS NULL OR btrim(NEW.public_ref) = '' THEN
    NEW.public_ref := public.generate_case_public_ref(NEW.case_type);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_full_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT customers_email_not_blank CHECK (length(btrim(email)) > 0)
);

CREATE UNIQUE INDEX customers_email_lower_idx ON public.customers (lower(email));

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_name text,
  country text NOT NULL,
  business_profile_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_country_not_blank CHECK (length(btrim(country)) > 0)
);

CREATE INDEX locations_business_id_idx ON public.locations (business_id);

CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL,
  case_type text NOT NULL,
  issue_subtype text,
  status text NOT NULL DEFAULT 'RECEIVED',
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'GET_HELP',
  issue_description text NOT NULL,
  review_url text,
  intake_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  information_accurate_at timestamptz,
  privacy_accepted_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cases_public_ref_unique UNIQUE (public_ref),
  CONSTRAINT cases_public_ref_format CHECK (
    public_ref ~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
  ),
  CONSTRAINT cases_public_ref_matches_type CHECK (
    (case_type = 'PROFILE_RECOVERY' AND public_ref LIKE 'PR-%')
    OR (case_type = 'REVIEW_PROTECTION' AND public_ref LIKE 'RV-%')
  ),
  CONSTRAINT cases_case_type_allowed CHECK (
    case_type IN ('PROFILE_RECOVERY', 'REVIEW_PROTECTION')
  ),
  CONSTRAINT cases_status_allowed CHECK (
    status IN (
      'RECEIVED',
      'UNDER_REVIEW',
      'AWAITING_CUSTOMER',
      'RECOMMENDATION_READY',
      'CLOSED',
      'CANCELLED'
    )
  ),
  CONSTRAINT cases_issue_description_not_blank CHECK (length(btrim(issue_description)) > 0)
);

CREATE TABLE public.case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'SYSTEM',
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_events_event_type_not_blank CHECK (length(btrim(event_type)) > 0)
);

CREATE INDEX case_events_case_id_created_at_idx
  ON public.case_events (case_id, created_at DESC);

CREATE TABLE public.communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'EMAIL',
  communication_type text NOT NULL,
  direction text NOT NULL DEFAULT 'OUTBOUND',
  recipient text NOT NULL,
  subject text,
  provider text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'PENDING',
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communications_channel_allowed CHECK (channel = 'EMAIL'),
  CONSTRAINT communications_direction_allowed CHECK (direction IN ('OUTBOUND', 'INBOUND')),
  CONSTRAINT communications_status_allowed CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  CONSTRAINT communications_type_not_blank CHECK (length(btrim(communication_type)) > 0),
  CONSTRAINT communications_recipient_not_blank CHECK (length(btrim(recipient)) > 0)
);

CREATE INDEX communications_case_id_created_at_idx
  ON public.communications (case_id, created_at DESC);

CREATE INDEX communications_status_idx ON public.communications (status);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER locations_set_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cases_set_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER communications_set_updated_at
  BEFORE UPDATE ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cases_assign_public_ref
  BEFORE INSERT ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.cases_assign_public_ref();

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled, with no anon/authenticated policies.
-- Marketing Portal access is server-side via the secret/service role only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Privileges: no browser RPC or table access. Service role only.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_case_public_ref(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cases_assign_public_ref() FROM PUBLIC;

REVOKE ALL ON TABLE public.customers FROM PUBLIC;
REVOKE ALL ON TABLE public.businesses FROM PUBLIC;
REVOKE ALL ON TABLE public.locations FROM PUBLIC;
REVOKE ALL ON TABLE public.cases FROM PUBLIC;
REVOKE ALL ON TABLE public.case_events FROM PUBLIC;
REVOKE ALL ON TABLE public.communications FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;
    REVOKE ALL ON FUNCTION public.generate_case_public_ref(text) FROM anon;
    REVOKE ALL ON FUNCTION public.cases_assign_public_ref() FROM anon;
    REVOKE ALL ON TABLE public.customers FROM anon;
    REVOKE ALL ON TABLE public.businesses FROM anon;
    REVOKE ALL ON TABLE public.locations FROM anon;
    REVOKE ALL ON TABLE public.cases FROM anon;
    REVOKE ALL ON TABLE public.case_events FROM anon;
    REVOKE ALL ON TABLE public.communications FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.set_updated_at() FROM authenticated;
    REVOKE ALL ON FUNCTION public.generate_case_public_ref(text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.cases_assign_public_ref() FROM authenticated;
    REVOKE ALL ON TABLE public.customers FROM authenticated;
    REVOKE ALL ON TABLE public.businesses FROM authenticated;
    REVOKE ALL ON TABLE public.locations FROM authenticated;
    REVOKE ALL ON TABLE public.cases FROM authenticated;
    REVOKE ALL ON TABLE public.case_events FROM authenticated;
    REVOKE ALL ON TABLE public.communications FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
    GRANT EXECUTE ON FUNCTION public.generate_case_public_ref(text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.cases_assign_public_ref() TO service_role;
    GRANT ALL ON TABLE public.customers TO service_role;
    GRANT ALL ON TABLE public.businesses TO service_role;
    GRANT ALL ON TABLE public.locations TO service_role;
    GRANT ALL ON TABLE public.cases TO service_role;
    GRANT ALL ON TABLE public.case_events TO service_role;
    GRANT ALL ON TABLE public.communications TO service_role;
  END IF;
END;
$$;
