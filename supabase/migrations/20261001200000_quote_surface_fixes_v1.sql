-- Step 23 acceptance and security hardening: two quote surface defects.
-- Patches admin_private.admin_quote_command_core_v1 and public.admin_quote_list_v1.
-- Deliberately does NOT redefine public.admin_quote_command_v1: see the note below.
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED
-- Generated with: npx supabase migration new quote_surface_fixes_v1
-- Do not apply from this PR. Do not replay or modify applied migrations (Steps 1-21).
--
-- ---------------------------------------------------------------------------
-- Which function carries the quote command, and why this file patches the
-- private core rather than the public entry point.
--
-- Step 13 (20260929233953_catalogue_quotes_orders_v1.sql) created the quote
-- command as public.admin_quote_command_v1. Step 15
-- (20260930164529_guard_onboarding_activation_v1.sql) then changed that
-- arrangement: it renamed the Step 13 function to admin_quote_command_core_v1,
-- moved it into admin_private, revoked it from PUBLIC, anon, authenticated AND
-- service_role, and created a NEW public.admin_quote_command_v1 wrapper in its
-- place. The wrapper delegates every operation except 'record_qualification' to
-- the private core, and routes 'record_qualification' to
-- admin_private.record_guard_linked_qualification_v1, which proves a genuine
-- paid Guard coverage relationship through
-- admin_private.paid_guard_discount_ready_v1 instead of trusting the
-- coverage fields in the request payload.
--
-- So the function that still holds the Step 13 command body — and therefore the
-- revoke defect below — is admin_private.admin_quote_command_core_v1. This file
-- replaces that private core and MUST NOT redefine public.admin_quote_command_v1:
-- doing so would overwrite the Step 15 wrapper and silently reinstate the
-- Step 13 qualification branch, which accepts caller-supplied PAID/ACTIVE
-- strings as proof of coverage and would hand out the 20% Guard discount
-- without any qualifying Guard relationship. The Step 15 wrapper, its ACL and
-- the Guard-linked qualification path are all left untouched.
--
-- ---------------------------------------------------------------------------
-- Defect 1: cross-quote action revocation.
-- Found by Step 23 adversarial authorization testing.
--
-- The 'revoke_action' branch loaded the target customer action by its identifier
-- alone. It checked kind and status but never checked that the action belonged
-- to the quote named in the same request. An operator who supplied quote A's
-- identifier together with an OPEN QUOTE_ACCEPTANCE action identifier belonging
-- to quote B therefore revoked quote B's action, deleted quote B's customer
-- action challenges and sessions, and wrote the audit row against quote A.
-- That is a cross-record mutation and a mis-attributed audit entry.
--
-- The equivalent payments branch (admin_payment_command_v1 'revoke_action') already
-- verifies action.service_order_id against the loaded order. This brings the quote
-- branch to the same standard by requiring the action's quote version to belong to
-- the loaded quote. Any version of the quote is accepted, not only the current one,
-- so an action issued against a previously offered version stays revocable.
--
-- Replacement is restricted to that single guard. Every other line of the core
-- body is carried over unchanged from its current definition, including the
-- 'record_qualification' branch, which the Step 15 wrapper intercepts before the
-- core is ever reached. CREATE OR REPLACE keeps the existing owner, SECURITY
-- DEFINER marking and pinned empty search_path; the REVOKE below restates that
-- the core stays internal, with no service_role grant, because the public
-- wrapper is the only intended entry point.
--
-- Regression tests: apps/admin/lib/commerce/quote-surface-fixes.database.test.ts
--   (full migration chain, Step 15 wrapper preserved, spoofed Guard
--   qualification denied, cross-quote revoke refused, own-quote revoke allowed)
--   and apps/admin/lib/commerce/database.test.ts.
--
-- ---------------------------------------------------------------------------
-- Defect 2: the quote list raises instead of returning.
-- Found by the Step 23 simulated Admin workday, which is the first test to
-- call public.admin_quote_list_v1 at all.
--
-- The aggregate ordered by `row.quote.created_at`. PostgreSQL reads a
-- three-part qualified name as schema.table.column, so it looked for a table
-- named `quote` and raised `missing FROM-clause entry for table "quote"`. The
-- plan is built the first time the statement runs, so every call failed
-- regardless of how many quotes existed, and the /commercial page returned an
-- error for the operator rather than the quote list. The existing page test
-- mocks loadQuotes, so nothing exercised the SQL.
--
-- The fix parenthesises the composite reference. Ordering, filtering and the
-- returned shape are otherwise unchanged.
--
-- This one is on the public function, which Step 15 did not touch.
--
-- Regression tests: apps/admin/lib/workday.database.test.ts
--   "carries one enquiry through triage, a case, evidence, a pack and a quote"
--   and apps/admin/lib/commerce/quote-surface-fixes.database.test.ts.

BEGIN;

CREATE OR REPLACE FUNCTION admin_private.admin_quote_command_core_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb;
  qu public.quotes; qv public.quote_versions; price public.price_versions; snap public.quote_discount_snapshots;
  cs public.cases; mon public.monitoring_requests; c public.customers;
  service text; scope text; exclusions text; success text; valid_until timestamptz; expires timestamptz;
  secret text; action public.customer_actions; apply_discount boolean; v_tax_behaviour text; v_tax_rate integer;
  prep text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN (
      'create_draft','create_version','set_draft_tax','offer','supersede','cancel',
      'record_qualification','create_quote_acceptance_action','revoke_action'
    ) OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.quote_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;

  IF p_operation = 'record_qualification' THEN
    service := data->>'serviceCode';
    SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid;
    IF price.id IS NULL OR service IS NULL OR service NOT IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF coalesce(data->>'qualificationResult','') = 'QUALIFIED' THEN
      IF coalesce(data->>'coverageBasis','') <> 'PAID' OR coalesce(data->>'coverageStatus','') <> 'ACTIVE'
        OR coalesce(data->>'coverageType','') <> 'PAID_GUARD' OR coalesce(data->>'paidVsIncluded','') <> 'PAID'
        OR coalesce(data->>'issuePredatesPaidCoverage','') <> 'false'
        OR service NOT IN ('MANAGED_RELAUNCH','MANAGED_REVIEW')
        OR NULLIF(data->>'locationId','')::uuid IS NULL
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      INSERT INTO public.quote_discount_snapshots(
        location_id, coverage_basis, coverage_status, coverage_type, future_coverage_id, paid_vs_included,
        issue_observed_at, issue_predates_paid_coverage, service_code, price_version_id, policy_id, discount_bps,
        qualification_result, reason_code, standard_amount_minor, discount_amount_minor, discounted_subtotal_minor,
        recorded_by, source, evidence_notes, valid_until
      ) VALUES (
        (data->>'locationId')::uuid, 'PAID', 'ACTIVE', 'PAID_GUARD', NULLIF(data->>'futureCoverageId','')::uuid, 'PAID',
        NULLIF(data->>'issueObservedAt','')::timestamptz, false, service, price.id, 'PAID_GUARD_MANAGED_20', 2000,
        'QUALIFIED', 'QUALIFIED', price.amount_minor,
        admin_private.money_discount_minor_v1(price.amount_minor, 2000),
        price.amount_minor - admin_private.money_discount_minor_v1(price.amount_minor, 2000),
        actor, 'ADMIN_RECORDED', NULLIF(left(btrim(coalesce(data->>'evidenceNotes','')), 2000), ''),
        NULLIF(data->>'validUntil','')::timestamptz
      ) RETURNING * INTO snap;
    ELSE
      INSERT INTO public.quote_discount_snapshots(
        location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, issue_observed_at,
        issue_predates_paid_coverage, service_code, price_version_id, policy_id, discount_bps, qualification_result,
        reason_code, standard_amount_minor, discount_amount_minor, discounted_subtotal_minor, recorded_by, source, evidence_notes
      ) VALUES (
        NULLIF(data->>'locationId','')::uuid, coalesce(NULLIF(data->>'coverageBasis',''),'NONE'),
        coalesce(NULLIF(data->>'coverageStatus',''),'UNKNOWN'), coalesce(NULLIF(data->>'coverageType',''),'NONE'),
        coalesce(NULLIF(data->>'paidVsIncluded',''),'UNPROVEN'), NULLIF(data->>'issueObservedAt','')::timestamptz,
        coalesce((data->>'issuePredatesPaidCoverage')::boolean, true), service, price.id, 'NONE', 0, 'NOT_QUALIFIED',
        coalesce(NULLIF(data->>'reasonCode',''),'NO_AUTHORITATIVE_COVERAGE'), price.amount_minor, 0, price.amount_minor,
        actor, 'ADMIN_RECORDED', NULLIF(left(btrim(coalesce(data->>'evidenceNotes','')), 2000), '')
      ) RETURNING * INTO snap;
    END IF;
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', snap.id, p_request, 'discount_snapshot',
      'Guard discount qualification recorded', jsonb_build_object('result', snap.qualification_result, 'reasonCode', snap.reason_code));
    result := jsonb_build_object('status', 'success', 'id', snap.id, 'result', snap.qualification_result, 'reasonCode', snap.reason_code);
    INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'create_draft' THEN
    service := data->>'serviceCode';
    scope := btrim(coalesce(data->>'scope', ''));
    exclusions := btrim(coalesce(data->>'exclusions', ''));
    BEGIN valid_until := (data->>'validUntil')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF service IS NULL OR char_length(scope) NOT BETWEEN 10 AND 5000 OR char_length(exclusions) NOT BETWEEN 10 AND 5000
      OR valid_until IS NULL OR valid_until <= now() THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO c FROM public.customers WHERE id = NULLIF(data->>'customerId','')::uuid;
    IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NULLIF(data->>'caseId','')::uuid;
    SELECT * INTO mon FROM public.monitoring_requests WHERE id = NULLIF(data->>'monitoringRequestId','')::uuid;
    IF NOT admin_private.quote_service_compatible_v1(cs, service, mon, NULLIF(data->>'locationId','')::uuid) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF cs.id IS NOT NULL AND (cs.customer_id IS DISTINCT FROM c.id OR cs.business_id IS DISTINCT FROM NULLIF(data->>'businessId','')::uuid) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid;
    IF price.id IS NULL OR NOT admin_private.price_version_is_current_v1(price.id, service, now()) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    apply_discount := coalesce((data->>'applyDiscount')::boolean, false);
    IF apply_discount THEN
      SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = NULLIF(data->>'qualificationId','')::uuid;
      IF NOT admin_private.qualified_discount_snapshot_v1(
        snap, service, price.id, coalesce(cs.location_id, NULLIF(data->>'locationId','')::uuid)
      ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    ELSE
      IF NULLIF(data->>'qualificationId','') IS NOT NULL THEN
        SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = NULLIF(data->>'qualificationId','')::uuid;
        IF snap.id IS NULL OR snap.qualification_result <> 'NOT_QUALIFIED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      ELSE
        snap := admin_private.fail_closed_discount_v1(actor, service, price, coalesce(cs.location_id, NULLIF(data->>'locationId','')::uuid), 'NO_AUTHORITATIVE_COVERAGE');
      END IF;
    END IF;
    success := nullif(btrim(coalesce(data->>'successDefinition', '')), '');
    IF success IS NULL THEN success := admin_private.success_definition_v1(service); END IF;
    v_tax_behaviour := coalesce(NULLIF(data->>'taxBehaviour',''), price.tax_behaviour);
    v_tax_rate := coalesce(NULLIF(data->>'taxRateBps','')::integer, price.tax_rate_bps);
    INSERT INTO public.quotes(public_ref, customer_id, business_id, location_id, case_id, monitoring_request_id, status, created_by)
    VALUES (
      admin_private.commerce_public_ref_v1('QT'), c.id, coalesce(cs.business_id, NULLIF(data->>'businessId','')::uuid),
      coalesce(cs.location_id, NULLIF(data->>'locationId','')::uuid), cs.id, mon.id, 'DRAFT', actor
    ) RETURNING * INTO qu;
    qv := admin_private.build_quote_version_v1(
      qu, actor, service, price, snap, scope, exclusions, success, valid_until, v_tax_behaviour,
      coalesce(NULLIF(data->>'taxJurisdiction',''), price.tax_jurisdiction), v_tax_rate, coalesce(NULLIF(data->>'taxCode',''), price.tax_code)
    );
    UPDATE public.quotes SET current_version_id = qv.id, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_DRAFTED', jsonb_build_object('serviceCode', service, 'totalAmountMinor', qv.total_amount_minor));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote draft created', jsonb_build_object('operation', p_operation, 'quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version, 'publicRef', qu.public_ref);
    INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  SELECT * INTO qu FROM public.quotes WHERE id = NULLIF(data->>'quoteId','')::uuid FOR UPDATE;
  IF qu.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_operation NOT IN ('create_quote_acceptance_action','revoke_action') AND p_version IS DISTINCT FROM qu.record_version THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = qu.current_version_id FOR UPDATE;

  IF p_operation = 'create_version' THEN
    IF qu.status = 'ACCEPTED' OR qv.status = 'ACCEPTED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    service := coalesce(data->>'serviceCode', qv.service_code);
    scope := btrim(coalesce(NULLIF(data->>'scope',''), qv.scope_text));
    exclusions := btrim(coalesce(NULLIF(data->>'exclusions',''), qv.exclusions_text));
    BEGIN valid_until := coalesce(NULLIF(data->>'validUntil','')::timestamptz, qv.valid_until); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF valid_until IS NULL OR valid_until <= now() THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO price FROM public.price_versions WHERE id = coalesce(NULLIF(data->>'priceVersionId','')::uuid, qv.price_version_id);
    SELECT * INTO cs FROM public.cases WHERE id = qu.case_id;
    SELECT * INTO mon FROM public.monitoring_requests WHERE id = qu.monitoring_request_id;
    IF NOT admin_private.quote_service_compatible_v1(cs, service, mon, qu.location_id)
      OR NOT admin_private.price_version_is_current_v1(price.id, service, now())
    THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    apply_discount := coalesce((data->>'applyDiscount')::boolean, false);
    IF apply_discount THEN
      SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = NULLIF(data->>'qualificationId','')::uuid;
      IF NOT admin_private.qualified_discount_snapshot_v1(snap, service, price.id, qu.location_id) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
    ELSE
      snap := admin_private.fail_closed_discount_v1(actor, service, price, qu.location_id, 'NO_AUTHORITATIVE_COVERAGE');
    END IF;
    qv := admin_private.build_quote_version_v1(
      qu, actor, service, price, snap, scope, exclusions,
      coalesce(nullif(btrim(coalesce(data->>'successDefinition','')), ''), admin_private.success_definition_v1(service)),
      valid_until, coalesce(NULLIF(data->>'taxBehaviour',''), price.tax_behaviour),
      coalesce(NULLIF(data->>'taxJurisdiction',''), price.tax_jurisdiction),
      coalesce(NULLIF(data->>'taxRateBps','')::integer, price.tax_rate_bps),
      coalesce(NULLIF(data->>'taxCode',''), price.tax_code)
    );
    UPDATE public.quotes SET record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_VERSION_CREATED', jsonb_build_object('versionNumber', qv.version_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote version created', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version);
  ELSIF p_operation = 'set_draft_tax' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = coalesce(NULLIF(data->>'quoteVersionId','')::uuid, qu.current_version_id) FOR UPDATE;
    IF qv.quote_id IS DISTINCT FROM qu.id OR qv.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    v_tax_behaviour := data->>'taxBehaviour';
    v_tax_rate := NULLIF(data->>'taxRateBps','')::integer;
    IF v_tax_behaviour IS NULL OR v_tax_behaviour NOT IN ('UNCONFIRMED','INCLUSIVE','EXCLUSIVE','NOT_APPLICABLE') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF v_tax_behaviour IN ('UNCONFIRMED','NOT_APPLICABLE') THEN v_tax_rate := NULL; END IF;
    IF v_tax_behaviour IN ('INCLUSIVE','EXCLUSIVE') AND v_tax_rate IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.quote_versions SET
      tax_behaviour = v_tax_behaviour,
      tax_jurisdiction = NULLIF(data->>'taxJurisdiction',''),
      tax_rate_bps = v_tax_rate,
      tax_code = NULLIF(data->>'taxCode',''),
      tax_amount_minor = admin_private.money_tax_minor_v1(quote_versions.quoted_subtotal_minor, v_tax_behaviour, v_tax_rate),
      total_amount_minor = admin_private.money_total_minor_v1(
        quote_versions.quoted_subtotal_minor, v_tax_behaviour,
        admin_private.money_tax_minor_v1(quote_versions.quoted_subtotal_minor, v_tax_behaviour, v_tax_rate)
      )
    WHERE id = qv.id RETURNING * INTO qv;
    UPDATE public.quotes SET record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'TAX_SET', jsonb_build_object('taxBehaviour', v_tax_behaviour));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Draft quote tax set', jsonb_build_object('taxBehaviour', v_tax_behaviour));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version);
  ELSIF p_operation = 'offer' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = coalesce(NULLIF(data->>'quoteVersionId','')::uuid, qu.current_version_id) FOR UPDATE;
    IF qv.quote_id IS DISTINCT FROM qu.id OR qv.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT admin_private.quote_version_offerable_v1(qv) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF qu.current_version_id IS DISTINCT FROM qv.id THEN
      UPDATE public.quote_versions SET status = 'SUPERSEDED' WHERE id = qu.current_version_id AND status = 'OFFERED';
      PERFORM admin_private.revoke_quote_actions_v1(qu.current_version_id, 'A replacement quote version was offered.');
    END IF;
    UPDATE public.quote_versions SET status = 'OFFERED', offered_at = now(), offered_by = actor WHERE id = qv.id RETURNING * INTO qv;
    UPDATE public.quotes SET status = 'OFFERED', current_version_id = qv.id, record_version = record_version + 1, updated_at = now()
      WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_OFFERED', jsonb_build_object('versionNumber', qv.version_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote offered', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version);
  ELSIF p_operation = 'supersede' THEN
    IF qv.status <> 'OFFERED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.quote_versions SET status = 'SUPERSEDED' WHERE id = qv.id;
    PERFORM admin_private.revoke_quote_actions_v1(qv.id, 'This quote version was superseded.');
    UPDATE public.quotes SET status = 'SUPERSEDED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_SUPERSEDED', jsonb_build_object('quoteVersionId', qv.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote superseded', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'version', qu.record_version);
  ELSIF p_operation = 'cancel' THEN
    IF qu.status NOT IN ('DRAFT','OFFERED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.quote_versions SET status = 'CANCELLED' WHERE id = qv.id AND status IN ('DRAFT','OFFERED');
    PERFORM admin_private.revoke_quote_actions_v1(qv.id, 'This quote was cancelled.');
    UPDATE public.quotes SET status = 'CANCELLED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_CANCELLED', jsonb_build_object('quoteVersionId', qv.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote cancelled', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'version', qu.record_version);
  ELSIF p_operation = 'create_quote_acceptance_action' THEN
    IF qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF qv.valid_until <= now() OR qv.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO c FROM public.customers WHERE id = qu.customer_id;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' OR expires IS NULL
      OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days'
      OR expires > qv.valid_until
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(qu.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = qu.customer_id AND m.business_id = qu.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    prep := admin_private.prepare_quote_acceptance_action_v1(qv.id);
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN
      INSERT INTO public.customer_actions(
        customer_id, business_id, location_id, case_id, quote_version_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by
      ) VALUES (
        qu.customer_id, qu.business_id, qu.location_id, qu.case_id, qv.id, 'QUOTE_ACCEPTANCE', secret, c.email, expires, actor
      ) RETURNING * INTO action;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'denied');
    END;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', 'QUOTE_ACCEPTANCE', 'quoteVersionId', qv.id));
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'ACTION_ISSUED', jsonb_build_object('actionId', action.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote acceptance action created', jsonb_build_object('actionId', action.id, 'quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', action.id, 'expiresAt', action.expires_at, 'quoteVersionId', qv.id);
  ELSE
    SELECT * INTO action FROM public.customer_actions WHERE id = NULLIF(data->>'actionId','')::uuid FOR UPDATE;
    IF action.id IS NULL OR action.kind <> 'QUOTE_ACCEPTANCE' OR action.status <> 'OPEN'
      OR action.quote_version_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.quote_versions v WHERE v.id = action.quote_version_id AND v.quote_id = qu.id
      )
    THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF char_length(btrim(coalesce(data->>'reason',''))) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = action.id RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_REVOKED', jsonb_build_object('reason', left(data->>'reason', 200)));
    DELETE FROM admin_private.customer_action_challenges WHERE action_id = action.id;
    DELETE FROM admin_private.customer_action_sessions WHERE action_id = action.id;
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote acceptance action revoked', jsonb_build_object('actionId', action.id));
    result := jsonb_build_object('status', 'success', 'id', action.id, 'actionStatus', action.status);
  END IF;
  INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_quote_list_v1(p_token text, p_status text DEFAULT NULL, p_q text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb; q text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('DRAFT','OFFERED','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED','CANCELLED') THEN
    RAISE EXCEPTION 'Invalid quote filter';
  END IF;
  q := nullif(btrim(coalesce(p_q, '')), '');
  IF q IS NOT NULL AND char_length(q) > 80 THEN RAISE EXCEPTION 'Invalid quote filter'; END IF;
  SELECT coalesce(jsonb_agg(admin_private.quote_json_v1(row.quote, row.version) ORDER BY (row.quote).created_at DESC), '[]')
  INTO items
  FROM (
    SELECT qu AS quote, qv AS version
    FROM public.quotes qu
    JOIN public.quote_versions qv ON qv.id = qu.current_version_id
    WHERE (p_status IS NULL OR qu.status = p_status)
      AND (q IS NULL OR qu.public_ref ILIKE ('%' || q || '%') OR qv.service_name ILIKE ('%' || q || '%'))
    ORDER BY qu.created_at DESC
    LIMIT 100
  ) row;
  RETURN jsonb_build_object('quotes', items);
END; $$;

-- The private core stays unreachable from every role, including service_role.
-- Step 15 revoked it on exactly these terms and the Step 15 public wrapper,
-- whose own service-role grant this file does not touch, is the way in.
REVOKE ALL ON FUNCTION admin_private.admin_quote_command_core_v1(text, uuid, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_quote_list_v1(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_quote_list_v1(text, text, text) TO service_role;

COMMIT;
