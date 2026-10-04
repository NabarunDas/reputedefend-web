BEGIN;

-- UX-10H. The Customer Portal has no Guard projection or portal command.
-- This migration adds a customer-safe read model and routes existing Guard
-- customer mutations through the same private helpers as the emailed secure
-- link. It does not create a table, a second Guard status, or a new
-- subscription authority.
--
-- Cancellation, payment recovery and checkout stay available only when an
-- existing GUARD_SUBSCRIPTION_START action is already bound to that
-- subscription. The portal never trusts a client-supplied subscription id.
-- The emailed command still resolves coalesce(action.guard_subscription_id,
-- data.subscriptionId) and then calls the shared helper.
--
-- Rollback: DROP the new functions and restore
-- public.customer_guard_subscription_command_v1 and
-- admin_private.customer_action_command_core_v1 from the applied migrations
-- that last defined them. Do not edit those applied files.
-- Forward fix: a later migration may CREATE OR REPLACE these functions.
-- No new index: the selector is computed from the coverage id.
-- This migration is source review only. Do not apply it from this change.

CREATE FUNCTION admin_private.customer_portal_guard_selector_v1(p_coverage uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=''
AS $$
  SELECT 'gd-' || encode(extensions.digest(p_coverage::text, 'sha256'), 'hex');
$$;

-- Read-only portal capability. These booleans are not stored. The emailed
-- secure-link command does not call this helper and keeps its own contract.
-- Checkout is only an initial setup step. Recovery is only PAST_DUE.
-- Period-end cancellation and its undo follow the stored request and the
-- provider-confirmed flag. An UNDO_PERIOD_END intent is still awaiting
-- provider confirmation, so neither another cancellation nor another undo
-- is offered until that confirmation clears the intent. Ended subscriptions
-- gain no mutation.
CREATE FUNCTION admin_private.customer_portal_guard_subscription_capabilities_v1(
  p_subscription public.guard_subscriptions,
  p_consent boolean
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=''
AS $$
  SELECT jsonb_build_object(
    'checkout', coalesce(p_consent, false)
      AND p_subscription.lifecycle_state IN ('PENDING_CUSTOMER', 'PENDING_PROVIDER', 'INCOMPLETE'),
    'recovery', coalesce(p_consent, false)
      AND p_subscription.lifecycle_state = 'PAST_DUE',
    'periodEndCancellation', coalesce(p_consent, false)
      AND p_subscription.lifecycle_state NOT IN ('CANCELED', 'ENDED')
      AND p_subscription.cancel_at_period_end IS NOT TRUE
      AND p_subscription.requested_cancel_at_period_end IS NOT TRUE
      AND p_subscription.cancellation_intent IS DISTINCT FROM 'CANCEL_AT_PERIOD_END'
      AND p_subscription.cancellation_intent IS DISTINCT FROM 'UNDO_PERIOD_END',
    'undoPeriodEndCancellation', coalesce(p_consent, false)
      AND p_subscription.lifecycle_state NOT IN ('CANCELED', 'ENDED')
      AND p_subscription.cancellation_intent IS DISTINCT FROM 'UNDO_PERIOD_END'
      AND (
        p_subscription.cancel_at_period_end IS TRUE
        OR p_subscription.requested_cancel_at_period_end IS TRUE
        OR p_subscription.cancellation_intent IS NOT DISTINCT FROM 'CANCEL_AT_PERIOD_END'
      ),
    'immediateCancellationReview', coalesce(p_consent, false)
      AND p_subscription.lifecycle_state NOT IN ('CANCELED', 'ENDED')
      AND p_subscription.cancellation_intent IS DISTINCT FROM 'REQUEST_IMMEDIATE_CANCELLATION'
  );
$$;

CREATE FUNCTION admin_private.decline_guard_permission_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $decline$
DECLARE
  a public.customer_actions;
  off public.guard_included_offers;
  result jsonb;
BEGIN
  UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = p_action.id RETURNING * INTO a;
  IF a.guard_included_offer_id IS NOT NULL THEN
    SELECT * INTO off FROM public.guard_included_offers WHERE id = a.guard_included_offer_id FOR UPDATE;
    IF off.status IN ('ELIGIBLE', 'OFFERED') THEN
      UPDATE public.guard_included_offers SET status = 'DECLINED', declined_at = now() WHERE id = off.id;
    END IF;
  END IF;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, NULL, 'CUSTOMER', p_actor, 'ACTION_DECLINED', jsonb_build_object('kind', 'GUARD_PERMISSION'));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', a.guard_coverage_id, p_request, 'guard_coverage',
    'Customer declined a Guard permission action', jsonb_build_object('actionId', a.id));
  result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
  RETURN result;
END;
$decline$;

CREATE OR REPLACE FUNCTION admin_private.customer_action_command_core_v1(
  p_token_hash text, p_request uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $core$
DECLARE
  sess admin_private.customer_action_sessions;
  a public.customer_actions;
  fp text;
  cached jsonb;
  result jsonb;
  data jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('accept', 'decline', 'revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(sess.action_id, p_operation, data)::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation IN ('accept', 'decline') AND a.kind = 'GUARD_PERMISSION' THEN
    IF p_operation = 'accept' THEN
      IF data->'accepted' IS DISTINCT FROM 'true'::jsonb OR data->>'permissionVersion' IS DISTINCT FROM 'GUARD_PERMISSION_V1' THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      IF a.status = 'COMPLETED' OR EXISTS (
        SELECT 1 FROM public.guard_permissions p WHERE p.coverage_id = a.guard_coverage_id AND p.status = 'ACTIVE'
      ) THEN
        result := admin_private.accept_guard_permission_v1(a, sess.auth_user_id, p_request);
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
        RETURN result;
      END IF;
      IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
      result := admin_private.accept_guard_permission_v1(a, sess.auth_user_id, p_request);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    result := admin_private.decline_guard_permission_v1(a, sess.auth_user_id, p_request);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF a.kind IN ('QUOTE_ACCEPTANCE', 'AGREEMENT_ACCEPTANCE', 'AUTHORIZATION_REVOCATION') THEN
    RETURN admin_private.customer_commercial_apply_v1(
      a.id, sess.auth_user_id, p_request, fp, p_operation, data, 'CUSTOMER_OTP', a.customer_id, a.case_id, NULL
    );
  END IF;
  RETURN jsonb_build_object('status', 'unavailable');
END;
$core$;

CREATE FUNCTION admin_private.customer_guard_subscription_apply_v1(
  p_action public.customer_actions,
  p_actor uuid,
  p_request uuid,
  p_fingerprint text,
  p_operation text,
  p_data jsonb,
  p_subscription uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $apply$
DECLARE
  sub public.guard_subscriptions;
  consent public.guard_recurring_consents;
  map public.guard_provider_price_maps;
  op public.provider_operations;
  cus public.stripe_customer_maps;
  cont public.guard_continuations;
  included public.guard_coverages;
  trial_end timestamptz;
  cached jsonb;
BEGIN
  IF p_action.id IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_fingerprint IS NULL
    OR p_subscription IS NULL OR p_operation IS NULL OR p_data IS NULL
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM p_action.customer_id
    OR sub.location_id IS DISTINCT FROM p_action.location_id
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF p_action.guard_subscription_id IS NOT NULL AND p_action.guard_subscription_id IS DISTINCT FROM sub.id THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF p_operation = 'start_checkout' THEN
    SELECT * INTO consent FROM public.guard_recurring_consents WHERE subscription_id = sub.id;
    IF consent.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'consent_required'); END IF;
    IF sub.coverage_id IS NOT NULL AND NOT admin_private.guard_non_billing_ready_v1(sub.coverage_id) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
    END IF;
    IF NOT admin_private.guard_tax_provider_ready_v1(sub.tax_behaviour, sub.amount_minor, sub.amount_minor) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'tax_not_provider_ready');
    END IF;
    SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = sub.price_version_id;
    IF map.id IS NULL OR map.amount_minor IS DISTINCT FROM sub.amount_minor THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'wrong_price');
    END IF;
    IF sub.continuation_id IS NOT NULL THEN
      SELECT * INTO cont FROM public.guard_continuations WHERE id = sub.continuation_id;
      SELECT * INTO included FROM public.guard_coverages WHERE id = cont.included_coverage_id;
      IF included.activated_at IS NULL OR included.included_start_at IS NULL OR included.included_end_at IS NULL THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'included_never_activated');
      END IF;
      IF included.included_end_at > now()
        AND included.included_end_at < now() + interval '48 hours 5 minutes'
      THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'included_trial_window_unsupported');
      END IF;
      IF included.included_end_at >= now() + interval '48 hours 5 minutes' THEN
        trial_end := included.included_end_at;
      END IF;
    END IF;
    SELECT * INTO cus FROM public.stripe_customer_maps WHERE customer_id = sub.customer_id;
    SELECT * INTO op FROM public.provider_operations
      WHERE guard_subscription_id = sub.id AND kind = 'CREATE_SUBSCRIPTION_CHECKOUT' AND status IN ('PENDING', 'SUBMITTED', 'SUCCEEDED')
      ORDER BY created_at ASC LIMIT 1;
    IF op.id IS NULL THEN
      INSERT INTO public.provider_operations(
        idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
      ) VALUES (
        coalesce(NULLIF(p_data->>'idempotencyKey', '')::uuid, p_request), 'CREATE_SUBSCRIPTION_CHECKOUT',
        'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
      ) RETURNING * INTO op;
    END IF;
    UPDATE public.guard_subscriptions SET lifecycle_state = 'PENDING_PROVIDER' WHERE id = sub.id AND lifecycle_state = 'PENDING_CUSTOMER';
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CHECKOUT_CREATED', 'PENDING_CUSTOMER', 'PENDING_PROVIDER',
      'Subscription Checkout prepared', jsonb_build_object('providerOperationId', op.id, 'trialEnd', trial_end));
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeCustomerId', cus.stripe_customer_id, 'stripePriceId', map.stripe_price_id, 'amountMinor', sub.amount_minor,
      'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardCoverageId', sub.coverage_id,
      'guardSubscriptionId', sub.id, 'priceVersionId', sub.price_version_id, 'continuationId', sub.continuation_id,
      'mode', 'subscription', 'trialEnd', trial_end, 'includedEndAt', included.included_end_at,
      'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'start_recovery' THEN
    op := admin_private.guard_reuse_provider_operation_v1(
      p_request, 'CREATE_RECOVERY_CHECKOUT', 'GUARD_RECOVERY', sub.customer_id, sub.service_order_id, sub.id
    );
    SELECT * INTO cus FROM public.stripe_customer_maps WHERE customer_id = sub.customer_id;
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeCustomerId', cus.stripe_customer_id, 'stripeSubscriptionId', sub.stripe_subscription_id,
      'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardSubscriptionId', sub.id,
      'priceVersionId', sub.price_version_id, 'mode', 'setup', 'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'request_period_end_cancellation' THEN
    IF sub.lifecycle_state IN ('CANCELED', 'ENDED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.guard_subscriptions SET
      cancellation_intent = 'CANCEL_AT_PERIOD_END', requested_cancel_at_period_end = true
      WHERE id = sub.id RETURNING * INTO sub;
    op := admin_private.guard_reuse_provider_operation_v1(
      p_request, 'CANCEL_SUBSCRIPTION_PERIOD_END', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id
    );
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CANCELLATION_REQUESTED', NULL, sub.lifecycle_state,
      'Customer requested period-end cancellation', jsonb_build_object('providerOperationId', op.id));
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeSubscriptionId', sub.stripe_subscription_id, 'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'undo_period_end_cancellation' THEN
    IF sub.lifecycle_state IN ('CANCELED', 'ENDED') THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'already_ended'); END IF;
    UPDATE public.guard_subscriptions SET
      cancellation_intent = 'UNDO_PERIOD_END', requested_cancel_at_period_end = false
      WHERE id = sub.id RETURNING * INTO sub;
    op := admin_private.guard_reuse_provider_operation_v1(
      p_request, 'UNDO_SUBSCRIPTION_CANCELLATION', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id
    );
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CANCELLATION_REQUESTED', NULL, sub.lifecycle_state,
      'Customer requested undo of scheduled cancellation', jsonb_build_object('providerOperationId', op.id));
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeSubscriptionId', sub.stripe_subscription_id, 'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation <> 'request_immediate_cancellation' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  UPDATE public.guard_subscriptions SET cancellation_intent = 'REQUEST_IMMEDIATE_CANCELLATION' WHERE id = sub.id;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CANCELLATION_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Customer requested immediate cancellation review', '{}'::jsonb);
  cached := jsonb_build_object('status', 'success', 'reviewRequired', true);
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
  RETURN cached;
END;
$apply$;

CREATE OR REPLACE FUNCTION public.customer_guard_subscription_command_v1(
  p_token_hash text, p_request uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $command$
DECLARE
  sess admin_private.customer_action_sessions;
  a public.customer_actions;
  sub public.guard_subscriptions;
  fp text;
  cached jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN (
      'start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation', 'request_immediate_cancellation'
    )
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(sess.action_id, p_operation, coalesce(p_data, '{}'::jsonb))::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sub FROM public.guard_subscriptions
    WHERE id = coalesce(a.guard_subscription_id, NULLIF(p_data->>'subscriptionId', '')::uuid) FOR UPDATE;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM a.customer_id OR sub.location_id IS DISTINCT FROM a.location_id THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  RETURN admin_private.customer_guard_subscription_apply_v1(
    a, sess.auth_user_id, p_request, fp, p_operation, coalesce(p_data, '{}'::jsonb), sub.id
  );
END;
$command$;

CREATE FUNCTION admin_private.customer_portal_guard_location_body_v1(
  p_coverage uuid, p_customer uuid, p_email text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path=''
AS $body$
DECLARE
  cov public.guard_coverages;
  biz public.businesses;
  loc public.locations;
  bill public.guard_billing;
  sub public.guard_subscriptions;
  perm public.guard_permissions;
  observed_at timestamptz;
  availability text;
  classification text;
  actions jsonb := '[]'::jsonb;
  action public.customer_actions;
  linked public.guard_subscriptions;
  consent public.guard_recurring_consents;
  offer public.guard_price_change_offers;
  arrangement text;
  status_label text;
  permission_label text;
  monitoring text;
  billing_label text;
  subscription_label text;
  cancellation text;
  show_here boolean;
  caps jsonb;
  body jsonb;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = p_coverage AND customer_id = p_customer;
  IF cov.id IS NULL OR p_email IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO biz FROM public.businesses WHERE id = cov.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = cov.location_id AND business_id = cov.business_id;
  IF biz.id IS NULL OR loc.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO bill FROM public.guard_billing WHERE coverage_id = cov.id;
  SELECT * INTO sub FROM public.guard_subscriptions candidate
  WHERE candidate.customer_id = cov.customer_id
    AND candidate.location_id = cov.location_id
    AND (
      candidate.coverage_id = cov.id
      OR (
        candidate.coverage_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.guard_continuations cont
          WHERE cont.id = candidate.continuation_id
            AND cont.customer_id = cov.customer_id
            AND cont.included_coverage_id = cov.id
        )
      )
    )
  ORDER BY CASE WHEN candidate.lifecycle_state IN ('CANCELED', 'ENDED') THEN 1 ELSE 0 END, candidate.created_at DESC
  LIMIT 1;
  SELECT * INTO perm FROM public.guard_permissions
  WHERE coverage_id = cov.id AND customer_id = cov.customer_id AND status = 'ACTIVE'
  LIMIT 1;
  IF perm.id IS NULL THEN
    SELECT * INTO perm FROM public.guard_permissions
    WHERE coverage_id = cov.id AND customer_id = cov.customer_id AND status = 'REVIEW_REQUIRED'
    ORDER BY accepted_at DESC
    LIMIT 1;
  END IF;
  SELECT observation.observed_at, observation.profile_availability, observation.classification
    INTO observed_at, availability, classification
  FROM public.guard_check_observations observation
  JOIN public.guard_check_obligations obligation ON obligation.id = observation.obligation_id
  WHERE observation.coverage_id = cov.id
    AND obligation.coverage_id = cov.id
    AND obligation.customer_id = cov.customer_id
    AND obligation.state = 'COMPLETED'
  ORDER BY observation.observed_at DESC
  LIMIT 1;
  arrangement := CASE cov.coverage_origin
    WHEN 'INCLUDED_RECOVERY' THEN 'Included Guard from a recovery service'
    WHEN 'INCLUDED_CONTINUATION' THEN 'Paid continuation from included Guard'
    ELSE 'Directly purchased Guard'
  END;
  status_label := CASE cov.state
    WHEN 'REQUESTED' THEN 'Preparing Guard'
    WHEN 'AWAITING_AUTHORIZATION' THEN 'Permission required'
    WHEN 'VERIFYING_ACCESS' THEN 'Access being verified'
    WHEN 'BASELINE_REQUIRED' THEN 'Setup in progress'
    WHEN 'AWAITING_PAYMENT' THEN 'Payment setup required'
    WHEN 'READY_TO_ACTIVATE' THEN 'Ready for activation'
    WHEN 'ACTIVE' THEN 'Active'
    WHEN 'PAUSED' THEN 'Paused'
    WHEN 'ENDING' THEN 'Ending'
    WHEN 'ENDED' THEN 'Ended'
    ELSE NULL
  END;
  IF status_label IS NULL THEN RETURN NULL; END IF;
  permission_label := CASE
    WHEN perm.status = 'ACTIVE' THEN 'Permission recorded'
    WHEN perm.status = 'REVIEW_REQUIRED' THEN 'Permission needs review'
    WHEN cov.state = 'AWAITING_AUTHORIZATION' THEN 'Permission required'
    ELSE 'Permission not recorded'
  END;
  monitoring := CASE classification
    WHEN 'HEALTHY' THEN 'No issue detected'
    WHEN 'CHANGE_DETECTED' THEN 'Change detected — being reviewed'
    WHEN 'PROFILE_UNAVAILABLE' THEN 'Profile unavailable — being reviewed'
    WHEN 'INCOMPLETE' THEN 'Check incomplete'
    ELSE NULL
  END;
  billing_label := CASE bill.billing_state
    WHEN 'NOT_REQUIRED' THEN 'Included with your recovery service'
    WHEN 'PENDING' THEN 'Payment setup required'
    WHEN 'CURRENT' THEN 'Billing is current'
    WHEN 'PAST_DUE' THEN 'Payment needs attention'
    WHEN 'PAUSED' THEN 'Billing is paused'
    WHEN 'ENDED' THEN 'Billing has ended'
    ELSE 'Billing position is not available yet'
  END;
  subscription_label := CASE sub.lifecycle_state
    WHEN 'PENDING_CUSTOMER' THEN 'Waiting for you to confirm billing'
    WHEN 'PENDING_PROVIDER' THEN 'Billing setup is being confirmed'
    WHEN 'INCOMPLETE' THEN 'Billing setup is not finished'
    WHEN 'ACTIVE' THEN 'Billing is active'
    WHEN 'PAST_DUE' THEN 'Payment needs attention'
    WHEN 'CANCEL_AT_PERIOD_END' THEN 'Cancellation is scheduled for the end of the paid period'
    WHEN 'CANCELED' THEN 'This subscription has been cancelled'
    WHEN 'UNPAID' THEN 'Payment has not been collected'
    WHEN 'ENDED' THEN 'This subscription has ended'
    ELSE NULL
  END;
  cancellation := CASE
    WHEN sub.id IS NULL THEN NULL
    WHEN sub.cancellation_intent = 'REQUEST_IMMEDIATE_CANCELLATION' THEN 'Immediate cancellation is with ProfileRelaunch for review. A refund is not promised.'
    WHEN sub.cancellation_intent = 'UNDO_PERIOD_END' AND sub.cancel_at_period_end IS TRUE
      THEN 'Your request to keep this subscription is recorded. Cancellation stays scheduled until the provider confirms the change.'
    WHEN sub.cancellation_intent = 'UNDO_PERIOD_END'
      THEN 'Your request to keep this subscription is recorded and is awaiting confirmation.'
    WHEN sub.cancel_at_period_end IS TRUE
      THEN 'Cancellation is scheduled for the end of the paid period.'
    WHEN sub.requested_cancel_at_period_end IS TRUE OR sub.cancellation_intent = 'CANCEL_AT_PERIOD_END'
      THEN 'Your cancellation request is recorded and is awaiting confirmation.'
    ELSE NULL
  END;
  FOR action IN
    SELECT * FROM public.customer_actions act
    WHERE act.customer_id = cov.customer_id
      AND act.business_id = cov.business_id
      AND act.location_id = cov.location_id
      AND lower(act.expected_email_snapshot) = lower(p_email)
      AND act.expires_at > now()
      AND act.status IN ('OPEN', 'COMPLETED')
    ORDER BY act.created_at
  LOOP
    IF action.kind = 'GUARD_PERMISSION' AND action.status = 'OPEN' AND action.guard_coverage_id = cov.id
      AND admin_private.customer_action_eligible_v1(action)
    THEN
      actions := actions || jsonb_build_array(jsonb_build_object(
        'selector', admin_private.customer_portal_action_selector_v1(action.id),
        'kind', 'permission',
        'permissionVersion', 'GUARD_PERMISSION_V1',
        'permissionText', admin_private.guard_permission_text_v1(cov.coverage_basis)
      ));
    ELSIF action.kind = 'GUARD_SUBSCRIPTION_START' AND action.guard_subscription_id IS NOT NULL THEN
      SELECT * INTO linked FROM public.guard_subscriptions WHERE id = action.guard_subscription_id;
      show_here := linked.customer_id = cov.customer_id AND linked.location_id = cov.location_id AND (
        linked.coverage_id = cov.id
        OR (linked.coverage_id IS NULL AND EXISTS (
          SELECT 1 FROM public.guard_continuations cont
          WHERE cont.id = linked.continuation_id AND cont.customer_id = cov.customer_id AND cont.included_coverage_id = cov.id
        ))
      );
      IF show_here THEN
        SELECT * INTO consent FROM public.guard_recurring_consents WHERE subscription_id = linked.id;
        IF consent.id IS NOT NULL OR admin_private.customer_action_eligible_v1(action) THEN
          caps := admin_private.customer_portal_guard_subscription_capabilities_v1(linked, consent.id IS NOT NULL);
          actions := actions || jsonb_build_array(jsonb_build_object(
            'selector', admin_private.customer_portal_action_selector_v1(action.id),
            'kind', 'subscription',
            'amountMinor', linked.amount_minor,
            'currency', linked.currency,
            'taxBehaviour', CASE WHEN linked.tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE') THEN linked.tax_behaviour ELSE NULL END,
            'consentVersion', 'GUARD_RECURRING_CONSENT_V1',
            'consentText', admin_private.guard_recurring_consent_text_v1(),
            'consentRecorded', consent.id IS NOT NULL,
            'cancellationTerms', admin_private.guard_cancellation_terms_text_v1(),
            'checkout', caps->'checkout',
            'recovery', caps->'recovery',
            'periodEndCancellation', caps->'periodEndCancellation',
            'undoPeriodEndCancellation', caps->'undoPeriodEndCancellation',
            'immediateCancellationReview', caps->'immediateCancellationReview'
          ));
        END IF;
      END IF;
    ELSIF action.kind = 'GUARD_PRICE_CHANGE_ACCEPTANCE' AND action.status = 'OPEN'
      AND admin_private.customer_action_eligible_v1(action)
    THEN
      SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = action.guard_price_change_offer_id AND status = 'OFFERED';
      SELECT * INTO linked FROM public.guard_subscriptions WHERE id = offer.subscription_id;
      show_here := offer.id IS NOT NULL AND linked.customer_id = cov.customer_id AND linked.location_id = cov.location_id AND (
        linked.coverage_id = cov.id
        OR (linked.coverage_id IS NULL AND EXISTS (
          SELECT 1 FROM public.guard_continuations cont
          WHERE cont.id = linked.continuation_id AND cont.customer_id = cov.customer_id AND cont.included_coverage_id = cov.id
        ))
      );
      IF show_here THEN
        actions := actions || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'selector', admin_private.customer_portal_action_selector_v1(action.id),
          'kind', 'price_change',
          'oldAmountMinor', offer.old_amount_minor,
          'newAmountMinor', offer.new_amount_minor,
          'currency', offer.currency,
          'noticeVersion', offer.notice_version,
          'noticeText', offer.notice_text,
          'effectiveAt', offer.effective_renewal_at
        )));
      END IF;
    END IF;
  END LOOP;
  body := jsonb_strip_nulls(jsonb_build_object(
    'selector', admin_private.customer_portal_guard_selector_v1(cov.id),
    'businessName', biz.display_name,
    'locationName', loc.location_name,
    'arrangement', arrangement,
    'status', status_label,
    'monitoringActive', cov.state = 'ACTIVE',
    'permission', permission_label,
    'activatedAt', cov.activated_at,
    'includedEndsAt', CASE WHEN cov.coverage_basis = 'INCLUDED' THEN cov.included_end_at ELSE NULL END,
    'billing', billing_label,
    'subscription', subscription_label,
    'amountMinor', sub.amount_minor,
    'currency', CASE WHEN sub.id IS NULL THEN NULL ELSE sub.currency END,
    'taxBehaviour', CASE WHEN sub.tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE') THEN sub.tax_behaviour ELSE NULL END,
    'periodEnd', sub.current_period_end,
    'cancellation', cancellation,
    'lastCheckedAt', CASE WHEN monitoring IS NULL THEN NULL ELSE observed_at END,
    'monitoring', monitoring,
    'issueUnderReview', EXISTS (
      SELECT 1 FROM public.guard_alerts alert
      WHERE alert.coverage_id = cov.id AND alert.customer_id = cov.customer_id AND alert.state IN ('NEW', 'ACKNOWLEDGED')
    ),
    'actions', actions
  ));
  -- Keep an explicit null so UNKNOWN is distinct from UNAVAILABLE. strip_nulls
  -- would otherwise drop the key and the customer page would treat it as absent.
  IF monitoring IS NOT NULL THEN
    body := body || jsonb_build_object(
      'profileAvailable',
      CASE availability
        WHEN 'AVAILABLE' THEN 'true'::jsonb
        WHEN 'UNAVAILABLE' THEN 'false'::jsonb
        ELSE 'null'::jsonb
      END
    );
  END IF;
  RETURN body;
END;
$body$;

CREATE FUNCTION public.customer_portal_guard_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $list$
DECLARE
  v_customer uuid;
  v_email text;
  locations jsonb;
BEGIN
  SELECT customer_id, email INTO v_customer, v_email FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(body ORDER BY body->>'businessName', body->>'locationName'), '[]'::jsonb)
    INTO locations
  FROM public.guard_coverages cov
  CROSS JOIN LATERAL admin_private.customer_portal_guard_location_body_v1(cov.id, v_customer, v_email) body
  WHERE cov.customer_id = v_customer AND body IS NOT NULL;
  RETURN jsonb_build_object('locations', locations);
END;
$list$;

CREATE FUNCTION public.customer_portal_guard_location_v1(p_token_hash text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $one$
DECLARE
  v_customer uuid;
  v_email text;
  body jsonb;
BEGIN
  SELECT customer_id, email INTO v_customer, v_email FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_selector IS NULL OR p_selector !~ '^gd-[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT admin_private.customer_portal_guard_location_body_v1(cov.id, v_customer, v_email)
    INTO body
  FROM public.guard_coverages cov
  WHERE cov.customer_id = v_customer
    AND admin_private.customer_portal_guard_selector_v1(cov.id) = p_selector;
  IF body IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found', true, 'location', body);
END;
$one$;

CREATE FUNCTION public.customer_portal_guard_command_v1(
  p_token_hash text,
  p_request uuid,
  p_selector text,
  p_action_selector text,
  p_operation text,
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $portal$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  cov public.guard_coverages;
  a public.customer_actions;
  sub public.guard_subscriptions;
  consent public.guard_recurring_consents;
  caps jsonb;
  fp text;
  cached jsonb;
  result jsonb;
  safe jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_selector IS NULL OR p_action_selector IS NULL OR p_operation IS NULL OR p_data IS NULL
    OR p_selector !~ '^gd-[a-f0-9]{64}$'
    OR p_action_selector !~ '^ca-[a-f0-9]{64}$'
    OR p_operation NOT IN (
      'accept_permission', 'decline_permission', 'accept_consent', 'accept_price', 'decline_price',
      'start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation',
      'request_immediate_cancellation'
    )
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
    OR p_data ? 'subscriptionId' OR p_data ? 'customerId' OR p_data ? 'coverageId'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation = 'accept_permission' AND p_data IS DISTINCT FROM jsonb_build_object('accepted', true, 'permissionVersion', 'GUARD_PERMISSION_V1') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'decline_permission' AND p_data IS DISTINCT FROM '{}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'accept_consent' AND p_data IS DISTINCT FROM jsonb_build_object('accepted', true, 'consentVersion', 'GUARD_RECURRING_CONSENT_V1') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'accept_price' AND p_data IS DISTINCT FROM jsonb_build_object('accepted', true) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'decline_price' AND p_data IS DISTINCT FROM '{}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation IN (
    'start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation', 'request_immediate_cancellation'
  ) AND (
    p_data->>'idempotencyKey' IS NULL
    OR p_data->>'idempotencyKey' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_data IS DISTINCT FROM jsonb_build_object('idempotencyKey', p_data->>'idempotencyKey')
  ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_selector, p_action_selector, p_operation, p_data)::text);
  cached := admin_private.customer_action_receipt_v1(v_auth, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO cov FROM public.guard_coverages
  WHERE customer_id = v_customer AND admin_private.customer_portal_guard_selector_v1(id) = p_selector
  FOR UPDATE;
  IF cov.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO a FROM public.customer_actions action
  WHERE action.customer_id = v_customer
    AND action.business_id = cov.business_id
    AND action.location_id = cov.location_id
    AND lower(action.expected_email_snapshot) = lower(v_email)
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_action_selector
  FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF p_operation IN ('accept_permission', 'decline_permission') THEN
    IF a.kind <> 'GUARD_PERMISSION' OR a.guard_coverage_id IS DISTINCT FROM cov.id THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    IF p_operation = 'accept_permission' AND (
      a.status = 'COMPLETED' OR EXISTS (
        SELECT 1 FROM public.guard_permissions p WHERE p.coverage_id = a.guard_coverage_id AND p.status = 'ACTIVE'
      )
    ) THEN
      result := admin_private.accept_guard_permission_v1(a, v_auth, p_request);
    ELSIF NOT admin_private.customer_action_eligible_v1(a) THEN
      RETURN jsonb_build_object('status', 'unavailable');
    ELSIF p_operation = 'accept_permission' THEN
      result := admin_private.accept_guard_permission_v1(a, v_auth, p_request);
    ELSE
      result := admin_private.decline_guard_permission_v1(a, v_auth, p_request);
    END IF;
    safe := jsonb_build_object('status', result->>'status', 'actionStatus', result->>'actionStatus');
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, v_auth, fp, safe, now());
    RETURN safe;
  END IF;
  IF p_operation IN ('accept_price', 'decline_price') THEN
    IF a.kind <> 'GUARD_PRICE_CHANGE_ACCEPTANCE' OR NOT admin_private.customer_action_eligible_v1(a) THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = a.guard_subscription_id;
    IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM cov.customer_id OR sub.location_id IS DISTINCT FROM cov.location_id
      OR (sub.coverage_id IS NOT NULL AND sub.coverage_id IS DISTINCT FROM cov.id)
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    result := admin_private.accept_guard_price_change_v1(a, v_auth, p_request, p_operation = 'accept_price');
    safe := jsonb_strip_nulls(jsonb_build_object(
      'status', result->>'status',
      'actionStatus', result->>'actionStatus',
      'offerStatus', result->>'offerStatus',
      'unapplied', result->'unapplied',
      'reason', result->>'reason',
      'providerOperationId', result->>'providerOperationId',
      'idempotencyKey', result->>'idempotencyKey',
      'providerOperationStatus', result->>'providerOperationStatus',
      'subscriptionItemId', result->>'subscriptionItemId',
      'newStripePriceId', result->>'newStripePriceId',
      'oldStripePriceId', result->>'oldStripePriceId',
      'stripeSubscriptionId', result->>'stripeSubscriptionId',
      'stripeCustomerId', result->>'stripeCustomerId',
      'periodEnd', result->>'periodEnd',
      'cancelAtPeriodEnd', result->'cancelAtPeriodEnd'
    ));
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, v_auth, fp, safe, now());
    RETURN safe;
  END IF;
  IF a.kind <> 'GUARD_SUBSCRIPTION_START' OR a.guard_subscription_id IS NULL OR a.expires_at <= now()
    OR a.status NOT IN ('OPEN', 'COMPLETED')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation = 'accept_consent' THEN
    IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    result := admin_private.accept_guard_recurring_consent_v1(a, v_auth, p_request);
    safe := jsonb_build_object('status', result->>'status');
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, v_auth, fp, safe, now());
    RETURN safe;
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = a.guard_subscription_id;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM cov.customer_id OR sub.location_id IS DISTINCT FROM cov.location_id THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF sub.coverage_id IS NOT NULL AND sub.coverage_id IS DISTINCT FROM cov.id
    AND NOT EXISTS (
      SELECT 1 FROM public.guard_continuations cont
      WHERE cont.id = sub.continuation_id AND cont.customer_id = cov.customer_id
        AND (cont.included_coverage_id = cov.id OR cont.paid_coverage_id = cov.id)
    )
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO consent FROM public.guard_recurring_consents WHERE subscription_id = sub.id;
  caps := admin_private.customer_portal_guard_subscription_capabilities_v1(sub, consent.id IS NOT NULL);
  IF (p_operation = 'start_checkout' AND (caps->>'checkout') IS DISTINCT FROM 'true')
    OR (p_operation = 'start_recovery' AND (caps->>'recovery') IS DISTINCT FROM 'true')
    OR (p_operation = 'request_period_end_cancellation' AND (caps->>'periodEndCancellation') IS DISTINCT FROM 'true')
    OR (p_operation = 'undo_period_end_cancellation' AND (caps->>'undoPeriodEndCancellation') IS DISTINCT FROM 'true')
    OR (p_operation = 'request_immediate_cancellation' AND (caps->>'immediateCancellationReview') IS DISTINCT FROM 'true')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  RETURN admin_private.customer_guard_subscription_apply_v1(
    a, v_auth, p_request, fp, p_operation, p_data, a.guard_subscription_id
  );
END;
$portal$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_guard_selector_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.decline_guard_permission_v1(public.customer_actions, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_guard_subscription_apply_v1(public.customer_actions, uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_guard_location_body_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_portal_guard_subscription_capabilities_v1(public.guard_subscriptions, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_action_command_core_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_guard_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_guard_location_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_guard_command_v1(text, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_guard_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_guard_location_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_guard_command_v1(text, uuid, text, text, text, jsonb) TO service_role;

COMMIT;
