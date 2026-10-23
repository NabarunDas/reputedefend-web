-- ADMIN-SEC-REAUTH-30. Every Admin recent-sign-in gate uses 30 minutes.
-- Not applied to DEV or Production. Do not apply without approval.
-- Does not change session validity, inactivity, absolute expiry, revocation,
-- grants, idempotency, audit, financial checks, job retry backoff, customer
-- OTP or action expiry, or the 48-hour-5-minute Guard cutoff.
-- Clock origin remains admin_sessions.created_at. Last API activity does not
-- extend this window. admin_dev_send_email_claim_v1 is already 30 minutes.

BEGIN;

-- public.admin_record_save_v1 from 20260917183422_admin_client_workspace_v1.sql
CREATE OR REPLACE FUNCTION public.admin_record_save_v1(p_token text,p_entity text,p_id uuid,p_version integer,p_data jsonb,p_reason text,p_request uuid)
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
 IF p_id IS NOT NULL AND lower(old_email) IS DISTINCT FROM lower(p_data->>'email') AND (s->>'createdAt')::timestamptz<now()-interval '30 minutes' THEN outcome:='reauth_required'; END IF;
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

-- public.admin_contact_verify_v1 from 20260917183422_admin_client_workspace_v1.sql
CREATE OR REPLACE FUNCTION public.admin_contact_verify_v1(p_token text,p_customer uuid,p_version integer,p_channel text,p_evidence text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.customers; value text; outcome text:='success';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_channel IS NULL OR p_channel NOT IN ('email','phone') OR p_request IS NULL OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 10 AND 1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT * INTO c FROM public.customers WHERE id=p_customer FOR UPDATE;
 IF c.id IS NULL OR c.record_version IS DISTINCT FROM p_version THEN outcome:='conflict';
 ELSIF (s->>'createdAt')::timestamptz<now()-interval '30 minutes' THEN outcome:='reauth_required';
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

-- public.admin_membership_save_v1 from 20260917183422_admin_client_workspace_v1.sql
CREATE OR REPLACE FUNCTION public.admin_membership_save_v1(p_token text,p_customer uuid,p_business uuid,p_version integer,p_status text,p_evidence text,p_request uuid)
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
 ELSIF (s->>'createdAt')::timestamptz<now()-interval '30 minutes' THEN outcome:='reauth_required';
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

-- public.admin_authorization_command_v1 from 20260928175738_customer_case_pack_access_v1.sql
CREATE OR REPLACE FUNCTION public.admin_authorization_command_v1(
  p_token text, p_request uuid, p_case uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; cs public.cases; c public.customers; loc public.locations; fp text; cached jsonb; result jsonb;
  data jsonb; p_kind text; title text; body text; scope text; expires timestamptz; next_no integer;
  v public.agreement_versions; a public.customer_actions; auth public.authorization_records; note text; secret text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL
    OR p_operation NOT IN ('create_agreement_action','revoke_action','create_revocation_action','admin_revoke_authorization','create_case_access_action')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 65536
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  secret := data->>'secretHash';
  data := data - 'secretHash';
  fp := md5(jsonb_build_array(p_case, p_operation, data)::text);
  cached := admin_private.authz_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = p_case FOR UPDATE;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF cs.status IN ('CLOSED','CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO c FROM public.customers WHERE id = cs.customer_id;
  IF p_operation = 'create_agreement_action' THEN
    p_kind := data->>'kind';
    title := btrim(coalesce(data->>'title', ''));
    body := btrim(coalesce(data->>'bodyText', ''));
    scope := btrim(coalesce(data->>'scopeText', ''));
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF p_kind IS NULL OR p_kind NOT IN ('SERVICE_AGREEMENT','CASE_MANAGEMENT_PERMISSION')
      OR length(title) NOT BETWEEN 1 AND 200 OR length(body) NOT BETWEEN 20 AND 50000 OR length(scope) NOT BETWEEN 10 AND 5000
      OR expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF p_kind = 'CASE_MANAGEMENT_PERMISSION' AND cs.service_track IS DISTINCT FROM 'MANAGED' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF cs.location_id IS NOT NULL THEN
      SELECT * INTO loc FROM public.locations WHERE id = cs.location_id;
      IF loc.id IS NULL OR loc.business_id <> cs.business_id THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.customer_actions x
      WHERE x.case_id = cs.id AND x.kind = 'AGREEMENT_ACCEPTANCE' AND x.status = 'OPEN'
        AND x.agreement_version_id IN (SELECT id FROM public.agreement_versions WHERE case_id = cs.id AND agreement_kind = p_kind)
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    SELECT coalesce(max(version_number), 0) + 1 INTO next_no FROM public.agreement_versions WHERE case_id = cs.id AND agreement_kind = p_kind;
    INSERT INTO public.agreement_versions(case_id, customer_id, business_id, location_id, agreement_kind, version_number, title, body_text, scope_text, content_hash, created_by)
    VALUES (cs.id, cs.customer_id, cs.business_id, cs.location_id, p_kind, next_no, title, body, scope,
      admin_private.agreement_content_hash_v1(p_kind, title, body, scope), actor)
    RETURNING * INTO v;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, agreement_version_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, v.id, 'AGREEMENT_ACCEPTANCE', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind, 'agreementKind', p_kind, 'versionNumber', v.version_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer agreement action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id, 'kind', p_kind));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'agreementVersionId', v.id, 'versionNumber', v.version_number, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'revoke_action' THEN
    IF jsonb_typeof(data->'actionId') <> 'string' OR data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'reason', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN SELECT * INTO a FROM public.customer_actions WHERE id = (data->>'actionId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF a.id IS NULL OR a.case_id IS DISTINCT FROM cs.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF a.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_REVOKED', jsonb_build_object('source', 'ADMIN', 'reason', left(note, 200)));
    DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
    DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer action revoked',
      jsonb_build_object('operation', p_operation, 'actionId', a.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'actionStatus', a.status);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'create_revocation_action' THEN
    IF jsonb_typeof(data->'authorizationId') <> 'string' OR secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN SELECT * INTO auth FROM public.authorization_records WHERE id = (data->>'authorizationId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM cs.id OR auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, authorization_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, auth.id, 'AUTHORIZATION_REVOCATION', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind, 'authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Authorization revocation action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'create_case_access_action' THEN
    IF (data - 'expiresAt') <> '{}'::jsonb OR secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF c.id IS NULL OR lower(c.email) = 'admin@profilerelaunch.com' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF cs.location_id IS NOT NULL THEN
      SELECT * INTO loc FROM public.locations WHERE id = cs.location_id;
      IF loc.id IS NULL OR loc.business_id <> cs.business_id THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    END IF;
    SELECT * INTO a FROM public.customer_actions
      WHERE case_id = cs.id AND kind = 'CASE_ACCESS' AND status = 'OPEN'
      FOR UPDATE;
    IF a.id IS NOT NULL THEN
      IF a.expires_at > now() THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
      IF NOT admin_private.revoke_case_access_action_v1(
        a.id,
        'The previous case-access capability expired.',
        jsonb_build_object('source', 'ACTION_EXPIRED')
      ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    END IF;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, 'CASE_ACCESS', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer case-access action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'admin_revoke_authorization' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    IF jsonb_typeof(data->'authorizationId') <> 'string' OR data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'reason', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT (data ? 'recordVersion') OR jsonb_typeof(data->'recordVersion') <> 'number'
      OR (data->>'recordVersion') ~ '\.' OR (data->>'recordVersion')::integer < 1 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    BEGIN SELECT * INTO auth FROM public.authorization_records WHERE id = (data->>'authorizationId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM cs.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF (data->>'recordVersion')::integer IS DISTINCT FROM auth.record_version THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    IF auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.authorization_records
      SET status = 'REVOKED', revoked_at = now(), revoked_by = actor, revocation_reason = note
      WHERE id = auth.id RETURNING * INTO auth;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, cs.id, 'ADMIN', actor, 'AUTHORIZATION_REVOKED', jsonb_build_object('source', 'ADMIN_RECORDED_REVOCATION'));
    PERFORM admin_private.revoke_open_customer_actions_v1(cs.customer_id, cs.business_id, 'Related authorization was revoked.');
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Authorization revoked by Admin',
      jsonb_build_object('operation', p_operation, 'authorizationId', auth.id));
    result := jsonb_build_object('status', 'success', 'id', auth.id, 'authorizationStatus', auth.status, 'recordVersion', auth.record_version);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  RETURN jsonb_build_object('status', 'invalid');
END; $$;

-- public.admin_manager_access_command_v1 from 20260928094817_admin_customer_actions_v1.sql
CREATE OR REPLACE FUNCTION public.admin_manager_access_command_v1(
  p_token text, p_request uuid, p_case uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; cs public.cases; loc public.locations; fp text; cached jsonb; result jsonb; data jsonb;
  p_evidence text; note text; p_level text; row public.location_manager_access;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL OR p_operation NOT IN ('verify','revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_case, p_operation, data)::text);
  cached := admin_private.authz_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = p_case FOR UPDATE;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF cs.service_track IS DISTINCT FROM 'MANAGED' OR cs.location_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO loc FROM public.locations WHERE id = cs.location_id;
  IF loc.id IS NULL OR loc.business_id <> cs.business_id THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF NOT (data ? 'recordVersion') OR jsonb_typeof(data->'recordVersion') <> 'number'
    OR (data->>'recordVersion') ~ '\.' OR (data->>'recordVersion')::integer < 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'verify' THEN
    IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    p_level := data->>'accessLevel';
    p_evidence := btrim(coalesce(data->>'evidence', ''));
    IF p_level IS NULL OR p_level NOT IN ('MANAGER','OWNER') OR length(p_evidence) NOT BETWEEN 10 AND 1000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO row FROM public.location_manager_access WHERE location_id = loc.id FOR UPDATE;
    IF row.id IS NULL THEN
      IF (data->>'recordVersion')::integer IS DISTINCT FROM 0 THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
      INSERT INTO public.location_manager_access(business_id, location_id, status, access_level, verified_at, verified_by, evidence)
      VALUES (cs.business_id, loc.id, 'VERIFIED', p_level, now(), actor, p_evidence) RETURNING * INTO row;
    ELSE
      IF (data->>'recordVersion')::integer IS DISTINCT FROM row.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
      UPDATE public.location_manager_access
        SET status = 'VERIFIED', access_level = p_level, verified_at = now(), verified_by = actor, evidence = p_evidence,
            revoked_at = NULL, revoked_by = NULL, revocation_reason = ''
        WHERE id = row.id RETURNING * INTO row;
    END IF;
    INSERT INTO public.location_manager_access_events(manager_access_id, location_id, actor_id, event, details)
    VALUES (row.id, loc.id, actor, 'MANAGER_ACCESS_VERIFIED', jsonb_build_object('accessLevel', p_level, 'evidence', p_evidence));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Google Manager access verified',
      jsonb_build_object('operation', p_operation, 'locationId', loc.id, 'accessLevel', p_level));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'managerStatus', row.status, 'recordVersion', row.record_version);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  note := btrim(coalesce(data->>'reason', ''));
  IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO row FROM public.location_manager_access WHERE location_id = loc.id FOR UPDATE;
  IF row.id IS NULL OR row.status <> 'VERIFIED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF (data->>'recordVersion')::integer IS DISTINCT FROM row.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  UPDATE public.location_manager_access
    SET status = 'REVOKED', revoked_at = now(), revoked_by = actor, revocation_reason = note
    WHERE id = row.id RETURNING * INTO row;
  INSERT INTO public.location_manager_access_events(manager_access_id, location_id, actor_id, event, details)
  VALUES (row.id, loc.id, actor, 'MANAGER_ACCESS_REVOKED', jsonb_build_object('reason', left(note, 200), 'previousAccessLevel', row.access_level));
  PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Google Manager access revoked',
    jsonb_build_object('operation', p_operation, 'locationId', loc.id));
  result := jsonb_build_object('status', 'success', 'id', row.id, 'managerStatus', row.status, 'recordVersion', row.record_version);
  INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

-- public.admin_revoke_session_v1 from 20260917160740_admin_audit_foundation_v1.sql
CREATE OR REPLACE FUNCTION public.admin_revoke_session_v1(p_token text,p_target uuid,p_request uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s jsonb; outcome text;
BEGIN
  IF p_request IS NULL OR p_target IS NULL THEN RETURN 'invalid'; END IF;
  -- Stable lock order prevents two devices ending each other from deadlocking.
  PERFORM id FROM public.admin_sessions WHERE token_hash=p_token OR id=p_target ORDER BY id FOR UPDATE;
  s:=public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN 'unauthorized'; END IF;
  IF (s->>'createdAt')::timestamptz < now()-interval '30 minutes' THEN outcome:='reauth_required';
  ELSIF p_target=(s->>'id')::uuid THEN outcome:='denied';
  ELSE
    -- Compare-and-set: a stale/replayed action cannot modify an ended or unrelated session.
    UPDATE public.admin_sessions SET revoked_at=now() WHERE id=p_target
      AND auth_user_id=(s->>'userId')::uuid AND revoked_at IS NULL
      AND expires_at>now() AND last_seen_at>now()-interval '30 minutes';
    IF FOUND THEN outcome:='success'; ELSE outcome:='conflict'; END IF;
  END IF;
  PERFORM admin_private.write_audit_v1((s->>'userId')::uuid,'SESSION_REVOKED',outcome,p_target,p_request);
  RETURN outcome;
END;
$$;

-- public.admin_catalogue_command_v1 from 20260929233953_catalogue_quotes_orders_v1.sql
CREATE OR REPLACE FUNCTION public.admin_catalogue_command_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb; row public.price_versions;
  pred public.price_versions; service text; name text; amount integer; from_at timestamptz; to_at timestamptz;
  overlap_n integer;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create_price_version','approve_price_version','retire_price_version')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 8192
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.catalogue_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached || jsonb_build_object('replay', true); END IF;
  IF p_operation = 'create_price_version' THEN
    service := data->>'serviceCode';
    name := btrim(coalesce(data->>'displayName', ''));
    BEGIN amount := (data->>'amountMinor')::integer; from_at := (data->>'effectiveFrom')::timestamptz;
      to_at := NULLIF(data->>'effectiveTo','')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF service IS NULL OR service NOT IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD')
      OR char_length(name) NOT BETWEEN 1 AND 120 OR amount IS NULL OR amount < 0 OR from_at IS NULL
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    INSERT INTO public.price_versions(
      service_code, display_name, amount_minor, currency, payment_model, billing_cadence, billing_unit,
      effective_from, effective_to, status, tax_behaviour, tax_jurisdiction, tax_rate_bps, tax_code, created_by, notes
    ) VALUES (
      service, name, amount, coalesce(data->>'currency','GBP'),
      CASE service WHEN 'RELAUNCH_GUARD' THEN 'RECURRING_MONTHLY' WHEN 'MANAGED_RELAUNCH' THEN 'SUCCESS_FEE' WHEN 'MANAGED_REVIEW' THEN 'SUCCESS_FEE' ELSE 'UPFRONT' END,
      CASE service WHEN 'RELAUNCH_GUARD' THEN 'MONTHLY' WHEN 'MANAGED_RELAUNCH' THEN 'ON_SUCCESS' WHEN 'MANAGED_REVIEW' THEN 'ON_SUCCESS' ELSE 'ONCE' END,
      CASE service WHEN 'RELAUNCH_GUARD' THEN 'LOCATION_MONTH' ELSE 'SERVICE' END,
      from_at, to_at, 'DRAFT', coalesce(data->>'taxBehaviour','UNCONFIRMED'),
      NULLIF(data->>'taxJurisdiction',''), NULLIF(data->>'taxRateBps','')::integer, NULLIF(data->>'taxCode',''),
      actor, NULLIF(data->>'notes','')
    ) RETURNING * INTO row;
    INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
    VALUES (row.id, actor, 'PRICE_DRAFTED', jsonb_build_object('serviceCode', row.service_code, 'amountMinor', row.amount_minor));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', row.id, p_request, 'price_version',
      'Draft price version created', jsonb_build_object('operation', p_operation, 'serviceCode', row.service_code));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version);
  ELSIF p_operation = 'approve_price_version' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    SELECT * INTO row FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid FOR UPDATE;
    IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF p_version IS DISTINCT FROM row.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF row.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF row.effective_from <= now() THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT count(*) INTO overlap_n
    FROM public.price_versions p
    WHERE p.id IS DISTINCT FROM row.id
      AND p.service_code = row.service_code
      AND p.status = 'APPROVED'
      AND tstzrange(p.effective_from, p.effective_to, '[)') && tstzrange(row.effective_from, row.effective_to, '[)');
    IF overlap_n > 1 THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF overlap_n = 1 THEN
      SELECT * INTO pred
      FROM public.price_versions p
      WHERE p.id IS DISTINCT FROM row.id
        AND p.service_code = row.service_code
        AND p.status = 'APPROVED'
        AND tstzrange(p.effective_from, p.effective_to, '[)') && tstzrange(row.effective_from, row.effective_to, '[)')
      FOR UPDATE;
      IF pred.id IS NULL
        OR pred.effective_from >= row.effective_from
        OR (pred.effective_to IS NOT NULL AND pred.effective_to <= row.effective_from)
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      PERFORM set_config('admin_private.price_rollover', pred.id::text, true);
      UPDATE public.price_versions SET effective_to = row.effective_from WHERE id = pred.id;
      INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
      VALUES (pred.id, actor, 'PRICE_SCHEDULED_END', jsonb_build_object('successorId', row.id, 'effectiveTo', row.effective_from));
    END IF;
    UPDATE public.price_versions SET status = 'APPROVED', approved_at = now(), approved_by = actor
      WHERE id = row.id RETURNING * INTO row;
    INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
    VALUES (row.id, actor, 'PRICE_APPROVED', jsonb_build_object('serviceCode', row.service_code, 'amountMinor', row.amount_minor));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', row.id, p_request, 'price_version',
      'Price version approved', jsonb_build_object('operation', p_operation, 'serviceCode', row.service_code, 'rolledOverFrom', pred.id));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version);
  ELSE
    SELECT * INTO row FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid FOR UPDATE;
    IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF p_version IS DISTINCT FROM row.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF row.status <> 'APPROVED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.price_versions
      SET status = 'RETIRED', retired_at = now(), retired_by = actor, effective_to = coalesce(effective_to, now())
      WHERE id = row.id RETURNING * INTO row;
    INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
    VALUES (row.id, actor, 'PRICE_RETIRED', jsonb_build_object('serviceCode', row.service_code));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', row.id, p_request, 'price_version',
      'Price version retired', jsonb_build_object('operation', p_operation, 'serviceCode', row.service_code));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version);
  END IF;
  INSERT INTO admin_private.catalogue_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

-- public.admin_job_replay_v1 from 20260929183214_jobs_outbox_operational_health_v1.sql
CREATE OR REPLACE FUNCTION public.admin_job_replay_v1(
  p_token text, p_request uuid, p_job uuid, p_reason text, p_confirmed boolean, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; actor uuid; fp text; cached jsonb; result jsonb; row admin_private.jobs; reason text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    PERFORM admin_private.write_record_audit_v1(actor, 'OPERATIONS_CHANGED', 'reauth_required', p_job, p_request, 'job', 'Dead-letter replay requires a sign-in from the last 30 minutes', jsonb_build_object('operation', 'replay'));
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  reason := btrim(coalesce(p_reason, ''));
  IF p_request IS NULL OR p_job IS NULL OR p_version IS NULL OR coalesce(p_confirmed, false) IS NOT TRUE
    OR length(reason) NOT BETWEEN 10 AND 2000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_job, p_version, 'replay')::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO row FROM admin_private.jobs WHERE id = p_job FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.status = 'SUCCEEDED' OR row.status = 'RUNNING' THEN
    PERFORM admin_private.write_record_audit_v1(actor, 'OPERATIONS_CHANGED', 'denied', row.id, p_request, 'job', reason, jsonb_build_object('operation', 'replay', 'jobStatus', row.status));
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF row.status <> 'DEAD_LETTER' OR row.record_version <> p_version THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  UPDATE admin_private.jobs
    SET status = 'PENDING',
        scheduled_at = now(),
        claimed_at = NULL,
        lease_expires_at = NULL,
        lease_owner = NULL,
        lease_token = NULL,
        attempts = 0,
        dead_lettered_at = NULL,
        last_error = NULL,
        replay_count = row.replay_count + 1,
        record_version = row.record_version + 1,
        updated_at = now()
    WHERE id = row.id AND status = 'DEAD_LETTER' AND record_version = p_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  result := jsonb_build_object(
    'status', 'success', 'jobId', row.id, 'idempotencyKey', row.idempotency_key,
    'replayCount', row.replay_count + 1, 'version', row.record_version + 1
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'OPERATIONS_CHANGED', 'success', row.id, p_request, 'job', reason,
    jsonb_build_object('operation', 'replay', 'jobType', row.job_type, 'replayCount', row.replay_count + 1)
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

-- public.admin_dev_stripe_one_shot_claim_v1 from 20261015230000_dev_stripe_one_shot_v1.sql
CREATE OR REPLACE FUNCTION public.admin_dev_stripe_one_shot_claim_v1(
  p_token text,
  p_request uuid,
  p_event_id text,
  p_confirmed boolean,
  p_preflight_clear boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  current_status text;
  v_key text;
  outbox admin_private.job_outbox;
  rec admin_private.stripe_event_receipts;
  row admin_private.jobs;
  family text;
  object_id text;
  event_type text;
  token uuid;
  attempt_no integer;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'reauth_required', NULL, p_request, 'job',
      'DEV Stripe one-shot requires a sign-in from the last 30 minutes',
      jsonb_build_object('operation', 'dev_stripe_one_shot')
    );
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR coalesce(p_confirmed, false) IS NOT TRUE
    OR p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{4,160}$'
    OR length('process-stripe-event:' || p_event_id) > 200
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  v_key := 'process-stripe-event:' || p_event_id;
  fp := md5(jsonb_build_array('dev_stripe_one_shot', p_event_id)::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    current_status := NULL;
    IF cached ? 'jobId' THEN
      SELECT j.status INTO current_status
      FROM admin_private.jobs j
      WHERE j.id = (cached->>'jobId')::uuid;
    END IF;
    RETURN cached || jsonb_build_object('replay', true, 'currentJobStatus', current_status);
  END IF;

  SELECT * INTO outbox
  FROM admin_private.job_outbox
  WHERE event_key = v_key
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM admin_private.job_outbox WHERE event_key = v_key) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing');
  END IF;

  -- A matching key with any other topic is refused without an update.
  IF outbox.topic IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR outbox.payload->>'eventId' IS DISTINCT FROM p_event_id
    OR outbox.payload->>'livemode' IS DISTINCT FROM 'false'
    OR coalesce(outbox.payload->>'eventType', '') = ''
  THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot refused an event that is not a test-mode Stripe job',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'not_stripe_test')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'not_stripe_test', 'eventId', p_event_id);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  event_type := outbox.payload->>'eventType';
  object_id := nullif(outbox.payload->>'objectId', '');
  SELECT * INTO rec
  FROM admin_private.stripe_event_receipts
  WHERE provider_event_id = p_event_id
  FOR UPDATE;
  IF rec.provider_event_id IS NULL OR rec.livemode IS DISTINCT FROM false
    OR rec.event_type IS DISTINCT FROM event_type
    OR object_id IS NULL OR rec.provider_object_id IS DISTINCT FROM object_id
  THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot refused an event whose receipt does not match',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'receipt')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'receipt', 'eventId', p_event_id);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  -- An earlier apply already settled this receipt. Do not promote or lease it.
  IF rec.processed IS TRUE THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot left an already processed event unchanged',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'already_processed')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'eventId', p_event_id);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  family := admin_private.dev_stripe_event_family_v1(event_type);
  IF family = 'guard' OR (
    event_type LIKE 'invoice.%' AND EXISTS (
      SELECT 1 FROM public.guard_subscription_invoices g WHERE g.stripe_invoice_id = object_id
    )
  ) THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot left a Guard-linked event queued',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'guard_event', 'eventType', event_type)
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'guard_event', 'eventId', p_event_id, 'eventType', event_type);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF family IS DISTINCT FROM 'settlement' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot refused an unsupported event type',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'unsupported', 'eventType', event_type)
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'unsupported', 'eventId', p_event_id, 'eventType', event_type);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF event_type LIKE 'checkout.session.%' OR event_type LIKE 'invoice.%' OR event_type LIKE 'setup_intent.%' THEN
    IF coalesce(p_preflight_clear, false) IS DISTINCT FROM true THEN
      RETURN jsonb_build_object(
        'status', 'preflight_required',
        'eventId', p_event_id,
        'eventType', event_type,
        'objectId', object_id
      );
    END IF;
  END IF;

  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'eventId', p_event_id);
  END IF;

  IF outbox.promoted_at IS NULL THEN
    INSERT INTO admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
    VALUES (outbox.id, 'PROCESS_STRIPE_EVENT', outbox.event_key, outbox.payload, 'PENDING', outbox.available_at)
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox
      SET promoted_at = now(), last_error = NULL
      WHERE id = outbox.id AND promoted_at IS NULL;
  END IF;

  SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id FOR UPDATE;
  IF row.id IS NULL OR row.job_type IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR row.idempotency_key IS DISTINCT FROM v_key
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_stripe_test', 'eventId', p_event_id);
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'eventId', p_event_id, 'jobId', row.id);
  END IF;
  IF row.status IN ('PENDING', 'RETRY') AND row.scheduled_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'eventId', p_event_id, 'jobId', row.id);
  END IF;

  IF row.status = 'RUNNING' THEN
    IF row.attempts >= row.max_attempts THEN
      PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'DEAD_LETTER', 'Maximum attempts exhausted after worker lease expiry');
      UPDATE admin_private.jobs
        SET status = 'DEAD_LETTER',
            dead_lettered_at = now(),
            lease_expires_at = NULL,
            lease_owner = NULL,
            lease_token = NULL,
            last_error = 'Maximum attempts exhausted after worker lease expiry',
            updated_at = now(),
            record_version = row.record_version + 1
        WHERE id = row.id AND status = 'RUNNING';
      result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER',
          dead_lettered_at = now(),
          lease_expires_at = NULL,
          lease_owner = NULL,
          lease_token = NULL,
          last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = now(),
          record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  token := gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a
  WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING',
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-stripe-one-shot',
        lease_token = token,
        attempts = row.attempts + 1,
        updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'eventId', p_event_id);
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-stripe-one-shot', token, NULL);

  result := jsonb_build_object(
    'status', 'success',
    'replay', false,
    'eventId', p_event_id,
    'jobId', row.id,
    'jobType', row.job_type,
    'idempotencyKey', row.idempotency_key,
    'payload', row.payload,
    'leaseToken', token,
    'attemptNumber', row.attempts,
    'attempts', row.attempts,
    'maxAttempts', row.max_attempts
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'OPERATIONS_CHANGED', 'success', row.id, p_request, 'job',
    'DEV Stripe one-shot claimed one test-mode event',
    jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'eventType', event_type, 'jobType', 'PROCESS_STRIPE_EVENT')
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END;
$$;

-- admin_private.admin_payment_command_core_v1 from 20261020150000_admin_journey_e2e_03_success_fee_guard_v1.sql
CREATE OR REPLACE FUNCTION admin_private.admin_payment_command_core_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb;
  ord public.service_orders; ob public.payment_obligations; qv public.quote_versions; cs public.cases;
  action public.customer_actions; prep text; expires timestamptz; secret text;
  approval public.success_fee_approvals; pm public.saved_payment_methods; inv public.payment_invoices;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN (
      'issue_guided_payment_action','issue_managed_setup_action','issue_recovery_action',
      'approve_success_fee','revoke_action','ensure_customer_map','issue_invoice_fallback'
    ) OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.payment_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  IF p_operation = 'ensure_customer_map' THEN
    INSERT INTO public.stripe_customer_maps(customer_id, stripe_customer_id, livemode)
    VALUES ((data->>'customerId')::uuid, data->>'stripeCustomerId', admin_private.payment_expected_livemode_v1())
    ON CONFLICT (customer_id) DO NOTHING;
    SELECT jsonb_build_object('status','success','id', id, 'stripeCustomerId', stripe_customer_id)
      INTO result FROM public.stripe_customer_maps WHERE customer_id = (data->>'customerId')::uuid;
    INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(data->>'serviceOrderId','')::uuid FOR UPDATE;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_version IS DISTINCT FROM ord.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  IF p_operation = 'issue_guided_payment_action' THEN
    IF ord.payment_model <> 'UPFRONT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO ob FROM public.payment_obligations WHERE service_order_id = ord.id AND kind = 'UPFRONT' AND state <> 'VOID' FOR UPDATE;
    IF ob.id IS NULL OR ob.state = 'PAID' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'GUIDED_PAYMENT');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id,
      'GUIDED_PAYMENT', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_managed_setup_action' THEN
    IF ord.payment_model <> 'SUCCESS_FEE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'MANAGED_PAYMENT_SETUP');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id,
      'MANAGED_PAYMENT_SETUP', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_recovery_action' THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = NULLIF(data->>'obligationId','')::uuid FOR UPDATE;
    IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state <> 'AUTHENTICATION_REQUIRED' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'PAYMENT_RECOVERY');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id,
      'PAYMENT_RECOVERY', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_invoice_fallback' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    SELECT * INTO ob FROM public.payment_obligations WHERE id = NULLIF(data->>'obligationId','')::uuid FOR UPDATE;
    IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state IN ('PAID','VOID') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO inv FROM public.payment_invoices
      WHERE obligation_id = ob.id AND status = 'ISSUED' ORDER BY created_at ASC LIMIT 1;
    IF inv.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'INVOICE_PAYMENT');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id, payment_invoice_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id, inv.id,
      'INVOICE_PAYMENT', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at, 'invoiceId', inv.id);
  ELSIF p_operation = 'approve_success_fee' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    IF ord.payment_model <> 'SUCCESS_FEE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = ord.case_id FOR UPDATE;
    SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
    IF admin_private.qualifying_success_outcome_v1(cs) IS NOT TRUE THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF char_length(btrim(coalesce(data->>'evidenceNote',''))) NOT BETWEEN 10 AND 2000
      OR char_length(btrim(coalesce(data->>'approvalReason',''))) NOT BETWEEN 10 AND 2000
      OR NULLIF(data->>'outcomeEvidenceVersionId','') IS NULL
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.accepted_outcome_evidence_v1(cs.id, (data->>'outcomeEvidenceVersionId')::uuid) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO approval FROM public.success_fee_approvals WHERE service_order_id = ord.id;
    IF approval.id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE success_fee_approval_id = approval.id;
      result := jsonb_build_object('status','success','id', approval.id, 'obligationId', ob.id, 'replay', true);
      INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    SELECT * INTO pm FROM public.saved_payment_methods WHERE service_order_id = ord.id AND status = 'USABLE';
    INSERT INTO public.success_fee_approvals(
      service_order_id, case_id, quote_version_id, outcome, success_definition, outcome_evidence_version_id,
      evidence_note, approval_reason, amount_minor, currency, discount_amount_minor, tax_behaviour, tax_amount_minor,
      payment_method_ready, approved_by
    ) VALUES (
      ord.id, cs.id, qv.id, cs.outcome, qv.success_definition, (data->>'outcomeEvidenceVersionId')::uuid,
      btrim(data->>'evidenceNote'), btrim(data->>'approvalReason'),
      ord.amount_minor, ord.currency, qv.discount_amount_minor, ord.tax_behaviour, ord.tax_amount_minor, pm.id IS NOT NULL, actor
    ) RETURNING * INTO approval;
    INSERT INTO public.payment_obligations(
      service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state,
      amount_minor, currency, tax_behaviour, tax_amount_minor, success_fee_approval_id
    ) VALUES (
      ord.id, ord.quote_id, ord.quote_version_id, ord.customer_id, ord.case_id, 'SUCCESS_FEE', 'DUE',
      ord.amount_minor, ord.currency, ord.tax_behaviour, ord.tax_amount_minor, approval.id
    ) RETURNING * INTO ob;
    PERFORM admin_private.write_payment_ledger_v1(
      ord.customer_id, ord.id, ob.id, 'OBLIGATION_CREATED', ob.amount_minor, ob.currency, NULL, 'ADMIN', actor, 'SUCCESS_FEE_APPROVAL'
    );
    PERFORM admin_private.write_record_audit_v1(actor, 'PAYMENT_CHANGED', 'success', ord.id, p_request, 'payment_obligation',
      'Success fee approved', jsonb_build_object('obligationId', ob.id, 'outcome', cs.outcome));
    result := jsonb_build_object('status','success','id', approval.id, 'obligationId', ob.id);
  ELSIF p_operation = 'revoke_action' THEN
    SELECT * INTO action FROM public.customer_actions WHERE id = NULLIF(data->>'actionId','')::uuid FOR UPDATE;
    IF action.id IS NULL OR action.service_order_id IS DISTINCT FROM ord.id OR action.status <> 'OPEN' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF char_length(btrim(coalesce(data->>'reason',''))) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = action.id RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_REVOKED', jsonb_build_object('reason', data->>'reason'));
    result := jsonb_build_object('status','success','id', action.id);
  ELSE
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

-- public.payment_prepare_invoice_v1 from 20261015153000_payment_lane_isolation_v1.sql
CREATE OR REPLACE FUNCTION public.payment_prepare_invoice_v1(p_token text, p_obligation uuid, p_livemode boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; ob public.payment_obligations; ord public.service_orders; op public.provider_operations;
  att public.payment_attempts; inv public.payment_invoices; n integer; declared text;
BEGIN
  declared := CASE WHEN p_livemode IS NULL THEN NULL WHEN p_livemode THEN 'true' ELSE 'false' END;
  IF NOT admin_private.payment_external_lane_allowed_v1(declared) THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  SELECT * INTO ob FROM public.payment_obligations WHERE id = p_obligation FOR UPDATE;
  IF ob.id IS NULL OR ob.state IN ('PAID','VOID') THEN RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = ob.service_order_id FOR UPDATE;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF ob.tax_behaviour NOT IN ('INCLUSIVE','NOT_APPLICABLE') THEN
    RETURN jsonb_build_object('status','denied','reason','tax_not_issuable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_receipts WHERE obligation_id = ob.id) THEN
    RETURN jsonb_build_object('status','denied','reason','already_paid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_invoices WHERE obligation_id = ob.id AND status = 'PAID') THEN
    RETURN jsonb_build_object('status','denied','reason','already_paid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(ob.id::text, 16));
  IF EXISTS (
    SELECT 1 FROM public.payment_attempts
    WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
      AND purpose IN ('CHECKOUT','OFF_SESSION','RECOVERY')
  ) OR EXISTS (
    SELECT 1 FROM public.provider_operations
    WHERE obligation_id = ob.id AND status IN ('PENDING','SUBMITTED')
      AND kind IN ('CREATE_CHECKOUT_SESSION','CREATE_PAYMENT_INTENT','CREATE_RECOVERY_SESSION')
  ) THEN
    RETURN jsonb_build_object('status','denied','reason','active_collection');
  END IF;
  SELECT * INTO inv FROM public.payment_invoices
    WHERE obligation_id = ob.id AND status IN ('DRAFT','ISSUED') ORDER BY created_at ASC LIMIT 1;
  IF inv.id IS NOT NULL THEN
    SELECT * INTO op FROM public.provider_operations WHERE id = inv.provider_operation_id;
    SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = inv.provider_operation_id;
    RETURN jsonb_build_object(
      'status','success','replay', inv.status = 'ISSUED', 'providerOperationId', op.id,
      'idempotencyKey', op.idempotency_key, 'attemptId', att.id, 'invoiceId', inv.id,
      'amountMinor', inv.amount_minor, 'currency', inv.currency, 'taxBehaviour', inv.tax_behaviour,
      'hostedInvoiceUrl', inv.hosted_invoice_url, 'providerInvoiceId', inv.provider_invoice_id,
      'customerId', inv.customer_id, 'serviceOrderId', inv.service_order_id, 'obligationId', inv.obligation_id,
      'orderRef', ord.public_ref
    );
  END IF;
  INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
  VALUES (extensions.gen_random_uuid(), 'CREATE_INVOICE', 'INVOICE', ob.customer_id, ob.service_order_id, ob.id, 'PENDING')
  RETURNING * INTO op;
  SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = ob.id;
  INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
  VALUES (ob.id, ob.service_order_id, op.id, n, 'INVOICE', 'CREATED', ob.amount_minor, ob.currency)
  RETURNING * INTO att;
  INSERT INTO public.payment_invoices(
    obligation_id, service_order_id, customer_id, provider_operation_id, amount_minor, currency,
    tax_behaviour, tax_amount_minor, status
  ) VALUES (
    ob.id, ob.service_order_id, ob.customer_id, op.id, ob.amount_minor, ob.currency,
    ob.tax_behaviour, ob.tax_amount_minor, 'DRAFT'
  ) RETURNING * INTO inv;
  RETURN jsonb_build_object(
    'status','success','replay', false, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
    'attemptId', att.id, 'invoiceId', inv.id, 'amountMinor', inv.amount_minor, 'currency', inv.currency,
    'taxBehaviour', inv.tax_behaviour, 'customerId', inv.customer_id, 'serviceOrderId', inv.service_order_id,
    'obligationId', inv.obligation_id, 'orderRef', ord.public_ref
  );
END; $$;

-- admin_private.guard_activate_v1 from 20260930164529_guard_onboarding_activation_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_activate_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; ready jsonb; rota public.guard_rota_assignments; window_code text; on_date date;
  exception_id uuid; paid_not_ready boolean;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  IF cov.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF cov.state = 'ACTIVE' AND cov.activated_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', cov.id, 'version', cov.record_version, 'replay', true, 'activatedAt', cov.activated_at);
  END IF;
  IF p_version IS DISTINCT FROM cov.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  ready := admin_private.guard_coverage_readiness_v1(cov.id);
  paid_not_ready := cov.coverage_basis = 'DIRECT_GUARD'
    AND (ready->>'billingReady')::boolean IS TRUE
    AND (ready->>'readyToActivate')::boolean IS NOT TRUE;
  IF paid_not_ready THEN
    exception_id := admin_private.guard_open_exception_v1(cov.id, p_actor, ready, 'PAID_NOT_READY', coalesce(p_payload->>'notes',''));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'denied', cov.id, p_request, 'guard_coverage',
      'Activation blocked after payment entitlement', jsonb_build_object('exceptionId', exception_id, 'blockerCodes', ready->'blockerCodes'));
    RETURN jsonb_build_object('status','denied','reason','paid_not_ready','exceptionId', exception_id, 'readiness', ready);
  END IF;
  IF (ready->>'readyToActivate')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('status','denied','reason','not_ready','readiness', ready);
  END IF;
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'ADMIN', p_actor);
  SELECT * INTO cov FROM public.guard_coverages WHERE id = cov.id;
  IF cov.state IS DISTINCT FROM 'READY_TO_ACTIVATE' THEN
    RETURN jsonb_build_object('status','denied','reason','not_ready','readiness', ready);
  END IF;
  SELECT marker.window_code, marker.on_date INTO window_code, on_date
    FROM admin_private.guard_first_planned_marker_v1() AS marker;
  UPDATE public.guard_rota_assignments
    SET first_planned_window_code = window_code, first_planned_on = on_date
    WHERE coverage_id = cov.id AND status = 'ACTIVE'
    RETURNING * INTO rota;
  PERFORM admin_private.guard_begin_activation_v1();
  UPDATE public.guard_coverages SET
    state = 'ACTIVE',
    activated_at = now(),
    permission_id = NULLIF(ready->>'permissionId','')::uuid,
    baseline_id = NULLIF(ready->>'baselineId','')::uuid,
    rota_id = NULLIF(ready->>'rotaId','')::uuid,
    access_id = NULLIF(ready->>'accessId','')::uuid,
    first_planned_window_code = window_code,
    first_planned_on = on_date,
    included_start_at = CASE WHEN coverage_basis = 'INCLUDED' THEN now() ELSE included_start_at END,
    included_end_at = CASE WHEN coverage_basis = 'INCLUDED' THEN now() + interval '30 days' ELSE included_end_at END
    WHERE id = cov.id RETURNING * INTO cov;
  PERFORM admin_private.guard_resolve_exception_v1(cov.id, p_actor);
  PERFORM admin_private.guard_append_event_v1(
    cov.id, 'ADMIN', p_actor, 'ACTIVATED', ready->>'state', 'ACTIVE', 'Guard activated',
    jsonb_build_object(
      'permissionId', cov.permission_id, 'accessId', cov.access_id, 'accessVersion', ready->'accessVersion',
      'baselineId', cov.baseline_id, 'rotaId', cov.rota_id, 'firstPlannedWindow', window_code,
      'firstPlannedOn', on_date, 'includedStartAt', cov.included_start_at, 'includedEndAt', cov.included_end_at
    )
  );
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Activated Guard coverage', jsonb_build_object('activatedAt', cov.activated_at, 'coverageBasis', cov.coverage_basis));
  RETURN jsonb_build_object(
    'status','success','id', cov.id, 'version', cov.record_version, 'activatedAt', cov.activated_at,
    'includedStartAt', cov.included_start_at, 'includedEndAt', cov.included_end_at,
    'firstPlannedWindow', window_code, 'firstPlannedOn', on_date
  );
END; $$;

-- admin_private.guard_issue_price_change_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_issue_price_change_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  sub public.guard_subscriptions; price public.price_versions; offer public.guard_price_change_offers;
  a public.customer_actions; expires timestamptz; hash text;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(p_payload->>'priceVersionId','')::uuid;
  expires := NULLIF(p_payload->>'expiresAt','')::timestamptz;
  hash := NULLIF(p_payload->>'secretHash','');
  IF sub.id IS NULL OR price.id IS NULL OR price.service_code <> 'RELAUNCH_GUARD' OR price.status <> 'APPROVED'
    OR expires IS NULL OR hash IS NULL OR hash !~ '^[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_payload->>'version' IS NOT NULL AND (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.guard_price_change_offers o
    WHERE o.subscription_id = sub.id AND o.status IN ('OFFERED','ACCEPTED','SCHEDULE_PENDING','SCHEDULED')
  ) THEN RETURN jsonb_build_object('status','denied','reason','offer_open'); END IF;
  INSERT INTO public.guard_price_change_offers(
    subscription_id, location_id, old_price_version_id, old_amount_minor, new_price_version_id, new_amount_minor,
    currency, effective_renewal_at, notice_version, notice_text, status
  ) VALUES (
    sub.id, sub.location_id, sub.price_version_id, sub.amount_minor, price.id, price.amount_minor,
    'GBP', sub.current_period_end, 'GUARD_PRICE_CHANGE_NOTICE_V1',
    admin_private.guard_price_change_notice_text_v1(sub.amount_minor, price.amount_minor), 'OFFERED'
  ) RETURNING * INTO offer;
  INSERT INTO public.customer_actions(
    kind, status, customer_id, business_id, location_id, guard_subscription_id, guard_price_change_offer_id,
    secret_hash, expected_email_snapshot, expires_at, created_by
  ) SELECT
    'GUARD_PRICE_CHANGE_ACCEPTANCE', 'OPEN', sub.customer_id, sub.business_id, sub.location_id, sub.id, offer.id,
    hash, c.email, expires, p_actor
    FROM public.customers c WHERE c.id = sub.customer_id
  RETURNING * INTO a;
  UPDATE public.guard_price_change_offers SET customer_action_id = a.id WHERE id = offer.id;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'PRICE_CHANGE_OFFERED', sub.lifecycle_state, sub.lifecycle_state,
    'Price-change offer issued', jsonb_build_object('offerId', offer.id, 'newPriceVersionId', price.id));
  RETURN jsonb_build_object('status','success','id', a.id, 'offerId', offer.id, 'expiresAt', a.expires_at);
END; $$;

-- admin_private.guard_schedule_cancellation_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_schedule_cancellation_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sub public.guard_subscriptions; op public.provider_operations;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  IF sub.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF sub.lifecycle_state IN ('CANCELED','ENDED') THEN RETURN jsonb_build_object('status','denied','reason','already_ended'); END IF;
  IF sub.stripe_subscription_id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','no_provider'); END IF;
  UPDATE public.guard_subscriptions SET
    cancellation_intent = 'CANCEL_AT_PERIOD_END', requested_cancel_at_period_end = true
    WHERE id = sub.id RETURNING * INTO sub;
  op := admin_private.guard_reuse_provider_operation_v1(
    p_request, 'CANCEL_SUBSCRIPTION_PERIOD_END', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id
  );
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'CANCELLATION_REQUESTED', NULL, sub.lifecycle_state,
    coalesce(p_payload->>'reason','Period-end cancellation requested'), jsonb_build_object('providerOperationId', op.id));
  PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'GUARD_CANCELLATION', NULL, 'GBP',
    sub.stripe_subscription_id, 'ADMIN', p_actor, 'CANCEL_AT_PERIOD_END');
  RETURN jsonb_build_object(
    'status','success','id', sub.id, 'version', sub.record_version, 'providerOperationId', op.id,
    'idempotencyKey', op.idempotency_key, 'stripeSubscriptionId', sub.stripe_subscription_id,
    'providerOperationStatus', op.status
  );
END; $$;

-- admin_private.guard_undo_cancellation_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_undo_cancellation_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sub public.guard_subscriptions; op public.provider_operations;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  IF sub.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF sub.lifecycle_state IN ('CANCELED','ENDED') THEN RETURN jsonb_build_object('status','denied','reason','already_ended'); END IF;
  IF sub.cancel_at_period_end IS NOT TRUE AND sub.requested_cancel_at_period_end IS NOT TRUE THEN
    RETURN jsonb_build_object('status','denied','reason','not_scheduled');
  END IF;
  UPDATE public.guard_subscriptions SET
    cancellation_intent = 'UNDO_PERIOD_END', requested_cancel_at_period_end = false
    WHERE id = sub.id RETURNING * INTO sub;
  op := admin_private.guard_reuse_provider_operation_v1(
    p_request, 'UNDO_SUBSCRIPTION_CANCELLATION', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id
  );
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'CANCELLATION_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Undo of scheduled cancellation requested', jsonb_build_object('providerOperationId', op.id));
  RETURN jsonb_build_object(
    'status','success','id', sub.id, 'version', sub.record_version, 'providerOperationId', op.id,
    'idempotencyKey', op.idempotency_key, 'stripeSubscriptionId', sub.stripe_subscription_id,
    'providerOperationStatus', op.status
  );
END; $$;

-- admin_private.guard_request_immediate_cancellation_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_request_immediate_cancellation_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  sub public.guard_subscriptions; inv public.guard_subscription_invoices; adj public.guard_billing_adjustments;
  refundable integer;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  IF sub.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF length(btrim(coalesce(p_payload->>'reason',''))) < 10 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO inv FROM public.guard_subscription_invoices
    WHERE subscription_id = sub.id AND status = 'PAID' ORDER BY created_at DESC LIMIT 1;
  refundable := CASE WHEN inv.id IS NULL THEN 0 ELSE admin_private.guard_refundable_minor_v1(inv.id) END;
  UPDATE public.guard_subscriptions SET cancellation_intent = 'REQUEST_IMMEDIATE_CANCELLATION' WHERE id = sub.id RETURNING * INTO sub;
  IF refundable > 0 AND inv.id IS NOT NULL THEN
    INSERT INTO public.guard_billing_adjustments(
      subscription_id, location_id, invoice_id, kind, status, amount_minor, currency, period_start, period_end, reason, created_by
    ) VALUES (
      sub.id, sub.location_id, inv.id, 'REFUND', 'REQUESTED', refundable, 'GBP',
      sub.current_period_start, sub.current_period_end, btrim(p_payload->>'reason'), p_actor
    ) RETURNING * INTO adj;
  END IF;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'CANCELLATION_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Immediate cancellation review requested', jsonb_build_object('adjustmentId', adj.id, 'refundableMinor', refundable));
  RETURN jsonb_build_object(
    'status','success','id', sub.id, 'adjustmentId', adj.id, 'refundableMinor', refundable,
    'latestInvoiceId', inv.id, 'version', sub.record_version
  );
END; $$;

-- admin_private.guard_approve_refund_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_approve_refund_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  adj public.guard_billing_adjustments; sub public.guard_subscriptions; inv public.guard_subscription_invoices;
  refund public.guard_refunds; op public.provider_operations; amount integer; refundable integer;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO adj FROM public.guard_billing_adjustments WHERE id = NULLIF(p_payload->>'adjustmentId','')::uuid FOR UPDATE;
  IF adj.id IS NULL OR adj.kind <> 'REFUND' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = adj.subscription_id FOR UPDATE;
  SELECT * INTO inv FROM public.guard_subscription_invoices WHERE id = adj.invoice_id FOR UPDATE;
  amount := NULLIF(p_payload->>'amountMinor','')::integer;
  IF amount IS NULL OR amount <= 0 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  refundable := admin_private.guard_refundable_minor_v1(inv.id);
  IF amount > refundable THEN RETURN jsonb_build_object('status','denied','reason','exceeds_refundable'); END IF;
  IF admin_private.guard_unresolved_dispute_v1(sub.id, inv.id) THEN
    RETURN jsonb_build_object('status','denied','reason','unresolved_dispute');
  END IF;
  IF admin_private.guard_overlapping_credit_v1(sub.id, adj.period_start, adj.period_end) THEN
    RETURN jsonb_build_object('status','denied','reason','overlapping_credit');
  END IF;
  SELECT * INTO refund FROM public.guard_refunds WHERE adjustment_id = adj.id FOR UPDATE;
  IF refund.id IS NOT NULL THEN
    SELECT * INTO op FROM public.provider_operations WHERE id = refund.provider_operation_id;
    RETURN jsonb_build_object(
      'status','success','id', refund.id, 'providerOperationId', refund.provider_operation_id, 'replay', true,
      'idempotencyKey', op.idempotency_key, 'amountMinor', refund.amount_minor,
      'paymentIntentId', refund.stripe_payment_intent_id, 'chargeId', refund.stripe_charge_id,
      'providerOperationStatus', op.status, 'guardRefundId', refund.id,
      'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardSubscriptionId', sub.id
    );
  END IF;
  INSERT INTO public.provider_operations(
    idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
  ) VALUES (
    p_request, 'CREATE_REFUND', 'GUARD_REFUND', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
  ) RETURNING * INTO op;
  UPDATE public.guard_billing_adjustments SET
    status = 'APPROVED', approved_amount_minor = amount, approved_by = p_actor, approved_at = now()
    WHERE id = adj.id RETURNING * INTO adj;
  INSERT INTO public.guard_refunds(
    adjustment_id, subscription_id, invoice_id, provider_operation_id, stripe_payment_intent_id, stripe_charge_id,
    amount_minor, currency, status
  ) VALUES (
    adj.id, sub.id, inv.id, op.id, inv.stripe_payment_intent_id, inv.stripe_charge_id, amount, 'GBP', 'APPROVED'
  ) RETURNING * INTO refund;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'REFUND_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Bounded refund approved', jsonb_build_object('refundId', refund.id, 'amountMinor', amount));
  RETURN jsonb_build_object(
    'status','success','id', refund.id, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
    'amountMinor', amount, 'paymentIntentId', inv.stripe_payment_intent_id, 'chargeId', inv.stripe_charge_id,
    'providerOperationStatus', op.status, 'guardRefundId', refund.id,
    'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardSubscriptionId', sub.id
  );
END; $$;

-- admin_private.guard_approve_immediate_cancellation_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_approve_immediate_cancellation_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sub public.guard_subscriptions; op public.provider_operations;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  IF sub.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF sub.lifecycle_state IN ('CANCELED','ENDED') THEN RETURN jsonb_build_object('status','denied','reason','already_ended'); END IF;
  IF sub.stripe_subscription_id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','no_provider'); END IF;
  IF sub.cancellation_intent IS DISTINCT FROM 'REQUEST_IMMEDIATE_CANCELLATION' THEN
    RETURN jsonb_build_object('status','denied','reason','no_customer_request');
  END IF;
  IF sub.location_id IS DISTINCT FROM NULLIF(p_payload->>'locationId','')::uuid AND NULLIF(p_payload->>'locationId','') IS NOT NULL THEN
    RETURN jsonb_build_object('status','denied','reason','location_mismatch');
  END IF;
  op := admin_private.guard_reuse_provider_operation_v1(
    p_request, 'CANCEL_SUBSCRIPTION_IMMEDIATE', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id
  );
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'CANCELLATION_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Immediate cancellation approved for provider execution', jsonb_build_object('providerOperationId', op.id));
  RETURN jsonb_build_object(
    'status','success','id', sub.id, 'version', sub.record_version, 'providerOperationId', op.id,
    'idempotencyKey', op.idempotency_key, 'stripeSubscriptionId', sub.stripe_subscription_id,
    'providerOperationStatus', op.status
  );
END; $$;

-- admin_private.guard_approve_credit_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_approve_credit_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE adj public.guard_billing_adjustments; sub public.guard_subscriptions; amount integer; creditable integer;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  amount := NULLIF(p_payload->>'amountMinor','')::integer;
  IF sub.id IS NULL OR amount IS NULL OR amount <= 0 OR length(btrim(coalesce(p_payload->>'reason',''))) < 10 THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  creditable := admin_private.guard_creditable_minor_v1(sub.id, sub.current_period_start, sub.current_period_end);
  IF amount > creditable THEN RETURN jsonb_build_object('status','denied','reason','exceeds_attributable'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.guard_billing_adjustments a
    WHERE a.subscription_id = sub.id AND a.kind = 'REFUND' AND a.status IN ('APPROVED','SUBMITTED','SUCCEEDED')
      AND a.period_start IS NOT DISTINCT FROM sub.current_period_start
      AND a.period_end IS NOT DISTINCT FROM sub.current_period_end
  ) THEN RETURN jsonb_build_object('status','denied','reason','overlapping_refund'); END IF;
  INSERT INTO public.guard_billing_adjustments(
    subscription_id, location_id, kind, status, amount_minor, currency, period_start, period_end, reason,
    approved_amount_minor, approved_by, approved_at, created_by
  ) VALUES (
    sub.id, sub.location_id, 'SERVICE_CREDIT', 'PENDING_APPLICATION', amount, 'GBP',
    sub.current_period_start, sub.current_period_end, btrim(p_payload->>'reason'),
    amount, p_actor, now(), p_actor
  ) RETURNING * INTO adj;
  PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'GUARD_CREDIT_APPROVED', amount, 'GBP',
    adj.id::text, 'ADMIN', p_actor, 'SERVICE_CREDIT');
  RETURN jsonb_build_object('status','success','id', adj.id, 'statusName', adj.status);
END; $$;

-- admin_private.guard_map_provider_price_v1 from 20260930180050_guard_subscriptions_billing_v1.sql
CREATE OR REPLACE FUNCTION admin_private.guard_map_provider_price_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  price public.price_versions; map public.guard_provider_price_maps; op public.provider_operations;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(p_payload->>'priceVersionId','')::uuid FOR UPDATE;
  IF price.id IS NULL OR price.service_code <> 'RELAUNCH_GUARD' OR price.status <> 'APPROVED'
    OR price.payment_model <> 'RECURRING_MONTHLY' OR price.billing_cadence <> 'MONTHLY'
  THEN RETURN jsonb_build_object('status','denied','reason','wrong_price'); END IF;
  IF price.tax_behaviour IS NULL OR price.tax_behaviour NOT IN ('NOT_APPLICABLE','INCLUSIVE') THEN
    RETURN jsonb_build_object('status','denied','reason','tax_not_provider_ready');
  END IF;
  SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = price.id;
  IF map.id IS NOT NULL THEN
    SELECT * INTO op FROM public.provider_operations WHERE id = map.provider_operation_id;
    RETURN jsonb_build_object(
      'status','success','id', map.id, 'providerOperationId', map.provider_operation_id, 'replay', true,
      'idempotencyKey', op.idempotency_key, 'providerOperationStatus', op.status,
      'amountMinor', price.amount_minor, 'currency', 'GBP', 'priceVersionId', price.id
    );
  END IF;
  SELECT * INTO op FROM public.provider_operations
    WHERE kind = 'CREATE_RECURRING_PRICE' AND purpose = 'GUARD_PRICE' AND idempotency_key = price.id FOR UPDATE;
  IF op.id IS NULL THEN
    INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, status)
    VALUES (price.id, 'CREATE_RECURRING_PRICE', 'GUARD_PRICE', NULL, 'PENDING')
    RETURNING * INTO op;
  END IF;
  RETURN jsonb_build_object(
    'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
    'amountMinor', price.amount_minor, 'currency', 'GBP', 'priceVersionId', price.id,
    'providerOperationStatus', op.status
  );
END; $$;

-- admin_private.settings_reauth_ok_v1 from 20261001141218_admin_settings_privacy_operations_v1.sql
CREATE OR REPLACE FUNCTION admin_private.settings_reauth_ok_v1(p_token text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_sessions s
    WHERE s.token_hash = p_token
      AND s.revoked_at IS NULL
      AND s.created_at >= now() - interval '30 minutes'
  );
$$;

COMMIT;
