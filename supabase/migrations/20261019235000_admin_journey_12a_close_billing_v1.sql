BEGIN;

-- ADMIN-JOURNEY-12A. Not applied to DEV (rmzozuiamjcclvtgutgd) or Production (cxwwekdzkkjjbiyofrov).
-- Do not apply this migration from the pull request. Independent review applies it to DEV only.
-- This extends the existing close branch of public.admin_case_command_v1.
-- It does not add a command, collect a payment, create an invoice, send email, or write Guard.
-- service_orders.state has no ACCEPTED_PAID value. An upfront order stays
-- ACCEPTED_AWAITING_PAYMENT. Settlement is a non-void UPFRONT obligation in PAID
-- plus a payment_receipts row for that obligation, the case and the customer.
-- The receipt and obligation must match the accepted order amount, currency and tax.
-- The obligation, approval and order must name the accepted quote version.
-- One applicable order for the case and track is required. A second order is not ignored.
-- A checkout attempt, a saved card and an unconfirmed payment are not read.
-- A Managed decision at OUTCOME_REVIEW needs that accepted order. It does not need a
-- success fee when the outcome is not qualifying. A non-void success fee still blocks it.
-- A voided success fee is historical and is not an active charge.
-- WITHDRAWN before OUTCOME_REVIEW can cancel a Managed case that has no active success fee.
-- Guided withdrawal still needs the upfront receipt.
-- CREATE OR REPLACE keeps the existing service_role EXECUTE grant on the command.
-- The predicate is not granted to PUBLIC, anon, authenticated or service_role.

CREATE FUNCTION admin_private.case_close_billing_ready_v1(p_case public.cases, p_outcome text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path=''
AS $$
DECLARE
  projected public.cases := p_case;
  qualifying boolean;
  accepted_quotes integer;
  applicable_orders integer;
  matched_orders integer;
  foreign_orders integer;
  settled integer;
  active_success integer;
BEGIN
  projected.outcome := p_outcome;
  qualifying := admin_private.qualifying_success_outcome_v1(projected);
  SELECT count(*)::int INTO accepted_quotes
    FROM public.quotes q
   WHERE q.case_id = p_case.id AND q.customer_id = p_case.customer_id AND q.status = 'ACCEPTED';

  IF p_case.service_track = 'GUIDED' THEN
    IF accepted_quotes <> 1 THEN RETURN false; END IF;
    SELECT count(*)::int INTO applicable_orders
      FROM public.service_orders o
     WHERE o.case_id = p_case.id AND o.payment_model = 'UPFRONT';
    IF applicable_orders <> 1 THEN RETURN false; END IF;
    SELECT count(*)::int INTO foreign_orders
      FROM public.service_orders o
     WHERE o.case_id = p_case.id AND o.payment_model IN ('SUCCESS_FEE','RECURRING_MONTHLY');
    IF foreign_orders <> 0 THEN RETURN false; END IF;
    SELECT count(*)::int INTO settled
      FROM public.payment_obligations b
      JOIN public.service_orders o ON o.id = b.service_order_id
      JOIN public.quotes q ON q.id = o.quote_id AND q.current_version_id = o.quote_version_id
      JOIN public.quote_versions v ON v.id = o.quote_version_id AND v.quote_id = q.id
      JOIN public.quote_acceptances acc ON acc.id = o.quote_acceptance_id
        AND acc.quote_id = q.id AND acc.quote_version_id = o.quote_version_id
     WHERE o.case_id = p_case.id
       AND o.customer_id = p_case.customer_id
       AND b.case_id = p_case.id
       AND b.customer_id = p_case.customer_id
       AND b.quote_id = q.id
       AND b.quote_version_id = o.quote_version_id
       AND q.case_id = p_case.id
       AND q.customer_id = p_case.customer_id
       AND q.status = 'ACCEPTED'
       AND v.status = 'ACCEPTED'
       AND o.payment_model = 'UPFRONT'
       AND o.state = 'ACCEPTED_AWAITING_PAYMENT'
       AND o.amount_minor = v.total_amount_minor
       AND o.currency = v.currency
       AND o.tax_behaviour = v.tax_behaviour
       AND o.tax_amount_minor = v.tax_amount_minor
       AND b.kind = 'UPFRONT'
       AND b.state = 'PAID'
       AND b.amount_minor = o.amount_minor
       AND b.currency = o.currency
       AND b.tax_behaviour = o.tax_behaviour
       AND b.tax_amount_minor = o.tax_amount_minor
       AND EXISTS (
         SELECT 1 FROM public.payment_receipts r
          WHERE r.obligation_id = b.id
            AND r.service_order_id = o.id
            AND r.customer_id = p_case.customer_id
            AND r.amount_minor = b.amount_minor
            AND r.currency = b.currency
            AND r.tax_behaviour = b.tax_behaviour
            AND r.tax_amount_minor = b.tax_amount_minor
       );
    RETURN settled = 1;
  END IF;

  IF p_case.service_track = 'MANAGED' THEN
    SELECT count(*)::int INTO active_success
      FROM public.payment_obligations b
      JOIN public.service_orders o ON o.id = b.service_order_id
     WHERE b.kind = 'SUCCESS_FEE'
       AND b.state <> 'VOID'
       AND (b.case_id = p_case.id OR o.case_id = p_case.id);
    IF NOT qualifying THEN
      IF active_success <> 0 THEN RETURN false; END IF;
      IF p_outcome = 'WITHDRAWN' AND p_case.work_stage IS DISTINCT FROM 'OUTCOME_REVIEW' THEN
        RETURN true;
      END IF;
      IF accepted_quotes <> 1 THEN RETURN false; END IF;
      SELECT count(*)::int INTO applicable_orders
        FROM public.service_orders o
       WHERE o.case_id = p_case.id AND o.payment_model = 'SUCCESS_FEE';
      IF applicable_orders <> 1 THEN RETURN false; END IF;
      SELECT count(*)::int INTO foreign_orders
        FROM public.service_orders o
       WHERE o.case_id = p_case.id AND o.payment_model IN ('UPFRONT','RECURRING_MONTHLY');
      IF foreign_orders <> 0 THEN RETURN false; END IF;
      SELECT count(*)::int INTO matched_orders
        FROM public.service_orders o
        JOIN public.quotes q ON q.id = o.quote_id AND q.current_version_id = o.quote_version_id
        JOIN public.quote_versions v ON v.id = o.quote_version_id AND v.quote_id = q.id
        JOIN public.quote_acceptances acc ON acc.id = o.quote_acceptance_id
          AND acc.quote_id = q.id AND acc.quote_version_id = o.quote_version_id
       WHERE o.case_id = p_case.id
         AND o.customer_id = p_case.customer_id
         AND q.case_id = p_case.id
         AND q.customer_id = p_case.customer_id
         AND q.status = 'ACCEPTED'
         AND v.status = 'ACCEPTED'
         AND o.payment_model = 'SUCCESS_FEE'
         AND o.state = 'ACCEPTED_SUCCESS_FEE'
         AND o.amount_minor = v.total_amount_minor
         AND o.currency = v.currency
         AND o.tax_behaviour = v.tax_behaviour
         AND o.tax_amount_minor = v.tax_amount_minor;
      RETURN matched_orders = 1;
    END IF;
    IF accepted_quotes <> 1 OR active_success <> 1 THEN RETURN false; END IF;
    SELECT count(*)::int INTO applicable_orders
      FROM public.service_orders o
     WHERE o.case_id = p_case.id AND o.payment_model = 'SUCCESS_FEE';
    IF applicable_orders <> 1 THEN RETURN false; END IF;
    SELECT count(*)::int INTO foreign_orders
      FROM public.service_orders o
     WHERE o.case_id = p_case.id AND o.payment_model IN ('UPFRONT','RECURRING_MONTHLY');
    IF foreign_orders <> 0 THEN RETURN false; END IF;
    SELECT count(*)::int INTO settled
      FROM public.payment_obligations b
      JOIN public.service_orders o ON o.id = b.service_order_id
      JOIN public.quotes q ON q.id = o.quote_id AND q.current_version_id = o.quote_version_id
      JOIN public.quote_versions v ON v.id = o.quote_version_id AND v.quote_id = q.id
      JOIN public.quote_acceptances acc ON acc.id = o.quote_acceptance_id
        AND acc.quote_id = q.id AND acc.quote_version_id = o.quote_version_id
      JOIN public.success_fee_approvals a ON a.id = b.success_fee_approval_id
     WHERE o.case_id = p_case.id
       AND o.customer_id = p_case.customer_id
       AND b.case_id = p_case.id
       AND b.customer_id = p_case.customer_id
       AND b.quote_id = q.id
       AND b.quote_version_id = o.quote_version_id
       AND q.case_id = p_case.id
       AND q.customer_id = p_case.customer_id
       AND q.status = 'ACCEPTED'
       AND v.status = 'ACCEPTED'
       AND o.payment_model = 'SUCCESS_FEE'
       AND o.state = 'ACCEPTED_SUCCESS_FEE'
       AND o.amount_minor = v.total_amount_minor
       AND o.currency = v.currency
       AND o.tax_behaviour = v.tax_behaviour
       AND o.tax_amount_minor = v.tax_amount_minor
       AND b.kind = 'SUCCESS_FEE'
       AND b.state = 'PAID'
       AND b.amount_minor = o.amount_minor
       AND b.currency = o.currency
       AND b.tax_behaviour = o.tax_behaviour
       AND b.tax_amount_minor = o.tax_amount_minor
       AND a.case_id = p_case.id
       AND a.service_order_id = o.id
       AND a.quote_version_id = o.quote_version_id
       AND a.outcome = p_outcome
       AND EXISTS (
         SELECT 1 FROM public.payment_receipts r
          WHERE r.obligation_id = b.id
            AND r.service_order_id = o.id
            AND r.customer_id = p_case.customer_id
            AND r.amount_minor = b.amount_minor
            AND r.currency = b.currency
            AND r.tax_behaviour = b.tax_behaviour
            AND r.tax_amount_minor = b.tax_amount_minor
       );
    RETURN settled = 1;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.case_close_billing_ready_v1(public.cases, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_case_command_v1(p_token text,p_request uuid,p_case uuid,p_version integer,p_operation text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;c public.cases;t public.case_tasks; r admin_private.case_command_receipts; fp text; result jsonb; note text; vis text:='INTERNAL'; target text; outcome_value text; due timestamptz; now_time timestamptz:=now(); event_details jsonb:='{}';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_operation IS NULL OR p_operation NOT IN ('plan','transition','note','task','resolve_task','submission','resolve_submission','record_outcome','close','reopen') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 note:=p_data->>'note'; IF note IS NULL OR length(btrim(note))<10 OR length(note)>1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 fp:=md5(jsonb_build_array(p_case,p_version,p_operation,p_data)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id=p_request;
 IF r.request_id IS NOT NULL THEN
  IF r.actor_id=(s->>'userId')::uuid AND r.fingerprint=fp THEN RETURN r.response; ELSE RETURN jsonb_build_object('status','conflict'); END IF;
 END IF;
 SELECT * INTO c FROM public.cases WHERE id=p_case FOR UPDATE;
 IF c.id IS NULL OR c.workflow_version<>p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
 IF c.status IN ('CLOSED','CANCELLED') AND p_operation<>'reopen' THEN RETURN jsonb_build_object('status','denied'); END IF;
 IF p_operation='plan' THEN
  IF p_data - ARRAY['note','track','priority','assigned','nextAction','due','firstResponseDue'] <> '{}'::jsonb OR p_data->>'track' IS NULL OR p_data->>'track' NOT IN ('UNDECIDED','GUIDED','MANAGED') OR p_data->>'priority' IS NULL OR p_data->>'priority' NOT IN ('NORMAL','HIGH','URGENT') OR jsonb_typeof(p_data->'assigned') IS DISTINCT FROM 'boolean' OR p_data->>'nextAction' IS NULL OR length(p_data->>'nextAction')>1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF c.service_track<>p_data->>'track' AND (c.work_stage NOT IN ('INITIAL_REVIEW','EVIDENCE_COLLECTION','ASSESSMENT_READY','SERVICE_SELECTION') OR EXISTS(SELECT 1 FROM public.case_submissions WHERE case_id=c.id)) THEN RETURN jsonb_build_object('status','denied'); END IF;
  due:=NULLIF(p_data->>'due','')::timestamptz;
  IF c.work_stage IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION','WAITING_GOOGLE') AND (due IS NULL OR length(btrim(p_data->>'nextAction'))<3) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  UPDATE public.cases SET service_track=p_data->>'track',priority=p_data->>'priority',priority_reason=note,assigned=(p_data->>'assigned')::boolean,next_action=p_data->>'nextAction',next_action_at=due,first_response_due_at=NULLIF(p_data->>'firstResponseDue','')::timestamptz WHERE id=c.id;
 ELSIF p_operation='transition' THEN
  target:=p_data->>'target';due:=NULLIF(p_data->>'due','')::timestamptz;
  IF p_data - ARRAY['note','target','nextAction','due'] <> '{}'::jsonb OR NOT EXISTS(SELECT 1 FROM admin_private.case_transitions WHERE from_stage=c.work_stage AND to_stage=target) THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF (target='PAYMENT_REQUIRED' AND c.service_track<>'GUIDED') OR (target='AUTHORIZATION_REQUIRED' AND c.service_track<>'MANAGED') THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF target IN ('PREPARATION','READY_TO_SUBMIT') AND NOT admin_private.case_stage_ready_v1(c, target) THEN RETURN jsonb_build_object('status','prerequisite'); END IF;
  IF target IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION','WAITING_GOOGLE') AND (due IS NULL OR coalesce(length(btrim(p_data->>'nextAction')),0)<3) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF coalesce(length(p_data->>'nextAction'),0)>1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  UPDATE public.cases SET work_stage=target,status=CASE WHEN target IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION') THEN 'AWAITING_CUSTOMER' ELSE 'UNDER_REVIEW' END,next_action=coalesce(p_data->>'nextAction',''),next_action_at=due WHERE id=c.id;
  IF target IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION','WAITING_GOOGLE') THEN
   INSERT INTO public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy) VALUES(c.id,left(p_data->>'nextAction',200),CASE WHEN target='WAITING_GOOGLE' THEN 'ADMIN' ELSE 'CUSTOMER' END,'FOLLOW_UP',due,'Internal follow-up; not a Google deadline','UTC','MANUAL_QUEUE');
  END IF;
  event_details:=jsonb_build_object('from',c.work_stage,'to',target);
 ELSIF p_operation='note' THEN
  IF p_data - ARRAY['note','visibility'] <> '{}'::jsonb OR p_data->>'visibility' IS NULL OR p_data->>'visibility' NOT IN ('INTERNAL','CUSTOMER') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  vis:=p_data->>'visibility';
  UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id;
 ELSIF p_operation IN ('task','reopen') THEN
  IF p_data - ARRAY['note','title','owner','kind','due','source','timezone'] <> '{}'::jsonb OR coalesce(length(btrim(p_data->>'title')),0) NOT BETWEEN 3 AND 200 OR p_data->>'owner' IS NULL OR p_data->>'owner' NOT IN ('ADMIN','CUSTOMER') OR p_data->>'kind' IS NULL OR p_data->>'kind' NOT IN ('FOLLOW_UP','EVIDENCE','CALL','COMPLAINT','CANCELLATION','OTHER') OR coalesce(length(btrim(p_data->>'source')),0) NOT BETWEEN 3 AND 500 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_data->>'timezone') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  due:=(p_data->>'due')::timestamptz;IF due IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_operation='reopen' AND c.status NOT IN ('CLOSED','CANCELLED') THEN RETURN jsonb_build_object('status','denied'); END IF;
  INSERT INTO public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy) VALUES(c.id,p_data->>'title',p_data->>'owner',p_data->>'kind',due,p_data->>'source',p_data->>'timezone','MANUAL_QUEUE');
  IF p_operation='reopen' THEN
   UPDATE public.cases SET status='UNDER_REVIEW',work_stage='FURTHER_REVIEW',outcome=NULL,closed_at=NULL,closure_summary='',assigned=true,next_action=p_data->>'title',next_action_at=due WHERE id=c.id;
   event_details:=jsonb_build_object('previousOutcome',c.outcome,'previousSummary',c.closure_summary);
  ELSE UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id; END IF;
 ELSIF p_operation='resolve_task' THEN
  IF p_data - ARRAY['note','taskId','status'] <> '{}'::jsonb OR p_data->>'status' IS NULL OR p_data->>'status' NOT IN ('DONE','CANCELLED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO t FROM public.case_tasks WHERE id=(p_data->>'taskId')::uuid AND case_id=c.id AND status='OPEN';
  IF t.id IS NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
  UPDATE public.case_tasks SET status=p_data->>'status',resolution=note,resolved_at=now_time WHERE id=t.id;
  UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id;event_details:=jsonb_build_object('taskId',t.id,'status',p_data->>'status');
 ELSIF p_operation='submission' THEN
  IF p_data - ARRAY['note','submittedAt','reference','channel','evidence','confirmed'] <> '{}'::jsonb OR p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb OR c.service_track='UNDECIDED' OR c.work_stage NOT IN ('SERVICE_SELECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','READY_TO_SUBMIT','FURTHER_REVIEW') OR coalesce(length(btrim(p_data->>'reference')),0) NOT BETWEEN 1 AND 200 OR coalesce(length(btrim(p_data->>'channel')),0) NOT BETWEEN 3 AND 200 OR coalesce(length(btrim(p_data->>'evidence')),0) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  due:=(p_data->>'submittedAt')::timestamptz;
  IF due IS NULL OR due>now_time OR due<c.created_at THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF EXISTS(SELECT 1 FROM public.case_submissions a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.case_submission_results b WHERE b.submission_id=a.id)) THEN RETURN jsonb_build_object('status','open_work'); END IF;
  INSERT INTO public.case_submissions(case_id,actor,track,submitted_at,google_reference,channel,evidence,recorded_by) VALUES(c.id,CASE WHEN c.service_track='GUIDED' THEN 'CUSTOMER' ELSE 'ADMIN' END,c.service_track,due,p_data->>'reference',p_data->>'channel',p_data->>'evidence',(s->>'userId')::uuid);
  UPDATE public.cases SET work_stage='SUBMITTED',status='UNDER_REVIEW' WHERE id=c.id;
  event_details:=jsonb_build_object('actor',CASE WHEN c.service_track='GUIDED' THEN 'CUSTOMER' ELSE 'ADMIN' END,'recordedOnly',true);
 ELSIF p_operation='resolve_submission' THEN
  IF p_data - ARRAY['note','submissionId','result'] <> '{}'::jsonb OR p_data->>'result' IS NULL OR p_data->>'result' NOT IN ('DECIDED','WITHDRAWN') OR NOT EXISTS(SELECT 1 FROM public.case_submissions WHERE id=(p_data->>'submissionId')::uuid AND case_id=c.id) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  INSERT INTO public.case_submission_results(submission_id,result,note,recorded_by) VALUES((p_data->>'submissionId')::uuid,p_data->>'result',note,(s->>'userId')::uuid);
  UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id;
 ELSIF p_operation='record_outcome' THEN
  outcome_value:=p_data->>'outcome';
  IF p_data - ARRAY['note','outcome','summary'] <> '{}'::jsonb OR coalesce(length(btrim(p_data->>'summary')),0) NOT BETWEEN 10 AND 2000 OR outcome_value IS NULL OR NOT ((c.case_type='PROFILE_RECOVERY' AND outcome_value IN ('RESTORED','PARTIALLY_RESTORED','NOT_RESTORED','WITHDRAWN')) OR (c.case_type='REVIEW_PROTECTION' AND outcome_value IN ('REMOVED','NOT_REMOVED','RESPONSE_RECOMMENDED','WITHDRAWN'))) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF c.work_stage='FINISHED' OR (outcome_value<>'WITHDRAWN' AND c.work_stage<>'OUTCOME_REVIEW') THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF c.outcome IS NOT NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
  UPDATE public.cases SET outcome=outcome_value, closure_summary=p_data->>'summary' WHERE id=c.id;
  event_details:=jsonb_build_object('outcome',outcome_value,'summary',p_data->>'summary','closesCase',false);
 ELSIF p_operation='close' THEN
  outcome_value:=p_data->>'outcome';
  IF p_data - ARRAY['note','outcome','summary'] <> '{}'::jsonb OR coalesce(length(btrim(p_data->>'summary')),0) NOT BETWEEN 10 AND 2000 OR outcome_value IS NULL OR NOT ((c.case_type='PROFILE_RECOVERY' AND outcome_value IN ('RESTORED','PARTIALLY_RESTORED','NOT_RESTORED','WITHDRAWN')) OR (c.case_type='REVIEW_PROTECTION' AND outcome_value IN ('REMOVED','NOT_REMOVED','RESPONSE_RECOMMENDED','WITHDRAWN'))) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF outcome_value<>'WITHDRAWN' AND c.work_stage<>'OUTCOME_REVIEW' THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF c.outcome IS NOT NULL AND (c.outcome IS DISTINCT FROM outcome_value OR c.closure_summary IS DISTINCT FROM p_data->>'summary') THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF EXISTS(SELECT 1 FROM public.case_tasks WHERE case_id=c.id AND status='OPEN') OR EXISTS(SELECT 1 FROM public.case_submissions a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.case_submission_results b WHERE b.submission_id=a.id)) THEN RETURN jsonb_build_object('status','open_work'); END IF;
  IF NOT admin_private.case_close_billing_ready_v1(c, outcome_value) THEN RETURN jsonb_build_object('status','prerequisite'); END IF;
  UPDATE public.cases SET status=CASE WHEN outcome_value='WITHDRAWN' THEN 'CANCELLED' ELSE 'CLOSED' END,work_stage='FINISHED',outcome=outcome_value,closure_summary=p_data->>'summary',closed_at=now_time,next_action='',next_action_at=NULL WHERE id=c.id;
  event_details:=jsonb_build_object('outcome',outcome_value,'summary',p_data->>'summary');
 END IF;
 INSERT INTO public.case_work_events(case_id,actor_id,event,note,visibility,details) VALUES(c.id,(s->>'userId')::uuid,p_operation,note,vis,event_details);
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'CASE_CHANGED','success',c.id,p_request,'case',note,jsonb_build_object('operation',p_operation,'previousVersion',p_version));
 result:=jsonb_build_object('status','success','id',c.id);
 INSERT INTO admin_private.case_command_receipts VALUES(p_request,(s->>'userId')::uuid,fp,result,now_time);
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR unique_violation THEN RETURN jsonb_build_object('status','invalid');
END; $$;

COMMIT;
