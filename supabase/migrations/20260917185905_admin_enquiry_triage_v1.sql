BEGIN;
CREATE TABLE public.enquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_key uuid UNIQUE NOT NULL,
 fingerprint text NOT NULL,
 source text NOT NULL CHECK(source IN ('contact','homepage','phone')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=32768),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','open','waiting','closed','spam','converted')),
 assigned boolean NOT NULL DEFAULT false,
 next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=1000),
 next_action_at timestamptz,
 record_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 notification_attempt uuid,
 internal_status text NOT NULL CHECK(internal_status IN ('SENDING','SENT','FAILED','UNKNOWN','SKIPPED')),
 ack_status text NOT NULL CHECK(ack_status IN ('SENDING','SENT','FAILED','UNKNOWN','SKIPPED')),
 notification_updated_at timestamptz,
 case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
 monitoring_request_id uuid REFERENCES public.monitoring_requests(id) ON DELETE RESTRICT,
 conversion_fingerprint text,
 CHECK(num_nonnulls(case_id,monitoring_request_id)<=1),
 CHECK((status='converted')=(num_nonnulls(case_id,monitoring_request_id)=1)),
 CHECK(status<>'waiting' OR (length(btrim(next_action))>0 AND next_action_at IS NOT NULL))
);
CREATE INDEX enquiries_queue_idx ON public.enquiries(status,created_at DESC,id DESC);
CREATE INDEX enquiries_created_idx ON public.enquiries(created_at DESC,id DESC);
CREATE TABLE public.enquiry_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE RESTRICT,
 actor_id uuid,
 event text NOT NULL CHECK(event IN ('received','triaged','converted')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiry_events_parent_idx ON public.enquiry_events(enquiry_id,id DESC);
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enquiries,public.enquiry_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.enquiry_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK(action IN
 ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED'));
ALTER TABLE public.monitoring_requests DROP CONSTRAINT monitoring_requests_source_allowed;
ALTER TABLE public.monitoring_requests ADD CONSTRAINT monitoring_requests_source_allowed CHECK(source IN ('START_MONITORING','ADMIN_ENQUIRY'));

CREATE FUNCTION admin_private.valid_enquiry_v1(p_data jsonb,p_manual boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; value text;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>32768
 OR (p_data - ARRAY['fullName','email','phone','businessName','country','service','subject','details','websiteUrl','businessProfileUrl','reviewUrl','informationAccurate','privacyAccepted','source'])<>'{}'::jsonb THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['fullName','email','phone','businessName','country','service','subject','details','websiteUrl','businessProfileUrl','reviewUrl','source'] LOOP
 IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 END LOOP;
 IF length(btrim(p_data->>'fullName')) NOT BETWEEN 1 AND 100 OR length(p_data->>'email')>254 OR length(p_data->>'phone')>40
 OR length(btrim(p_data->>'details')) NOT BETWEEN 1 AND 5000 OR length(p_data->>'businessName')>160 OR length(p_data->>'country')>80 OR length(p_data->>'subject')>64 OR length(p_data->>'service')>64 THEN RETURN false; END IF;
 IF p_manual THEN
  IF p_data->>'source'<>'phone' OR (p_data->>'email'='' AND length(btrim(p_data->>'phone'))<7) THEN RETURN false; END IF;
 ELSE
  IF p_data->>'source' NOT IN ('homepage','contact') OR p_data->>'email'='' THEN RETURN false; END IF;
 END IF;
 IF p_data->>'email'<>'' AND (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['websiteUrl','businessProfileUrl','reviewUrl'] LOOP
 value:=p_data->>k; IF length(value)>1000 OR (value<>'' AND value !~ '^https?://[^[:space:]]+$') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$$;

CREATE FUNCTION public.create_general_enquiry_v1(p_key uuid,p_data jsonb,p_ack boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.enquiries; fingerprint text;
BEGIN
 IF p_key IS NULL OR p_ack IS NULL OR NOT admin_private.valid_enquiry_v1(p_data,false) THEN RETURN jsonb_build_object('status','invalid'); END IF;
 fingerprint:=md5(p_data::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 SELECT * INTO e FROM public.enquiries WHERE submission_key=p_key;
 IF e.id IS NOT NULL THEN
  IF e.fingerprint<>fingerprint OR e.source='phone' THEN RETURN jsonb_build_object('status','conflict'); END IF;
  RETURN jsonb_build_object('status','existing');
 END IF;
 INSERT INTO public.enquiries(submission_key,fingerprint,source,payload,notification_attempt,internal_status,ack_status)
 VALUES(p_key,fingerprint,p_data->>'source',p_data,gen_random_uuid(),'SENDING',CASE WHEN p_ack THEN 'SENDING' ELSE 'SKIPPED' END) RETURNING * INTO e;
 INSERT INTO public.enquiry_events(enquiry_id,event) VALUES(e.id,'received');
 RETURN jsonb_build_object('status','created','id',e.id,'attempt',e.notification_attempt,'sendAck',p_ack);
END;
$$;
CREATE FUNCTION public.finish_general_enquiry_notification_v1(p_id uuid,p_attempt uuid,p_internal text,p_ack text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_internal IS NULL OR p_internal NOT IN ('SENT','FAILED','UNKNOWN') OR p_ack IS NULL OR p_ack NOT IN ('SENT','FAILED','UNKNOWN','SKIPPED') THEN RETURN false; END IF;
 UPDATE public.enquiries SET internal_status=p_internal,ack_status=CASE WHEN ack_status='SKIPPED' THEN 'SKIPPED' ELSE p_ack END,notification_updated_at=now()
 WHERE id=p_id AND notification_attempt=p_attempt AND internal_status='SENDING';
 RETURN FOUND;
END;
$$;

CREATE FUNCTION public.admin_enquiry_list_v1(p_token text,p_status text DEFAULT 'active',p_search text DEFAULT '',p_before_time timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_filter text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF p_status IS NULL OR p_status NOT IN ('active','all','new','open','waiting','closed','spam','converted') OR p_search IS NULL OR length(p_search)>100
 OR p_filter IS NULL OR p_filter NOT IN ('all','unassigned','assigned','email','overdue') OR (p_before_time IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid enquiry filters'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC,x.id DESC),'[]'::jsonb) INTO result FROM
 (SELECT e.id,e.payload->>'fullName' AS name,e.payload->>'email' AS email,e.payload->>'businessName' AS business,e.payload->>'subject' AS subject,e.source,e.status,e.assigned,e.created_at AS "createdAt",e.next_action_at AS "nextActionAt",e.internal_status AS "internalStatus",e.ack_status AS "ackStatus"
 FROM public.enquiries e WHERE (p_status='all' OR (p_status='active' AND e.status IN ('new','open','waiting')) OR e.status=p_status)
 AND (p_search='' OR strpos(lower(e.payload->>'fullName'||' '||(e.payload->>'email')||' '||(e.payload->>'phone')||' '||(e.payload->>'businessName')),lower(p_search))>0)
 AND (p_before_time IS NULL OR (e.created_at,e.id)<(p_before_time,p_before_id))
 AND (p_filter='all' OR (p_filter='unassigned' AND NOT e.assigned) OR (p_filter='assigned' AND e.assigned)
 OR (p_filter='email' AND (e.internal_status IN ('SENDING','FAILED','UNKNOWN') OR e.ack_status IN ('SENDING','FAILED','UNKNOWN')))
 OR (p_filter='overdue' AND e.status IN ('new','open','waiting') AND e.next_action_at<now()))
 ORDER BY e.created_at DESC,e.id DESC LIMIT 51) x;
 RETURN result;
END;
$$;
CREATE FUNCTION public.admin_enquiry_detail_v1(p_token text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.enquiries; events jsonb; ref text;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO e FROM public.enquiries WHERE id=p_id;
 IF e.id IS NULL THEN RETURN jsonb_build_object('missing',true); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sort_id DESC),'[]') INTO events FROM
 (SELECT id::text,id AS sort_id,event,note,created_at AS "createdAt" FROM public.enquiry_events WHERE enquiry_id=p_id ORDER BY id DESC LIMIT 100) x;
 SELECT public_ref INTO ref FROM public.cases WHERE id=e.case_id;
 RETURN jsonb_build_object('id',e.id,'payload',e.payload,'source',e.source,'status',e.status,'assigned',e.assigned,'version',e.record_version,'createdAt',e.created_at,'nextAction',e.next_action,'nextActionAt',e.next_action_at,'internalStatus',e.internal_status,'ackStatus',e.ack_status,'caseRef',ref,'caseId',e.case_id,'monitoringId',e.monitoring_request_id,'events',events);
END;
$$;
CREATE FUNCTION public.admin_enquiry_create_v1(p_token text,p_key uuid,p_data jsonb,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; e public.enquiries; fingerprint text;
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_key IS NULL OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 1000 OR NOT admin_private.valid_enquiry_v1(p_data,true) THEN RETURN jsonb_build_object('status','invalid'); END IF;
 fingerprint:=md5(jsonb_build_object('data',p_data,'note',p_note)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 SELECT * INTO e FROM public.enquiries WHERE submission_key=p_key;
 IF e.id IS NOT NULL THEN
 IF e.fingerprint=fingerprint AND e.source='phone' THEN RETURN jsonb_build_object('status','success','id',e.id); ELSE RETURN jsonb_build_object('status','conflict'); END IF;
 END IF;
 INSERT INTO public.enquiries(submission_key,fingerprint,source,payload,assigned,internal_status,ack_status)
 VALUES(p_key,fingerprint,'phone',p_data,true,'SKIPPED','SKIPPED') RETURNING * INTO e;
 INSERT INTO public.enquiry_events(enquiry_id,actor_id,event,note) VALUES(e.id,(s->>'userId')::uuid,'received',p_note);
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'ENQUIRY_CREATED','success',e.id,p_key,'enquiry',p_note,'{}');
 RETURN jsonb_build_object('status','success','id',e.id);
END;
$$;
CREATE FUNCTION public.admin_enquiry_triage_v1(p_token text,p_id uuid,p_version integer,p_status text,p_assigned boolean,p_next text,p_due timestamptz,p_note text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; e public.enquiries; outcome text:='success';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_status IS NULL OR p_status NOT IN ('new','open','waiting','closed','spam') OR p_assigned IS NULL OR p_next IS NULL OR length(p_next)>1000 OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 1000 OR p_request IS NULL
 OR (p_status='waiting' AND (length(btrim(p_next))=0 OR p_due IS NULL)) OR (p_due IS NOT NULL AND length(btrim(p_next))=0) THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT * INTO e FROM public.enquiries WHERE id=p_id FOR UPDATE;
 IF e.id IS NULL OR e.record_version IS DISTINCT FROM p_version THEN outcome:='conflict';
 ELSIF e.status='converted' THEN outcome:='denied';
 ELSE
 UPDATE public.enquiries SET status=p_status,assigned=p_assigned,next_action=btrim(p_next),next_action_at=p_due,record_version=record_version+1,updated_at=now() WHERE id=p_id;
 INSERT INTO public.enquiry_events(enquiry_id,actor_id,event,note) VALUES(p_id,(s->>'userId')::uuid,'triaged',p_note);
 END IF;
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'ENQUIRY_TRIAGED',outcome,p_id,p_request,'enquiry',p_note,jsonb_build_object('previousVersion',p_version,'from',e.status,'to',CASE WHEN outcome='success' THEN p_status ELSE e.status END));
 RETURN jsonb_build_object('status',outcome,'id',p_id);
END;
$$;
CREATE FUNCTION public.admin_enquiry_convert_v1(p_token text,p_id uuid,p_version integer,p_kind text,p_customer uuid,p_location uuid,p_terms_at timestamptz,p_note text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; e public.enquiries; l public.locations; outcome text:='success'; work_id uuid; ref text; v_fingerprint text;
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('PROFILE_RECOVERY','REVIEW_PROTECTION','MONITORING') OR p_customer IS NULL OR p_location IS NULL OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 1000 OR p_request IS NULL
 OR (p_kind='MONITORING' AND (p_terms_at IS NULL OR p_terms_at>now())) THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT * INTO e FROM public.enquiries WHERE id=p_id FOR UPDATE;
 v_fingerprint:=md5(jsonb_build_object('kind',p_kind,'customer',p_customer,'location',p_location,'termsAt',p_terms_at,'note',p_note)::text);
 IF e.id IS NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
 IF e.status='converted' THEN
 IF e.conversion_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('status','success','id',p_id); ELSE RETURN jsonb_build_object('status','conflict'); END IF;
 END IF;
 SELECT * INTO l FROM public.locations WHERE id=p_location;
 IF e.record_version IS DISTINCT FROM p_version THEN outcome:='conflict';
 ELSIF e.status NOT IN ('new','open','waiting') THEN outcome:='denied';
 ELSIF l.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_customer) THEN outcome:='denied';
 ELSE
 IF p_kind='MONITORING' THEN
 INSERT INTO public.monitoring_requests(submission_key,customer_id,business_id,location_id,number_of_locations,source,terms_accepted_at,intake_snapshot)
 VALUES(gen_random_uuid(),p_customer,l.business_id,l.id,1,'ADMIN_ENQUIRY',p_terms_at,jsonb_build_object('schemaVersion',1,'origin','admin-enquiry','enquiryId',e.id,'termsEvidence',p_note)) RETURNING id INTO work_id;
 INSERT INTO public.monitoring_request_events(monitoring_request_id,event_type,actor_type,event_data) VALUES(work_id,'ENQUIRY_CONVERTED','ADMIN',jsonb_build_object('enquiryId',e.id,'adminId',s->>'userId'));
 ELSE
 INSERT INTO public.cases(public_ref,case_type,customer_id,business_id,location_id,source,issue_description,intake_snapshot)
 VALUES(public.generate_case_public_ref(p_kind),p_kind,p_customer,l.business_id,l.id,'ADMIN_ENQUIRY',e.payload->>'details',jsonb_build_object('schemaVersion',1,'origin','admin-enquiry','enquiryId',e.id)) RETURNING id,public_ref INTO work_id,ref;
 INSERT INTO public.case_events(case_id,event_type,actor_type,event_data) VALUES(work_id,'ENQUIRY_CONVERTED','ADMIN',jsonb_build_object('enquiryId',e.id,'adminId',s->>'userId'));
 END IF;
 UPDATE public.enquiries SET status='converted',assigned=true,record_version=record_version+1,updated_at=now(),next_action='',next_action_at=NULL,conversion_fingerprint=v_fingerprint,
 case_id=CASE WHEN p_kind<>'MONITORING' THEN work_id END,monitoring_request_id=CASE WHEN p_kind='MONITORING' THEN work_id END WHERE id=p_id;
 INSERT INTO public.enquiry_events(enquiry_id,actor_id,event,note) VALUES(p_id,(s->>'userId')::uuid,'converted',p_note);
 END IF;
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'ENQUIRY_CONVERTED',outcome,p_id,p_request,'enquiry',p_note,jsonb_build_object('kind',p_kind,'workId',work_id,'previousVersion',p_version));
 RETURN jsonb_build_object('status',outcome,'id',p_id);
END;
$$;
REVOKE ALL ON FUNCTION admin_private.valid_enquiry_v1(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_general_enquiry_v1(uuid,jsonb,boolean),public.finish_general_enquiry_notification_v1(uuid,uuid,text,text),
 public.admin_enquiry_list_v1(text,text,text,timestamptz,uuid,text),public.admin_enquiry_detail_v1(text,uuid),public.admin_enquiry_create_v1(text,uuid,jsonb,text),
 public.admin_enquiry_triage_v1(text,uuid,integer,text,boolean,text,timestamptz,text,uuid),public.admin_enquiry_convert_v1(text,uuid,integer,text,uuid,uuid,timestamptz,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_general_enquiry_v1(uuid,jsonb,boolean),public.finish_general_enquiry_notification_v1(uuid,uuid,text,text),
 public.admin_enquiry_list_v1(text,text,text,timestamptz,uuid,text),public.admin_enquiry_detail_v1(text,uuid),public.admin_enquiry_create_v1(text,uuid,jsonb,text),
 public.admin_enquiry_triage_v1(text,uuid,integer,text,boolean,text,timestamptz,text,uuid),public.admin_enquiry_convert_v1(text,uuid,integer,text,uuid,uuid,timestamptz,text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text,p_before bigint DEFAULT NULL,p_action text DEFAULT NULL,p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF (p_before IS NOT NULL AND p_before<1)
 OR (p_action IS NOT NULL AND p_action NOT IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED'))
 OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required')) THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'createdAt',e.created_at,'action',e.action,'outcome',e.outcome,'targetId',e.target_id,'requestId',e.request_id,'entity',e.entity,'reason',e.reason,'details',e.details) ORDER BY e.id DESC),'[]') INTO result
 FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id<p_before) AND (p_action IS NULL OR action=p_action) AND (p_outcome IS NULL OR outcome=p_outcome) ORDER BY id DESC LIMIT 51) e;
 RETURN result;
END;
$$;
COMMIT;
