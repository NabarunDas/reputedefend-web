BEGIN;
ALTER TABLE public.cases
 ADD COLUMN work_stage text NOT NULL DEFAULT 'INITIAL_REVIEW',
 ADD COLUMN service_track text NOT NULL DEFAULT 'UNDECIDED' CHECK(service_track IN ('UNDECIDED','GUIDED','MANAGED')),
 ADD COLUMN outcome text,
 ADD COLUMN workflow_version integer NOT NULL DEFAULT 1,
 ADD COLUMN assigned boolean NOT NULL DEFAULT false,
 ADD COLUMN priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','HIGH','URGENT')),
 ADD COLUMN priority_reason text NOT NULL DEFAULT '',
 ADD COLUMN next_action text NOT NULL DEFAULT '',
 ADD COLUMN next_action_at timestamptz,
 ADD COLUMN first_response_due_at timestamptz,
 ADD COLUMN closure_summary text NOT NULL DEFAULT '';
UPDATE public.cases SET work_stage='FINISHED' WHERE status IN ('CLOSED','CANCELLED');
ALTER TABLE public.cases ADD CONSTRAINT cases_work_stage_allowed CHECK(work_stage IN ('INITIAL_REVIEW','EVIDENCE_COLLECTION','ASSESSMENT_READY','SERVICE_SELECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','PREPARATION','READY_TO_SUBMIT','SUBMITTED','WAITING_GOOGLE','OWNER_ACTION','FURTHER_REVIEW','OUTCOME_REVIEW','FINISHED'));
CREATE FUNCTION admin_private.bump_case_workflow_version_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.workflow_version:=OLD.workflow_version+1; RETURN NEW; END; $$;
CREATE TRIGGER cases_workflow_version BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION admin_private.bump_case_workflow_version_v1();
REVOKE ALL ON FUNCTION admin_private.bump_case_workflow_version_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX cases_work_queue_idx ON public.cases(created_at DESC,id DESC);
CREATE INDEX cases_next_action_idx ON public.cases(next_action_at) WHERE status NOT IN ('CLOSED','CANCELLED');
CREATE TABLE public.case_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 200), owner text NOT NULL CHECK(owner IN ('ADMIN','CUSTOMER')),
 kind text NOT NULL CHECK(kind IN ('FOLLOW_UP','EVIDENCE','CALL','COMPLAINT','CANCELLATION','OTHER')),
 due_at timestamptz NOT NULL, deadline_source text NOT NULL CHECK(length(btrim(deadline_source)) BETWEEN 3 AND 500),
 deadline_timezone text NOT NULL, reminder_policy text NOT NULL CHECK(reminder_policy='MANUAL_QUEUE'),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','DONE','CANCELLED')),
 resolution text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX case_tasks_case_idx ON public.case_tasks(case_id,created_at,id);
CREATE INDEX case_tasks_due_idx ON public.case_tasks(due_at,id) WHERE status='OPEN';
CREATE TABLE public.case_work_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL, event text NOT NULL, note text NOT NULL CHECK(length(note) BETWEEN 10 AND 4000),
 visibility text NOT NULL DEFAULT 'INTERNAL' CHECK(visibility IN ('INTERNAL','CUSTOMER')),
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_work_events_case_idx ON public.case_work_events(case_id,id DESC);
CREATE TABLE public.case_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
 actor text NOT NULL CHECK(actor IN ('CUSTOMER','ADMIN')), track text NOT NULL CHECK(track IN ('GUIDED','MANAGED')),
 submitted_at timestamptz NOT NULL,google_reference text NOT NULL CHECK(length(google_reference) BETWEEN 1 AND 200),
 channel text NOT NULL CHECK(length(channel) BETWEEN 3 AND 200),evidence text NOT NULL CHECK(length(evidence) BETWEEN 10 AND 2000),
 recorded_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_submissions_case_idx ON public.case_submissions(case_id,created_at,id);
CREATE TABLE public.case_submission_results (
 submission_id uuid PRIMARY KEY REFERENCES public.case_submissions(id) ON DELETE RESTRICT,
 result text NOT NULL CHECK(result IN ('DECIDED','WITHDRAWN')),note text NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),
 recorded_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_private.case_command_receipts (
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL, fingerprint text NOT NULL, response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.case_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_work_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_submission_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.case_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.case_work_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE admin_private.case_transitions (from_stage text NOT NULL,to_stage text NOT NULL,PRIMARY KEY(from_stage,to_stage));
ALTER TABLE admin_private.case_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.case_transitions FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO admin_private.case_transitions VALUES
 ('INITIAL_REVIEW','EVIDENCE_COLLECTION'),('INITIAL_REVIEW','ASSESSMENT_READY'),
 ('EVIDENCE_COLLECTION','ASSESSMENT_READY'),('ASSESSMENT_READY','EVIDENCE_COLLECTION'),('ASSESSMENT_READY','SERVICE_SELECTION'),
 ('SERVICE_SELECTION','PAYMENT_REQUIRED'),('SERVICE_SELECTION','AUTHORIZATION_REQUIRED'),
 ('PAYMENT_REQUIRED','PREPARATION'),('AUTHORIZATION_REQUIRED','PREPARATION'),
 ('PREPARATION','EVIDENCE_COLLECTION'),('PREPARATION','READY_TO_SUBMIT'),
 ('SUBMITTED','WAITING_GOOGLE'),('SUBMITTED','OUTCOME_REVIEW'),('WAITING_GOOGLE','OWNER_ACTION'),('WAITING_GOOGLE','FURTHER_REVIEW'),('WAITING_GOOGLE','OUTCOME_REVIEW'),
 ('OWNER_ACTION','FURTHER_REVIEW'),('OWNER_ACTION','WAITING_GOOGLE'),('FURTHER_REVIEW','PREPARATION'),('FURTHER_REVIEW','OUTCOME_REVIEW'),('OUTCOME_REVIEW','FURTHER_REVIEW');
CREATE FUNCTION public.admin_case_command_v1(p_token text,p_request uuid,p_case uuid,p_version integer,p_operation text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;c public.cases;t public.case_tasks; r admin_private.case_command_receipts; fp text; result jsonb; note text; vis text:='INTERNAL'; target text; outcome_value text; due timestamptz; now_time timestamptz:=now(); event_details jsonb:='{}';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_operation IS NULL OR p_operation NOT IN ('plan','transition','note','task','resolve_task','submission','resolve_submission','close','reopen') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
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
 -- All operations lock the same case row: task, submission and closure races serialize.
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
  -- Payment, permission and pack approval gates are activated by later stages; a workflow dropdown cannot bypass them.
  IF target IN ('PREPARATION','READY_TO_SUBMIT') THEN RETURN jsonb_build_object('status','prerequisite'); END IF;
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
  -- Record an action already completed outside this portal; this command never submits to Google.
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
 ELSIF p_operation='close' THEN
  outcome_value:=p_data->>'outcome';
  IF p_data - ARRAY['note','outcome','summary'] <> '{}'::jsonb OR coalesce(length(btrim(p_data->>'summary')),0) NOT BETWEEN 10 AND 2000 OR outcome_value IS NULL OR NOT ((c.case_type='PROFILE_RECOVERY' AND outcome_value IN ('RESTORED','PARTIALLY_RESTORED','NOT_RESTORED','WITHDRAWN')) OR (c.case_type='REVIEW_PROTECTION' AND outcome_value IN ('REMOVED','NOT_REMOVED','RESPONSE_RECOMMENDED','WITHDRAWN'))) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF outcome_value<>'WITHDRAWN' AND c.work_stage<>'OUTCOME_REVIEW' THEN RETURN jsonb_build_object('status','denied'); END IF;
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
CREATE FUNCTION public.admin_case_list_v1(p_token text,p_query text DEFAULT '',p_filter text DEFAULT 'open',p_before_time timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF p_query IS NULL OR length(p_query)>100 OR p_filter IS NULL OR p_filter NOT IN ('all','open','closed','unassigned','overdue','GUIDED','MANAGED') OR (p_before_time IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid case filter'; END IF;
 SELECT coalesce(jsonb_agg(x.data ORDER BY x.created_at DESC,x.id DESC),'[]') INTO result FROM (
 SELECT c.id,c.created_at,jsonb_build_object('id',c.id,'reference',c.public_ref,'type',c.case_type,'stage',c.work_stage,'status',c.status,'track',c.service_track,'client',u.full_name,'business',b.display_name,'assigned',c.assigned,'priority',c.priority,'nextAction',c.next_action,'due',c.next_action_at,'createdAt',c.created_at) data
 FROM public.cases c JOIN public.customers u ON u.id=c.customer_id JOIN public.businesses b ON b.id=c.business_id
 WHERE (p_query='' OR strpos(lower(c.public_ref||' '||u.full_name||' '||u.email||' '||b.display_name),lower(p_query))>0)
 AND (p_filter='all' OR (p_filter='open' AND c.status NOT IN ('CLOSED','CANCELLED')) OR (p_filter='closed' AND c.status IN ('CLOSED','CANCELLED')) OR (p_filter='unassigned' AND NOT c.assigned AND c.status NOT IN ('CLOSED','CANCELLED')) OR (p_filter='overdue' AND c.status NOT IN ('CLOSED','CANCELLED') AND (c.next_action_at<now() OR EXISTS(SELECT 1 FROM public.case_tasks t WHERE t.case_id=c.id AND t.status='OPEN' AND t.due_at<now()))) OR c.service_track=p_filter)
 AND (p_before_time IS NULL OR (c.created_at,c.id)<(p_before_time,p_before_id)) ORDER BY c.created_at DESC,c.id DESC LIMIT 51) x;
 RETURN result;
END; $$;
CREATE FUNCTION public.admin_case_detail_v1(p_token text,p_id uuid,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cases; result jsonb; events jsonb; transitions jsonb;tasks jsonb;submissions jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.cases WHERE id=p_id;IF c.id IS NULL THEN RETURN jsonb_build_object('missing',true); END IF;
 SELECT coalesce(jsonb_agg(to_stage ORDER BY to_stage),'[]') INTO transitions FROM admin_private.case_transitions WHERE from_stage=c.work_stage;
 SELECT coalesce(jsonb_agg(x.data ORDER BY x.id DESC),'[]') INTO events FROM (SELECT id,jsonb_build_object('id',id::text,'event',event,'note',note,'visibility',visibility,'details',details,'createdAt',created_at) data FROM public.case_work_events WHERE case_id=p_id AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 51) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'owner',owner,'kind',kind,'due',due_at,'source',deadline_source,'timezone',deadline_timezone,'status',status,'resolution',resolution) ORDER BY due_at,id),'[]') INTO tasks FROM public.case_tasks WHERE case_id=p_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor',a.actor,'track',a.track,'submittedAt',a.submitted_at,'reference',a.google_reference,'channel',a.channel,'evidence',a.evidence,'result',b.result,'resultNote',b.note) ORDER BY a.created_at,a.id),'[]') INTO submissions FROM public.case_submissions a LEFT JOIN public.case_submission_results b ON b.submission_id=a.id WHERE a.case_id=p_id;
 SELECT jsonb_build_object('id',c.id,'reference',c.public_ref,'type',c.case_type,'status',c.status,'stage',c.work_stage,'track',c.service_track,'version',c.workflow_version,'outcome',c.outcome,'summary',c.closure_summary,'assigned',c.assigned,'priority',c.priority,'priorityReason',c.priority_reason,'nextAction',c.next_action,'due',c.next_action_at,'firstResponseDue',c.first_response_due_at,'issue',c.issue_description,'reviewUrl',c.review_url,'customerId',c.customer_id,'businessId',c.business_id,'locationId',c.location_id,'createdAt',c.created_at,'client',u.full_name,'business',b.display_name,'events',events,'tasks',tasks,'submissions',submissions,'transitions',transitions,
 'customerPreview',jsonb_build_object('reference',c.public_ref,'type',c.case_type,'summary',c.closure_summary,'notes',coalesce((SELECT jsonb_agg(x.note ORDER BY x.id) FROM (SELECT id,note FROM public.case_work_events WHERE case_id=p_id AND visibility='CUSTOMER' ORDER BY id DESC LIMIT 100) x),'[]')))
 INTO result FROM public.customers u,public.businesses b WHERE u.id=c.customer_id AND b.id=c.business_id;
 RETURN result;
END; $$;
CREATE FUNCTION public.admin_task_list_v1(p_token text,p_filter text DEFAULT 'open',p_before_time timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF p_filter IS NULL OR p_filter NOT IN ('open','overdue','customer','admin','resolved') OR (p_before_time IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid task filter'; END IF;
 SELECT coalesce(jsonb_agg(x.data ORDER BY x.due_at,x.id),'[]') INTO result FROM (
 SELECT t.id,t.due_at,jsonb_build_object('id',t.id,'caseId',t.case_id,'reference',c.public_ref,'title',t.title,'owner',t.owner,'kind',t.kind,'due',t.due_at,'status',t.status) data
 FROM public.case_tasks t JOIN public.cases c ON c.id=t.case_id
 WHERE ((p_filter='resolved' AND t.status<>'OPEN') OR (t.status='OPEN' AND (p_filter='open' OR (p_filter='overdue' AND t.due_at<now()) OR (p_filter='customer' AND t.owner='CUSTOMER') OR (p_filter='admin' AND t.owner='ADMIN'))))
 AND (p_before_time IS NULL OR (t.due_at,t.id)>(p_before_time,p_before_id)) ORDER BY t.due_at,t.id LIMIT 51) x;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_case_command_v1(text,uuid,uuid,integer,text,jsonb),public.admin_case_list_v1(text,text,text,timestamptz,uuid),public.admin_case_detail_v1(text,uuid,bigint),public.admin_task_list_v1(text,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_command_v1(text,uuid,uuid,integer,text,jsonb),public.admin_case_list_v1(text,text,text,timestamptz,uuid),public.admin_case_detail_v1(text,uuid,bigint),public.admin_task_list_v1(text,text,timestamptz,uuid) TO service_role;
ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK(action IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED'));
CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text,p_before bigint DEFAULT NULL,p_action text DEFAULT NULL,p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF (p_before IS NOT NULL AND p_before<1)
 OR (p_action IS NOT NULL AND p_action NOT IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED'))
 OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required')) THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'createdAt',e.created_at,'action',e.action,'outcome',e.outcome,'targetId',e.target_id,'requestId',e.request_id,'entity',e.entity,'reason',e.reason,'details',e.details) ORDER BY e.id DESC),'[]') INTO result
 FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id<p_before) AND (p_action IS NULL OR action=p_action) AND (p_outcome IS NULL OR outcome=p_outcome) ORDER BY id DESC LIMIT 51) e;
 RETURN result;
END;
$$;
COMMIT;
