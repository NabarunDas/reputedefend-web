-- Proposed only. Do not apply this file to DEV or Production.
-- Do not create a schedule. Do not set destructive deletion on.
-- This does not use PRIVACY_DELETION_ENABLED.
-- Ordinary Telloya marketing enquiries only. Voice leads, billing, usage,
-- ProfileRelaunch enquiries and paid-service records are out of scope.
-- Resend copies and provider backups are not deleted by this function.

BEGIN;

CREATE TABLE admin_private.telloya_marketing_enquiry_retention_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  destructive_enabled boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE admin_private.telloya_marketing_enquiry_retention_control IS
  'Empty means destructive deletion is off. A later approved change may insert the single row with destructive_enabled true. This migration does not insert that row and does not create a schedule.';

CREATE TABLE admin_private.telloya_marketing_enquiry_holds (
  enquiry_id uuid PRIMARY KEY REFERENCES public.enquiries (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  released_at timestamptz,
  CHECK (released_at IS NULL OR released_at >= created_at)
);

COMMENT ON TABLE admin_private.telloya_marketing_enquiry_holds IS
  'Explicit hold for one Telloya marketing enquiry. public.legal_holds cannot name an enquiry. A released hold does not keep the enquiry.';

CREATE TABLE admin_private.telloya_marketing_enquiry_retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('dry_run', 'execute')),
  status text NOT NULL CHECK (status IN ('dry_run', 'disabled', 'blocked', 'complete')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  batch_limit integer NOT NULL CHECK (batch_limit BETWEEN 1 AND 100),
  deleted_count integer NOT NULL CHECK (deleted_count >= 0),
  failed_count integer NOT NULL CHECK (failed_count >= 0),
  counts jsonb NOT NULL CHECK (
    jsonb_typeof(counts) = 'object'
    AND pg_catalog.octet_length(counts::text) <= 2000
  )
);

COMMENT ON TABLE admin_private.telloya_marketing_enquiry_retention_runs IS
  'Counts only. No enquiry id, name, email, phone or payload.';

CREATE INDEX enquiries_telloya_created_idx
  ON public.enquiries (created_at, id)
  WHERE source = 'telloya';

CREATE FUNCTION admin_private.telloya_marketing_enquiry_retention_class_v1(
  p_enquiry_id uuid,
  p_source text,
  p_created_at timestamptz,
  p_status text,
  p_assigned boolean,
  p_next_action text,
  p_next_action_at timestamptz,
  p_case_id uuid,
  p_monitoring_request_id uuid,
  p_public_ref text,
  p_now timestamptz,
  p_person_hold boolean
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
  IF p_source IS DISTINCT FROM 'telloya' THEN
    RETURN 'other_source';
  END IF;
  -- Older than 90 complete days. An enquiry created exactly 90 days ago stays.
  IF p_created_at IS NULL OR p_now IS NULL OR p_created_at >= p_now - interval '90 days' THEN
    RETURN 'too_recent';
  END IF;
  IF p_case_id IS NOT NULL THEN
    RETURN 'linked_case';
  END IF;
  IF p_monitoring_request_id IS NOT NULL THEN
    RETURN 'linked_monitoring';
  END IF;
  IF p_status = 'converted' THEN
    RETURN 'converted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.complaints AS complaint WHERE complaint.enquiry_id = p_enquiry_id) THEN
    RETURN 'linked_complaint';
  END IF;
  IF EXISTS (SELECT 1 FROM public.onboarding_requests AS request WHERE request.enquiry_id = p_enquiry_id) THEN
    RETURN 'linked_onboarding';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_response_obligations AS obligation
    WHERE obligation.enquiry_id = p_enquiry_id
  ) THEN
    RETURN 'linked_obligation';
  END IF;
  IF p_public_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.privacy_requests AS request
    WHERE request.subject_ref = p_public_ref
      AND request.status NOT IN ('COMPLETED', 'REJECTED', 'CANCELLED')
  ) THEN
    RETURN 'privacy_request';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM admin_private.telloya_marketing_enquiry_holds AS hold
    WHERE hold.enquiry_id = p_enquiry_id
      AND hold.released_at IS NULL
  ) THEN
    RETURN 'enquiry_hold';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.legal_holds AS hold
    WHERE hold.status = 'ACTIVE'
      AND hold.scope_kind = 'CATEGORY'
      AND hold.category = 'UNSUCCESSFUL_ENQUIRIES'
  ) THEN
    RETURN 'category_hold';
  END IF;
  -- A customer or business hold cannot be matched to an unlinked marketing
  -- enquiry. Do not match by email or name. Keep every candidate.
  IF p_person_hold THEN
    RETURN 'unresolved_person_hold';
  END IF;
  IF p_status NOT IN ('new', 'closed', 'spam')
    OR COALESCE(p_assigned, false)
    OR pg_catalog.length(pg_catalog.btrim(COALESCE(p_next_action, ''))) > 0
    OR p_next_action_at IS NOT NULL
  THEN
    RETURN 'active';
  END IF;
  RETURN 'eligible';
END;
$fn$;

CREATE FUNCTION admin_private.telloya_marketing_enquiry_retention_v1(
  p_now timestamptz,
  p_mode text,
  p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_enabled boolean := false;
  v_person_hold boolean := false;
  v_limit integer;
  v_deleted integer := 0;
  v_failed integer := 0;
  v_eligible integer := 0;
  v_status text;
  v_reason text := NULL;
  v_counts jsonb;
  v_row public.enquiries;
  v_class text;
BEGIN
  IF p_now IS NULL OR p_mode IS NULL OR p_mode NOT IN ('dry_run', 'execute') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'deleted', 0, 'failed', 0);
  END IF;
  v_limit := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('telloya-marketing-enquiry-retention')::bigint) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'busy', 'deleted', 0, 'failed', 0);
  END IF;

  SELECT control.destructive_enabled INTO v_enabled
  FROM admin_private.telloya_marketing_enquiry_retention_control AS control
  LIMIT 1;
  v_enabled := COALESCE(v_enabled, false);

  SELECT EXISTS (
    SELECT 1
    FROM public.legal_holds AS hold
    WHERE hold.status = 'ACTIVE'
      AND hold.scope_kind IN ('CUSTOMER', 'BUSINESS')
  ) INTO v_person_hold;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(classified.reason, classified.n), '{}'::jsonb)
  INTO v_counts
  FROM (
    SELECT reason, pg_catalog.count(*)::integer AS n
    FROM (
      SELECT admin_private.telloya_marketing_enquiry_retention_class_v1(
        enquiry.id, enquiry.source, enquiry.created_at, enquiry.status, enquiry.assigned,
        enquiry.next_action, enquiry.next_action_at, enquiry.case_id, enquiry.monitoring_request_id,
        enquiry.public_ref, p_now, v_person_hold
      ) AS reason
      FROM public.enquiries AS enquiry
      WHERE enquiry.source = 'telloya'
        OR enquiry.created_at < p_now - interval '90 days'
    ) AS reasons
    GROUP BY reason
  ) AS classified;
  v_eligible := COALESCE((v_counts->>'eligible')::integer, 0);

  IF p_mode = 'dry_run' THEN
    v_status := 'dry_run';
  ELSIF NOT v_enabled THEN
    v_status := 'disabled';
  ELSIF v_person_hold THEN
    v_status := 'blocked';
    v_reason := 'unresolved_person_hold';
  ELSE
    FOR v_row IN
      SELECT enquiry.*
      FROM public.enquiries AS enquiry
      WHERE enquiry.source = 'telloya'
        AND enquiry.created_at < p_now - interval '90 days'
        AND admin_private.telloya_marketing_enquiry_retention_class_v1(
          enquiry.id, enquiry.source, enquiry.created_at, enquiry.status, enquiry.assigned,
          enquiry.next_action, enquiry.next_action_at, enquiry.case_id, enquiry.monitoring_request_id,
          enquiry.public_ref, p_now, false
        ) = 'eligible'
      ORDER BY enquiry.created_at, enquiry.id
      LIMIT v_limit
      FOR UPDATE OF enquiry SKIP LOCKED
    LOOP
      v_class := admin_private.telloya_marketing_enquiry_retention_class_v1(
        v_row.id, v_row.source, v_row.created_at, v_row.status, v_row.assigned,
        v_row.next_action, v_row.next_action_at, v_row.case_id, v_row.monitoring_request_id,
        v_row.public_ref, p_now, false
      );
      IF v_class IS DISTINCT FROM 'eligible' THEN
        CONTINUE;
      END IF;
      BEGIN
        DELETE FROM public.enquiry_events WHERE enquiry_id = v_row.id;
        DELETE FROM public.enquiries WHERE id = v_row.id;
        v_deleted := v_deleted + 1;
      EXCEPTION WHEN OTHERS THEN
        v_failed := v_failed + 1;
      END;
    END LOOP;
    v_status := 'complete';
  END IF;

  INSERT INTO admin_private.telloya_marketing_enquiry_retention_runs(
    mode, status, started_at, finished_at, batch_limit, deleted_count, failed_count, counts
  ) VALUES (
    p_mode, v_status, v_started, pg_catalog.clock_timestamp(), v_limit, v_deleted, v_failed, v_counts
  );

  RETURN pg_catalog.jsonb_build_object(
    'status', v_status,
    'deleted', v_deleted,
    'failed', v_failed,
    'eligible', v_eligible,
    'blockedReason', v_reason,
    'limit', v_limit,
    'counts', v_counts
  );
END;
$fn$;

COMMENT ON FUNCTION admin_private.telloya_marketing_enquiry_retention_v1(timestamptz, text, integer) IS
  'Owner role only. Dry-run counts Telloya marketing enquiries without deleting them. Execute deletes only when telloya_marketing_enquiry_retention_control.destructive_enabled is true. No anon, authenticated or service_role grant. No schedule is created. Does not delete voice leads, billing, usage, ProfileRelaunch enquiries, Resend copies or backups.';

-- Proposed schedule, not created:
-- After a separate approval, a database-owner cron entry could run
-- SELECT admin_private.telloya_marketing_enquiry_retention_v1(now(), 'execute', 25);
-- daily, only once destructive_enabled is explicitly set true.
-- Do not create this schedule in this migration.

REVOKE ALL ON TABLE
  admin_private.telloya_marketing_enquiry_retention_control,
  admin_private.telloya_marketing_enquiry_holds,
  admin_private.telloya_marketing_enquiry_retention_runs
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  admin_private.telloya_marketing_enquiry_retention_class_v1(uuid, text, timestamptz, text, boolean, text, timestamptz, uuid, uuid, text, timestamptz, boolean),
  admin_private.telloya_marketing_enquiry_retention_v1(timestamptz, text, integer)
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE admin_private.telloya_marketing_enquiry_retention_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_marketing_enquiry_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_marketing_enquiry_retention_runs ENABLE ROW LEVEL SECURITY;

COMMIT;
