BEGIN;

-- AUTO-EMAIL-VERIFY delivery provenance. Source only. Do not apply this file
-- to DEV or Production from this change. It does not send mail, store a bearer,
-- or change a contact-verification or business-authority row.
--
-- A challenge may exist before the provider accepts the email. Admin may say
-- that confirmation was requested only after this file's acceptance record
-- exists for that challenge. An initial receipt and a later recovery email
-- stay distinct.

ALTER TABLE public.email_confirmation_challenges
  ADD COLUMN delivery_state text NOT NULL DEFAULT 'prepared',
  ADD COLUMN provider_accepted_at timestamptz;

ALTER TABLE public.email_confirmation_challenges
  ADD CONSTRAINT email_confirmation_challenges_delivery_state_check
    CHECK (delivery_state IN ('prepared', 'accepted', 'rejected')),
  ADD CONSTRAINT email_confirmation_challenges_accepted_at_check
    CHECK (
      (delivery_state = 'accepted' AND provider_accepted_at IS NOT NULL)
      OR (delivery_state <> 'accepted' AND provider_accepted_at IS NULL)
    );

CREATE FUNCTION public.record_email_confirmation_delivery_v1(
  p_challenge uuid,
  p_environment text,
  p_outcome text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.email_confirmation_challenges;
BEGIN
  IF p_challenge IS NULL OR p_environment IS NULL OR p_environment NOT IN ('development', 'preview', 'production') THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('accepted', 'rejected') THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT * INTO v_row
  FROM public.email_confirmation_challenges
  WHERE id = p_challenge
  FOR UPDATE;
  IF v_row.id IS NULL
    OR v_row.environment IS DISTINCT FROM p_environment
    OR v_row.consumed_at IS NOT NULL
    OR v_row.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF v_row.delivery_state = p_outcome THEN
    RETURN jsonb_build_object('status', p_outcome);
  END IF;
  IF v_row.delivery_state IS DISTINCT FROM 'prepared' THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF v_row.created_at < clock_timestamp() - interval '15 minutes' THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  UPDATE public.email_confirmation_challenges
    SET delivery_state = p_outcome,
        provider_accepted_at = CASE
          WHEN p_outcome = 'accepted' THEN clock_timestamp()
          ELSE NULL
        END
    WHERE id = v_row.id
      AND delivery_state = 'prepared'
      AND consumed_at IS NULL
      AND superseded_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  RETURN jsonb_build_object('status', p_outcome);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_email_confirmation_status_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.cases;
  v_customer public.customers;
  v_email text;
  v_next integer;
  v_live public.email_confirmation_challenges;
  v_accepted public.email_confirmation_challenges;
  v_provenance text;
  v_recovery text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL OR p_case IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_case FROM public.cases WHERE id = p_case;
  IF v_case.id IS NULL THEN
    RETURN jsonb_build_object(
      'state', 'none',
      'provenance', 'none',
      'recovery', 'unavailable',
      'label', 'Not verified',
      'nextGeneration', 0
    );
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_case.customer_id;
  IF v_customer.id IS NOT NULL AND admin_private.contact_verified_v1(v_customer.id, 'email') THEN
    RETURN jsonb_build_object(
      'state', 'verified',
      'provenance', 'none',
      'recovery', 'unavailable',
      'label', 'Verified',
      'nextGeneration', 0
    );
  END IF;

  v_email := lower(btrim(coalesce(v_customer.email, '')));
  SELECT coalesce(max(challenge.generation), 0) + 1 INTO v_next
  FROM public.email_confirmation_challenges AS challenge
  WHERE challenge.case_id = v_case.id;

  IF v_email = '' OR EXISTS (
    SELECT 1 FROM admin_private.email_suppressions AS suppression
    WHERE suppression.address_normalized = v_email
  ) OR v_next > 8 THEN
    RETURN jsonb_build_object(
      'state', 'none',
      'provenance', 'none',
      'recovery', 'unavailable',
      'label', 'Not verified',
      'nextGeneration', v_next
    );
  END IF;

  SELECT * INTO v_live
  FROM public.email_confirmation_challenges AS challenge
  WHERE challenge.case_id = v_case.id
    AND challenge.consumed_at IS NULL
    AND challenge.superseded_at IS NULL
    AND challenge.expires_at > clock_timestamp()
  ORDER BY challenge.generation DESC
  LIMIT 1;

  SELECT * INTO v_accepted
  FROM public.email_confirmation_challenges AS challenge
  WHERE challenge.case_id = v_case.id
    AND challenge.delivery_state = 'accepted'
  ORDER BY challenge.generation DESC
  LIMIT 1;

  IF v_live.id IS NOT NULL AND v_live.delivery_state = 'accepted' THEN
    v_provenance := CASE
      WHEN v_live.purpose = 'INITIAL_RECEIPT' THEN 'initial_receipt'
      ELSE 'recovery'
    END;
    RETURN jsonb_build_object(
      'state', 'pending',
      'provenance', v_provenance,
      'recovery', 'resend',
      'label', CASE
        WHEN v_provenance = 'initial_receipt'
          THEN 'Email confirmation pending — requested automatically in your case receipt'
        ELSE 'Email confirmation pending — requested in a separate recovery email'
      END,
      'nextGeneration', v_next
    );
  END IF;

  IF v_accepted.id IS NOT NULL THEN
    v_provenance := CASE
      WHEN v_accepted.purpose = 'INITIAL_RECEIPT' THEN 'initial_receipt'
      ELSE 'recovery'
    END;
    v_recovery := 'resend';
  ELSE
    v_provenance := 'none';
    v_recovery := 'send';
  END IF;

  RETURN jsonb_build_object(
    'state', 'none',
    'provenance', v_provenance,
    'recovery', v_recovery,
    'label', 'Not verified',
    'nextGeneration', v_next
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_email_confirmation_delivery_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_confirmation_delivery_v1(uuid, text, text) TO service_role;

COMMIT;
