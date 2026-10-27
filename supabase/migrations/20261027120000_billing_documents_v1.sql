-- PROFILERELAUNCH-UNIFIED-BILLING-DOCUMENTS-01. Source only.
-- Do not apply this file to DEV or Production from this change.
-- Do not replay 20261026180000 or 20261026190000.
-- This file does not charge a card, refund a payment, change a stored amount,
-- or update public.payment_receipts. Existing receipt references stay as they
-- are. New document references are assigned only to invoices, Guard billing
-- rows and adjustments that did not have one.

BEGIN;

ALTER TABLE public.payment_invoices ADD COLUMN public_ref text;
ALTER TABLE public.guard_subscription_invoices ADD COLUMN public_ref text;
ALTER TABLE public.guard_refunds ADD COLUMN public_ref text;
ALTER TABLE public.guard_billing_adjustments ADD COLUMN public_ref text;

CREATE FUNCTION admin_private.billing_document_ref_v1(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  yy text;
  bytes bytea;
  token text;
  candidate text;
  i integer;
  attempts integer := 0;
BEGIN
  IF p_prefix NOT IN ('IN', 'RG', 'CN') THEN
    RAISE EXCEPTION 'unsupported billing document prefix';
  END IF;
  yy := to_char(timezone('utc', now()), 'YY');
  LOOP
    attempts := attempts + 1;
    IF attempts > 20 THEN RAISE EXCEPTION 'could not generate a unique billing document reference'; END IF;
    bytes := extensions.gen_random_bytes(6);
    token := '';
    FOR i IN 0..5 LOOP
      token := token || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;
    candidate := p_prefix || '-' || yy || '-' || token;
    IF p_prefix = 'IN' AND NOT EXISTS (SELECT 1 FROM public.payment_invoices WHERE public_ref = candidate) THEN
      RETURN candidate;
    ELSIF p_prefix = 'RG' AND NOT EXISTS (SELECT 1 FROM public.guard_subscription_invoices WHERE public_ref = candidate) THEN
      RETURN candidate;
    ELSIF p_prefix = 'CN'
      AND NOT EXISTS (SELECT 1 FROM public.guard_refunds WHERE public_ref = candidate)
      AND NOT EXISTS (SELECT 1 FROM public.guard_billing_adjustments WHERE public_ref = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.billing_document_ref_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  row_id uuid;
BEGIN
  FOR row_id IN SELECT id FROM public.payment_invoices WHERE public_ref IS NULL LOOP
    UPDATE public.payment_invoices
      SET public_ref = admin_private.billing_document_ref_v1('IN')
      WHERE id = row_id AND public_ref IS NULL;
  END LOOP;
  FOR row_id IN SELECT id FROM public.guard_subscription_invoices WHERE public_ref IS NULL LOOP
    UPDATE public.guard_subscription_invoices
      SET public_ref = admin_private.billing_document_ref_v1('RG')
      WHERE id = row_id AND public_ref IS NULL;
  END LOOP;
  FOR row_id IN SELECT id FROM public.guard_refunds WHERE public_ref IS NULL LOOP
    UPDATE public.guard_refunds
      SET public_ref = admin_private.billing_document_ref_v1('CN')
      WHERE id = row_id AND public_ref IS NULL;
  END LOOP;
  FOR row_id IN SELECT id FROM public.guard_billing_adjustments WHERE public_ref IS NULL LOOP
    UPDATE public.guard_billing_adjustments
      SET public_ref = admin_private.billing_document_ref_v1('CN')
      WHERE id = row_id AND public_ref IS NULL;
  END LOOP;
END;
$$;

ALTER TABLE public.payment_invoices
  ALTER COLUMN public_ref SET DEFAULT admin_private.billing_document_ref_v1('IN');
ALTER TABLE public.payment_invoices
  ALTER COLUMN public_ref SET NOT NULL;
ALTER TABLE public.payment_invoices
  ADD CONSTRAINT payment_invoices_public_ref_format
  CHECK (public_ref ~ '^IN-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$');
CREATE UNIQUE INDEX payment_invoices_public_ref_key ON public.payment_invoices (public_ref);

ALTER TABLE public.guard_subscription_invoices
  ALTER COLUMN public_ref SET DEFAULT admin_private.billing_document_ref_v1('RG');
ALTER TABLE public.guard_subscription_invoices
  ALTER COLUMN public_ref SET NOT NULL;
ALTER TABLE public.guard_subscription_invoices
  ADD CONSTRAINT guard_subscription_invoices_public_ref_format
  CHECK (public_ref ~ '^RG-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$');
CREATE UNIQUE INDEX guard_subscription_invoices_public_ref_key ON public.guard_subscription_invoices (public_ref);

ALTER TABLE public.guard_refunds
  ALTER COLUMN public_ref SET DEFAULT admin_private.billing_document_ref_v1('CN');
ALTER TABLE public.guard_refunds
  ALTER COLUMN public_ref SET NOT NULL;
ALTER TABLE public.guard_refunds
  ADD CONSTRAINT guard_refunds_public_ref_format
  CHECK (public_ref ~ '^CN-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$');
CREATE UNIQUE INDEX guard_refunds_public_ref_key ON public.guard_refunds (public_ref);

ALTER TABLE public.guard_billing_adjustments
  ALTER COLUMN public_ref SET DEFAULT admin_private.billing_document_ref_v1('CN');
ALTER TABLE public.guard_billing_adjustments
  ALTER COLUMN public_ref SET NOT NULL;
ALTER TABLE public.guard_billing_adjustments
  ADD CONSTRAINT guard_billing_adjustments_public_ref_format
  CHECK (public_ref ~ '^CN-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$');
CREATE UNIQUE INDEX guard_billing_adjustments_public_ref_key ON public.guard_billing_adjustments (public_ref);

CREATE FUNCTION admin_private.billing_bill_to_v1(p_business uuid, p_customer uuid, p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'name', coalesce(est.legal_name, cust.full_name),
    'email', nullif(btrim(coalesce(p_email, '')), ''),
    'country', est.country_code,
    'contactName', CASE
      WHEN est.legal_name IS NOT NULL AND btrim(cust.full_name) <> btrim(est.legal_name) THEN cust.full_name
      ELSE NULL
    END
  )
  FROM public.customers cust
  LEFT JOIN public.business_establishments est
    ON est.business_id = p_business
   AND est.verification_status = 'VERIFIED'
   AND est.superseded_at IS NULL
  WHERE cust.id = p_customer
$$;

REVOKE ALL ON FUNCTION admin_private.billing_bill_to_v1(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_portal_receipt_v1(p_token_hash text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $receipt$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_receipt public.payment_receipts;
  v_order public.service_orders;
  v_case public.cases;
  v_quote public.quote_versions;
  v_recorded_email text;
  v_bill jsonb;
  v_reconciled boolean := false;
  v_seller boolean := false;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_selector IS NULL OR p_selector !~ '^rc-[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT r.* INTO v_receipt
  FROM public.payment_receipts r
  WHERE r.customer_id = v_customer
    AND admin_private.customer_portal_receipt_selector_v1(r.id) = p_selector;
  IF v_receipt.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO v_order
  FROM public.service_orders
  WHERE id = v_receipt.service_order_id AND customer_id = v_customer;
  IF v_order.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO v_case
  FROM public.cases
  WHERE id = v_order.case_id AND customer_id = v_customer;
  IF v_case.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO v_quote FROM public.quote_versions WHERE id = v_order.quote_version_id;
  IF v_quote.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT accepted_email_snapshot INTO v_recorded_email
  FROM public.quote_acceptances
  WHERE id = v_order.quote_acceptance_id;
  v_bill := admin_private.billing_bill_to_v1(v_order.business_id, v_customer, v_recorded_email);
  IF v_bill IS NULL OR coalesce(v_bill->>'name', '') = '' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  v_reconciled := v_quote.currency = v_receipt.currency
    AND v_quote.total_amount_minor = v_receipt.amount_minor
    AND v_quote.tax_behaviour = v_receipt.tax_behaviour
    AND v_quote.tax_amount_minor = v_receipt.tax_amount_minor
    AND v_quote.standard_amount_minor = v_quote.discount_amount_minor + v_quote.quoted_subtotal_minor
    AND (
      (v_receipt.tax_behaviour = 'EXCLUSIVE' AND v_quote.quoted_subtotal_minor + v_quote.tax_amount_minor = v_receipt.amount_minor)
      OR (v_receipt.tax_behaviour <> 'EXCLUSIVE' AND v_quote.quoted_subtotal_minor = v_receipt.amount_minor)
    );
  SELECT coalesce(position.status = 'REGISTERED', false) INTO v_seller
  FROM public.seller_vat_position position
  WHERE position.effective_from <= v_receipt.paid_at
  ORDER BY position.effective_from DESC
  LIMIT 1;
  v_seller := coalesce(v_seller, false);
  RETURN jsonb_build_object(
    'status', 'ok',
    'receiptRef', v_receipt.public_ref,
    'reference', v_case.public_ref,
    'orderRef', v_order.public_ref,
    'serviceName', v_quote.service_name,
    'amountMinor', v_receipt.amount_minor,
    'currency', v_receipt.currency,
    'taxBehaviour', v_receipt.tax_behaviour,
    'taxAmountMinor', v_receipt.tax_amount_minor,
    'paidAt', v_receipt.paid_at,
    'paymentStatus', 'Paid',
    'providerLabel', 'Card payment through Stripe',
    'billToName', v_bill->>'name',
    'billToEmail', v_bill->>'email',
    'billToCountry', v_bill->>'country',
    'contactName', v_bill->>'contactName',
    'paymentModel', v_order.payment_model,
    'standardAmountMinor', CASE WHEN v_reconciled THEN v_quote.standard_amount_minor ELSE NULL END,
    'discountAmountMinor', CASE WHEN v_reconciled THEN v_quote.discount_amount_minor ELSE NULL END,
    'quotedSubtotalMinor', CASE WHEN v_reconciled THEN v_quote.quoted_subtotal_minor ELSE NULL END,
    'sellerVatRegistered', v_seller,
    'sellerVatNumber', NULL
  );
END;
$receipt$;

CREATE FUNCTION public.customer_portal_invoice_document_v1(p_token_hash text, p_reference text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $invoice$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_case uuid;
  a public.customer_actions;
  inv public.payment_invoices;
  ord public.service_orders;
  qv public.quote_versions;
  v_recorded_email text;
  v_bill jsonb;
  v_reconciled boolean := false;
  v_seller boolean := false;
  matches integer;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_reference IS NULL OR p_selector IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT count(*) INTO matches
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF matches <> 1 THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO a
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF a.id IS NULL OR a.kind <> 'INVOICE_PAYMENT'
    OR lower(a.expected_email_snapshot) IS DISTINCT FROM lower(v_email)
  THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payment_obligations ob
    JOIN public.success_fee_collection_pauses pause ON pause.service_order_id = ob.service_order_id
    WHERE ob.id = a.payment_obligation_id
      AND ob.customer_id = v_customer
      AND ob.kind = 'SUCCESS_FEE'
      AND pause.status IN ('OPEN', 'UPHELD')
  ) THEN
    RETURN jsonb_build_object('status', 'collection_paused');
  END IF;
  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT * INTO inv FROM public.payment_invoices
  WHERE id = a.payment_invoice_id AND customer_id = v_customer AND obligation_id = a.payment_obligation_id;
  IF inv.id IS NULL OR inv.status <> 'ISSUED' THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = inv.service_order_id AND customer_id = v_customer;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF qv.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT accepted_email_snapshot INTO v_recorded_email FROM public.quote_acceptances WHERE id = ord.quote_acceptance_id;
  v_bill := admin_private.billing_bill_to_v1(ord.business_id, v_customer, v_recorded_email);
  IF v_bill IS NULL OR coalesce(v_bill->>'name', '') = '' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  v_reconciled := qv.currency = inv.currency
    AND qv.total_amount_minor = inv.amount_minor
    AND qv.tax_behaviour = inv.tax_behaviour
    AND qv.tax_amount_minor = inv.tax_amount_minor
    AND qv.standard_amount_minor = qv.discount_amount_minor + qv.quoted_subtotal_minor
    AND (
      (inv.tax_behaviour = 'EXCLUSIVE' AND qv.quoted_subtotal_minor + qv.tax_amount_minor = inv.amount_minor)
      OR (inv.tax_behaviour <> 'EXCLUSIVE' AND qv.quoted_subtotal_minor = inv.amount_minor)
    );
  SELECT coalesce(position.status = 'REGISTERED', false) INTO v_seller
  FROM public.seller_vat_position position
  WHERE position.effective_from <= inv.created_at
  ORDER BY position.effective_from DESC
  LIMIT 1;
  v_seller := coalesce(v_seller, false);
  RETURN jsonb_build_object(
    'status', 'ok',
    'invoiceRef', inv.public_ref,
    'reference', p_reference,
    'orderRef', ord.public_ref,
    'serviceName', qv.service_name,
    'amountMinor', inv.amount_minor,
    'currency', inv.currency,
    'taxBehaviour', inv.tax_behaviour,
    'taxAmountMinor', inv.tax_amount_minor,
    'issuedAt', inv.created_at,
    'billToName', v_bill->>'name',
    'billToEmail', v_bill->>'email',
    'billToCountry', v_bill->>'country',
    'contactName', v_bill->>'contactName',
    'standardAmountMinor', CASE WHEN v_reconciled THEN qv.standard_amount_minor ELSE NULL END,
    'discountAmountMinor', CASE WHEN v_reconciled THEN qv.discount_amount_minor ELSE NULL END,
    'quotedSubtotalMinor', CASE WHEN v_reconciled THEN qv.quoted_subtotal_minor ELSE NULL END,
    'sellerVatRegistered', v_seller,
    'sellerVatNumber', NULL
  );
END;
$invoice$;

REVOKE ALL ON FUNCTION public.customer_portal_invoice_document_v1(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_invoice_document_v1(text, text, text) TO service_role;

CREATE FUNCTION public.customer_portal_quotation_document_v1(p_token_hash text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $quotation$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_case uuid;
  v_business uuid;
  v_view jsonb;
  v_offered timestamptz;
  v_recorded_email text;
  v_bill jsonb;
  v_seller boolean := false;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_reference IS NULL OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT business_id INTO v_business FROM public.cases WHERE id = v_case AND customer_id = v_customer;
  v_view := admin_private.customer_portal_quote_view_v1(v_case, v_customer, v_email);
  IF v_view IS NULL OR v_view->>'status' NOT IN ('offered', 'accepted') THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_view->>'taxBehaviour' = 'UNCONFIRMED' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT ver.offered_at INTO v_offered
  FROM public.quotes q
  JOIN public.quote_versions ver ON ver.quote_id = q.id
  WHERE q.public_ref = v_view->>'reference'
    AND q.customer_id = v_customer
    AND q.case_id = v_case
    AND ver.total_amount_minor = (v_view->>'totalAmountMinor')::integer
    AND ver.currency = v_view->>'currency'
    AND ver.service_name = v_view->>'serviceName'
  ORDER BY ver.offered_at DESC NULLS LAST
  LIMIT 1;
  IF v_offered IS NULL THEN
    v_offered := nullif(v_view->>'acceptedAt', '')::timestamptz;
  END IF;
  IF v_offered IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT acc.accepted_email_snapshot INTO v_recorded_email
  FROM public.quote_acceptances acc
  JOIN public.quote_versions ver ON ver.id = acc.quote_version_id
  JOIN public.quotes q ON q.id = ver.quote_id
  WHERE q.public_ref = v_view->>'reference'
    AND q.customer_id = v_customer
    AND q.case_id = v_case
  ORDER BY acc.accepted_at DESC
  LIMIT 1;
  v_bill := admin_private.billing_bill_to_v1(v_business, v_customer, coalesce(v_recorded_email, v_email));
  IF v_bill IS NULL OR coalesce(v_bill->>'name', '') = '' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT coalesce(position.status = 'REGISTERED', false) INTO v_seller
  FROM public.seller_vat_position position
  WHERE position.effective_from <= v_offered
  ORDER BY position.effective_from DESC
  LIMIT 1;
  v_seller := coalesce(v_seller, false);
  RETURN jsonb_build_object(
    'status', 'ok',
    'quoteRef', v_view->>'reference',
    'reference', p_reference,
    'orderRef', v_view->>'orderReference',
    'serviceName', v_view->>'serviceName',
    'currency', v_view->>'currency',
    'taxBehaviour', v_view->>'taxBehaviour',
    'taxAmountMinor', (v_view->>'taxAmountMinor')::integer,
    'totalMinor', (v_view->>'totalAmountMinor')::integer,
    'standardAmountMinor', (v_view->>'standardAmountMinor')::integer,
    'discountAmountMinor', (v_view->>'discountAmountMinor')::integer,
    'quotedSubtotalMinor', (v_view->>'quotedAmountMinor')::integer,
    'paymentModel', v_view->>'paymentModel',
    'issuedAt', v_offered,
    'validUntil', v_view->>'validUntil',
    'billToName', v_bill->>'name',
    'billToEmail', v_bill->>'email',
    'billToCountry', v_bill->>'country',
    'contactName', v_bill->>'contactName',
    'sellerVatRegistered', v_seller,
    'sellerVatNumber', NULL
  );
END;
$quotation$;

REVOKE ALL ON FUNCTION public.customer_portal_quotation_document_v1(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_quotation_document_v1(text, text) TO service_role;

CREATE FUNCTION admin_private.guard_billing_selector_v1(p_kind text, p_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_kind || '-' || encode(extensions.digest(p_id::text, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION admin_private.guard_billing_selector_v1(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.customer_portal_guard_documents_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $list$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_rows jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(row_value ORDER BY issued_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'kind', 'receipt',
      'selector', admin_private.guard_billing_selector_v1('rg', inv.id),
      'reference', inv.public_ref,
      'amountMinor', inv.amount_paid_minor,
      'currency', inv.currency,
      'issuedAt', inv.created_at,
      'periodStart', inv.period_start,
      'periodEnd', inv.period_end,
      'relatedReference', NULL
    ) AS row_value, inv.created_at AS issued_at
    FROM public.guard_subscription_invoices inv
    JOIN public.guard_subscriptions sub ON sub.id = inv.subscription_id
    WHERE sub.customer_id = v_customer AND inv.status = 'PAID'
    UNION ALL
    SELECT jsonb_build_object(
      'kind', 'credit_note',
      'selector', admin_private.guard_billing_selector_v1('cn', refund.id),
      'reference', refund.public_ref,
      'amountMinor', refund.amount_minor,
      'currency', refund.currency,
      'issuedAt', coalesce(refund.succeeded_at, refund.created_at),
      'periodStart', NULL,
      'periodEnd', NULL,
      'relatedReference', inv.public_ref
    ), coalesce(refund.succeeded_at, refund.created_at)
    FROM public.guard_refunds refund
    JOIN public.guard_subscriptions sub ON sub.id = refund.subscription_id
    JOIN public.guard_subscription_invoices inv ON inv.id = refund.invoice_id
    WHERE sub.customer_id = v_customer AND refund.status = 'SUCCEEDED'
    UNION ALL
    SELECT jsonb_build_object(
      'kind', 'credit_note',
      'selector', admin_private.guard_billing_selector_v1('sc', adjustment.id),
      'reference', adjustment.public_ref,
      'amountMinor', coalesce(adjustment.approved_amount_minor, adjustment.amount_minor),
      'currency', adjustment.currency,
      'issuedAt', coalesce(adjustment.approved_at, adjustment.created_at),
      'periodStart', adjustment.period_start,
      'periodEnd', adjustment.period_end,
      'relatedReference', inv.public_ref
    ), coalesce(adjustment.approved_at, adjustment.created_at)
    FROM public.guard_billing_adjustments adjustment
    JOIN public.guard_subscriptions sub ON sub.id = adjustment.subscription_id
    LEFT JOIN public.guard_subscription_invoices inv ON inv.id = adjustment.invoice_id
    WHERE sub.customer_id = v_customer
      AND adjustment.kind = 'SERVICE_CREDIT'
      AND adjustment.status = 'SUCCEEDED'
      AND NOT EXISTS (
        SELECT 1 FROM public.guard_refunds refund
        WHERE refund.adjustment_id = adjustment.id AND refund.status = 'SUCCEEDED'
      )
  ) documents;
  RETURN jsonb_build_object('documents', v_rows);
END;
$list$;

REVOKE ALL ON FUNCTION public.customer_portal_guard_documents_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_guard_documents_v1(text) TO service_role;

CREATE FUNCTION public.customer_portal_guard_document_v1(p_token_hash text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $one$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_row jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_selector IS NULL OR p_selector !~ '^(rg|cn|sc)-[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF p_selector ~ '^rg-' THEN
    SELECT jsonb_build_object(
      'status', 'ok',
      'kind', 'receipt',
      'reference', inv.public_ref,
      'serviceName', qv.service_name,
      'amountMinor', inv.amount_paid_minor,
      'currency', inv.currency,
      'issuedAt', inv.created_at,
      'periodStart', inv.period_start,
      'periodEnd', inv.period_end,
      'relatedReference', NULL,
      'orderRef', ord.public_ref,
      'coveredLocation', loc.location_name,
      'billToName', party.bill->>'name',
      'billToEmail', party.bill->>'email',
      'billToCountry', party.bill->>'country',
      'contactName', party.bill->>'contactName',
      'sellerVatRegistered', coalesce((
        SELECT position.status = 'REGISTERED'
        FROM public.seller_vat_position position
        WHERE position.effective_from <= inv.created_at
        ORDER BY position.effective_from DESC
        LIMIT 1
      ), false),
      'sellerVatNumber', NULL
    ) INTO v_row
    FROM public.guard_subscription_invoices inv
    JOIN public.guard_subscriptions sub ON sub.id = inv.subscription_id AND sub.customer_id = v_customer
    JOIN public.service_orders ord ON ord.id = sub.service_order_id AND ord.customer_id = v_customer
    JOIN public.quote_versions qv ON qv.id = ord.quote_version_id
    JOIN public.locations loc ON loc.id = sub.location_id
    CROSS JOIN LATERAL (
      SELECT admin_private.billing_bill_to_v1(sub.business_id, v_customer, (
        SELECT accepted_email_snapshot FROM public.quote_acceptances WHERE id = ord.quote_acceptance_id
      )) AS bill
    ) party
    WHERE inv.status = 'PAID'
      AND admin_private.guard_billing_selector_v1('rg', inv.id) = p_selector
      AND party.bill IS NOT NULL
      AND coalesce(party.bill->>'name', '') <> '';
  ELSIF p_selector ~ '^cn-' THEN
    SELECT jsonb_build_object(
      'status', 'ok',
      'kind', 'credit_note',
      'reference', refund.public_ref,
      'serviceName', qv.service_name,
      'amountMinor', refund.amount_minor,
      'currency', refund.currency,
      'issuedAt', coalesce(refund.succeeded_at, refund.created_at),
      'periodStart', NULL,
      'periodEnd', NULL,
      'relatedReference', inv.public_ref,
      'orderRef', ord.public_ref,
      'coveredLocation', NULL,
      'billToName', party.bill->>'name',
      'billToEmail', party.bill->>'email',
      'billToCountry', party.bill->>'country',
      'contactName', party.bill->>'contactName',
      'sellerVatRegistered', coalesce((
        SELECT position.status = 'REGISTERED'
        FROM public.seller_vat_position position
        WHERE position.effective_from <= coalesce(refund.succeeded_at, refund.created_at)
        ORDER BY position.effective_from DESC
        LIMIT 1
      ), false),
      'sellerVatNumber', NULL
    ) INTO v_row
    FROM public.guard_refunds refund
    JOIN public.guard_subscriptions sub ON sub.id = refund.subscription_id AND sub.customer_id = v_customer
    JOIN public.guard_subscription_invoices inv ON inv.id = refund.invoice_id AND inv.status = 'PAID'
    JOIN public.service_orders ord ON ord.id = sub.service_order_id AND ord.customer_id = v_customer
    JOIN public.quote_versions qv ON qv.id = ord.quote_version_id
    CROSS JOIN LATERAL (
      SELECT admin_private.billing_bill_to_v1(sub.business_id, v_customer, (
        SELECT accepted_email_snapshot FROM public.quote_acceptances WHERE id = ord.quote_acceptance_id
      )) AS bill
    ) party
    WHERE refund.status = 'SUCCEEDED'
      AND admin_private.guard_billing_selector_v1('cn', refund.id) = p_selector
      AND party.bill IS NOT NULL
      AND coalesce(party.bill->>'name', '') <> '';
  ELSE
    SELECT jsonb_build_object(
      'status', 'ok',
      'kind', 'credit_note',
      'reference', adjustment.public_ref,
      'serviceName', qv.service_name,
      'amountMinor', coalesce(adjustment.approved_amount_minor, adjustment.amount_minor),
      'currency', adjustment.currency,
      'issuedAt', coalesce(adjustment.approved_at, adjustment.created_at),
      'periodStart', adjustment.period_start,
      'periodEnd', adjustment.period_end,
      'relatedReference', inv.public_ref,
      'orderRef', ord.public_ref,
      'coveredLocation', NULL,
      'billToName', party.bill->>'name',
      'billToEmail', party.bill->>'email',
      'billToCountry', party.bill->>'country',
      'contactName', party.bill->>'contactName',
      'sellerVatRegistered', coalesce((
        SELECT position.status = 'REGISTERED'
        FROM public.seller_vat_position position
        WHERE position.effective_from <= coalesce(adjustment.approved_at, adjustment.created_at)
        ORDER BY position.effective_from DESC
        LIMIT 1
      ), false),
      'sellerVatNumber', NULL
    ) INTO v_row
    FROM public.guard_billing_adjustments adjustment
    JOIN public.guard_subscriptions sub ON sub.id = adjustment.subscription_id AND sub.customer_id = v_customer
    JOIN public.service_orders ord ON ord.id = sub.service_order_id AND ord.customer_id = v_customer
    JOIN public.quote_versions qv ON qv.id = ord.quote_version_id
    LEFT JOIN public.guard_subscription_invoices inv ON inv.id = adjustment.invoice_id
    CROSS JOIN LATERAL (
      SELECT admin_private.billing_bill_to_v1(sub.business_id, v_customer, (
        SELECT accepted_email_snapshot FROM public.quote_acceptances WHERE id = ord.quote_acceptance_id
      )) AS bill
    ) party
    WHERE adjustment.kind = 'SERVICE_CREDIT'
      AND adjustment.status = 'SUCCEEDED'
      AND admin_private.guard_billing_selector_v1('sc', adjustment.id) = p_selector
      AND party.bill IS NOT NULL
      AND coalesce(party.bill->>'name', '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.guard_refunds refund
        WHERE refund.adjustment_id = adjustment.id AND refund.status = 'SUCCEEDED'
      );
  END IF;
  IF v_row IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  RETURN v_row;
END;
$one$;

REVOKE ALL ON FUNCTION public.customer_portal_guard_document_v1(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_guard_document_v1(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_payment_list_v1(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'orderId', o.id, 'orderRef', o.public_ref, 'customerId', o.customer_id, 'caseId', o.case_id,
    'serviceCode', o.service_code, 'amountMinor', o.amount_minor, 'currency', o.currency,
    'paymentModel', o.payment_model, 'orderState', o.state, 'version', o.record_version,
    'obligationId', ob.id, 'obligationKind', ob.kind, 'obligationState', ob.state,
    'setupReady', EXISTS (SELECT 1 FROM public.saved_payment_methods pm WHERE pm.service_order_id = o.id AND pm.status = 'USABLE'),
    'consentId', c.id, 'approvalId', a.id, 'receiptId', r.id, 'receiptRef', r.public_ref,
    'invoiceId', inv.id, 'invoiceStatus', inv.status,
    'acceptedEvidence', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', v.id, 'filename', v.original_filename, 'versionNumber', v.version_number) ORDER BY v.created_at DESC)
      FROM public.case_document_versions v
      JOIN public.case_documents d ON d.id = v.document_id
      WHERE d.case_id = o.case_id
        AND v.upload_status = 'UPLOADED'
        AND v.scan_status = 'NO_THREATS_FOUND'
        AND v.validation_status = 'VALID'
        AND v.review_status = 'ACCEPTED'
    ), '[]'::jsonb)
  ) ORDER BY o.created_at DESC), '[]') INTO rows
  FROM public.service_orders o
  LEFT JOIN public.payment_obligations ob ON ob.service_order_id = o.id AND ob.state <> 'VOID'
  LEFT JOIN public.payment_consents c ON c.service_order_id = o.id
  LEFT JOIN public.success_fee_approvals a ON a.service_order_id = o.id
  LEFT JOIN public.payment_receipts r ON r.service_order_id = o.id
  LEFT JOIN public.payment_invoices inv ON inv.obligation_id = ob.id AND inv.status <> 'VOID';
  RETURN jsonb_build_object('orders', rows);
END; $$;

COMMIT;
