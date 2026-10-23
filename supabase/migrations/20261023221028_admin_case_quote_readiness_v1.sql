-- ADMIN-JOURNEY-06. Read-only purchasing and seller-VAT facts for Step 6.
-- Authenticated Admin sessions only. Reuses commercial_country_v1 and
-- seller_vat_status_v1. Does not read the Google listing country, tax
-- identifiers, evidence text, or session secrets.
-- Not applied to DEV or Production. Do not apply without approval.

BEGIN;

CREATE FUNCTION public.admin_case_quote_readiness_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  session jsonb;
  found public.cases;
  place jsonb;
  seller text;
  pending_count integer;
  country text;
  legal_name text;
  establishment text;
  tax_path text;
BEGIN
  session := public.admin_session_v1(p_token);
  IF session IS NULL OR session->>'userId' IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_case IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO found FROM public.cases WHERE id = p_case;
  IF found.id IS NULL OR found.business_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  BEGIN
    place := admin_private.commercial_country_v1(found.business_id);
    seller := admin_private.seller_vat_status_v1();
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END;

  IF place IS NULL OR jsonb_typeof(place) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF coalesce(place->>'ok', 'false') = 'true' THEN
    country := place->>'countryCode';
    IF country IS NULL OR country !~ '^[A-Z]{2}$' OR country IN ('UK', 'EU', 'XX') THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    SELECT establishment_row.legal_name INTO legal_name
    FROM public.business_establishments establishment_row
    WHERE establishment_row.business_id = found.business_id
      AND establishment_row.superseded_at IS NULL
      AND establishment_row.verification_status = 'VERIFIED'
    LIMIT 1;
    IF legal_name IS NULL OR char_length(btrim(legal_name)) < 2 THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    establishment := 'verified';
  ELSIF place->>'reason' = 'conflicting_establishment' THEN
    establishment := 'conflicting';
    country := NULL;
    legal_name := NULL;
  ELSIF place->>'reason' = 'unresolved_establishment' THEN
    SELECT count(*) INTO pending_count
    FROM public.business_establishments establishment_row
    WHERE establishment_row.business_id = found.business_id
      AND establishment_row.superseded_at IS NULL
      AND establishment_row.verification_status = 'PENDING';
    establishment := CASE WHEN pending_count > 0 THEN 'pending' ELSE 'missing' END;
    country := NULL;
    legal_name := NULL;
  ELSE
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF seller IS NULL OR seller NOT IN ('NOT_VAT_REGISTERED', 'REGISTERED') THEN
    seller := 'UNKNOWN';
  END IF;

  IF establishment = 'verified' AND country = 'GB' AND seller = 'NOT_VAT_REGISTERED' THEN
    tax_path := 'uk_not_charged';
  ELSIF establishment = 'verified' OR establishment = 'conflicting' THEN
    tax_path := 'review';
  ELSE
    tax_path := 'unavailable';
  END IF;

  RETURN jsonb_build_object(
    'status', establishment,
    'countryCode', country,
    'legalName', legal_name,
    'sellerVat', seller,
    'taxPath', tax_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_case_quote_readiness_v1(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_quote_readiness_v1(text, uuid) TO service_role;

COMMIT;
