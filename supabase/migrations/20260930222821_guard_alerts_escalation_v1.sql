-- Guard alerts, escalation and linked cases v1 (Step 18). Additive only.
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / LIVE ALERTS & NOTIFICATIONS DISABLED
-- Do not apply from this PR. Do not replay or modify applied migrations.
-- Do not enable GUARD_ALERTS_ENABLED, GUARD_ALERT_NOTIFICATIONS_ENABLED,
-- GUARD_CHECKS_ENABLED, GUARD_ACTIVATION_ENABLED, Stripe or live mail.
-- Do not configure Resend or Google API. Do not invent an alert SLA.
-- Do not change Cron. Current Cron remains 0 4 * * *.

BEGIN;

ALTER TABLE admin_private.job_outbox DROP CONSTRAINT job_outbox_topic_check;
ALTER TABLE admin_private.job_outbox ADD CONSTRAINT job_outbox_topic_check
  CHECK (topic IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING','MAINTAIN_GUARD_CHECKS','MAINTAIN_GUARD_ALERTS'));
ALTER TABLE admin_private.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE admin_private.jobs ADD CONSTRAINT jobs_type_check
  CHECK (job_type IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING','MAINTAIN_GUARD_CHECKS','MAINTAIN_GUARD_ALERTS'));

CREATE OR REPLACE FUNCTION admin_private.enqueue_outbox_v1(
  p_event_key text, p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_available_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE created admin_private.job_outbox;
BEGIN
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 8 AND 200
    OR p_topic IS NULL OR p_topic NOT IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING','MAINTAIN_GUARD_CHECKS','MAINTAIN_GUARD_ALERTS')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid outbox event'; END IF;
  INSERT INTO admin_private.job_outbox(event_key, topic, aggregate_type, aggregate_id, payload, available_at)
  VALUES (btrim(p_event_key), p_topic, nullif(btrim(coalesce(p_aggregate_type, '')), ''), p_aggregate_id, p_payload, coalesce(p_available_at, now()))
  RETURNING * INTO created;
  RETURN created.id;
END; $$;

CREATE TABLE public.guard_alerts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'NEW' CHECK (state IN ('NEW','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  severity text NOT NULL DEFAULT 'UNASSESSED' CHECK (severity IN ('UNASSESSED','LOW','MEDIUM','HIGH','CRITICAL')),
  review_disposition text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (review_disposition IN ('PENDING_REVIEW','CONFIRMED_CUSTOMER_ISSUE','INTERNAL_ONLY','FALSE_POSITIVE')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  first_observation_id uuid NOT NULL REFERENCES public.guard_check_observations(id) ON DELETE RESTRICT,
  latest_observation_id uuid NOT NULL REFERENCES public.guard_check_observations(id) ON DELETE RESTRICT,
  first_observed_at timestamptz NOT NULL,
  latest_observed_at timestamptz NOT NULL,
  issue_codes text[] NOT NULL DEFAULT '{}',
  needs_review boolean NOT NULL DEFAULT true,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  dismissed_at timestamptz,
  dismissed_by uuid,
  escalation_count integer NOT NULL DEFAULT 0 CHECK (escalation_count >= 0),
  last_escalated_at timestamptz,
  linked_primary_case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guard_alert_times CHECK (latest_observed_at >= first_observed_at),
  CONSTRAINT guard_alert_new CHECK (
    state <> 'NEW'
    OR (
      acknowledged_at IS NULL AND acknowledged_by IS NULL
      AND resolved_at IS NULL AND resolved_by IS NULL
      AND dismissed_at IS NULL AND dismissed_by IS NULL
      AND review_disposition = 'PENDING_REVIEW'
      AND severity = 'UNASSESSED'
    )
  ),
  CONSTRAINT guard_alert_acknowledged CHECK (
    state <> 'ACKNOWLEDGED'
    OR (
      acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL
      AND resolved_at IS NULL AND resolved_by IS NULL
      AND dismissed_at IS NULL AND dismissed_by IS NULL
      AND review_disposition IN ('CONFIRMED_CUSTOMER_ISSUE','INTERNAL_ONLY')
      AND severity <> 'UNASSESSED'
    )
  ),
  CONSTRAINT guard_alert_resolved CHECK (
    state <> 'RESOLVED'
    OR (
      resolved_at IS NOT NULL AND resolved_by IS NOT NULL
      AND dismissed_at IS NULL AND dismissed_by IS NULL
      AND review_disposition IN ('CONFIRMED_CUSTOMER_ISSUE','INTERNAL_ONLY')
      AND severity <> 'UNASSESSED'
      AND needs_review IS FALSE
    )
  ),
  CONSTRAINT guard_alert_dismissed CHECK (
    state <> 'DISMISSED'
    OR (
      dismissed_at IS NOT NULL AND dismissed_by IS NOT NULL
      AND resolved_at IS NULL AND resolved_by IS NULL
      AND review_disposition = 'FALSE_POSITIVE'
    )
  ),
  CONSTRAINT guard_alert_issue_codes CHECK (
    issue_codes <@ ARRAY[
      'PROFILE_UNAVAILABLE','BUSINESS_NAME_CHANGED','REVIEW_COUNT_INCREASED','REVIEW_COUNT_DECREASED',
      'RATING_CHANGED','LATEST_REVIEW_CHANGED','BASELINE_MISSING','OBSERVATION_INCOMPLETE'
    ]::text[]
  )
);
CREATE UNIQUE INDEX guard_alerts_one_open_coverage_idx
  ON public.guard_alerts (coverage_id)
  WHERE state IN ('NEW','ACKNOWLEDGED');
CREATE INDEX guard_alerts_queue_idx ON public.guard_alerts (state, severity, latest_observed_at DESC, id DESC);
CREATE INDEX guard_alerts_needs_review_idx ON public.guard_alerts (needs_review, latest_observed_at DESC, id DESC)
  WHERE needs_review IS TRUE AND state IN ('NEW','ACKNOWLEDGED');

CREATE TABLE public.guard_alert_observations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.guard_alerts(id) ON DELETE RESTRICT,
  observation_id uuid NOT NULL REFERENCES public.guard_check_observations(id) ON DELETE RESTRICT,
  attached_at timestamptz NOT NULL DEFAULT now(),
  issue_codes text[] NOT NULL DEFAULT '{}',
  classification text NOT NULL CHECK (classification IN ('CHANGE_DETECTED','PROFILE_UNAVAILABLE','INCOMPLETE')),
  UNIQUE (observation_id)
);
CREATE INDEX guard_alert_observations_alert_idx ON public.guard_alert_observations (alert_id, attached_at, id);

CREATE TABLE public.guard_alert_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.guard_alerts(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('ADMIN','SYSTEM')),
  actor_id uuid,
  event text NOT NULL CHECK (event IN (
    'ALERT_OPENED','OBSERVATION_ATTACHED','ACKNOWLEDGED','EVIDENCE_REVIEWED','SEVERITY_CHANGED','ESCALATED',
    'NOTIFICATION_PREPARED','NOTIFICATION_APPROVED','NOTIFICATION_QUEUED','NOTIFICATION_DELIVERY_FAILED',
    'CASE_LINKED','SERVICE_ACTION_OPENED','COVERAGE_PAUSED','COVERAGE_RESUMED','RESOLVED','DISMISSED'
  )),
  previous_state text,
  new_state text,
  previous_severity text,
  new_severity text,
  reason text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guard_alert_event_reason CHECK (length(reason) <= 500),
  CONSTRAINT guard_alert_event_details CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX guard_alert_events_alert_idx ON public.guard_alert_events (alert_id, created_at, id);

CREATE TABLE public.guard_alert_cases (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.guard_alerts(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'PRIMARY' CHECK (role IN ('PRIMARY')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (alert_id, case_id)
);
CREATE UNIQUE INDEX guard_alert_cases_one_primary_idx
  ON public.guard_alert_cases (alert_id)
  WHERE role = 'PRIMARY';

CREATE TABLE public.guard_alert_notifications (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.guard_alerts(id) ON DELETE RESTRICT,
  communication_id uuid NOT NULL REFERENCES public.communications(id) ON DELETE RESTRICT,
  notification_kind text NOT NULL CHECK (notification_kind IN ('INITIAL','FOLLOW_UP','RESOLUTION')),
  sequence_number integer NOT NULL CHECK (sequence_number >= 1),
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (communication_id),
  UNIQUE (alert_id, sequence_number)
);
CREATE UNIQUE INDEX guard_alert_notifications_one_initial_idx
  ON public.guard_alert_notifications (alert_id)
  WHERE notification_kind = 'INITIAL';

CREATE TABLE public.guard_service_actions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  alert_id uuid REFERENCES public.guard_alerts(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('CONTACT_RECOVERY','ACCESS_RECOVERY')),
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED')),
  reason_code text NOT NULL CHECK (reason_code IN (
    'EMAIL_FAILED_PHONE_AVAILABLE','NO_REACHABLE_VERIFIED_CONTACT','ACCESS_NOT_VERIFIED'
  )),
  details text NOT NULL DEFAULT '',
  opened_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guard_service_action_details CHECK (length(details) <= 1000),
  CONSTRAINT guard_service_action_kind_reason CHECK (
    (kind = 'CONTACT_RECOVERY' AND reason_code IN ('EMAIL_FAILED_PHONE_AVAILABLE','NO_REACHABLE_VERIFIED_CONTACT'))
    OR (kind = 'ACCESS_RECOVERY' AND reason_code = 'ACCESS_NOT_VERIFIED')
  ),
  CONSTRAINT guard_service_action_open CHECK (
    state <> 'OPEN' OR (acknowledged_at IS NULL AND resolved_at IS NULL AND cancelled_at IS NULL)
  ),
  CONSTRAINT guard_service_action_ack CHECK (
    state <> 'ACKNOWLEDGED' OR (acknowledged_at IS NOT NULL AND resolved_at IS NULL AND cancelled_at IS NULL)
  ),
  CONSTRAINT guard_service_action_resolved CHECK (
    state <> 'RESOLVED' OR (resolved_at IS NOT NULL AND cancelled_at IS NULL)
  ),
  CONSTRAINT guard_service_action_cancelled CHECK (
    state <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND resolved_at IS NULL)
  )
);
CREATE UNIQUE INDEX guard_service_actions_one_open_kind_idx
  ON public.guard_service_actions (coverage_id, kind)
  WHERE state IN ('OPEN','ACKNOWLEDGED');
CREATE INDEX guard_service_actions_queue_idx
  ON public.guard_service_actions (kind, state, opened_at DESC, id DESC);

CREATE TABLE admin_private.guard_alert_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.communications ADD COLUMN guard_alert_id uuid REFERENCES public.guard_alerts(id) ON DELETE RESTRICT;
ALTER TABLE public.communications DROP CONSTRAINT communications_exactly_one_parent;
ALTER TABLE public.communications ADD CONSTRAINT communications_exactly_one_parent
  CHECK (num_nonnulls(case_id, monitoring_request_id, guard_alert_id) = 1);

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN ('EVIDENCE_REQUEST','CASE_UPDATE','CONVERSATION_REPLY','GUARD_ALERT') AND template_version >= 1)
);
ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN ('EVIDENCE_REQUEST','CASE_UPDATE','CONVERSATION_REPLY','GUARD_ALERT'));
INSERT INTO admin_private.communication_templates(template_key, version, name, subject_template, body_text_template)
VALUES (
  'GUARD_ALERT', 1, 'Guard alert update',
  'Relaunch Guard update for {location_name}',
  '{fact}' || E'\n\n' || '{effect}' || E'\n\n' || '{next_step}'
);

CREATE OR REPLACE FUNCTION admin_private.protect_communication_snapshot_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.lifecycle IS NULL THEN RETURN NEW; END IF;
  IF OLD.content_locked IS TRUE AND NEW.content_locked IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Reviewed communication snapshot is immutable';
  END IF;
  IF OLD.rfc_message_id IS NOT NULL AND NEW.rfc_message_id IS DISTINCT FROM OLD.rfc_message_id THEN
    RAISE EXCEPTION 'Provider RFC Message-ID is immutable once set';
  END IF;
  IF OLD.content_locked IS TRUE THEN
    IF NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.monitoring_request_id IS DISTINCT FROM OLD.monitoring_request_id
      OR NEW.guard_alert_id IS DISTINCT FROM OLD.guard_alert_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
      OR NEW.customer_action_id IS DISTINCT FROM OLD.customer_action_id
      OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
      OR NEW.communication_type IS DISTINCT FROM OLD.communication_type
      OR NEW.direction IS DISTINCT FROM OLD.direction
      OR NEW.recipient IS DISTINCT FROM OLD.recipient
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.body_text IS DISTINCT FROM OLD.body_text
      OR NEW.body_html IS DISTINCT FROM OLD.body_html
      OR NEW.template_key IS DISTINCT FROM OLD.template_key
      OR NEW.template_version IS DISTINCT FROM OLD.template_version
      OR NEW.content_version IS DISTINCT FROM OLD.content_version
      OR NEW.sender_address IS DISTINCT FROM OLD.sender_address
      OR NEW.reply_to_address IS DISTINCT FROM OLD.reply_to_address
      OR NEW.in_reply_to IS DISTINCT FROM OLD.in_reply_to
      OR NEW.references_header IS DISTINCT FROM OLD.references_header
      OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
      OR NEW.author_id IS DISTINCT FROM OLD.author_id
    THEN RAISE EXCEPTION 'Reviewed communication snapshot is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.guard_alert_customer_issue_codes_v1() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT ARRAY[
    'PROFILE_UNAVAILABLE','BUSINESS_NAME_CHANGED','REVIEW_COUNT_DECREASED','RATING_CHANGED','LATEST_REVIEW_CHANGED'
  ]::text[];
$$;

CREATE FUNCTION admin_private.guard_alert_severity_rank_v1(p_severity text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_severity
    WHEN 'UNASSESSED' THEN 0
    WHEN 'LOW' THEN 1
    WHEN 'MEDIUM' THEN 2
    WHEN 'HIGH' THEN 3
    WHEN 'CRITICAL' THEN 4
    ELSE -1
  END;
$$;

CREATE FUNCTION admin_private.guard_alert_observation_is_customer_issue_v1(p_classification text, p_codes text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT
    p_classification = 'PROFILE_UNAVAILABLE'
    OR (
      p_classification = 'CHANGE_DETECTED'
      AND coalesce(p_codes, '{}'::text[]) && admin_private.guard_alert_customer_issue_codes_v1()
    );
$$;

CREATE FUNCTION admin_private.guard_alert_has_customer_issue_v1(p_alert uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.guard_alert_observations link
    JOIN public.guard_check_observations obs ON obs.id = link.observation_id
    WHERE link.alert_id = p_alert
      AND admin_private.guard_alert_observation_is_customer_issue_v1(obs.classification, obs.change_codes)
  );
$$;

CREATE FUNCTION admin_private.guard_alert_first_customer_issue_at_v1(p_alert uuid) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT min(obs.observed_at)
  FROM public.guard_alert_observations link
  JOIN public.guard_check_observations obs ON obs.id = link.observation_id
  WHERE link.alert_id = p_alert
    AND admin_private.guard_alert_observation_is_customer_issue_v1(obs.classification, obs.change_codes);
$$;

CREATE FUNCTION admin_private.guard_alert_notification_allowed_v1(
  p_kind text, p_state text, p_disposition text, p_needs_review boolean
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT
    p_disposition = 'CONFIRMED_CUSTOMER_ISSUE'
    AND (
      (p_kind IN ('INITIAL','FOLLOW_UP') AND p_state = 'ACKNOWLEDGED' AND p_needs_review IS NOT TRUE)
      OR (p_kind = 'RESOLUTION' AND p_state = 'RESOLVED')
    );
$$;

CREATE FUNCTION admin_private.guard_alert_current_email_v1(p_customer uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT admin_private.normalize_email_v1(c.email)
  FROM public.customers c
  WHERE c.id = p_customer
    AND admin_private.contact_verified_v1(c.id, 'email');
$$;

CREATE FUNCTION admin_private.guard_alert_scope_matches_v1(
  p_coverage uuid, p_customer uuid, p_business uuid, p_location uuid
) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guard_coverages g
    WHERE g.id = p_coverage
      AND g.customer_id = p_customer
      AND g.business_id = p_business
      AND g.location_id = p_location
  );
$$;

CREATE FUNCTION admin_private.guard_alert_validate_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cov public.guard_coverages; first_obs public.guard_check_observations; latest_obs public.guard_check_observations;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NEW.coverage_id;
  IF cov.id IS NULL
    OR cov.customer_id IS DISTINCT FROM NEW.customer_id
    OR cov.business_id IS DISTINCT FROM NEW.business_id
    OR cov.location_id IS DISTINCT FROM NEW.location_id
  THEN RAISE EXCEPTION 'Guard alert scope must match coverage'; END IF;
  SELECT * INTO first_obs FROM public.guard_check_observations WHERE id = NEW.first_observation_id;
  IF first_obs.id IS NULL OR first_obs.coverage_id IS DISTINCT FROM NEW.coverage_id OR first_obs.location_id IS DISTINCT FROM NEW.location_id THEN
    RAISE EXCEPTION 'Guard alert observation is outside coverage scope';
  END IF;
  SELECT * INTO latest_obs FROM public.guard_check_observations WHERE id = NEW.latest_observation_id;
  IF latest_obs.id IS NULL OR latest_obs.coverage_id IS DISTINCT FROM NEW.coverage_id OR latest_obs.location_id IS DISTINCT FROM NEW.location_id THEN
    RAISE EXCEPTION 'Guard alert observation is outside coverage scope';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.first_observation_id IS DISTINCT FROM NEW.latest_observation_id
      OR NEW.first_observed_at IS DISTINCT FROM first_obs.observed_at
      OR NEW.latest_observed_at IS DISTINCT FROM first_obs.observed_at
      OR NEW.issue_codes IS DISTINCT FROM first_obs.change_codes
    THEN RAISE EXCEPTION 'Guard alert opening observation snapshot is invalid'; END IF;
  ELSIF NEW.latest_observation_id IS DISTINCT FROM OLD.latest_observation_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.guard_alert_observations link
      WHERE link.alert_id = NEW.id AND link.observation_id = NEW.latest_observation_id
    ) THEN RAISE EXCEPTION 'Guard alert latest observation must already be linked'; END IF;
    IF NEW.latest_observed_at IS DISTINCT FROM latest_obs.observed_at THEN
      RAISE EXCEPTION 'Guard alert latest observed time must match the linked observation';
    END IF;
  ELSIF NEW.latest_observed_at IS DISTINCT FROM OLD.latest_observed_at
    OR NEW.latest_observed_at IS DISTINCT FROM latest_obs.observed_at
  THEN RAISE EXCEPTION 'Guard alert latest observed time must match the linked observation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_alerts_scope
  BEFORE INSERT OR UPDATE ON public.guard_alerts
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_alert_validate_scope_v1();

CREATE FUNCTION admin_private.guard_alerts_protect_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Guard alerts cannot be deleted'; END IF;
  IF NEW.coverage_id IS DISTINCT FROM OLD.coverage_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.first_observation_id IS DISTINCT FROM OLD.first_observation_id
    OR NEW.first_observed_at IS DISTINCT FROM OLD.first_observed_at
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
  THEN RAISE EXCEPTION 'Guard alert identity is immutable'; END IF;
  IF OLD.state IN ('RESOLVED','DISMISSED') THEN
    IF NEW.state IS DISTINCT FROM OLD.state
      OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
      OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
      OR NEW.dismissed_at IS DISTINCT FROM OLD.dismissed_at
      OR NEW.dismissed_by IS DISTINCT FROM OLD.dismissed_by
    THEN RAISE EXCEPTION 'Terminal Guard alerts cannot be reopened'; END IF;
  END IF;
  IF NEW.state = 'ACKNOWLEDGED' AND NEW.severity = 'UNASSESSED' THEN
    RAISE EXCEPTION 'Acknowledged Guard alerts cannot remain unassessed';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_alerts_protect
  BEFORE UPDATE OR DELETE ON public.guard_alerts
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_alerts_protect_v1();

CREATE FUNCTION admin_private.guard_alert_observation_validate_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE alert public.guard_alerts; obs public.guard_check_observations; obl public.guard_check_obligations;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Guard alert observation links are immutable';
  END IF;
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NEW.alert_id;
  SELECT * INTO obs FROM public.guard_check_observations WHERE id = NEW.observation_id;
  IF alert.id IS NULL OR obs.id IS NULL THEN RAISE EXCEPTION 'Guard alert observation link is incomplete'; END IF;
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = obs.obligation_id;
  IF obs.coverage_id IS DISTINCT FROM alert.coverage_id
    OR obs.location_id IS DISTINCT FROM alert.location_id
    OR obl.customer_id IS DISTINCT FROM alert.customer_id
    OR obl.business_id IS DISTINCT FROM alert.business_id
    OR obl.location_id IS DISTINCT FROM alert.location_id
    OR NOT admin_private.guard_alert_scope_matches_v1(alert.coverage_id, alert.customer_id, alert.business_id, alert.location_id)
  THEN RAISE EXCEPTION 'Guard alert observation is outside coverage scope'; END IF;
  IF NEW.classification IS DISTINCT FROM obs.classification THEN
    RAISE EXCEPTION 'Guard alert observation classification snapshot mismatch';
  END IF;
  IF NEW.issue_codes IS DISTINCT FROM obs.change_codes THEN
    RAISE EXCEPTION 'Guard alert observation issue-code snapshot mismatch';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_alert_observations_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.guard_alert_observations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_alert_observation_validate_v1();

CREATE FUNCTION admin_private.guard_alert_events_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Guard alert events are immutable';
END; $$;
CREATE TRIGGER guard_alert_events_immutable
  BEFORE UPDATE OR DELETE ON public.guard_alert_events
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_alert_events_immutable_v1();

CREATE FUNCTION admin_private.guard_alert_notifications_protect_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE alert public.guard_alerts; comm public.communications;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Guard alert notifications are immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.alert_id IS DISTINCT FROM OLD.alert_id
      OR NEW.communication_id IS DISTINCT FROM OLD.communication_id
      OR NEW.notification_kind IS DISTINCT FROM OLD.notification_kind
      OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR OLD.approved_at IS NOT NULL
      OR OLD.approved_by IS NOT NULL
      OR NEW.approved_at IS NULL
      OR NEW.approved_by IS NULL
    THEN RAISE EXCEPTION 'Guard alert notifications are immutable'; END IF;
    SELECT * INTO alert FROM public.guard_alerts WHERE id = NEW.alert_id;
    IF NOT admin_private.guard_alert_notification_allowed_v1(
      NEW.notification_kind, alert.state, alert.review_disposition, alert.needs_review
    ) THEN RAISE EXCEPTION 'Guard alert notification kind is not valid for this alert state'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NEW.alert_id;
  SELECT * INTO comm FROM public.communications WHERE id = NEW.communication_id;
  IF alert.id IS NULL OR comm.id IS NULL THEN RAISE EXCEPTION 'Guard alert notification is incomplete'; END IF;
  IF comm.guard_alert_id IS DISTINCT FROM alert.id
    OR comm.customer_id IS DISTINCT FROM alert.customer_id
    OR comm.business_id IS DISTINCT FROM alert.business_id
    OR comm.template_key IS DISTINCT FROM 'GUARD_ALERT'
    OR comm.direction IS DISTINCT FROM 'OUTBOUND'
    OR comm.recipient IS DISTINCT FROM admin_private.guard_alert_current_email_v1(alert.customer_id)
  THEN RAISE EXCEPTION 'Guard alert notification communication parent mismatch'; END IF;
  IF NOT admin_private.guard_alert_notification_allowed_v1(
    NEW.notification_kind, alert.state, alert.review_disposition, alert.needs_review
  ) THEN RAISE EXCEPTION 'Guard alert notification kind is not valid for this alert state'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_alert_notifications_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.guard_alert_notifications
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_alert_notifications_protect_v1();

CREATE FUNCTION admin_private.guard_alert_cases_validate_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE alert public.guard_alerts; cs public.cases;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Guard alert case links are immutable';
  END IF;
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NEW.alert_id;
  SELECT * INTO cs FROM public.cases WHERE id = NEW.case_id;
  IF alert.id IS NULL OR cs.id IS NULL THEN RAISE EXCEPTION 'Guard alert case link is incomplete'; END IF;
  IF alert.review_disposition IS DISTINCT FROM 'CONFIRMED_CUSTOMER_ISSUE' OR alert.state IS DISTINCT FROM 'ACKNOWLEDGED' THEN
    RAISE EXCEPTION 'Intervention cases require a confirmed acknowledged Guard alert';
  END IF;
  IF cs.customer_id IS DISTINCT FROM alert.customer_id
    OR cs.business_id IS DISTINCT FROM alert.business_id
    OR cs.location_id IS DISTINCT FROM alert.location_id
  THEN RAISE EXCEPTION 'Intervention case scope must match the Guard alert'; END IF;
  IF cs.case_type NOT IN ('PROFILE_RECOVERY','REVIEW_PROTECTION') OR cs.status IN ('CLOSED','CANCELLED') THEN
    RAISE EXCEPTION 'Intervention case is not suitable to link';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_alert_cases_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.guard_alert_cases
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_alert_cases_validate_v1();

CREATE FUNCTION admin_private.guard_service_action_validate_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cov public.guard_coverages; alert public.guard_alerts;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NEW.coverage_id;
  IF cov.id IS NULL
    OR cov.customer_id IS DISTINCT FROM NEW.customer_id
    OR cov.business_id IS DISTINCT FROM NEW.business_id
    OR cov.location_id IS DISTINCT FROM NEW.location_id
  THEN RAISE EXCEPTION 'Guard service action scope must match coverage'; END IF;
  IF NEW.alert_id IS NOT NULL THEN
    SELECT * INTO alert FROM public.guard_alerts WHERE id = NEW.alert_id;
    IF alert.id IS NULL
      OR alert.coverage_id IS DISTINCT FROM NEW.coverage_id
      OR alert.customer_id IS DISTINCT FROM NEW.customer_id
      OR alert.business_id IS DISTINCT FROM NEW.business_id
      OR alert.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Guard service action alert is outside coverage scope'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.coverage_id IS DISTINCT FROM OLD.coverage_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.kind IS DISTINCT FROM OLD.kind
    THEN RAISE EXCEPTION 'Guard service action identity is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_service_actions_scope
  BEFORE INSERT OR UPDATE ON public.guard_service_actions
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_service_action_validate_v1();

CREATE FUNCTION admin_private.guard_alert_append_event_v1(
  p_alert uuid, p_actor_type text, p_actor uuid, p_event text,
  p_previous_state text, p_new_state text, p_previous_severity text, p_new_severity text,
  p_reason text, p_details jsonb
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO public.guard_alert_events(
    alert_id, actor_type, actor_id, event, previous_state, new_state, previous_severity, new_severity, reason, details
  ) VALUES (
    p_alert, p_actor_type, p_actor, p_event, p_previous_state, p_new_state, p_previous_severity, p_new_severity,
    left(coalesce(p_reason, ''), 500), coalesce(p_details, '{}'::jsonb)
  );
END; $$;

CREATE FUNCTION admin_private.guard_alert_receipt_v1(p_actor uuid, p_request uuid, p_fp text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row admin_private.guard_alert_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO row FROM admin_private.guard_alert_receipts WHERE request_id = p_request;
  IF row.request_id IS NULL THEN RETURN NULL; END IF;
  IF row.actor_id IS DISTINCT FROM p_actor OR row.fingerprint IS DISTINCT FROM p_fp THEN
    RETURN jsonb_build_object('status','conflict','reason','idempotency_conflict');
  END IF;
  RETURN row.result;
END; $$;

CREATE FUNCTION admin_private.guard_alert_store_receipt_v1(p_request uuid, p_actor uuid, p_fp text, p_result jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO admin_private.guard_alert_receipts(request_id, actor_id, fingerprint, result)
  VALUES (p_request, p_actor, p_fp, p_result)
  ON CONFLICT (request_id) DO NOTHING;
END; $$;

CREATE FUNCTION admin_private.guard_alert_union_codes_v1(p_existing text[], p_next text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(array(
    SELECT DISTINCT code
    FROM unnest(coalesce(p_existing, '{}'::text[]) || coalesce(p_next, '{}'::text[])) AS code
    WHERE code IS NOT NULL
    ORDER BY 1
  ), '{}'::text[]);
$$;

CREATE FUNCTION admin_private.guard_alert_resume_ready_v1(p_coverage uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE cov public.guard_coverages;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = p_coverage;
  IF cov.id IS NULL OR cov.state <> 'PAUSED' THEN RETURN false; END IF;
  IF NOT admin_private.guard_resume_ready_v1(p_coverage) THEN RETURN false; END IF;
  IF cov.coverage_basis = 'INCLUDED' AND (cov.included_end_at IS NULL OR cov.included_end_at <= now()) THEN
    RETURN false;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.guard_alert_discount_assessment_v1(p_alert uuid, p_service text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  issue_at timestamptz;
  eligible boolean;
  reason text;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = p_alert;
  IF alert.id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'alert_missing', 'policy', 'PAID_GUARD_MANAGED_20');
  END IF;
  IF alert.review_disposition IS DISTINCT FROM 'CONFIRMED_CUSTOMER_ISSUE'
    OR NOT admin_private.guard_alert_has_customer_issue_v1(alert.id)
  THEN
    RETURN jsonb_build_object(
      'eligible', false, 'reason', 'no_confirmed_customer_issue', 'policy', 'PAID_GUARD_MANAGED_20',
      'issueObservedAt', NULL, 'service', p_service
    );
  END IF;
  issue_at := admin_private.guard_alert_first_customer_issue_at_v1(alert.id);
  IF issue_at IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false, 'reason', 'no_confirmed_customer_issue', 'policy', 'PAID_GUARD_MANAGED_20',
      'issueObservedAt', NULL, 'service', p_service
    );
  END IF;
  IF p_service IS NULL OR p_service NOT IN ('MANAGED_RELAUNCH','MANAGED_REVIEW') THEN
    RETURN jsonb_build_object(
      'eligible', false, 'reason', 'guided_or_undecided_not_eligible', 'policy', 'PAID_GUARD_MANAGED_20',
      'issueObservedAt', issue_at, 'service', p_service
    );
  END IF;
  SELECT coverage_basis INTO reason FROM public.guard_coverages WHERE id = alert.coverage_id;
  IF reason = 'INCLUDED' THEN
    RETURN jsonb_build_object(
      'eligible', false, 'reason', 'included_guard_not_eligible', 'policy', 'PAID_GUARD_MANAGED_20',
      'issueObservedAt', issue_at, 'service', p_service
    );
  END IF;
  eligible := admin_private.paid_guard_discount_ready_v1(alert.coverage_id, alert.location_id, p_service, issue_at);
  IF eligible THEN
    RETURN jsonb_build_object(
      'eligible', true, 'reason', 'qualified_paid_managed', 'policy', 'PAID_GUARD_MANAGED_20',
      'issueObservedAt', issue_at, 'service', p_service
    );
  END IF;
  RETURN jsonb_build_object(
    'eligible', false, 'reason', 'not_eligible_for_paid_guard_discount', 'policy', 'PAID_GUARD_MANAGED_20',
    'issueObservedAt', issue_at, 'service', p_service
  );
END; $$;

CREATE FUNCTION admin_private.guard_alert_open_service_action_v1(
  p_coverage uuid, p_alert uuid, p_kind text, p_reason text, p_details text, p_actor_type text, p_actor uuid
) RETURNS public.guard_service_actions LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages;
  existing public.guard_service_actions;
  created public.guard_service_actions;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = p_coverage FOR UPDATE;
  IF cov.id IS NULL THEN RAISE EXCEPTION 'Guard coverage missing'; END IF;
  SELECT * INTO existing
    FROM public.guard_service_actions
    WHERE coverage_id = cov.id AND kind = p_kind AND state IN ('OPEN','ACKNOWLEDGED')
    FOR UPDATE;
  IF existing.id IS NOT NULL THEN
    IF existing.alert_id IS NULL AND p_alert IS NOT NULL THEN
      UPDATE public.guard_service_actions
        SET alert_id = p_alert, updated_at = now(), record_version = record_version + 1
        WHERE id = existing.id
        RETURNING * INTO existing;
    END IF;
    RETURN existing;
  END IF;
  INSERT INTO public.guard_service_actions(
    coverage_id, alert_id, customer_id, business_id, location_id, kind, reason_code, details
  ) VALUES (
    cov.id, p_alert, cov.customer_id, cov.business_id, cov.location_id, p_kind, p_reason, left(coalesce(p_details, ''), 1000)
  ) RETURNING * INTO created;
  IF p_alert IS NOT NULL THEN
    PERFORM admin_private.guard_alert_append_event_v1(
      p_alert, p_actor_type, p_actor, 'SERVICE_ACTION_OPENED', NULL, NULL, NULL, NULL, p_reason,
      jsonb_build_object('serviceActionId', created.id, 'kind', p_kind, 'reasonCode', p_reason)
    );
  END IF;
  RETURN created;
END; $$;

CREATE FUNCTION admin_private.guard_alert_handle_delivery_failure_v1(p_communication uuid)
RETURNS public.guard_service_actions LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  comm public.communications;
  alert public.guard_alerts;
  action public.guard_service_actions;
  reason text;
BEGIN
  SELECT * INTO comm FROM public.communications WHERE id = p_communication;
  IF comm.id IS NULL OR comm.guard_alert_id IS NULL THEN RETURN NULL; END IF;
  IF comm.delivery_status NOT IN ('BOUNCED','COMPLAINED','SUPPRESSED','FAILED') THEN RETURN NULL; END IF;
  SELECT * INTO alert FROM public.guard_alerts WHERE id = comm.guard_alert_id FOR UPDATE;
  IF alert.id IS NULL THEN RETURN NULL; END IF;
  IF admin_private.contact_verified_v1(alert.customer_id, 'phone') THEN
    reason := 'EMAIL_FAILED_PHONE_AVAILABLE';
  ELSE
    reason := 'NO_REACHABLE_VERIFIED_CONTACT';
  END IF;
  action := admin_private.guard_alert_open_service_action_v1(
    alert.coverage_id, alert.id, 'CONTACT_RECOVERY', reason,
    'Guard alert email delivery failed. Do not automatically resend.',
    'SYSTEM', NULL
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.guard_alert_events e
    WHERE e.alert_id = alert.id
      AND e.event = 'NOTIFICATION_DELIVERY_FAILED'
      AND e.details->>'communicationId' = comm.id::text
      AND e.details->>'deliveryStatus' = comm.delivery_status
  ) THEN
    PERFORM admin_private.guard_alert_append_event_v1(
      alert.id, 'SYSTEM', NULL, 'NOTIFICATION_DELIVERY_FAILED', alert.state, alert.state, alert.severity, alert.severity,
      comm.delivery_status, jsonb_build_object('communicationId', comm.id, 'deliveryStatus', comm.delivery_status, 'reasonCode', reason)
    );
  END IF;
  RETURN action;
END; $$;

CREATE FUNCTION admin_private.guard_alert_delivery_trigger_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.guard_alert_id IS NOT NULL
    AND NEW.delivery_status IN ('BOUNCED','COMPLAINED','SUPPRESSED','FAILED')
    AND (OLD.delivery_status IS DISTINCT FROM NEW.delivery_status)
  THEN
    PERFORM admin_private.guard_alert_handle_delivery_failure_v1(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER communications_guard_alert_delivery
  AFTER UPDATE OF delivery_status ON public.communications
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_alert_delivery_trigger_v1();

CREATE FUNCTION admin_private.guard_process_alert_candidate_v1(p_observation uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  obs public.guard_check_observations;
  obl public.guard_check_obligations;
  existing_link public.guard_alert_observations;
  alert public.guard_alerts;
  created public.guard_alerts;
BEGIN
  SELECT * INTO obs FROM public.guard_check_observations WHERE id = p_observation;
  IF obs.id IS NULL THEN RETURN jsonb_build_object('status','invalid','reason','observation_missing'); END IF;
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = obs.obligation_id;
  IF obl.id IS NULL OR obl.state <> 'COMPLETED' THEN
    RETURN jsonb_build_object('status','denied','reason','obligation_not_completed');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('guard-alert:' || obs.coverage_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('guard-obs:' || obs.id::text, 0));
  SELECT * INTO existing_link FROM public.guard_alert_observations WHERE observation_id = obs.id;
  IF existing_link.id IS NOT NULL THEN
    SELECT * INTO alert FROM public.guard_alerts WHERE id = existing_link.alert_id;
    RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'replay', true, 'attached', true);
  END IF;
  IF obs.attention_candidate IS NOT TRUE OR obs.classification = 'HEALTHY' THEN
    RETURN jsonb_build_object('status','ignored','reason','healthy_or_not_candidate');
  END IF;
  IF obs.coverage_id IS DISTINCT FROM obl.coverage_id
    OR obs.location_id IS DISTINCT FROM obl.location_id
    OR NOT admin_private.guard_alert_scope_matches_v1(obs.coverage_id, obl.customer_id, obl.business_id, obl.location_id)
  THEN
    RETURN jsonb_build_object('status','denied','reason','scope_mismatch');
  END IF;
  SELECT * INTO alert
    FROM public.guard_alerts
    WHERE coverage_id = obs.coverage_id AND state IN ('NEW','ACKNOWLEDGED')
    FOR UPDATE;
  IF alert.id IS NOT NULL THEN
    INSERT INTO public.guard_alert_observations(alert_id, observation_id, issue_codes, classification)
    VALUES (alert.id, obs.id, obs.change_codes, obs.classification)
    ON CONFLICT (observation_id) DO NOTHING;
    UPDATE public.guard_alerts SET
      latest_observation_id = CASE WHEN obs.observed_at >= latest_observed_at THEN obs.id ELSE latest_observation_id END,
      latest_observed_at = CASE WHEN obs.observed_at >= latest_observed_at THEN obs.observed_at ELSE latest_observed_at END,
      issue_codes = admin_private.guard_alert_union_codes_v1(issue_codes, obs.change_codes),
      needs_review = true,
      updated_at = now(),
      record_version = record_version + 1
      WHERE id = alert.id
      RETURNING * INTO alert;
    PERFORM admin_private.guard_alert_append_event_v1(
      alert.id, 'SYSTEM', NULL, 'OBSERVATION_ATTACHED', alert.state, alert.state, alert.severity, alert.severity,
      'Additional attention candidate attached',
      jsonb_build_object('observationId', obs.id, 'classification', obs.classification, 'issueCodes', to_jsonb(obs.change_codes))
    );
    RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'attached', true);
  END IF;
  BEGIN
    INSERT INTO public.guard_alerts(
      coverage_id, customer_id, business_id, location_id, first_observation_id, latest_observation_id,
      first_observed_at, latest_observed_at, issue_codes
    ) VALUES (
      obs.coverage_id, obl.customer_id, obl.business_id, obl.location_id, obs.id, obs.id,
      obs.observed_at, obs.observed_at, obs.change_codes
    ) RETURNING * INTO created;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO created
      FROM public.guard_alerts
      WHERE coverage_id = obs.coverage_id AND state IN ('NEW','ACKNOWLEDGED')
      FOR UPDATE;
    IF created.id IS NULL THEN RAISE; END IF;
    INSERT INTO public.guard_alert_observations(alert_id, observation_id, issue_codes, classification)
    VALUES (created.id, obs.id, obs.change_codes, obs.classification)
    ON CONFLICT (observation_id) DO NOTHING;
    UPDATE public.guard_alerts SET
      latest_observation_id = CASE WHEN obs.observed_at >= latest_observed_at THEN obs.id ELSE latest_observation_id END,
      latest_observed_at = CASE WHEN obs.observed_at >= latest_observed_at THEN obs.observed_at ELSE latest_observed_at END,
      issue_codes = admin_private.guard_alert_union_codes_v1(issue_codes, obs.change_codes),
      needs_review = true,
      updated_at = now(),
      record_version = record_version + 1
      WHERE id = created.id
      RETURNING * INTO created;
    RETURN jsonb_build_object('status','success','id', created.id, 'version', created.record_version, 'attached', true);
  END;
  INSERT INTO public.guard_alert_observations(alert_id, observation_id, issue_codes, classification)
  VALUES (created.id, obs.id, obs.change_codes, obs.classification)
  ON CONFLICT (observation_id) DO NOTHING;
  PERFORM admin_private.guard_alert_append_event_v1(
    created.id, 'SYSTEM', NULL, 'ALERT_OPENED', NULL, 'NEW', NULL, 'UNASSESSED',
    'Attention candidate opened an internal review episode',
    jsonb_build_object('observationId', obs.id, 'classification', obs.classification, 'issueCodes', to_jsonb(obs.change_codes))
  );
  PERFORM admin_private.write_record_audit_v1(
    NULL, 'GUARD_CHANGED', 'success', created.id, created.id, 'guard_alert',
    'Opened Guard alert review', jsonb_build_object('coverageId', created.coverage_id, 'observationId', obs.id)
  );
  RETURN jsonb_build_object('status','success','id', created.id, 'version', created.record_version, 'attached', false);
END; $$;

CREATE FUNCTION public.guard_process_alert_candidate_v1(p_observation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN admin_private.guard_process_alert_candidate_v1(p_observation);
END; $$;

CREATE FUNCTION admin_private.guard_maintain_alerts_v1(p_now timestamptz DEFAULT NULL, p_batch integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  clock timestamptz := coalesce(p_now, now());
  batch integer := least(greatest(coalesce(p_batch, 50), 1), 100);
  obs public.guard_check_observations;
  cov public.guard_coverages;
  comm public.communications;
  processed integer := 0;
  recovered integer := 0;
  access_opened integer := 0;
  delivery integer := 0;
  scanned integer := 0;
  more_candidates boolean := false;
  more_delivery boolean := false;
  more_coverages boolean := false;
BEGIN
  FOR obs IN
    SELECT o.*
    FROM public.guard_check_observations o
    WHERE o.attention_candidate IS TRUE
      AND NOT EXISTS (SELECT 1 FROM public.guard_alert_observations l WHERE l.observation_id = o.id)
    ORDER BY o.observed_at, o.id
    LIMIT batch + 1
  LOOP
    IF processed >= batch THEN more_candidates := true; EXIT; END IF;
    PERFORM admin_private.guard_process_alert_candidate_v1(obs.id);
    processed := processed + 1;
  END LOOP;
  FOR comm IN
    SELECT c.*
    FROM public.communications c
    WHERE c.guard_alert_id IS NOT NULL
      AND c.delivery_status IN ('BOUNCED','COMPLAINED','SUPPRESSED','FAILED')
      AND NOT EXISTS (
        SELECT 1 FROM public.guard_alert_events e
        WHERE e.alert_id = c.guard_alert_id
          AND e.event = 'NOTIFICATION_DELIVERY_FAILED'
          AND e.details->>'communicationId' = c.id::text
          AND e.details->>'deliveryStatus' = c.delivery_status
      )
    ORDER BY c.id
    LIMIT batch + 1
  LOOP
    IF delivery >= batch THEN more_delivery := true; EXIT; END IF;
    PERFORM admin_private.guard_alert_handle_delivery_failure_v1(comm.id);
    delivery := delivery + 1;
  END LOOP;
  FOR cov IN
    SELECT g.*
    FROM public.guard_coverages g
    WHERE g.state IN ('ACTIVE','PAUSED')
      AND (
        (
          admin_private.guard_access_record_v1(g.business_id, g.location_id) IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.guard_service_actions sa
            WHERE sa.coverage_id = g.id AND sa.kind = 'ACCESS_RECOVERY' AND sa.state IN ('OPEN','ACKNOWLEDGED')
          )
        )
        OR (
          NOT admin_private.guard_contact_ready_v1(g.customer_id)
          AND NOT EXISTS (
            SELECT 1 FROM public.guard_service_actions sa
            WHERE sa.coverage_id = g.id AND sa.kind = 'CONTACT_RECOVERY' AND sa.state IN ('OPEN','ACKNOWLEDGED')
          )
        )
      )
    ORDER BY g.id
    LIMIT batch + 1
    FOR UPDATE
  LOOP
    IF scanned >= batch THEN more_coverages := true; EXIT; END IF;
    scanned := scanned + 1;
    IF admin_private.guard_access_record_v1(cov.business_id, cov.location_id) IS NULL THEN
      PERFORM admin_private.guard_alert_open_service_action_v1(
        cov.id, NULL, 'ACCESS_RECOVERY', 'ACCESS_NOT_VERIFIED',
        'Current Manager or Owner access is not verified.',
        'SYSTEM', NULL
      );
      access_opened := access_opened + 1;
    END IF;
    IF NOT admin_private.guard_contact_ready_v1(cov.customer_id) THEN
      PERFORM admin_private.guard_alert_open_service_action_v1(
        cov.id, NULL, 'CONTACT_RECOVERY', 'NO_REACHABLE_VERIFIED_CONTACT',
        'No currently verified email or phone is available.',
        'SYSTEM', NULL
      );
      recovered := recovered + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'status','success',
    'processedCandidates', processed,
    'deliveryFailures', delivery,
    'accessActions', access_opened,
    'contactActions', recovered,
    'hasMore', more_candidates OR more_delivery OR more_coverages,
    'batchSize', batch,
    'now', clock
  );
END; $$;

CREATE FUNCTION public.guard_maintain_alerts_v1(p_now timestamptz DEFAULT NULL, p_batch integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN admin_private.guard_maintain_alerts_v1(p_now, p_batch);
END; $$;

CREATE FUNCTION public.guard_enqueue_daily_alerts_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE service date; outbox uuid;
BEGIN
  service := (timezone('Europe/London', now()))::date;
  outbox := admin_private.enqueue_outbox_v1(
    'maintain-guard-alerts:' || service::text,
    'MAINTAIN_GUARD_ALERTS',
    'guard_alert',
    NULL,
    jsonb_build_object('serviceDate', service),
    now()
  );
  RETURN jsonb_build_object('status','success','serviceDate', service, 'outboxId', outbox, 'duplicate', false);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status','success','serviceDate', service, 'duplicate', true);
END; $$;

CREATE FUNCTION admin_private.guard_alert_acknowledge_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  v_severity text := btrim(coalesce(p_payload->>'severity',''));
  v_disposition text := btrim(coalesce(p_payload->>'disposition',''));
  v_reason text := btrim(coalesce(p_payload->>'reason',''));
  next_state text;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid','reason','alert_missing'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state <> 'NEW' THEN RETURN jsonb_build_object('status','denied','reason','not_new'); END IF;
  IF v_severity NOT IN ('LOW','MEDIUM','HIGH','CRITICAL') THEN RETURN jsonb_build_object('status','invalid','reason','severity_required'); END IF;
  IF v_disposition NOT IN ('CONFIRMED_CUSTOMER_ISSUE','INTERNAL_ONLY','FALSE_POSITIVE') THEN
    RETURN jsonb_build_object('status','invalid','reason','disposition_required');
  END IF;
  IF length(v_reason) < 10 OR length(v_reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  IF v_disposition = 'CONFIRMED_CUSTOMER_ISSUE' AND NOT admin_private.guard_alert_has_customer_issue_v1(alert.id) THEN
    RETURN jsonb_build_object('status','denied','reason','incomplete_only');
  END IF;
  next_state := CASE WHEN v_disposition = 'FALSE_POSITIVE' THEN 'DISMISSED' ELSE 'ACKNOWLEDGED' END;
  UPDATE public.guard_alerts SET
    state = next_state,
    severity = v_severity,
    review_disposition = v_disposition,
    needs_review = false,
    acknowledged_at = CASE WHEN next_state = 'ACKNOWLEDGED' THEN now() ELSE acknowledged_at END,
    acknowledged_by = CASE WHEN next_state = 'ACKNOWLEDGED' THEN p_actor ELSE acknowledged_by END,
    dismissed_at = CASE WHEN next_state = 'DISMISSED' THEN now() ELSE dismissed_at END,
    dismissed_by = CASE WHEN next_state = 'DISMISSED' THEN p_actor ELSE dismissed_by END,
    updated_at = now(),
    record_version = record_version + 1
    WHERE id = alert.id AND record_version = p_version
    RETURNING * INTO alert;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, CASE WHEN next_state = 'DISMISSED' THEN 'DISMISSED' ELSE 'ACKNOWLEDGED' END,
    'NEW', next_state, 'UNASSESSED', v_severity, v_reason,
    jsonb_build_object('disposition', v_disposition)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    CASE WHEN next_state = 'DISMISSED' THEN 'Dismissed Guard alert as false positive' ELSE 'Acknowledged Guard alert' END,
    jsonb_build_object('severity', v_severity, 'disposition', v_disposition)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'state', alert.state);
END; $$;

CREATE FUNCTION admin_private.guard_alert_review_new_evidence_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  v_disposition text := btrim(coalesce(p_payload->>'disposition',''));
  v_reason text := btrim(coalesce(p_payload->>'reason',''));
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid','reason','alert_missing'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state <> 'ACKNOWLEDGED' THEN RETURN jsonb_build_object('status','denied','reason','not_acknowledged'); END IF;
  IF alert.needs_review IS NOT TRUE THEN RETURN jsonb_build_object('status','denied','reason','no_new_evidence'); END IF;
  IF v_disposition NOT IN ('CONFIRMED_CUSTOMER_ISSUE','INTERNAL_ONLY') THEN
    RETURN jsonb_build_object('status','invalid','reason','disposition_required');
  END IF;
  IF length(v_reason) < 10 OR length(v_reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  IF v_disposition = 'CONFIRMED_CUSTOMER_ISSUE' AND NOT admin_private.guard_alert_has_customer_issue_v1(alert.id) THEN
    RETURN jsonb_build_object('status','denied','reason','incomplete_only');
  END IF;
  UPDATE public.guard_alerts SET
    review_disposition = v_disposition,
    needs_review = false,
    updated_at = now(),
    record_version = record_version + 1
    WHERE id = alert.id AND record_version = p_version
    RETURNING * INTO alert;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'EVIDENCE_REVIEWED', alert.state, alert.state, alert.severity, alert.severity, v_reason,
    jsonb_build_object('disposition', v_disposition)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Reviewed new Guard alert evidence', jsonb_build_object('disposition', v_disposition)
  );
  RETURN jsonb_build_object(
    'status','success','id', alert.id, 'version', alert.record_version, 'state', alert.state,
    'needsReview', false, 'acknowledgedAt', alert.acknowledged_at, 'acknowledgedBy', alert.acknowledged_by
  );
END; $$;

CREATE FUNCTION admin_private.guard_alert_escalate_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  v_severity text := btrim(coalesce(p_payload->>'severity',''));
  v_reason text := btrim(coalesce(p_payload->>'reason',''));
  v_previous text;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state IN ('RESOLVED','DISMISSED') THEN RETURN jsonb_build_object('status','denied','reason','terminal'); END IF;
  IF alert.state = 'NEW' THEN RETURN jsonb_build_object('status','denied','reason','not_acknowledged'); END IF;
  IF v_severity NOT IN ('LOW','MEDIUM','HIGH','CRITICAL') THEN RETURN jsonb_build_object('status','invalid','reason','severity_required'); END IF;
  IF admin_private.guard_alert_severity_rank_v1(v_severity) <= admin_private.guard_alert_severity_rank_v1(alert.severity) THEN
    RETURN jsonb_build_object('status','denied','reason','escalation_not_upward');
  END IF;
  IF length(v_reason) < 10 OR length(v_reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  v_previous := alert.severity;
  UPDATE public.guard_alerts SET
    severity = v_severity,
    escalation_count = escalation_count + 1,
    last_escalated_at = now(),
    updated_at = now(),
    record_version = record_version + 1
    WHERE id = alert.id AND record_version = p_version
    RETURNING * INTO alert;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'ESCALATED', alert.state, alert.state, v_previous, alert.severity,
    v_reason, jsonb_build_object('severity', v_severity, 'escalationCount', alert.escalation_count)
  );
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'SEVERITY_CHANGED', alert.state, alert.state, v_previous, alert.severity, v_reason,
    jsonb_build_object('direction', 'up')
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Escalated Guard alert severity', jsonb_build_object('severity', v_severity)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'severity', alert.severity);
END; $$;

CREATE FUNCTION admin_private.guard_alert_correct_severity_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  v_severity text := btrim(coalesce(p_payload->>'severity',''));
  v_reason text := btrim(coalesce(p_payload->>'reason',''));
  v_previous text;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state IN ('RESOLVED','DISMISSED','NEW') THEN RETURN jsonb_build_object('status','denied','reason','not_acknowledged'); END IF;
  IF v_severity NOT IN ('LOW','MEDIUM','HIGH','CRITICAL') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF admin_private.guard_alert_severity_rank_v1(v_severity) >= admin_private.guard_alert_severity_rank_v1(alert.severity) THEN
    RETURN jsonb_build_object('status','denied','reason','not_a_correction');
  END IF;
  IF length(v_reason) < 10 OR length(v_reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  v_previous := alert.severity;
  UPDATE public.guard_alerts SET
    severity = v_severity, updated_at = now(), record_version = record_version + 1
    WHERE id = alert.id AND record_version = p_version
    RETURNING * INTO alert;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'SEVERITY_CHANGED', alert.state, alert.state, v_previous, v_severity, v_reason,
    jsonb_build_object('direction', 'down')
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Corrected Guard alert severity', jsonb_build_object('from', v_previous, 'to', v_severity)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'severity', alert.severity);
END; $$;

CREATE FUNCTION admin_private.guard_alert_resolve_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  reason text := btrim(coalesce(p_payload->>'reason',''));
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state NOT IN ('NEW','ACKNOWLEDGED') THEN RETURN jsonb_build_object('status','denied','reason','terminal'); END IF;
  IF alert.state = 'NEW' THEN RETURN jsonb_build_object('status','denied','reason','not_acknowledged'); END IF;
  IF alert.needs_review IS TRUE THEN RETURN jsonb_build_object('status','denied','reason','needs_review'); END IF;
  IF length(reason) < 10 OR length(reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  UPDATE public.guard_alerts SET
    state = 'RESOLVED', resolved_at = now(), resolved_by = p_actor, needs_review = false,
    updated_at = now(), record_version = record_version + 1
    WHERE id = alert.id AND record_version = p_version
    RETURNING * INTO alert;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'RESOLVED', 'ACKNOWLEDGED', 'RESOLVED', alert.severity, alert.severity, reason, '{}'::jsonb
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert', 'Resolved Guard alert', jsonb_build_object('reason', reason)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'state', 'RESOLVED');
END; $$;

CREATE FUNCTION admin_private.guard_alert_dismiss_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  reason text := btrim(coalesce(p_payload->>'reason',''));
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state <> 'NEW' AND NOT (alert.state = 'ACKNOWLEDGED' AND alert.review_disposition = 'FALSE_POSITIVE') THEN
    IF alert.state <> 'NEW' THEN RETURN jsonb_build_object('status','denied','reason','not_dismissable'); END IF;
  END IF;
  IF alert.state IN ('RESOLVED','DISMISSED') THEN RETURN jsonb_build_object('status','denied','reason','terminal'); END IF;
  IF length(reason) < 10 OR length(reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  UPDATE public.guard_alerts SET
    state = 'DISMISSED',
    review_disposition = 'FALSE_POSITIVE',
    dismissed_at = now(),
    dismissed_by = p_actor,
    needs_review = false,
    updated_at = now(),
    record_version = record_version + 1
    WHERE id = alert.id AND record_version = p_version
    RETURNING * INTO alert;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'DISMISSED', 'NEW', 'DISMISSED', alert.severity, alert.severity, reason, '{}'::jsonb
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Dismissed Guard alert', jsonb_build_object('disposition', 'FALSE_POSITIVE')
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'state', 'DISMISSED');
END; $$;

CREATE FUNCTION admin_private.guard_alert_prepare_notification_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  loc public.locations;
  tpl admin_private.communication_templates;
  verified text;
  subject text;
  body text;
  html text;
  comm public.communications;
  kind text := btrim(coalesce(p_payload->>'notificationKind','INITIAL'));
  seq integer;
  values jsonb;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF kind NOT IN ('INITIAL','FOLLOW_UP','RESOLUTION') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.needs_review IS TRUE AND kind IN ('INITIAL','FOLLOW_UP') THEN
    RETURN jsonb_build_object('status','denied','reason','needs_review');
  END IF;
  IF NOT admin_private.guard_alert_notification_allowed_v1(kind, alert.state, alert.review_disposition, alert.needs_review)
    OR alert.severity = 'UNASSESSED'
  THEN RETURN jsonb_build_object('status','denied','reason','not_confirmed_customer_issue'); END IF;
  IF kind = 'INITIAL' AND EXISTS (
    SELECT 1 FROM public.guard_alert_notifications n WHERE n.alert_id = alert.id AND n.notification_kind = 'INITIAL'
  ) THEN RETURN jsonb_build_object('status','denied','reason','initial_already_exists'); END IF;
  IF kind = 'FOLLOW_UP' AND (
    length(btrim(coalesce(p_payload->>'reason',''))) < 10
    OR NOT EXISTS (SELECT 1 FROM public.guard_alert_notifications n WHERE n.alert_id = alert.id AND n.notification_kind = 'INITIAL')
  ) THEN RETURN jsonb_build_object('status','denied','reason','follow_up_requires_approval'); END IF;
  IF kind = 'RESOLUTION' AND length(btrim(coalesce(p_payload->>'reason',''))) < 10 THEN
    RETURN jsonb_build_object('status','denied','reason','resolution_requires_approval');
  END IF;
  verified := admin_private.guard_alert_current_email_v1(alert.customer_id);
  IF verified IS NULL THEN RETURN jsonb_build_object('status','denied','reason','email_not_verified'); END IF;
  IF EXISTS (SELECT 1 FROM admin_private.email_suppressions s WHERE s.address_normalized = verified) THEN
    RETURN jsonb_build_object('status','denied','reason','recipient_suppressed');
  END IF;
  IF length(btrim(coalesce(p_payload->>'fact',''))) NOT BETWEEN 10 AND 400
    OR length(btrim(coalesce(p_payload->>'effect',''))) NOT BETWEEN 10 AND 400
    OR length(btrim(coalesce(p_payload->>'nextStep',''))) NOT BETWEEN 10 AND 400
    OR coalesce(p_payload->>'fact','') ~* '<[^>]+>'
    OR coalesce(p_payload->>'effect','') ~* '<[^>]+>'
    OR coalesce(p_payload->>'nextStep','') ~* '<[^>]+>'
  THEN RETURN jsonb_build_object('status','invalid','reason','unresolved_or_invalid_copy'); END IF;
  SELECT * INTO loc FROM public.locations WHERE id = alert.location_id;
  SELECT * INTO tpl FROM admin_private.communication_templates WHERE template_key = 'GUARD_ALERT' ORDER BY version DESC LIMIT 1;
  values := jsonb_build_object(
    'location_name', loc.location_name,
    'fact', btrim(p_payload->>'fact'),
    'effect', btrim(p_payload->>'effect'),
    'next_step', btrim(p_payload->>'nextStep')
  );
  subject := admin_private.render_template_v1(tpl.subject_template, values);
  body := admin_private.render_template_v1(tpl.body_text_template, values);
  IF subject IS NULL OR body IS NULL OR subject ~ '\{[a-z_]+\}' OR body ~ '\{[a-z_]+\}' THEN
    RETURN jsonb_build_object('status','invalid','reason','unresolved_placeholders');
  END IF;
  html := '<p>' || replace(admin_private.escape_html_v1(body), E'\n', '<br />') || '</p>';
  INSERT INTO public.communications(
    guard_alert_id, customer_id, business_id, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version, author_id, content_version, record_version, content_locked
  ) VALUES (
    alert.id, alert.customer_id, alert.business_id, 'GUARD_ALERT', 'OUTBOUND', verified, subject, body, html,
    'PENDING', 'DRAFT', 'NONE', 'GUARD_ALERT', tpl.version, p_actor, 1, 1, false
  ) RETURNING * INTO comm;
  SELECT coalesce(max(sequence_number), 0) + 1 INTO seq FROM public.guard_alert_notifications WHERE alert_id = alert.id;
  INSERT INTO public.guard_alert_notifications(alert_id, communication_id, notification_kind, sequence_number)
  VALUES (alert.id, comm.id, kind, seq);
  UPDATE public.guard_alerts SET updated_at = now(), record_version = record_version + 1 WHERE id = alert.id RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'NOTIFICATION_PREPARED', alert.state, alert.state, alert.severity, alert.severity,
    coalesce(btrim(p_payload->>'reason'), kind),
    jsonb_build_object('communicationId', comm.id, 'kind', kind)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Prepared Guard alert notification', jsonb_build_object('communicationId', comm.id, 'kind', kind)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'communicationId', comm.id, 'communicationVersion', comm.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_alert_approve_notification_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  comm public.communications;
  note public.guard_alert_notifications;
  verified text;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL OR alert.record_version IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('status', CASE WHEN alert.id IS NULL THEN 'invalid' ELSE 'conflict' END);
  END IF;
  SELECT * INTO comm FROM public.communications WHERE id = NULLIF(p_payload->>'communicationId','')::uuid FOR UPDATE;
  SELECT * INTO note FROM public.guard_alert_notifications WHERE communication_id = comm.id AND alert_id = alert.id;
  IF comm.id IS NULL OR note.id IS NULL OR comm.guard_alert_id IS DISTINCT FROM alert.id THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;
  IF alert.needs_review IS TRUE AND note.notification_kind IN ('INITIAL','FOLLOW_UP') THEN
    RETURN jsonb_build_object('status','denied','reason','needs_review');
  END IF;
  IF NOT admin_private.guard_alert_notification_allowed_v1(note.notification_kind, alert.state, alert.review_disposition, alert.needs_review) THEN
    RETURN jsonb_build_object('status','denied','reason','not_confirmed_customer_issue');
  END IF;
  IF comm.lifecycle <> 'DRAFT' OR comm.content_locked THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF comm.subject ~ '\{[a-z_]+\}' OR comm.body_text ~ '\{[a-z_]+\}' THEN
    RETURN jsonb_build_object('status','invalid','reason','unresolved_placeholders');
  END IF;
  verified := admin_private.guard_alert_current_email_v1(alert.customer_id);
  IF verified IS NULL OR verified IS DISTINCT FROM comm.recipient THEN
    RETURN jsonb_build_object('status','denied','reason','recipient_changed');
  END IF;
  IF EXISTS (SELECT 1 FROM admin_private.email_suppressions s WHERE s.address_normalized = verified) THEN
    RETURN jsonb_build_object('status','denied','reason','recipient_suppressed');
  END IF;
  IF btrim(coalesce(p_payload->>'fromAddress','')) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN jsonb_build_object('status','denied','reason','sender_missing');
  END IF;
  UPDATE public.communications
    SET lifecycle = 'REVIEWED', reviewer_id = p_actor, reviewed_at = now(), content_locked = true,
        sender_address = lower(btrim(p_payload->>'fromAddress')),
        updated_at = now(), record_version = record_version + 1
    WHERE id = comm.id AND lifecycle = 'DRAFT'
    RETURNING * INTO comm;
  UPDATE public.guard_alert_notifications SET approved_at = now(), approved_by = p_actor WHERE id = note.id;
  UPDATE public.guard_alerts SET updated_at = now(), record_version = record_version + 1 WHERE id = alert.id RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'NOTIFICATION_APPROVED', alert.state, alert.state, alert.severity, alert.severity,
    'Reviewed Guard alert email', jsonb_build_object('communicationId', comm.id)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Approved Guard alert notification', jsonb_build_object('communicationId', comm.id)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'communicationId', comm.id, 'communicationVersion', comm.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_alert_queue_notification_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  comm public.communications;
  verified text;
BEGIN
  IF coalesce((p_payload->>'sendEnabled')::boolean, false) IS NOT TRUE
    OR coalesce((p_payload->>'notificationsEnabled')::boolean, false) IS NOT TRUE
  THEN RETURN jsonb_build_object('status','denied','reason','notifications_disabled'); END IF;
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL OR alert.record_version IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('status', CASE WHEN alert.id IS NULL THEN 'invalid' ELSE 'conflict' END);
  END IF;
  SELECT * INTO comm FROM public.communications WHERE id = NULLIF(p_payload->>'communicationId','')::uuid FOR UPDATE;
  IF comm.id IS NULL OR comm.guard_alert_id IS DISTINCT FROM alert.id THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  IF alert.needs_review IS TRUE AND EXISTS (
    SELECT 1 FROM public.guard_alert_notifications n
    WHERE n.communication_id = comm.id AND n.alert_id = alert.id AND n.notification_kind IN ('INITIAL','FOLLOW_UP')
  ) THEN RETURN jsonb_build_object('status','denied','reason','needs_review'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.guard_alert_notifications n
    WHERE n.communication_id = comm.id AND n.alert_id = alert.id
      AND admin_private.guard_alert_notification_allowed_v1(n.notification_kind, alert.state, alert.review_disposition, alert.needs_review)
  ) THEN RETURN jsonb_build_object('status','denied','reason','not_confirmed_customer_issue'); END IF;
  IF comm.lifecycle = 'QUEUED' THEN
    RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'communicationId', comm.id, 'replay', true);
  END IF;
  IF comm.lifecycle <> 'REVIEWED' OR comm.content_locked IS NOT TRUE THEN RETURN jsonb_build_object('status','denied'); END IF;
  verified := admin_private.guard_alert_current_email_v1(alert.customer_id);
  IF verified IS NULL OR verified IS DISTINCT FROM comm.recipient THEN
    RETURN jsonb_build_object('status','denied','reason','recipient_changed');
  END IF;
  IF EXISTS (SELECT 1 FROM admin_private.email_suppressions s WHERE s.address_normalized = verified) THEN
    RETURN jsonb_build_object('status','denied','reason','recipient_suppressed');
  END IF;
  UPDATE public.communications
    SET lifecycle = 'QUEUED', queued_at = now(), updated_at = now(), record_version = record_version + 1
    WHERE id = comm.id AND lifecycle = 'REVIEWED'
    RETURNING * INTO comm;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  BEGIN
    PERFORM admin_private.enqueue_outbox_v1(
      'send-email:' || comm.id::text || ':v' || comm.content_version::text,
      'SEND_EMAIL',
      'communication',
      comm.id,
      jsonb_build_object('communicationId', comm.id, 'contentVersion', comm.content_version),
      now()
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  PERFORM admin_private.append_delivery_event_v1(comm.id, 'QUEUED', 'Queued for the durable email worker');
  UPDATE public.guard_alerts SET updated_at = now(), record_version = record_version + 1 WHERE id = alert.id RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'NOTIFICATION_QUEUED', alert.state, alert.state, alert.severity, alert.severity,
    'Queued Guard alert email', jsonb_build_object('communicationId', comm.id)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Queued Guard alert notification', jsonb_build_object('communicationId', comm.id, 'jobType', 'SEND_EMAIL')
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'communicationId', comm.id);
END; $$;

CREATE FUNCTION admin_private.guard_alert_create_case_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  case_type text := btrim(coalesce(p_payload->>'caseType',''));
  summary text;
  created public.cases;
  evidence_at timestamptz;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state <> 'ACKNOWLEDGED' OR alert.review_disposition <> 'CONFIRMED_CUSTOMER_ISSUE' THEN
    RETURN jsonb_build_object('status','denied','reason','not_confirmed_customer_issue');
  END IF;
  IF alert.needs_review IS TRUE THEN RETURN jsonb_build_object('status','denied','reason','needs_review'); END IF;
  IF alert.linked_primary_case_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'caseId', alert.linked_primary_case_id, 'replay', true);
  END IF;
  IF case_type NOT IN ('PROFILE_RECOVERY','REVIEW_PROTECTION') THEN
    RETURN jsonb_build_object('status','invalid','reason','case_type_required');
  END IF;
  summary := left('Guard alert ' || array_to_string(alert.issue_codes, ', '), 500);
  IF length(btrim(summary)) < 1 THEN summary := 'Guard alert requiring reviewed intervention.'; END IF;
  evidence_at := coalesce(admin_private.guard_alert_first_customer_issue_at_v1(alert.id), alert.latest_observed_at, alert.first_observed_at);
  INSERT INTO public.cases(
    public_ref, case_type, customer_id, business_id, location_id, source, issue_description,
    information_accurate_at, privacy_accepted_at, service_track, work_stage, status
  ) VALUES (
    public.generate_case_public_ref(case_type), case_type, alert.customer_id, alert.business_id, alert.location_id,
    'GUARD_ALERT', summary, evidence_at, NULL, 'UNDECIDED', 'INITIAL_REVIEW', 'RECEIVED'
  ) RETURNING * INTO created;
  INSERT INTO public.case_events(case_id, event_type, actor_type, event_data)
  VALUES (created.id, 'CASE_RECEIVED', 'ADMIN', jsonb_build_object('source','GUARD_ALERT','alertId', alert.id));
  INSERT INTO public.guard_alert_cases(alert_id, case_id, role, created_by)
  VALUES (alert.id, created.id, 'PRIMARY', p_actor);
  UPDATE public.guard_alerts SET
    linked_primary_case_id = created.id, updated_at = now(), record_version = record_version + 1
    WHERE id = alert.id
    RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'CASE_LINKED', alert.state, alert.state, alert.severity, alert.severity,
    'Created intervention case', jsonb_build_object('caseId', created.id, 'caseType', case_type, 'publicRef', created.public_ref)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Created Guard intervention case', jsonb_build_object('caseId', created.id, 'caseType', case_type)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'caseId', created.id, 'publicRef', created.public_ref);
END; $$;

CREATE FUNCTION admin_private.guard_alert_link_case_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  cs public.cases;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF alert.state <> 'ACKNOWLEDGED' OR alert.review_disposition <> 'CONFIRMED_CUSTOMER_ISSUE' THEN
    RETURN jsonb_build_object('status','denied','reason','not_confirmed_customer_issue');
  END IF;
  IF alert.needs_review IS TRUE THEN RETURN jsonb_build_object('status','denied','reason','needs_review'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = NULLIF(p_payload->>'caseId','')::uuid FOR UPDATE;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('status','invalid','reason','case_missing'); END IF;
  IF cs.customer_id IS DISTINCT FROM alert.customer_id
    OR cs.business_id IS DISTINCT FROM alert.business_id
    OR cs.location_id IS DISTINCT FROM alert.location_id
  THEN RETURN jsonb_build_object('status','denied','reason','case_scope_mismatch'); END IF;
  IF cs.case_type NOT IN ('PROFILE_RECOVERY','REVIEW_PROTECTION') OR cs.status IN ('CLOSED','CANCELLED') THEN
    RETURN jsonb_build_object('status','denied','reason','case_not_usable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.guard_alert_cases l WHERE l.alert_id = alert.id AND l.case_id = cs.id) THEN
    RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'caseId', cs.id, 'replay', true);
  END IF;
  IF alert.linked_primary_case_id IS NOT NULL AND alert.linked_primary_case_id IS DISTINCT FROM cs.id THEN
    RETURN jsonb_build_object('status','denied','reason','primary_already_linked');
  END IF;
  INSERT INTO public.guard_alert_cases(alert_id, case_id, role, created_by)
  VALUES (alert.id, cs.id, 'PRIMARY', p_actor);
  UPDATE public.guard_alerts SET
    linked_primary_case_id = cs.id, updated_at = now(), record_version = record_version + 1
    WHERE id = alert.id
    RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'CASE_LINKED', alert.state, alert.state, alert.severity, alert.severity,
    'Linked existing intervention case', jsonb_build_object('caseId', cs.id)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Linked existing Guard intervention case', jsonb_build_object('caseId', cs.id)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'caseId', cs.id);
END; $$;

CREATE FUNCTION admin_private.guard_alert_pause_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  cov public.guard_coverages;
  action public.guard_service_actions;
  reason text := btrim(coalesce(p_payload->>'reason',''));
  activated timestamptz;
  included_start timestamptz;
  included_end timestamptz;
  paid_through timestamptz;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = alert.coverage_id FOR UPDATE;
  IF cov.state <> 'ACTIVE' THEN RETURN jsonb_build_object('status','denied','reason','coverage_not_active'); END IF;
  SELECT * INTO action FROM public.guard_service_actions
    WHERE id = NULLIF(p_payload->>'serviceActionId','')::uuid AND coverage_id = cov.id
    FOR UPDATE;
  IF action.id IS NULL OR action.state NOT IN ('OPEN','ACKNOWLEDGED') THEN
    RETURN jsonb_build_object('status','denied','reason','service_action_required');
  END IF;
  IF action.kind = 'CONTACT_RECOVERY' AND admin_private.guard_contact_ready_v1(cov.customer_id) THEN
    RETURN jsonb_build_object('status','denied','reason','stale_service_action');
  END IF;
  IF action.kind = 'ACCESS_RECOVERY' AND (admin_private.guard_access_record_v1(cov.business_id, cov.location_id)).id IS NOT NULL THEN
    RETURN jsonb_build_object('status','denied','reason','stale_service_action');
  END IF;
  IF admin_private.guard_contact_ready_v1(cov.customer_id)
    AND (admin_private.guard_access_record_v1(cov.business_id, cov.location_id)).id IS NOT NULL
  THEN RETURN jsonb_build_object('status','denied','reason','recovery_pause_not_justified'); END IF;
  IF length(reason) < 10 OR length(reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  activated := cov.activated_at;
  included_start := cov.included_start_at;
  included_end := cov.included_end_at;
  SELECT paid_through_at INTO paid_through FROM public.guard_billing WHERE coverage_id = cov.id;
  cov := admin_private.guard_transition_coverage_v1(cov.id, 'PAUSED', 'ADMIN', p_actor, 'STATE_CHANGED', reason);
  IF cov.activated_at IS DISTINCT FROM activated
    OR cov.included_start_at IS DISTINCT FROM included_start
    OR cov.included_end_at IS DISTINCT FROM included_end
    OR (SELECT paid_through_at FROM public.guard_billing WHERE coverage_id = cov.id) IS DISTINCT FROM paid_through
  THEN RAISE EXCEPTION 'Guard pause must not rewrite activation or billing clocks'; END IF;
  UPDATE public.guard_alerts SET updated_at = now(), record_version = record_version + 1 WHERE id = alert.id RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'COVERAGE_PAUSED', alert.state, alert.state, alert.severity, alert.severity, reason,
    jsonb_build_object('coverageId', cov.id, 'serviceActionId', action.id)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Paused Guard coverage for recovery', jsonb_build_object('coverageId', cov.id)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'coverageState', cov.state);
END; $$;

CREATE FUNCTION admin_private.guard_alert_resume_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  cov public.guard_coverages;
  reason text := btrim(coalesce(p_payload->>'reason',''));
  activated timestamptz;
  included_start timestamptz;
  included_end timestamptz;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = alert.coverage_id FOR UPDATE;
  IF cov.state <> 'PAUSED' THEN RETURN jsonb_build_object('status','denied','reason','coverage_not_paused'); END IF;
  IF NOT admin_private.guard_alert_resume_ready_v1(cov.id) THEN
    RETURN jsonb_build_object('status','denied','reason','resume_not_ready');
  END IF;
  IF length(reason) < 10 OR length(reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  activated := cov.activated_at;
  included_start := cov.included_start_at;
  included_end := cov.included_end_at;
  cov := admin_private.guard_transition_coverage_v1(cov.id, 'ACTIVE', 'ADMIN', p_actor, 'STATE_CHANGED', reason);
  IF cov.activated_at IS DISTINCT FROM activated
    OR cov.included_start_at IS DISTINCT FROM included_start
    OR cov.included_end_at IS DISTINCT FROM included_end
  THEN RAISE EXCEPTION 'Guard resume must preserve the original activation clock'; END IF;
  UPDATE public.guard_alerts SET updated_at = now(), record_version = record_version + 1 WHERE id = alert.id RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'COVERAGE_RESUMED', alert.state, alert.state, alert.severity, alert.severity, reason,
    jsonb_build_object('coverageId', cov.id)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Resumed Guard coverage after restored readiness', jsonb_build_object('coverageId', cov.id)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'coverageState', cov.state);
END; $$;

CREATE FUNCTION admin_private.guard_service_action_command_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_operation text
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  action public.guard_service_actions;
  reason text := btrim(coalesce(p_payload->>'reason',''));
BEGIN
  SELECT * INTO action FROM public.guard_service_actions WHERE id = NULLIF(p_payload->>'serviceActionId','')::uuid FOR UPDATE;
  IF action.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF action.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF length(reason) < 10 OR length(reason) > 500 THEN RETURN jsonb_build_object('status','invalid','reason','reason_required'); END IF;
  IF p_operation = 'acknowledge_service_action' THEN
    IF action.state <> 'OPEN' THEN RETURN jsonb_build_object('status','denied'); END IF;
    UPDATE public.guard_service_actions SET
      state = 'ACKNOWLEDGED', acknowledged_at = now(), acknowledged_by = p_actor,
      updated_at = now(), record_version = record_version + 1
      WHERE id = action.id AND record_version = p_version
      RETURNING * INTO action;
  ELSIF p_operation = 'resolve_service_action' THEN
    IF action.state NOT IN ('OPEN','ACKNOWLEDGED') THEN RETURN jsonb_build_object('status','denied'); END IF;
    IF action.kind = 'ACCESS_RECOVERY'
      AND admin_private.guard_access_record_v1(action.business_id, action.location_id) IS NULL
    THEN RETURN jsonb_build_object('status','denied','reason','access_still_missing'); END IF;
    IF action.kind = 'CONTACT_RECOVERY'
      AND action.reason_code = 'NO_REACHABLE_VERIFIED_CONTACT'
      AND NOT admin_private.contact_verified_v1(action.customer_id, 'email')
      AND NOT admin_private.contact_verified_v1(action.customer_id, 'phone')
    THEN RETURN jsonb_build_object('status','denied','reason','contact_still_missing'); END IF;
    UPDATE public.guard_service_actions SET
      state = 'RESOLVED', resolved_at = now(), resolved_by = p_actor,
      acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, p_actor),
      updated_at = now(), record_version = record_version + 1
      WHERE id = action.id AND record_version = p_version
      RETURNING * INTO action;
  ELSE
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', action.id, p_request, 'guard_service_action',
    CASE WHEN p_operation = 'resolve_service_action' THEN 'Resolved Guard recovery action' ELSE 'Acknowledged Guard recovery action' END,
    jsonb_build_object('kind', action.kind, 'state', action.state)
  );
  RETURN jsonb_build_object('status','success','id', action.id, 'version', action.record_version, 'state', action.state);
END; $$;

CREATE FUNCTION public.admin_guard_alert_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; fp text; cached jsonb; result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_operation IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF p_operation NOT IN (
    'acknowledge','dismiss','escalate','correct_severity','resolve','review_new_evidence',
    'prepare_notification','approve_notification','queue_notification',
    'create_intervention_case','link_existing_case','pause_for_recovery','resume',
    'acknowledge_service_action','resolve_service_action'
  ) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  fp := md5(jsonb_build_array(p_operation, p_payload, p_version)::text);
  cached := admin_private.guard_alert_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  result := CASE p_operation
    WHEN 'acknowledge' THEN admin_private.guard_alert_acknowledge_v1(actor, p_request, p_payload, p_version)
    WHEN 'review_new_evidence' THEN admin_private.guard_alert_review_new_evidence_v1(actor, p_request, p_payload, p_version)
    WHEN 'dismiss' THEN admin_private.guard_alert_dismiss_v1(actor, p_request, p_payload, p_version)
    WHEN 'escalate' THEN admin_private.guard_alert_escalate_v1(actor, p_request, p_payload, p_version)
    WHEN 'correct_severity' THEN admin_private.guard_alert_correct_severity_v1(actor, p_request, p_payload, p_version)
    WHEN 'resolve' THEN admin_private.guard_alert_resolve_v1(actor, p_request, p_payload, p_version)
    WHEN 'prepare_notification' THEN admin_private.guard_alert_prepare_notification_v1(actor, p_request, p_payload, p_version)
    WHEN 'approve_notification' THEN admin_private.guard_alert_approve_notification_v1(actor, p_request, p_payload, p_version)
    WHEN 'queue_notification' THEN admin_private.guard_alert_queue_notification_v1(actor, p_request, p_payload, p_version)
    WHEN 'create_intervention_case' THEN admin_private.guard_alert_create_case_v1(actor, p_request, p_payload, p_version)
    WHEN 'link_existing_case' THEN admin_private.guard_alert_link_case_v1(actor, p_request, p_payload, p_version)
    WHEN 'pause_for_recovery' THEN admin_private.guard_alert_pause_v1(actor, p_request, p_payload, p_version)
    WHEN 'resume' THEN admin_private.guard_alert_resume_v1(actor, p_request, p_payload, p_version)
    WHEN 'acknowledge_service_action' THEN admin_private.guard_service_action_command_v1(actor, p_request, p_payload, p_version, p_operation)
    WHEN 'resolve_service_action' THEN admin_private.guard_service_action_command_v1(actor, p_request, p_payload, p_version, p_operation)
  END;
  IF result IS NULL THEN result := jsonb_build_object('status','invalid'); END IF;
  PERFORM admin_private.guard_alert_store_receipt_v1(p_request, actor, fp, result);
  RETURN result;
END; $$;

CREATE FUNCTION admin_private.guard_alert_row_json_v1(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'coverageId', a.coverage_id,
    'customerId', a.customer_id,
    'businessId', a.business_id,
    'locationId', a.location_id,
    'customerName', c.full_name,
    'businessName', b.display_name,
    'locationName', loc.location_name,
    'coverageBasis', g.coverage_basis,
    'coverageState', g.state,
    'state', a.state,
    'severity', a.severity,
    'reviewDisposition', a.review_disposition,
    'issueCodes', to_jsonb(a.issue_codes),
    'needsReview', a.needs_review,
    'acknowledgedAt', a.acknowledged_at,
    'acknowledgedBy', a.acknowledged_by,
    'openedAt', a.opened_at,
    'firstObservedAt', a.first_observed_at,
    'latestObservedAt', a.latest_observed_at,
    'escalationCount', a.escalation_count,
    'lastEscalatedAt', a.last_escalated_at,
    'linkedPrimaryCaseId', a.linked_primary_case_id,
    'linkedCaseRef', cs.public_ref,
    'notificationStatus', (
      SELECT CASE
        WHEN comm.delivery_status = 'DELIVERED' THEN 'Delivered'
        WHEN comm.delivery_status = 'PROVIDER_ACCEPTED' THEN 'Provider accepted'
        WHEN comm.delivery_status = 'BOUNCED' THEN 'Bounced'
        WHEN comm.delivery_status = 'COMPLAINED' THEN 'Complained'
        WHEN comm.delivery_status = 'SUPPRESSED' THEN 'Suppressed'
        WHEN comm.delivery_status = 'FAILED' THEN 'Failed'
        WHEN comm.lifecycle = 'QUEUED' THEN 'Queued'
        WHEN comm.lifecycle = 'REVIEWED' THEN 'Reviewed'
        WHEN comm.lifecycle = 'DRAFT' THEN 'Draft'
        ELSE 'None'
      END
      FROM public.guard_alert_notifications n
      JOIN public.communications comm ON comm.id = n.communication_id
      WHERE n.alert_id = a.id
      ORDER BY n.sequence_number DESC
      LIMIT 1
    ),
    'contactBlocked', NOT admin_private.guard_contact_ready_v1(a.customer_id),
    'accessBlocked', admin_private.guard_access_record_v1(a.business_id, a.location_id) IS NULL,
    'openServiceActionKind', (
      SELECT sa.kind FROM public.guard_service_actions sa
      WHERE sa.coverage_id = a.coverage_id AND sa.state IN ('OPEN','ACKNOWLEDGED')
      ORDER BY sa.opened_at DESC LIMIT 1
    ),
    'version', a.record_version
  )
  FROM public.guard_alerts a
  JOIN public.guard_coverages g ON g.id = a.coverage_id
  JOIN public.customers c ON c.id = a.customer_id
  JOIN public.businesses b ON b.id = a.business_id
  JOIN public.locations loc ON loc.id = a.location_id
  LEFT JOIN public.cases cs ON cs.id = a.linked_primary_case_id
  WHERE a.id = p_id;
$$;

CREATE FUNCTION public.admin_guard_alert_list_v1(
  p_token text, p_queue text, p_limit integer, p_after uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  queue text := coalesce(nullif(btrim(p_queue), ''), 'NEW_REVIEW');
  rows jsonb;
  more boolean := false;
  next_cursor uuid;
  cursor_ok boolean := true;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  IF queue NOT IN ('NEW_REVIEW','ACKNOWLEDGED','HIGH_CRITICAL','NEEDS_REVIEW','CONTACT_RECOVERY','ACCESS_RECOVERY','RESOLVED_RECENT') THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_queue');
  END IF;
  IF p_after IS NOT NULL THEN
    IF queue IN ('CONTACT_RECOVERY','ACCESS_RECOVERY') THEN
      cursor_ok := EXISTS (
        SELECT 1 FROM public.guard_service_actions sa
        WHERE sa.id = p_after AND sa.kind = CASE queue WHEN 'CONTACT_RECOVERY' THEN 'CONTACT_RECOVERY' ELSE 'ACCESS_RECOVERY' END
          AND sa.state IN ('OPEN','ACKNOWLEDGED')
      );
    ELSIF queue = 'RESOLVED_RECENT' THEN
      cursor_ok := EXISTS (SELECT 1 FROM public.guard_alerts a WHERE a.id = p_after AND a.state IN ('RESOLVED','DISMISSED'));
    ELSIF queue = 'NEW_REVIEW' THEN
      cursor_ok := EXISTS (SELECT 1 FROM public.guard_alerts a WHERE a.id = p_after AND a.state = 'NEW');
    ELSIF queue = 'ACKNOWLEDGED' THEN
      cursor_ok := EXISTS (SELECT 1 FROM public.guard_alerts a WHERE a.id = p_after AND a.state = 'ACKNOWLEDGED');
    ELSIF queue = 'HIGH_CRITICAL' THEN
      cursor_ok := EXISTS (SELECT 1 FROM public.guard_alerts a WHERE a.id = p_after AND a.state IN ('NEW','ACKNOWLEDGED') AND a.severity IN ('HIGH','CRITICAL'));
    ELSE
      cursor_ok := EXISTS (SELECT 1 FROM public.guard_alerts a WHERE a.id = p_after AND a.needs_review IS TRUE AND a.state IN ('NEW','ACKNOWLEDGED'));
    END IF;
    IF NOT cursor_ok THEN RETURN jsonb_build_object('status','invalid','reason','invalid_cursor'); END IF;
  END IF;
  IF queue IN ('CONTACT_RECOVERY','ACCESS_RECOVERY') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id,
      'kind', x.kind,
      'state', x.state,
      'reasonCode', x.reason_code,
      'coverageId', x.coverage_id,
      'alertId', x.alert_id,
      'customerName', c.full_name,
      'businessName', b.display_name,
      'locationName', loc.location_name,
      'openedAt', x.opened_at,
      'version', x.record_version
    ) ORDER BY x.opened_at DESC, x.id DESC), '[]'::jsonb)
    INTO rows
    FROM (
      SELECT sa.*
      FROM public.guard_service_actions sa
      WHERE sa.kind = CASE queue WHEN 'CONTACT_RECOVERY' THEN 'CONTACT_RECOVERY' ELSE 'ACCESS_RECOVERY' END
        AND sa.state IN ('OPEN','ACKNOWLEDGED')
        AND (p_after IS NULL OR (sa.opened_at, sa.id) < (
          SELECT s2.opened_at, s2.id FROM public.guard_service_actions s2 WHERE s2.id = p_after
        ))
      ORDER BY sa.opened_at DESC, sa.id DESC
      LIMIT v_limit + 1
    ) x
    JOIN public.customers c ON c.id = x.customer_id
    JOIN public.businesses b ON b.id = x.business_id
    JOIN public.locations loc ON loc.id = x.location_id;
  ELSE
    SELECT coalesce(jsonb_agg(admin_private.guard_alert_row_json_v1(x.id) ORDER BY x.latest_observed_at DESC, x.id DESC), '[]'::jsonb)
    INTO rows
    FROM (
      SELECT a.*
      FROM public.guard_alerts a
      WHERE (
        (queue = 'NEW_REVIEW' AND a.state = 'NEW')
        OR (queue = 'ACKNOWLEDGED' AND a.state = 'ACKNOWLEDGED')
        OR (queue = 'HIGH_CRITICAL' AND a.state IN ('NEW','ACKNOWLEDGED') AND a.severity IN ('HIGH','CRITICAL'))
        OR (queue = 'NEEDS_REVIEW' AND a.needs_review IS TRUE AND a.state IN ('NEW','ACKNOWLEDGED'))
        OR (queue = 'RESOLVED_RECENT' AND a.state IN ('RESOLVED','DISMISSED'))
      )
      AND (p_after IS NULL OR (a.latest_observed_at, a.id) < (
        SELECT a2.latest_observed_at, a2.id FROM public.guard_alerts a2 WHERE a2.id = p_after
      ))
      ORDER BY a.latest_observed_at DESC, a.id DESC
      LIMIT v_limit + 1
    ) x;
  END IF;
  IF jsonb_array_length(rows) > v_limit THEN
    more := true;
    rows := (SELECT jsonb_agg(value) FROM jsonb_array_elements(rows) WITH ORDINALITY t(value, n) WHERE n <= v_limit);
  END IF;
  IF jsonb_array_length(rows) > 0 THEN
    next_cursor := (rows -> (jsonb_array_length(rows) - 1) ->> 'id')::uuid;
  END IF;
  RETURN jsonb_build_object(
    'status','success',
    'queue', queue,
    'alerts', rows,
    'hasMore', more,
    'nextCursor', next_cursor
  );
END; $$;

CREATE FUNCTION public.admin_guard_alert_detail_v1(p_token text, p_alert uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  alert public.guard_alerts;
  coverage public.guard_coverages;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO alert FROM public.guard_alerts WHERE id = p_alert;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT * INTO coverage FROM public.guard_coverages WHERE id = alert.coverage_id;
  RETURN jsonb_build_object(
    'status','success',
    'alert', admin_private.guard_alert_row_json_v1(alert.id),
    'enabled', false,
    'observations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', obs.id,
        'attached', true,
        'classification', obs.classification,
        'issueCodes', to_jsonb(link.issue_codes),
        'observedAt', obs.observed_at,
        'attentionCandidate', obs.attention_candidate,
        'profileAvailability', obs.profile_availability
      ) ORDER BY obs.observed_at, obs.id)
      FROM public.guard_alert_observations link
      JOIN public.guard_check_observations obs ON obs.id = link.observation_id
      WHERE link.alert_id = alert.id
    ), '[]'::jsonb),
    'recentCoverageObservations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'classification', x.classification, 'issueCodes', to_jsonb(x.change_codes),
        'observedAt', x.observed_at, 'attentionCandidate', x.attention_candidate
      ) ORDER BY x.observed_at DESC, x.id DESC)
      FROM (
        SELECT obs.id, obs.classification, obs.change_codes, obs.observed_at, obs.attention_candidate
        FROM public.guard_check_observations obs
        WHERE obs.coverage_id = alert.coverage_id
        ORDER BY obs.observed_at DESC, obs.id DESC
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'event', e.event, 'actorType', e.actor_type, 'reason', e.reason,
        'previousState', e.previous_state, 'newState', e.new_state,
        'previousSeverity', e.previous_severity, 'newSeverity', e.new_severity,
        'createdAt', e.created_at, 'details', e.details
      ) ORDER BY e.created_at, e.id)
      FROM (
        SELECT ev.* FROM public.guard_alert_events ev
        WHERE ev.alert_id = alert.id
        ORDER BY ev.created_at DESC, ev.id DESC
        LIMIT 100
      ) e
    ), '[]'::jsonb),
    'notifications', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'kind', n.notification_kind, 'sequenceNumber', n.sequence_number,
        'communicationId', n.communication_id, 'lifecycle', comm.lifecycle,
        'deliveryStatus', comm.delivery_status, 'recipient', comm.recipient,
        'subject', comm.subject, 'approvedAt', n.approved_at
      ) ORDER BY n.sequence_number)
      FROM public.guard_alert_notifications n
      JOIN public.communications comm ON comm.id = n.communication_id
      WHERE n.alert_id = alert.id
    ), '[]'::jsonb),
    'serviceActions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sa.id, 'kind', sa.kind, 'state', sa.state, 'reasonCode', sa.reason_code,
        'details', sa.details, 'openedAt', sa.opened_at, 'version', sa.record_version
      ) ORDER BY sa.opened_at DESC, sa.id DESC)
      FROM (
        SELECT s.* FROM public.guard_service_actions s
        WHERE s.coverage_id = alert.coverage_id
        ORDER BY s.opened_at DESC, s.id DESC
        LIMIT 20
      ) sa
    ), '[]'::jsonb),
    'contact', jsonb_build_object(
      'emailVerified', admin_private.contact_verified_v1(alert.customer_id, 'email'),
      'phoneVerified', admin_private.contact_verified_v1(alert.customer_id, 'phone')
    ),
    'access', jsonb_build_object(
      'verified', (admin_private.guard_access_record_v1(alert.business_id, alert.location_id)).id IS NOT NULL
    ),
    'coverage', jsonb_build_object(
      'id', coverage.id, 'state', coverage.state, 'basis', coverage.coverage_basis,
      'activatedAt', coverage.activated_at, 'includedStartAt', coverage.included_start_at,
      'includedEndAt', coverage.included_end_at, 'resumeReady', admin_private.guard_alert_resume_ready_v1(coverage.id)
    ),
    'discount', jsonb_build_object(
      'managedRelaunch', admin_private.guard_alert_discount_assessment_v1(alert.id, 'MANAGED_RELAUNCH'),
      'managedReview', admin_private.guard_alert_discount_assessment_v1(alert.id, 'MANAGED_REVIEW'),
      'guided', admin_private.guard_alert_discount_assessment_v1(alert.id, 'GUIDED_RELAUNCH')
    ),
    'permittedActions', jsonb_build_object(
      'acknowledge', alert.state = 'NEW',
      'dismiss', alert.state = 'NEW',
      'reviewNewEvidence', alert.state = 'ACKNOWLEDGED' AND alert.needs_review IS TRUE,
      'escalate', alert.state = 'ACKNOWLEDGED' AND alert.severity <> 'CRITICAL' AND alert.severity <> 'UNASSESSED',
      'resolve', alert.state = 'ACKNOWLEDGED' AND alert.needs_review IS NOT TRUE,
      'prepareNotification', alert.state = 'ACKNOWLEDGED' AND alert.review_disposition = 'CONFIRMED_CUSTOMER_ISSUE' AND alert.severity <> 'UNASSESSED' AND alert.needs_review IS NOT TRUE,
      'prepareResolutionNotification', alert.state = 'RESOLVED' AND alert.review_disposition = 'CONFIRMED_CUSTOMER_ISSUE',
      'createInterventionCase', alert.state = 'ACKNOWLEDGED' AND alert.review_disposition = 'CONFIRMED_CUSTOMER_ISSUE' AND alert.linked_primary_case_id IS NULL AND alert.needs_review IS NOT TRUE,
      'linkExistingCase', alert.state = 'ACKNOWLEDGED' AND alert.review_disposition = 'CONFIRMED_CUSTOMER_ISSUE' AND alert.linked_primary_case_id IS NULL AND alert.needs_review IS NOT TRUE,
      'pauseForRecovery', coverage.state = 'ACTIVE'
        AND (
          NOT admin_private.guard_contact_ready_v1(alert.customer_id)
          OR admin_private.guard_access_record_v1(alert.business_id, alert.location_id) IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM public.guard_service_actions sa
          WHERE sa.coverage_id = coverage.id AND sa.state IN ('OPEN','ACKNOWLEDGED')
        ),
      'resume', coverage.state = 'PAUSED' AND admin_private.guard_alert_resume_ready_v1(coverage.id)
    )
  );
END; $$;

REVOKE ALL ON TABLE public.guard_alerts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.guard_alert_observations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.guard_alert_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.guard_alert_cases FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.guard_alert_notifications FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.guard_service_actions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE admin_private.guard_alert_receipts FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.guard_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_alert_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_alert_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_alert_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_service_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guard_alert_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.guard_process_alert_candidate_v1(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_maintain_alerts_v1(timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_enqueue_daily_alerts_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_alert_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_alert_list_v1(text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_alert_detail_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_process_alert_candidate_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_maintain_alerts_v1(timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_enqueue_daily_alerts_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_alert_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_alert_list_v1(text, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_alert_detail_v1(text, uuid) TO service_role;

COMMIT;
