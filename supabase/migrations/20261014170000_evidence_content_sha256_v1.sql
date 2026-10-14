-- SEC-08 evidence content SHA-256, phase 1.
-- Forward-only and source-only. Do not apply this file to DEV or Production
-- from the change that adds it. It does not move the approved backup head.
-- Existing rows keep a null digest. This file does not reject VALID when the
-- digest is null, so the Admin build deployed today can still refresh a clean
-- file. The new Admin records a digest before it reports VALID. A later
-- reviewed migration may require the digest, and only after that Admin is
-- deployed and the backfill has been reviewed. No existing digest is rewritten.

BEGIN;

ALTER TABLE public.case_document_versions
  ADD COLUMN content_sha256 text,
  ADD COLUMN content_sha256_bytes bigint,
  ADD COLUMN content_sha256_verified_at timestamptz;

ALTER TABLE public.case_document_versions
  ADD CONSTRAINT case_document_versions_content_sha256_check CHECK (
    (
      content_sha256 IS NULL
      AND content_sha256_bytes IS NULL
      AND content_sha256_verified_at IS NULL
    )
    OR (
      content_sha256 IS NOT NULL
      AND content_sha256 ~ '^[a-f0-9]{64}$'
      AND content_sha256_bytes IS NOT NULL
      AND content_sha256_bytes = declared_size_bytes
      AND content_sha256_bytes BETWEEN 1 AND 10485760
      AND content_sha256_verified_at IS NOT NULL
    )
  );

CREATE FUNCTION admin_private.protect_evidence_content_sha256_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.content_sha256 IS NOT NULL AND (
    NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.content_sha256_bytes IS DISTINCT FROM OLD.content_sha256_bytes
    OR NEW.content_sha256_verified_at IS DISTINCT FROM OLD.content_sha256_verified_at
  ) THEN
    RAISE EXCEPTION 'evidence content digest is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER case_document_versions_protect_sha256
BEFORE UPDATE ON public.case_document_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_evidence_content_sha256_v1();

REVOKE ALL ON FUNCTION admin_private.protect_evidence_content_sha256_v1() FROM PUBLIC, anon, authenticated, service_role;

-- Records a server-computed digest. A null digest may be written once.
-- A different digest is reported and left unchanged. The digest is not returned.
CREATE FUNCTION public.evidence_content_sha256_v1(
  p_version uuid,
  p_sha256 text,
  p_byte_length bigint,
  p_write boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.case_document_versions;
BEGIN
  IF p_version IS NULL OR p_write IS NULL
    OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$'
    OR p_byte_length IS NULL OR p_byte_length < 1 OR p_byte_length > 10485760
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_write THEN
    SELECT * INTO v FROM public.case_document_versions WHERE id = p_version FOR UPDATE;
  ELSE
    SELECT * INTO v FROM public.case_document_versions WHERE id = p_version;
  END IF;
  IF v.id IS NULL OR v.upload_status <> 'UPLOADED' THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF p_byte_length <> v.declared_size_bytes THEN
    RETURN jsonb_build_object('status', 'size_mismatch', 'versionId', v.id);
  END IF;
  IF v.content_sha256 IS NULL THEN
    IF p_write IS NOT TRUE THEN
      RETURN jsonb_build_object('status', 'unverified', 'versionId', v.id);
    END IF;
    UPDATE public.case_document_versions
      SET content_sha256 = p_sha256,
          content_sha256_bytes = p_byte_length,
          content_sha256_verified_at = now()
      WHERE id = v.id AND content_sha256 IS NULL;
    IF NOT FOUND THEN
      SELECT * INTO v FROM public.case_document_versions WHERE id = p_version;
      IF v.content_sha256 = p_sha256 AND v.content_sha256_bytes = p_byte_length THEN
        RETURN jsonb_build_object('status', 'already_trusted', 'versionId', v.id);
      END IF;
      RETURN jsonb_build_object('status', 'mismatch', 'versionId', v.id);
    END IF;
    RETURN jsonb_build_object('status', 'recorded', 'versionId', v.id);
  END IF;
  IF v.content_sha256 = p_sha256 AND v.content_sha256_bytes = p_byte_length THEN
    RETURN jsonb_build_object('status', 'already_trusted', 'versionId', v.id);
  END IF;
  RETURN jsonb_build_object('status', 'mismatch', 'versionId', v.id);
END; $$;

-- check and restore list every UPLOADED version, whatever the stored scan is.
-- apply lists only clean uploaded versions that still have no digest.
-- PENDING_UPLOAD and FAILED have no accepted object: they are counted and omitted.
-- storage_key is returned to service_role so an operator tool can read the object.
-- Callers must not print it, and this function does not return the digest.
CREATE FUNCTION public.evidence_content_sha256_page_v1(
  p_after uuid,
  p_limit integer,
  p_unverified_only boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  lim integer; rows jsonb;
  uploaded_count integer; pending_count integer; failed_count integer;
BEGIN
  IF p_unverified_only IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  lim := least(greatest(coalesce(p_limit, 50), 1), 50);
  SELECT
    count(*) FILTER (WHERE upload_status = 'UPLOADED'),
    count(*) FILTER (WHERE upload_status = 'PENDING_UPLOAD'),
    count(*) FILTER (WHERE upload_status = 'FAILED')
  INTO uploaded_count, pending_count, failed_count
  FROM public.case_document_versions;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'versionId', v.id,
    'declaredSizeBytes', v.declared_size_bytes,
    'storageBucket', v.storage_bucket,
    'storageKey', v.storage_key,
    'scanStatus', v.scan_status,
    'hasDigest', v.content_sha256 IS NOT NULL
  ) ORDER BY v.id), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT id, declared_size_bytes, storage_bucket, storage_key, scan_status, content_sha256
    FROM public.case_document_versions
    WHERE upload_status = 'UPLOADED'
      AND (p_after IS NULL OR id > p_after)
      AND (
        NOT p_unverified_only
        OR (scan_status = 'NO_THREATS_FOUND' AND content_sha256 IS NULL)
      )
    ORDER BY id
    LIMIT lim
  ) v;
  RETURN jsonb_build_object(
    'status', 'success',
    'versions', rows,
    'uploadedCount', uploaded_count,
    'excludedPendingUploadCount', pending_count,
    'excludedFailedCount', failed_count
  );
END; $$;

REVOKE ALL ON FUNCTION
  public.evidence_content_sha256_v1(uuid, text, bigint, boolean),
  public.evidence_content_sha256_page_v1(uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.evidence_content_sha256_v1(uuid, text, bigint, boolean),
  public.evidence_content_sha256_page_v1(uuid, integer, boolean)
  TO service_role;

-- Phase 1 does not reject VALID when content_sha256 is null. The deployed
-- Admin refresh does not write a digest, and this function must keep accepting
-- that call. The new Admin records the digest before it asks for VALID.
-- Visibility is withdrawn in the same UPDATE as a failed scan or invalidation,
-- so the customer-visibility CHECK cannot abort the invalidation. A clean
-- VALID refresh of an accepted file keeps the visibility it already has.
CREATE OR REPLACE FUNCTION public.admin_evidence_refresh_scan_v1(
  p_token text, p_request uuid, p_case uuid, p_version uuid, p_scan text, p_validation text, p_validation_error text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.cases; d public.case_documents; v public.case_document_versions;
  actor uuid; fp text; cached jsonb; result jsonb; new_validated_at timestamptz; visible boolean;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL
    OR p_scan IS NULL OR p_scan NOT IN ('PENDING','NO_THREATS_FOUND','THREATS_FOUND','UNSUPPORTED','ACCESS_DENIED','FAILED')
    OR p_validation IS NULL OR p_validation NOT IN ('PENDING','VALID','INVALID','ERROR')
    OR (p_validation = 'VALID' AND p_scan <> 'NO_THREATS_FOUND')
    OR (p_scan <> 'NO_THREATS_FOUND' AND p_validation <> 'PENDING')
    OR (p_validation IN ('INVALID','ERROR') AND (p_validation_error IS NULL OR length(btrim(p_validation_error)) NOT BETWEEN 1 AND 500))
    OR (p_validation IN ('PENDING','VALID') AND p_validation_error IS NOT NULL)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_case, p_version, 'refresh_scan', p_scan, p_validation, p_validation_error)::text);
  cached := admin_private.evidence_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id FOR UPDATE;
  IF d.id IS NULL OR d.case_id <> p_case THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO c FROM public.cases WHERE id = d.case_id;
  IF v.upload_status <> 'UPLOADED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  new_validated_at := CASE WHEN p_validation IN ('VALID','INVALID','ERROR') THEN now() ELSE NULL END;
  UPDATE public.case_document_versions
    SET scan_status = p_scan, scan_checked_at = now(), validation_status = p_validation,
        validation_error = CASE WHEN p_validation IN ('INVALID','ERROR') THEN btrim(p_validation_error) ELSE NULL END,
        validated_at = coalesce(new_validated_at, case_document_versions.validated_at),
        customer_visible = CASE
          WHEN p_scan = 'NO_THREATS_FOUND' AND p_validation = 'VALID' AND review_status = 'ACCEPTED' THEN customer_visible
          ELSE false
        END
    WHERE id = v.id
    RETURNING customer_visible INTO visible;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (c.id, d.id, v.id, actor, 'SCAN_REFRESHED', jsonb_build_object('scanStatus', p_scan, 'validationStatus', p_validation, 'customerVisible', visible));
  PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Evidence scan refreshed', jsonb_build_object('documentId', d.id, 'versionId', v.id, 'operation', 'refresh_scan', 'scanStatus', p_scan, 'validationStatus', p_validation, 'customerVisible', visible));
  result := jsonb_build_object('status', 'success', 'documentId', d.id, 'versionId', v.id, 'uploadStatus', 'UPLOADED', 'scanStatus', p_scan, 'validationStatus', p_validation, 'customerVisible', visible);
  INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

COMMIT;
