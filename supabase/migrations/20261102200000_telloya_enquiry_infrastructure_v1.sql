-- Telloya Phase 4A: Extend existing enquiry infrastructure for Telloya
-- Migration: 20261102200000_telloya_enquiry_infrastructure_v1.sql

BEGIN;

-- Step 1: Add public_ref column to enquiries table
-- This allows us to store TY/CM references alongside the enquiry
-- Nullable initially to support existing enquiries
ALTER TABLE public.enquiries 
  ADD COLUMN public_ref text;

-- Add unique constraint to prevent duplicate references
CREATE UNIQUE INDEX enquiries_public_ref_unique_idx 
  ON public.enquiries(public_ref) 
  WHERE public_ref IS NOT NULL;

-- Step 2: Extract generic reference generation function
-- Reuses the same secure algorithm as generate_case_public_ref
CREATE OR REPLACE FUNCTION public.generate_enquiry_public_ref(p_source text)
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
  -- Determine prefix based on source
  IF p_source = 'telloya' THEN
    prefix := 'TY';
  ELSIF p_source = 'complete' THEN
    prefix := 'CM';
  ELSE
    -- Other sources don't get references
    RETURN NULL;
  END IF;

  yy := to_char(timezone('utc', now()), 'YY');

  LOOP
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'could not generate a unique enquiry reference';
    END IF;

    -- Generate secure random token using same approach as cases
    bytes := gen_random_bytes(6);
    token := '';
    FOR i IN 0..5 LOOP
      token := token || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;

    candidate := prefix || '-' || yy || '-' || token;

    -- Ensure uniqueness across all enquiry references
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.enquiries
      WHERE public_ref = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

-- Step 3: Extend source constraint to include telloya
ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_source_check;
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_source_check 
  CHECK(source IN ('contact','homepage','phone','telloya'));

-- Step 4: Extend validation function to support Telloya fields
DROP FUNCTION IF EXISTS admin_private.valid_enquiry_v1(jsonb,boolean);
CREATE FUNCTION admin_private.valid_enquiry_v1(p_data jsonb, p_manual boolean) 
RETURNS boolean
LANGUAGE plpgsql 
IMMUTABLE 
SET search_path='' 
AS $$
DECLARE 
  k text; 
  value text;
  p_source text;
BEGIN
  -- Basic structure validation
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>32768 THEN 
    RETURN false; 
  END IF;
  
  p_source := p_data->>'source';
  
  -- Validate source
  IF p_source IS NULL OR p_source NOT IN ('homepage','contact','phone','telloya') THEN
    RETURN false;
  END IF;
  
  -- Source-specific field validation
  IF p_source = 'telloya' THEN
    -- Telloya enquiry validation
    -- Required fields: fullName, email, businessName, country, trade, phone, product, details, privacyAccepted
    -- Optional fields: locations, websiteUrl, missedCallProblem, phoneSetup, contactPreference
    
    IF (p_data - ARRAY['fullName','email','phone','businessName','country','trade','locations','websiteUrl','product','missedCallProblem','phoneSetup','contactPreference','details','privacyAccepted','source'])<>'{}'::jsonb THEN 
      RETURN false; 
    END IF;
    
    -- String field type checks
    FOREACH k IN ARRAY ARRAY['fullName','email','phone','businessName','country','trade','locations','websiteUrl','product','missedCallProblem','phoneSetup','contactPreference','details','source'] LOOP
      IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;
    
    -- Length validations
    IF length(btrim(p_data->>'fullName')) NOT BETWEEN 1 AND 100 
      OR length(p_data->>'email')>254 
      OR length(p_data->>'phone')>40
      OR length(btrim(p_data->>'businessName')) NOT BETWEEN 1 AND 160
      OR length(p_data->>'country')>80
      OR length(btrim(p_data->>'trade')) NOT BETWEEN 1 AND 100
      OR length(p_data->>'locations')>50
      OR length(p_data->>'product')>64
      OR length(p_data->>'missedCallProblem')>5000
      OR length(p_data->>'phoneSetup')>5000
      OR length(p_data->>'contactPreference')>100
      OR length(btrim(p_data->>'details')) NOT BETWEEN 1 AND 5000 THEN 
      RETURN false; 
    END IF;
    
    -- Email validation
    IF p_data->>'email'='' OR (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 
      RETURN false; 
    END IF;
    
    -- Phone validation (required for Telloya)
    IF length(btrim(p_data->>'phone'))<7 THEN
      RETURN false;
    END IF;
    
    -- Product validation
    IF p_data->>'product' NOT IN ('telloya','complete','') THEN
      RETURN false;
    END IF;
    
    -- Website URL validation (optional)
    value := p_data->>'websiteUrl';
    IF length(value)>1000 OR (value<>'' AND value !~ '^https?://[^[:space:]]+$') THEN 
      RETURN false; 
    END IF;
    
  ELSE
    -- Existing ProfileRelaunch validation
    IF (p_data - ARRAY['fullName','email','phone','businessName','country','service','subject','details','websiteUrl','businessProfileUrl','reviewUrl','informationAccurate','privacyAccepted','source'])<>'{}'::jsonb THEN 
      RETURN false; 
    END IF;
    
    FOREACH k IN ARRAY ARRAY['fullName','email','phone','businessName','country','service','subject','details','websiteUrl','businessProfileUrl','reviewUrl','source'] LOOP
      IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;
    
    IF length(btrim(p_data->>'fullName')) NOT BETWEEN 1 AND 100 
      OR length(p_data->>'email')>254 
      OR length(p_data->>'phone')>40
      OR length(btrim(p_data->>'details')) NOT BETWEEN 1 AND 5000 
      OR length(p_data->>'businessName')>160 
      OR length(p_data->>'country')>80 
      OR length(p_data->>'subject')>64 
      OR length(p_data->>'service')>64 THEN 
      RETURN false; 
    END IF;
    
    IF p_manual THEN
      IF p_source<>'phone' OR (p_data->>'email'='' AND length(btrim(p_data->>'phone'))<7) THEN 
        RETURN false; 
      END IF;
    ELSE
      IF p_source NOT IN ('homepage','contact') OR p_data->>'email'='' THEN 
        RETURN false; 
      END IF;
    END IF;
    
    IF p_data->>'email'<>'' AND (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 
      RETURN false; 
    END IF;
    
    FOREACH k IN ARRAY ARRAY['websiteUrl','businessProfileUrl','reviewUrl'] LOOP
      value := p_data->>k; 
      IF length(value)>1000 OR (value<>'' AND value !~ '^https?://[^[:space:]]+$') THEN 
        RETURN false; 
      END IF;
    END LOOP;
  END IF;
  
  RETURN true;
END;
$$;

-- Step 5: Extend create_general_enquiry_v1 to generate references for Telloya
DROP FUNCTION IF EXISTS public.create_general_enquiry_v1(uuid,jsonb,boolean);
CREATE FUNCTION public.create_general_enquiry_v1(p_key uuid, p_data jsonb, p_ack boolean) 
RETURNS jsonb
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path='' 
AS $$
DECLARE 
  e public.enquiries; 
  fingerprint text;
  v_source text;
  v_ref text;
BEGIN
  IF p_key IS NULL OR p_ack IS NULL OR NOT admin_private.valid_enquiry_v1(p_data, false) THEN 
    RETURN jsonb_build_object('status','invalid'); 
  END IF;
  
  fingerprint := md5(p_data::text);
  v_source := p_data->>'source';
  
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  
  SELECT * INTO e FROM public.enquiries WHERE submission_key=p_key;
  
  IF e.id IS NOT NULL THEN
    IF e.fingerprint<>fingerprint OR e.source='phone' THEN 
      RETURN jsonb_build_object('status','conflict'); 
    END IF;
    -- Return existing enquiry with its reference
    RETURN jsonb_build_object('status','existing','enquiryRef',e.public_ref);
  END IF;
  
  -- Generate reference for supported sources
  v_ref := public.generate_enquiry_public_ref(v_source);
  
  INSERT INTO public.enquiries(
    submission_key,
    fingerprint,
    source,
    payload,
    public_ref,
    notification_attempt,
    internal_status,
    ack_status
  )
  VALUES(
    p_key,
    fingerprint,
    v_source,
    p_data,
    v_ref,
    gen_random_uuid(),
    'SENDING',
    CASE WHEN p_ack THEN 'SENDING' ELSE 'SKIPPED' END
  ) RETURNING * INTO e;
  
  INSERT INTO public.enquiry_events(enquiry_id, event) VALUES(e.id, 'received');
  
  RETURN jsonb_build_object(
    'status','created',
    'id',e.id,
    'attempt',e.notification_attempt,
    'sendAck',p_ack,
    'enquiryRef',e.public_ref
  );
END;
$$;

-- Step 6: Update admin_enquiry_detail_v1 to include public_ref
DROP FUNCTION IF EXISTS public.admin_enquiry_detail_v1(text,uuid);
CREATE FUNCTION public.admin_enquiry_detail_v1(p_token text, p_id uuid) 
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path='' 
AS $$
DECLARE 
  e public.enquiries; 
  events jsonb; 
  case_ref text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  
  SELECT * INTO e FROM public.enquiries WHERE id=p_id;
  
  IF e.id IS NULL THEN 
    RETURN jsonb_build_object('missing',true); 
  END IF;
  
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sort_id DESC),'[]') INTO events 
  FROM (
    SELECT 
      id::text,
      id AS sort_id,
      event,
      note,
      created_at AS "createdAt" 
    FROM public.enquiry_events 
    WHERE enquiry_id=p_id 
    ORDER BY id DESC 
    LIMIT 100
  ) x;
  
  SELECT public_ref INTO case_ref FROM public.cases WHERE id=e.case_id;
  
  RETURN jsonb_build_object(
    'id',e.id,
    'payload',e.payload,
    'source',e.source,
    'status',e.status,
    'assigned',e.assigned,
    'version',e.record_version,
    'createdAt',e.created_at,
    'nextAction',e.next_action,
    'nextActionAt',e.next_action_at,
    'internalStatus',e.internal_status,
    'ackStatus',e.ack_status,
    'enquiryRef',e.public_ref,
    'caseRef',case_ref,
    'caseId',e.case_id,
    'monitoringId',e.monitoring_request_id,
    'events',events
  );
END;
$$;

-- Step 7: Update admin_enquiry_list_v1 to include public_ref
DROP FUNCTION IF EXISTS public.admin_enquiry_list_v1(text,text,text,timestamptz,uuid,text);
CREATE FUNCTION public.admin_enquiry_list_v1(
  p_token text,
  p_status text DEFAULT 'active',
  p_search text DEFAULT '',
  p_before_time timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_filter text DEFAULT 'all'
) 
RETURNS jsonb
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path='' 
AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  
  IF p_status IS NULL 
    OR p_status NOT IN ('active','all','new','open','waiting','closed','spam','converted') 
    OR p_search IS NULL 
    OR length(p_search)>100
    OR p_filter IS NULL 
    OR p_filter NOT IN ('all','unassigned','assigned','email','overdue') 
    OR (p_before_time IS NULL)<>(p_before_id IS NULL) THEN 
    RAISE EXCEPTION 'Invalid enquiry filters'; 
  END IF;
  
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC, x.id DESC),'[]'::jsonb) 
  INTO result 
  FROM (
    SELECT 
      e.id,
      e.payload->>'fullName' AS name,
      e.payload->>'email' AS email,
      e.payload->>'businessName' AS business,
      e.payload->>'subject' AS subject,
      e.source,
      e.status,
      e.assigned,
      e.public_ref AS "enquiryRef",
      e.created_at AS "createdAt",
      e.next_action_at AS "nextActionAt",
      e.internal_status AS "internalStatus",
      e.ack_status AS "ackStatus"
    FROM public.enquiries e 
    WHERE (
      p_status='all' 
      OR (p_status='active' AND e.status IN ('new','open','waiting')) 
      OR e.status=p_status
    )
    AND (
      p_search='' 
      OR strpos(
        lower(
          e.payload->>'fullName' || ' ' || 
          (e.payload->>'email') || ' ' || 
          (e.payload->>'phone') || ' ' || 
          (e.payload->>'businessName') || ' ' ||
          coalesce(e.public_ref, '')
        ),
        lower(p_search)
      )>0
    )
    AND (p_before_time IS NULL OR (e.created_at, e.id)<(p_before_time, p_before_id))
    AND (
      p_filter='all' 
      OR (p_filter='unassigned' AND NOT e.assigned) 
      OR (p_filter='assigned' AND e.assigned)
      OR (p_filter='email' AND (e.internal_status IN ('SENDING','FAILED','UNKNOWN') OR e.ack_status IN ('SENDING','FAILED','UNKNOWN')))
      OR (p_filter='overdue' AND e.status IN ('new','open','waiting') AND e.next_action_at<now())
    )
    ORDER BY e.created_at DESC, e.id DESC 
    LIMIT 51
  ) x;
  
  RETURN result;
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.generate_enquiry_public_ref(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.generate_enquiry_public_ref(text) TO service_role;

REVOKE ALL ON FUNCTION admin_private.valid_enquiry_v1(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- No grant - internal function only

REVOKE ALL ON FUNCTION public.create_general_enquiry_v1(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_general_enquiry_v1(uuid,jsonb,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_enquiry_detail_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_enquiry_detail_v1(text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_enquiry_list_v1(text,text,text,timestamptz,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_enquiry_list_v1(text,text,text,timestamptz,uuid,text) TO service_role;

COMMIT;
