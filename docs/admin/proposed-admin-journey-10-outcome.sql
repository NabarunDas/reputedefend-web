-- ADMIN-JOURNEY-10 proposed SQL. NOT A MIGRATION.
-- Superseded by supabase/migrations/20261019183000_admin_journey_10b_record_outcome_v1.sql.
-- Do not copy this file into supabase/migrations and do not apply it.
-- The migration is not applied to DEV (rmzozuiamjcclvtgutgd) or Production (cxwwekdzkkjjbiyofrov).
-- The migration adds one guard this file does not have: when an outcome is already
-- stored, close also refuses a different closure_summary. Repeat both values exactly.
-- Reopen is the correction path. It clears the outcome and the summary.

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
  IF c.outcome IS NOT NULL AND c.outcome IS DISTINCT FROM outcome_value THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF EXISTS(SELECT 1 FROM public.case_tasks WHERE case_id=c.id AND status='OPEN') OR EXISTS(SELECT 1 FROM public.case_submissions a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.case_submission_results b WHERE b.submission_id=a.id)) THEN RETURN jsonb_build_object('status','open_work'); END IF;
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
