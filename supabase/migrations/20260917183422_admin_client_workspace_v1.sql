BEGIN;
ALTER TABLE public.customers ADD COLUMN record_version integer NOT NULL DEFAULT 1 CHECK(record_version>0);
ALTER TABLE public.businesses ADD COLUMN record_version integer NOT NULL DEFAULT 1 CHECK(record_version>0);
ALTER TABLE public.locations ADD COLUMN record_version integer NOT NULL DEFAULT 1 CHECK(record_version>0);
CREATE FUNCTION admin_private.bump_record_version_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_version:=OLD.record_version+1; RETURN NEW; END;
$$;
CREATE TRIGGER customers_record_version BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION admin_private.bump_record_version_v1();
CREATE TRIGGER businesses_record_version BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION admin_private.bump_record_version_v1();
CREATE TRIGGER locations_record_version BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION admin_private.bump_record_version_v1();
CREATE INDEX customers_name_search_idx ON public.customers(lower(btrim(full_name)));
CREATE INDEX businesses_name_search_idx ON public.businesses(lower(btrim(display_name)));

CREATE INDEX cases_client_workspace_idx ON public.cases(customer_id,submitted_at DESC);
CREATE INDEX cases_business_workspace_idx ON public.cases(business_id,submitted_at DESC);
CREATE INDEX cases_location_workspace_idx ON public.cases(location_id,submitted_at DESC);

CREATE TABLE public.customer_contact_verifications (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK(channel IN ('email','phone')),
  verified_value text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid NOT NULL,
  evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 10 AND 1000),
  PRIMARY KEY(customer_id,channel)
);
CREATE TABLE public.business_memberships (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('pending','verified','revoked')),
  record_version integer NOT NULL DEFAULT 1 CHECK(record_version>0),
  verified_at timestamptz,
  verified_by uuid,
  evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 10 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(customer_id,business_id),
  CHECK((status='verified')=(verified_at IS NOT NULL AND verified_by IS NOT NULL))
);
CREATE INDEX business_memberships_business_idx ON public.business_memberships(business_id,customer_id);
ALTER TABLE public.customer_contact_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_contact_verifications,public.business_memberships FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK(action IN
 ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED'));
ALTER TABLE public.admin_audit_events ADD COLUMN entity text,
 ADD COLUMN reason text CHECK(length(reason)<=1000),
 ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(octet_length(details::text)<=4096);
CREATE FUNCTION admin_private.write_record_audit_v1(p_actor uuid,p_action text,p_outcome text,p_target uuid,p_request uuid,p_entity text,p_reason text,p_details jsonb)
RETURNS void LANGUAGE sql SET search_path='' AS $$
 INSERT INTO public.admin_audit_events(actor_id,action,outcome,target_id,request_id,entity,reason,details)
 VALUES(p_actor,p_action,p_outcome,p_target,p_request,p_entity,p_reason,p_details);
$$;

-- Verification is valid only for the currently stored value, including changes made by marketing intake.
CREATE FUNCTION admin_private.contact_verified_v1(p_customer uuid,p_channel text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.customer_contact_verifications v JOIN public.customers c ON c.id=v.customer_id
 WHERE v.customer_id=p_customer AND v.channel=p_channel
 AND v.verified_value=CASE p_channel WHEN 'email' THEN lower(c.email) WHEN 'phone' THEN c.phone END);
$$;

-- Clear proofs on any contact change, including existing marketing intake writes.
CREATE FUNCTION admin_private.invalidate_contact_verification_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.business_memberships;
BEGIN
 DELETE FROM public.customer_contact_verifications WHERE customer_id=NEW.id AND
 ((channel='email' AND lower(OLD.email) IS DISTINCT FROM lower(NEW.email)) OR (channel='phone' AND OLD.phone IS DISTINCT FROM NEW.phone));
 IF lower(OLD.email) IS DISTINCT FROM lower(NEW.email) THEN
   FOR m IN UPDATE public.business_memberships SET status='pending',record_version=record_version+1,verified_at=NULL,verified_by=NULL,
     evidence='Email changed. Recheck business authority before verifying this relationship.',updated_at=now()
     WHERE customer_id=NEW.id AND status='verified' RETURNING * LOOP
     PERFORM admin_private.write_record_audit_v1(NULL,'MEMBERSHIP_CHANGED','success',m.business_id,gen_random_uuid(),'business',
       'Email changed. Business authority must be checked again.',jsonb_build_object('customerId',NEW.id,'previousStatus','verified','status','pending','source','CONTACT_CHANGED'));
   END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER customers_invalidate_verification AFTER UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION admin_private.invalidate_contact_verification_v1();

-- Internal projection only. A future customer endpoint must resolve its customer ID from its own verified session.
-- No browser or service-role execute grant: this is not a customer authentication endpoint.
CREATE FUNCTION admin_private.customer_business_projection_v1(p_customer uuid,p_business uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',b.id,'name',b.display_name,'website',b.website_url)
 FROM public.businesses b JOIN public.business_memberships m ON m.business_id=b.id
 WHERE m.customer_id=p_customer AND b.id=p_business AND m.status='verified'
 AND admin_private.contact_verified_v1(p_customer,'email');
$$;
CREATE FUNCTION admin_private.customer_location_projection_v1(p_customer uuid,p_location uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',l.id,'businessId',l.business_id,'name',l.location_name,'country',l.country,'profileUrl',l.business_profile_url)
 FROM public.locations l WHERE l.id=p_location
 AND admin_private.customer_business_projection_v1(p_customer,l.business_id) IS NOT NULL;
$$;

CREATE FUNCTION public.admin_records_list_v1(p_token text,p_entity text,p_search text DEFAULT '',p_before uuid DEFAULT NULL,p_business uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF p_entity NOT IN ('client','business','location') OR p_entity IS NULL OR p_search IS NULL OR length(p_search)>100 THEN RAISE EXCEPTION 'Invalid search'; END IF;
 IF p_entity='client' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO result FROM
 (SELECT c.id,c.full_name AS name,c.email,c.phone,c.record_version AS version,
 admin_private.contact_verified_v1(c.id,'email') AS "emailVerified",admin_private.contact_verified_v1(c.id,'phone') AS "phoneVerified"
 FROM public.customers c WHERE (p_before IS NULL OR c.id>p_before)
 AND (p_business IS NULL OR EXISTS(SELECT 1 FROM public.business_memberships m WHERE m.customer_id=c.id AND m.business_id=p_business))
 AND (p_search='' OR strpos(lower(c.full_name||' '||c.email||' '||coalesce(c.phone,'')),lower(p_search))>0) ORDER BY c.id LIMIT 51) x;
 ELSIF p_entity='business' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO result FROM
 (SELECT b.id,b.display_name AS name,b.website_url AS website,b.record_version AS version FROM public.businesses b
 WHERE (p_before IS NULL OR b.id>p_before) AND (p_search='' OR strpos(lower(b.display_name||' '||coalesce(b.website_url,'')),lower(p_search))>0) ORDER BY b.id LIMIT 51) x;
 ELSE
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO result FROM
 (SELECT l.id,coalesce(l.location_name,b.display_name) AS name,l.country,l.business_id AS "businessId",b.display_name AS "businessName",l.record_version AS version
 FROM public.locations l JOIN public.businesses b ON b.id=l.business_id
 WHERE (p_before IS NULL OR l.id>p_before) AND (p_business IS NULL OR l.business_id=p_business)
 AND (p_search='' OR strpos(lower(coalesce(l.location_name,'')||' '||b.display_name||' '||l.country),lower(p_search))>0) ORDER BY l.id LIMIT 51) x;
 END IF;
 RETURN result;
END;
$$;

CREATE FUNCTION public.admin_record_detail_v1(p_token text,p_entity text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE record jsonb; memberships jsonb; submitted jsonb; duplicates jsonb; work jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF p_entity='client' THEN
 SELECT jsonb_build_object('id',c.id,'name',c.full_name,'email',c.email,'phone',c.phone,'version',c.record_version,
 'emailVerified',admin_private.contact_verified_v1(c.id,'email'),'phoneVerified',admin_private.contact_verified_v1(c.id,'phone')) INTO record FROM public.customers c WHERE id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."businessId"),'[]') INTO memberships FROM
 (SELECT m.business_id AS "businessId",m.customer_id AS "customerId",b.display_name AS name,m.status,m.record_version AS version,m.evidence,m.verified_at AS "verifiedAt"
 FROM public.business_memberships m JOIN public.businesses b ON b.id=m.business_id WHERE m.customer_id=p_id ORDER BY m.business_id LIMIT 100) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO submitted FROM
 (SELECT b.id,b.display_name AS name FROM public.businesses b WHERE b.id IN
 (SELECT business_id FROM public.cases WHERE customer_id=p_id UNION SELECT business_id FROM public.monitoring_requests WHERE customer_id=p_id) ORDER BY b.id LIMIT 100) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO duplicates FROM
 (SELECT c.id,c.full_name AS name FROM public.customers c WHERE c.id<>p_id AND lower(btrim(c.full_name))=lower(btrim(record->>'name')) ORDER BY c.id LIMIT 20) x;
 ELSIF p_entity='business' THEN
 SELECT jsonb_build_object('id',b.id,'name',b.display_name,'website',b.website_url,'version',b.record_version) INTO record FROM public.businesses b WHERE id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."customerId"),'[]') INTO memberships FROM
 (SELECT m.customer_id AS "customerId",m.business_id AS "businessId",c.full_name AS name,m.status,m.record_version AS version,m.evidence,m.verified_at AS "verifiedAt"
 FROM public.business_memberships m JOIN public.customers c ON c.id=m.customer_id WHERE m.business_id=p_id ORDER BY m.customer_id LIMIT 100) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO duplicates FROM
 (SELECT b.id,b.display_name AS name FROM public.businesses b WHERE b.id<>p_id AND lower(btrim(b.display_name))=lower(btrim(record->>'name')) ORDER BY b.id LIMIT 20) x;
 ELSE
 IF p_entity<>'location' OR p_entity IS NULL THEN RAISE EXCEPTION 'Invalid record type'; END IF;
 SELECT jsonb_build_object('id',l.id,'name',l.location_name,'country',l.country,'profileUrl',l.business_profile_url,'businessId',l.business_id,'businessName',b.display_name,'version',l.record_version)
 INTO record FROM public.locations l JOIN public.businesses b ON b.id=l.business_id WHERE l.id=p_id;
 END IF;
 IF record IS NULL THEN RETURN jsonb_build_object('missing',true); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."submittedAt" DESC),'[]') INTO work FROM
 (SELECT 'case' AS kind,c.public_ref AS reference,c.status,c.submitted_at AS "submittedAt" FROM public.cases c
 WHERE (p_entity='client' AND c.customer_id=p_id) OR (p_entity='business' AND c.business_id=p_id) OR (p_entity='location' AND c.location_id=p_id)
 UNION ALL SELECT 'monitoring',m.id::text,m.status,m.submitted_at FROM public.monitoring_requests m
 WHERE (p_entity='client' AND m.customer_id=p_id) OR (p_entity='business' AND m.business_id=p_id) OR (p_entity='location' AND m.location_id=p_id)
 ORDER BY "submittedAt" DESC LIMIT 100) x;
 RETURN jsonb_build_object('record',record,'memberships',coalesce(memberships,'[]'),'submittedBusinesses',coalesce(submitted,'[]'),'duplicates',coalesce(duplicates,'[]'),'work',work);
END;
$$;

CREATE TABLE admin_private.record_command_receipts (
 request_id uuid PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.record_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.record_command_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_record_save_v1(p_token text,p_entity text,p_id uuid,p_version integer,p_data jsonb,p_reason text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; target uuid:=coalesce(p_id,gen_random_uuid()); outcome text:='success'; new_version integer; old_email text; action text; fingerprint text; receipt admin_private.record_command_receipts; result jsonb;
BEGIN
 s:=public.admin_session_v1(p_token);
 IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_entity IS NULL OR p_entity NOT IN ('client','business','location') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object'
 OR p_request IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 1000
 OR p_version IS NULL OR (p_id IS NULL AND p_version<>0) OR (p_id IS NOT NULL AND p_version<1)
 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 IF p_entity='client' THEN
 IF (p_data - ARRAY['name','email','phone'])<>'{}'::jsonb OR jsonb_typeof(p_data->'name') IS DISTINCT FROM 'string' OR length(btrim(p_data->>'name')) NOT BETWEEN 1 AND 200
 OR jsonb_typeof(p_data->'email') IS DISTINCT FROM 'string' OR length(p_data->>'email')>254 OR (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR jsonb_typeof(p_data->'phone') IS DISTINCT FROM 'string' OR length(p_data->>'phone')>50 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT email INTO old_email FROM public.customers WHERE id=p_id FOR UPDATE;
 IF p_id IS NOT NULL AND lower(old_email) IS DISTINCT FROM lower(p_data->>'email') AND (s->>'createdAt')::timestamptz<now()-interval '5 minutes' THEN outcome:='reauth_required'; END IF;
 ELSIF p_entity='business' THEN
 IF (p_data - ARRAY['name','website'])<>'{}'::jsonb OR jsonb_typeof(p_data->'name') IS DISTINCT FROM 'string' OR length(btrim(p_data->>'name')) NOT BETWEEN 1 AND 200
 OR jsonb_typeof(p_data->'website') IS DISTINCT FROM 'string' OR length(p_data->>'website')>2048 OR ((p_data->>'website')<>'' AND (p_data->>'website') !~ '^https?://[^[:space:]]+$') THEN RETURN jsonb_build_object('status','invalid'); END IF;
 ELSE
 IF (p_data - ARRAY['name','country','profileUrl','businessId'])<>'{}'::jsonb OR jsonb_typeof(p_data->'name') IS DISTINCT FROM 'string' OR length(p_data->>'name')>200
 OR jsonb_typeof(p_data->'country') IS DISTINCT FROM 'string' OR length(btrim(p_data->>'country')) NOT BETWEEN 1 AND 100
 OR jsonb_typeof(p_data->'profileUrl') IS DISTINCT FROM 'string' OR length(p_data->>'profileUrl')>2048 OR ((p_data->>'profileUrl')<>'' AND (p_data->>'profileUrl') !~ '^https?://[^[:space:]]+$')
 OR jsonb_typeof(p_data->'businessId') IS DISTINCT FROM 'string' OR (p_data->>'businessId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN RETURN jsonb_build_object('status','invalid'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=(p_data->>'businessId')::uuid) THEN RETURN jsonb_build_object('status','invalid'); END IF;
 END IF;
 fingerprint:=md5(jsonb_build_object('entity',p_entity,'id',p_id,'version',p_version,'data',p_data,'reason',p_reason)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO receipt FROM admin_private.record_command_receipts WHERE request_id=p_request;
 IF receipt.request_id IS NOT NULL THEN
   IF receipt.fingerprint=fingerprint THEN RETURN receipt.result; END IF;
   RETURN jsonb_build_object('status','conflict');
 END IF;
 action:=CASE WHEN p_id IS NULL THEN 'RECORD_CREATED' ELSE 'RECORD_UPDATED' END;
 IF outcome='success' THEN
 BEGIN
 IF p_entity='client' THEN
   IF p_id IS NULL THEN INSERT INTO public.customers(id,full_name,email,phone) VALUES(target,btrim(p_data->>'name'),lower(p_data->>'email'),nullif(btrim(p_data->>'phone'),'')) RETURNING record_version INTO new_version;
   ELSE UPDATE public.customers SET full_name=btrim(p_data->>'name'),email=lower(p_data->>'email'),phone=nullif(btrim(p_data->>'phone'),'') WHERE id=p_id AND record_version=p_version RETURNING record_version INTO new_version;
   END IF;
 ELSIF p_entity='business' THEN
   IF p_id IS NULL THEN INSERT INTO public.businesses(id,display_name,website_url) VALUES(target,btrim(p_data->>'name'),nullif(p_data->>'website','')) RETURNING record_version INTO new_version;
   ELSE UPDATE public.businesses SET display_name=btrim(p_data->>'name'),website_url=nullif(p_data->>'website','') WHERE id=p_id AND record_version=p_version RETURNING record_version INTO new_version;
   END IF;
 ELSE
   IF p_id IS NULL THEN INSERT INTO public.locations(id,business_id,location_name,country,business_profile_url) VALUES(target,(p_data->>'businessId')::uuid,nullif(btrim(p_data->>'name'),''),btrim(p_data->>'country'),nullif(p_data->>'profileUrl','')) RETURNING record_version INTO new_version;
   ELSE UPDATE public.locations SET location_name=nullif(btrim(p_data->>'name'),''),country=btrim(p_data->>'country'),business_profile_url=nullif(p_data->>'profileUrl','') WHERE id=p_id AND record_version=p_version AND business_id=(p_data->>'businessId')::uuid RETURNING record_version INTO new_version;
   END IF;
 END IF;
 IF new_version IS NULL THEN outcome:='conflict'; END IF;
 EXCEPTION WHEN unique_violation THEN outcome:='conflict';
 END;
 END IF;
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,action,outcome,target,p_request,p_entity,btrim(p_reason),jsonb_build_object('previousVersion',p_version,'version',new_version,'fields',(SELECT jsonb_agg(k) FROM jsonb_object_keys(p_data) k)));
 result:=jsonb_build_object('status',outcome,'id',target,'version',new_version);
 IF outcome='success' THEN INSERT INTO admin_private.record_command_receipts(request_id,fingerprint,result) VALUES(p_request,fingerprint,result); END IF;
 RETURN result;
END;
$$;

CREATE FUNCTION public.admin_contact_verify_v1(p_token text,p_customer uuid,p_version integer,p_channel text,p_evidence text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.customers; value text; outcome text:='success';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_channel IS NULL OR p_channel NOT IN ('email','phone') OR p_request IS NULL OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 10 AND 1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT * INTO c FROM public.customers WHERE id=p_customer FOR UPDATE;
 IF c.id IS NULL OR c.record_version IS DISTINCT FROM p_version THEN outcome:='conflict';
 ELSIF (s->>'createdAt')::timestamptz<now()-interval '5 minutes' THEN outcome:='reauth_required';
 ELSE
 value:=CASE p_channel WHEN 'email' THEN lower(c.email) ELSE c.phone END;
 IF value IS NULL OR value='' THEN outcome:='denied';
 ELSE
 INSERT INTO public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) VALUES(p_customer,p_channel,value,(s->>'userId')::uuid,btrim(p_evidence))
 ON CONFLICT(customer_id,channel) DO UPDATE SET verified_value=excluded.verified_value,verified_by=excluded.verified_by,verified_at=now(),evidence=excluded.evidence;
 -- Advance the client version so two confirmations/edits cannot silently overwrite one another.
 UPDATE public.customers SET record_version=record_version WHERE id=p_customer;
 END IF;
 END IF;
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'CONTACT_VERIFIED',outcome,p_customer,p_request,'client',btrim(p_evidence),jsonb_build_object('channel',p_channel,'previousVersion',p_version));
 RETURN jsonb_build_object('status',outcome,'id',p_customer);
END;
$$;

CREATE FUNCTION public.admin_membership_save_v1(p_token text,p_customer uuid,p_business uuid,p_version integer,p_status text,p_evidence text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; m public.business_memberships; outcome text:='success';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_customer IS NULL OR p_business IS NULL OR p_version IS NULL OR p_version<0 OR p_status IS NULL OR p_status NOT IN ('pending','verified','revoked') OR p_request IS NULL OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 10 AND 1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 -- Parent lock also serialises creation of a relationship that does not exist yet.
 PERFORM id FROM public.customers WHERE id=p_customer FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=p_business) THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT * INTO m FROM public.business_memberships WHERE customer_id=p_customer AND business_id=p_business FOR UPDATE;
 IF coalesce(m.record_version,0)<>p_version THEN outcome:='conflict';
 ELSIF (s->>'createdAt')::timestamptz<now()-interval '5 minutes' THEN outcome:='reauth_required';
 ELSIF p_status='verified' AND NOT (admin_private.contact_verified_v1(p_customer,'email') OR admin_private.contact_verified_v1(p_customer,'phone')) THEN outcome:='denied';
 ELSE
 INSERT INTO public.business_memberships(customer_id,business_id,status,record_version,verified_at,verified_by,evidence)
 VALUES(p_customer,p_business,p_status,1,CASE WHEN p_status='verified' THEN now() END,CASE WHEN p_status='verified' THEN (s->>'userId')::uuid END,btrim(p_evidence))
 ON CONFLICT(customer_id,business_id) DO UPDATE SET status=excluded.status,record_version=public.business_memberships.record_version+1,verified_at=excluded.verified_at,verified_by=excluded.verified_by,evidence=excluded.evidence,updated_at=now();
 END IF;
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'MEMBERSHIP_CHANGED',outcome,p_business,p_request,'business',btrim(p_evidence),jsonb_build_object('customerId',p_customer,'previousStatus',m.status,'status',CASE WHEN outcome='success' THEN p_status ELSE m.status END,'previousVersion',p_version));
 RETURN jsonb_build_object('status',outcome,'id',p_customer);
END;
$$;

CREATE FUNCTION public.admin_membership_get_v1(p_token text,p_customer uuid,p_business uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('customerId',customer_id,'businessId',business_id,'status',status,'version',record_version,'evidence',evidence,'verifiedAt',verified_at) INTO result
 FROM public.business_memberships WHERE customer_id=p_customer AND business_id=p_business;
 RETURN coalesce(result,'{"missing":true}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_membership_get_v1(text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_membership_get_v1(text,uuid,uuid) TO service_role;

CREATE FUNCTION public.admin_duplicate_preview_v1(p_token text,p_entity text,p_left uuid,p_right uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb; b jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF p_entity IS NULL OR p_entity NOT IN ('client','business') OR p_left IS NULL OR p_right IS NULL OR p_left=p_right THEN RETURN jsonb_build_object('invalid',true); END IF;
 a:=public.admin_record_detail_v1(p_token,p_entity,p_left); b:=public.admin_record_detail_v1(p_token,p_entity,p_right);
 IF a->'missing'='true'::jsonb OR b->'missing'='true'::jsonb THEN RETURN jsonb_build_object('missing',true); END IF;
 RETURN jsonb_build_object('left',a,'right',b,'readOnly',true,
 'leftCases',(SELECT count(*) FROM public.cases WHERE (p_entity='client' AND customer_id=p_left) OR (p_entity='business' AND business_id=p_left)),
 'rightCases',(SELECT count(*) FROM public.cases WHERE (p_entity='client' AND customer_id=p_right) OR (p_entity='business' AND business_id=p_right)),
 'leftMonitoring',(SELECT count(*) FROM public.monitoring_requests WHERE (p_entity='client' AND customer_id=p_left) OR (p_entity='business' AND business_id=p_left)),
 'rightMonitoring',(SELECT count(*) FROM public.monitoring_requests WHERE (p_entity='client' AND customer_id=p_right) OR (p_entity='business' AND business_id=p_right)),
 'leftLocations',(SELECT count(*) FROM public.locations WHERE p_entity='business' AND business_id=p_left),
 'rightLocations',(SELECT count(*) FROM public.locations WHERE p_entity='business' AND business_id=p_right));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text,p_before bigint DEFAULT NULL,p_action text DEFAULT NULL,p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
 IF (p_before IS NOT NULL AND p_before<1)
 OR (p_action IS NOT NULL AND p_action NOT IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED'))
 OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required')) THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'createdAt',e.created_at,'action',e.action,'outcome',e.outcome,'targetId',e.target_id,'requestId',e.request_id,'entity',e.entity,'reason',e.reason,'details',e.details) ORDER BY e.id DESC),'[]') INTO result
 FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id<p_before) AND (p_action IS NULL OR action=p_action) AND (p_outcome IS NULL OR outcome=p_outcome) ORDER BY id DESC LIMIT 51) e;
 RETURN result;
END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA admin_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_records_list_v1(text,text,text,uuid,uuid),public.admin_record_detail_v1(text,text,uuid),
 public.admin_record_save_v1(text,text,uuid,integer,jsonb,text,uuid),public.admin_contact_verify_v1(text,uuid,integer,text,text,uuid),
 public.admin_membership_save_v1(text,uuid,uuid,integer,text,text,uuid),public.admin_duplicate_preview_v1(text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_records_list_v1(text,text,text,uuid,uuid),public.admin_record_detail_v1(text,text,uuid),
 public.admin_record_save_v1(text,text,uuid,integer,jsonb,text,uuid),public.admin_contact_verify_v1(text,uuid,integer,text,text,uuid),
 public.admin_membership_save_v1(text,uuid,uuid,integer,text,text,uuid),public.admin_duplicate_preview_v1(text,text,uuid,uuid) TO service_role;
COMMIT;
