BEGIN;

-- AUTO-EMAIL-VERIFY. Source only. Do not apply this file to DEV or Production
-- from this change. It does not send mail, and it does not store a raw bearer.
-- A case-receipt confirmation is a single-use hashed challenge. Confirming it
-- records email control on the existing contact-verification row. It does not
-- change business membership or any other authority.

CREATE TABLE public.email_confirmation_challenges (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  email_normalized text NOT NULL,
  environment text NOT NULL,
  token_hash text NOT NULL,
  key_version integer NOT NULL,
  purpose text NOT NULL,
  generation integer NOT NULL,
  supersedes uuid,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT email_confirmation_challenges_email_check
    CHECK (email_normalized = lower(btrim(email_normalized)) AND length(email_normalized) BETWEEN 3 AND 254),
  CONSTRAINT email_confirmation_challenges_environment_check
    CHECK (environment IN ('development', 'preview', 'production')),
  CONSTRAINT email_confirmation_challenges_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT email_confirmation_challenges_key_check
    CHECK (key_version BETWEEN 1 AND 100),
  CONSTRAINT email_confirmation_challenges_purpose_check
    CHECK (purpose IN ('INITIAL_RECEIPT', 'RESEND')),
  CONSTRAINT email_confirmation_challenges_generation_check
    CHECK (generation BETWEEN 1 AND 8),
  CONSTRAINT email_confirmation_challenges_expiry_check
    CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX email_confirmation_one_live_idx
  ON public.email_confirmation_challenges (case_id)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

CREATE INDEX email_confirmation_case_idx
  ON public.email_confirmation_challenges (case_id, generation);

ALTER TABLE public.email_confirmation_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_confirmation_challenges FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.email_confirmation_rate (
  bucket text PRIMARY KEY CHECK (bucket ~ '^[a-z0-9:-]{8,120}$'),
  hits timestamptz[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT email_confirmation_rate_hits_size CHECK (cardinality(hits) <= 30)
);

ALTER TABLE admin_private.email_confirmation_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.email_confirmation_rate FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.email_confirmation_rate_v1(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_existing timestamptz[];
  v_kept timestamptz[];
  v_recent integer;
BEGIN
  IF p_bucket IS NULL OR p_bucket !~ '^[a-z0-9:-]{8,120}$' THEN
    RETURN false;
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 30 THEN
    RETURN false;
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 604800 THEN
    RETURN false;
  END IF;

  INSERT INTO admin_private.email_confirmation_rate (bucket, hits)
  VALUES (p_bucket, ARRAY[]::timestamptz[])
  ON CONFLICT (bucket) DO UPDATE
    SET updated_at = admin_private.email_confirmation_rate.updated_at;

  SELECT hits INTO v_existing
  FROM admin_private.email_confirmation_rate
  WHERE bucket = p_bucket
  FOR UPDATE;

  SELECT coalesce(array_agg(hit ORDER BY hit), ARRAY[]::timestamptz[]), count(*)::integer
  INTO v_kept, v_recent
  FROM unnest(v_existing) AS hit
  WHERE hit > v_now - (p_window_seconds * interval '1 second');

  IF v_recent >= p_limit THEN
    UPDATE admin_private.email_confirmation_rate
      SET hits = v_kept, updated_at = v_now
      WHERE bucket = p_bucket;
    RETURN false;
  END IF;

  UPDATE admin_private.email_confirmation_rate
    SET hits = array_append(v_kept, v_now), updated_at = v_now
    WHERE bucket = p_bucket;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.email_confirmation_rate_v1(text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.supersede_email_confirmation_on_email_change_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(btrim(OLD.email)) IS DISTINCT FROM lower(btrim(NEW.email)) THEN
    UPDATE public.email_confirmation_challenges
      SET superseded_at = clock_timestamp()
      WHERE customer_id = NEW.id
        AND superseded_at IS NULL
        AND consumed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_supersede_email_confirmation
  AFTER UPDATE OF email ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.supersede_email_confirmation_on_email_change_v1();

CREATE FUNCTION public.prepare_email_confirmation_challenge_v1(
  p_case uuid,
  p_challenge uuid,
  p_email text,
  p_environment text,
  p_token_hash text,
  p_key_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.cases;
  v_customer public.customers;
  v_email text;
  v_row public.email_confirmation_challenges;
BEGIN
  IF p_case IS NULL OR p_challenge IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('development', 'preview', 'production') THEN
    RETURN jsonb_build_object('status', 'environment');
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_key_version IS NULL OR p_key_version < 1 OR p_key_version > 100 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('email-confirmation:' || p_case::text, 0));

  SELECT * INTO v_case FROM public.cases WHERE id = p_case FOR UPDATE;
  IF v_case.id IS NULL OR v_case.customer_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_case.customer_id FOR UPDATE;
  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  v_email := lower(btrim(coalesce(p_email, '')));
  IF v_email = '' OR v_email IS DISTINCT FROM lower(btrim(v_customer.email)) THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  IF admin_private.contact_verified_v1(v_customer.id, 'email') THEN
    RETURN jsonb_build_object('status', 'already_verified');
  END IF;

  SELECT * INTO v_row
  FROM public.email_confirmation_challenges
  WHERE id = p_challenge
  FOR UPDATE;

  IF v_row.id IS NOT NULL THEN
    IF v_row.case_id IS DISTINCT FROM v_case.id
      OR v_row.customer_id IS DISTINCT FROM v_customer.id
      OR v_row.email_normalized IS DISTINCT FROM v_email
      OR v_row.environment IS DISTINCT FROM p_environment
      OR v_row.token_hash IS DISTINCT FROM p_token_hash
      OR v_row.purpose IS DISTINCT FROM 'INITIAL_RECEIPT'
      OR v_row.generation IS DISTINCT FROM 1 THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    IF v_row.consumed_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'consumed');
    END IF;
    IF v_row.superseded_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'superseded');
    END IF;
    IF v_row.expires_at <= clock_timestamp() THEN
      RETURN jsonb_build_object('status', 'expired');
    END IF;
    RETURN jsonb_build_object('status', 'ready', 'generation', v_row.generation);
  END IF;

  INSERT INTO public.email_confirmation_challenges (
    id, case_id, customer_id, email_normalized, environment, token_hash,
    key_version, purpose, generation, expires_at
  ) VALUES (
    p_challenge, v_case.id, v_customer.id, v_email, p_environment, p_token_hash,
    p_key_version, 'INITIAL_RECEIPT', 1, clock_timestamp() + interval '72 hours'
  );
  RETURN jsonb_build_object('status', 'ready', 'generation', 1);
END;
$$;

CREATE FUNCTION public.read_email_confirmation_challenge_v1(p_challenge uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.email_confirmation_challenges;
  v_case public.cases;
  v_customer public.customers;
  v_status text;
BEGIN
  IF p_challenge IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO v_row FROM public.email_confirmation_challenges WHERE id = p_challenge;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO v_case FROM public.cases WHERE id = v_row.case_id;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_row.customer_id;
  IF v_case.id IS NULL OR v_customer.id IS NULL OR v_case.customer_id IS DISTINCT FROM v_customer.id THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF v_row.superseded_at IS NOT NULL THEN
    v_status := 'superseded';
  ELSIF admin_private.contact_verified_v1(v_customer.id, 'email')
    AND lower(btrim(v_customer.email)) = v_row.email_normalized THEN
    v_status := 'confirmed';
  ELSIF v_row.consumed_at IS NOT NULL THEN
    v_status := 'consumed';
  ELSIF v_row.expires_at <= clock_timestamp() THEN
    v_status := 'expired';
  ELSIF lower(btrim(v_customer.email)) IS DISTINCT FROM v_row.email_normalized THEN
    v_status := 'mismatch';
  ELSE
    v_status := 'pending';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'publicRef', v_case.public_ref,
    'maskedEmail', admin_private.mask_email_v1(v_row.email_normalized),
    'generation', v_row.generation,
    'caseType', v_case.case_type
  );
END;
$$;

CREATE FUNCTION public.confirm_email_challenge_v1(
  p_challenge uuid,
  p_token_hash text,
  p_environment text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.email_confirmation_challenges;
  v_case public.cases;
  v_customer public.customers;
  v_email text;
  v_verified_at timestamptz;
BEGIN
  IF p_challenge IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('development', 'preview', 'production') THEN
    RETURN jsonb_build_object('status', 'environment');
  END IF;

  SELECT * INTO v_row
  FROM public.email_confirmation_challenges
  WHERE id = p_challenge
  FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT * INTO v_case FROM public.cases WHERE id = v_row.case_id FOR UPDATE;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_row.customer_id FOR UPDATE;
  IF v_case.id IS NULL OR v_customer.id IS NULL OR v_case.customer_id IS DISTINCT FROM v_customer.id THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  v_email := lower(btrim(v_customer.email));

  IF v_row.consumed_at IS NOT NULL
    AND admin_private.contact_verified_v1(v_customer.id, 'email')
    AND v_email = v_row.email_normalized
    AND v_row.token_hash = p_token_hash
    AND v_row.environment = p_environment THEN
    RETURN jsonb_build_object(
      'status', 'already_confirmed',
      'publicRef', v_case.public_ref,
      'maskedEmail', admin_private.mask_email_v1(v_email)
    );
  END IF;

  IF NOT admin_private.email_confirmation_rate_v1('confirm:' || p_challenge::text, 8, 600) THEN
    RETURN jsonb_build_object('status', 'limited');
  END IF;

  IF v_row.token_hash IS DISTINCT FROM p_token_hash THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  IF v_row.environment IS DISTINCT FROM p_environment THEN
    RETURN jsonb_build_object('status', 'environment');
  END IF;
  IF v_row.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'superseded');
  END IF;
  IF v_row.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'consumed');
  END IF;
  IF v_row.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;
  IF v_email IS DISTINCT FROM v_row.email_normalized THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions AS suppression
    WHERE suppression.address_normalized = v_email
  ) THEN
    RETURN jsonb_build_object('status', 'suppressed');
  END IF;

  IF admin_private.contact_verified_v1(v_customer.id, 'email') AND v_email = v_row.email_normalized THEN
    UPDATE public.email_confirmation_challenges
      SET consumed_at = clock_timestamp()
      WHERE id = v_row.id AND consumed_at IS NULL;
    RETURN jsonb_build_object(
      'status', 'already_confirmed',
      'publicRef', v_case.public_ref,
      'maskedEmail', admin_private.mask_email_v1(v_email)
    );
  END IF;

  UPDATE public.email_confirmation_challenges
    SET consumed_at = clock_timestamp()
    WHERE id = v_row.id AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'consumed');
  END IF;

  INSERT INTO public.customer_contact_verifications (
    customer_id, channel, verified_value, verified_by, evidence
  ) VALUES (
    v_customer.id,
    'email',
    v_email,
    v_customer.id,
    'CUSTOMER_EMAIL_LINK_CHALLENGE ' || v_row.id::text
  )
  ON CONFLICT (customer_id, channel) DO UPDATE
    SET verified_value = EXCLUDED.verified_value,
        verified_by = EXCLUDED.verified_by,
        verified_at = clock_timestamp(),
        evidence = EXCLUDED.evidence;

  SELECT verified_at INTO v_verified_at
  FROM public.customer_contact_verifications
  WHERE customer_id = v_customer.id AND channel = 'email';

  RETURN jsonb_build_object(
    'status', 'confirmed',
    'publicRef', v_case.public_ref,
    'maskedEmail', admin_private.mask_email_v1(v_email),
    'verifiedAt', v_verified_at
  );
END;
$$;

CREATE FUNCTION public.resend_email_confirmation_challenge_v1(
  p_previous uuid,
  p_previous_hash text,
  p_new uuid,
  p_new_hash text,
  p_environment text,
  p_key_version integer,
  p_expected_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous public.email_confirmation_challenges;
  v_case public.cases;
  v_customer public.customers;
  v_email text;
  v_generation integer;
BEGIN
  IF p_previous IS NULL OR p_new IS NULL OR p_previous = p_new THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_previous_hash IS NULL OR p_previous_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_new_hash IS NULL OR p_new_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('development', 'preview', 'production') THEN
    RETURN jsonb_build_object('status', 'environment');
  END IF;
  IF p_key_version IS NULL OR p_key_version < 1 OR p_key_version > 100 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT * INTO v_previous
  FROM public.email_confirmation_challenges
  WHERE id = p_previous
  FOR UPDATE;
  IF v_previous.id IS NULL OR v_previous.token_hash IS DISTINCT FROM p_previous_hash THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  IF v_previous.environment IS DISTINCT FROM p_environment THEN
    RETURN jsonb_build_object('status', 'environment');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('email-confirmation:' || v_previous.case_id::text, 0));

  SELECT * INTO v_case FROM public.cases WHERE id = v_previous.case_id FOR UPDATE;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_previous.customer_id FOR UPDATE;
  IF v_case.id IS NULL OR v_customer.id IS NULL OR v_case.customer_id IS DISTINCT FROM v_customer.id THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  v_email := lower(btrim(v_customer.email));
  IF v_email IS DISTINCT FROM v_previous.email_normalized THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  IF p_expected_email IS NOT NULL AND lower(btrim(p_expected_email)) IS DISTINCT FROM v_email THEN
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  IF admin_private.contact_verified_v1(v_customer.id, 'email') THEN
    RETURN jsonb_build_object('status', 'already_verified', 'publicRef', v_case.public_ref);
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions AS suppression
    WHERE suppression.address_normalized = v_email
  ) THEN
    RETURN jsonb_build_object('status', 'suppressed');
  END IF;
  SELECT coalesce(max(generation), 0) + 1 INTO v_generation
  FROM public.email_confirmation_challenges
  WHERE case_id = v_case.id;
  IF v_generation > 8 THEN
    RETURN jsonb_build_object('status', 'limited');
  END IF;
  IF v_previous.superseded_at IS NULL
    AND v_previous.consumed_at IS NULL
    AND v_previous.expires_at > clock_timestamp()
    AND v_previous.created_at > clock_timestamp() - interval '15 minutes' THEN
    RETURN jsonb_build_object('status', 'cooldown');
  END IF;
  IF NOT admin_private.email_confirmation_rate_v1('resend:' || v_case.id::text, 3, 86400) THEN
    RETURN jsonb_build_object('status', 'limited');
  END IF;

  UPDATE public.email_confirmation_challenges
    SET superseded_at = clock_timestamp()
    WHERE case_id = v_case.id
      AND consumed_at IS NULL
      AND superseded_at IS NULL;

  INSERT INTO public.email_confirmation_challenges (
    id, case_id, customer_id, email_normalized, environment, token_hash,
    key_version, purpose, generation, supersedes, expires_at
  ) VALUES (
    p_new, v_case.id, v_customer.id, v_email, p_environment, p_new_hash,
    p_key_version, 'RESEND', v_generation, v_previous.id, clock_timestamp() + interval '72 hours'
  );

  RETURN jsonb_build_object(
    'status', 'ready',
    'generation', v_generation,
    'publicRef', v_case.public_ref,
    'maskedEmail', admin_private.mask_email_v1(v_email),
    'caseType', v_case.case_type,
    'email', v_email
  );
END;
$$;

CREATE FUNCTION public.abandon_email_confirmation_resend_v1(
  p_new uuid,
  p_environment text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new public.email_confirmation_challenges;
  v_previous public.email_confirmation_challenges;
BEGIN
  IF p_new IS NULL OR p_environment IS NULL OR p_environment NOT IN ('development', 'preview', 'production') THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO v_new
  FROM public.email_confirmation_challenges
  WHERE id = p_new
  FOR UPDATE;
  IF v_new.id IS NULL
    OR v_new.purpose IS DISTINCT FROM 'RESEND'
    OR v_new.environment IS DISTINCT FROM p_environment
    OR v_new.consumed_at IS NOT NULL
    OR v_new.created_at < clock_timestamp() - interval '15 minutes' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  UPDATE public.email_confirmation_challenges
    SET superseded_at = clock_timestamp()
    WHERE id = v_new.id AND consumed_at IS NULL;

  IF v_new.supersedes IS NOT NULL THEN
    SELECT * INTO v_previous
    FROM public.email_confirmation_challenges
    WHERE id = v_new.supersedes
    FOR UPDATE;
    IF v_previous.id IS NOT NULL AND v_previous.consumed_at IS NULL THEN
      UPDATE public.email_confirmation_challenges
        SET superseded_at = NULL
        WHERE id = v_previous.id
          AND consumed_at IS NULL;
    END IF;
  END IF;
  RETURN jsonb_build_object('status', 'abandoned');
END;
$$;

CREATE FUNCTION public.admin_email_confirmation_status_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.cases;
  v_customer public.customers;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL OR p_case IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_case FROM public.cases WHERE id = p_case;
  IF v_case.id IS NULL THEN
    RETURN jsonb_build_object('state', 'none', 'label', 'Not verified');
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_case.customer_id;
  IF v_customer.id IS NOT NULL AND admin_private.contact_verified_v1(v_customer.id, 'email') THEN
    RETURN jsonb_build_object('state', 'verified', 'label', 'Verified', 'nextGeneration', 0);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.email_confirmation_challenges AS challenge
    WHERE challenge.case_id = v_case.id
      AND challenge.consumed_at IS NULL
      AND challenge.superseded_at IS NULL
      AND challenge.expires_at > clock_timestamp()
      -- A prepared challenge does not mean the customer received an email.
      -- The receipt must actually have been accepted by the email provider.
      AND EXISTS (
        SELECT 1 FROM public.communications AS receipt
        WHERE receipt.case_id = v_case.id
          AND receipt.communication_type = 'CASE_RECEIVED_CUSTOMER'
          AND receipt.channel = 'EMAIL'
          AND receipt.direction = 'OUTBOUND'
          AND receipt.status = 'SENT'
          AND lower(btrim(receipt.recipient)) = challenge.email_normalized
      )
  ) THEN
    RETURN jsonb_build_object(
      'state', 'pending',
      'label', 'Email confirmation pending — requested automatically in your case receipt',
      'nextGeneration', (
        SELECT coalesce(max(challenge.generation), 0) + 1
        FROM public.email_confirmation_challenges AS challenge
        WHERE challenge.case_id = v_case.id
      )
    );
  END IF;
  RETURN jsonb_build_object(
    'state', 'none',
    'label', 'Not verified',
    'nextGeneration', (
      SELECT coalesce(max(challenge.generation), 0) + 1
      FROM public.email_confirmation_challenges AS challenge
      WHERE challenge.case_id = v_case.id
    )
  );
END;
$$;

CREATE FUNCTION public.admin_prepare_email_confirmation_resend_v1(
  p_token text,
  p_case uuid,
  p_challenge uuid,
  p_token_hash text,
  p_environment text,
  p_key_version integer,
  p_generation integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.cases;
  v_customer public.customers;
  v_email text;
  v_next integer;
  v_public text;
  v_type text;
  v_live uuid;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_case IS NULL OR p_challenge IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('development', 'preview', 'production') THEN
    RETURN jsonb_build_object('status', 'environment');
  END IF;
  IF p_key_version IS NULL OR p_key_version < 1 OR p_key_version > 100 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_generation IS NULL OR p_generation < 1 OR p_generation > 8 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('email-confirmation:' || p_case::text, 0));
  SELECT * INTO v_case FROM public.cases WHERE id = p_case FOR UPDATE;
  IF v_case.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_case.customer_id FOR UPDATE;
  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  v_email := lower(btrim(v_customer.email));
  v_public := v_case.public_ref;
  v_type := v_case.case_type;
  IF admin_private.contact_verified_v1(v_customer.id, 'email') THEN
    RETURN jsonb_build_object('status', 'already_verified', 'publicRef', v_public);
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions AS suppression
    WHERE suppression.address_normalized = v_email
  ) THEN
    RETURN jsonb_build_object('status', 'suppressed');
  END IF;

  SELECT coalesce(max(generation), 0) + 1 INTO v_next
  FROM public.email_confirmation_challenges
  WHERE case_id = v_case.id;
  IF v_next IS DISTINCT FROM p_generation OR v_next > 8 THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF NOT admin_private.email_confirmation_rate_v1('resend:' || v_case.id::text, 3, 86400) THEN
    RETURN jsonb_build_object('status', 'limited');
  END IF;

  SELECT id INTO v_live
  FROM public.email_confirmation_challenges
  WHERE case_id = v_case.id
    AND consumed_at IS NULL
    AND superseded_at IS NULL
  ORDER BY generation DESC
  LIMIT 1
  FOR UPDATE;

  UPDATE public.email_confirmation_challenges
    SET superseded_at = clock_timestamp()
    WHERE case_id = v_case.id
      AND consumed_at IS NULL
      AND superseded_at IS NULL;

  INSERT INTO public.email_confirmation_challenges (
    id, case_id, customer_id, email_normalized, environment, token_hash,
    key_version, purpose, generation, supersedes, expires_at
  ) VALUES (
    p_challenge, v_case.id, v_customer.id, v_email, p_environment, p_token_hash,
    p_key_version, 'RESEND', v_next, v_live, clock_timestamp() + interval '72 hours'
  );

  RETURN jsonb_build_object(
    'status', 'ready',
    'generation', v_next,
    'publicRef', v_public,
    'caseType', v_type,
    'email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_email_confirmation_challenge_v1(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_confirmation_challenge_v1(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_email_challenge_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resend_email_confirmation_challenge_v1(uuid, text, uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_email_confirmation_resend_v1(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_email_confirmation_status_v1(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_prepare_email_confirmation_resend_v1(text, uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_email_confirmation_challenge_v1(uuid, uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_confirmation_challenge_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_email_challenge_v1(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_email_confirmation_challenge_v1(uuid, text, uuid, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_email_confirmation_resend_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_email_confirmation_status_v1(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_prepare_email_confirmation_resend_v1(text, uuid, uuid, text, text, integer, integer) TO service_role;

COMMIT;
