-- Customer case reference stays the primary subject on future case mail.
-- Quotation, service-order and receipt numbers remain their own records and
-- stay labelled in the message. Stored communications, quotations, receipts
-- and template catalogue rows are not rewritten.
-- Source only. Do not apply this file to DEV or Production from this change.
-- It does not send mail, take a payment, or repair existing rows.
-- The file sorts after the applied DEV head 20261031140000 so a clean rebuild
-- keeps these case-reference checks and the Guided completion sentence.
CREATE OR REPLACE FUNCTION admin_private.guided_payment_request_snapshot_reason_v1(
  p_subject text,
  p_text text,
  p_html text,
  p_origin text,
  p_case_ref text,
  p_order_ref text,
  p_service_name text,
  p_service_code text,
  p_amount integer,
  p_reply_to text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  expected text;
  label text;
  amount_label text;
  stripped text;
BEGIN
  IF p_service_code = 'GUIDED_RELAUNCH' AND p_service_name = 'Guided Relaunch' THEN
    NULL;
  ELSIF p_service_code = 'GUIDED_REVIEW' AND p_service_name = 'Guided Review' THEN
    NULL;
  ELSE
    RETURN 'snapshot_mismatch';
  END IF;
  -- The accepted order total, in pence. Catalogue list prices are not required.
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100000000 THEN
    RETURN 'snapshot_mismatch';
  END IF;
  label := 'Pay £' || (p_amount / 100)::text || '.' || lpad((p_amount % 100)::text, 2, '0') || ' securely';
  amount_label := '£' || (p_amount / 100)::text || '.' || lpad((p_amount % 100)::text, 2, '0') || ' GBP';
  IF p_origin IS NULL OR p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_case_ref IS NULL OR p_case_ref !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_order_ref IS NULL OR p_order_ref !~ '^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_subject IS NULL OR p_text IS NULL OR p_html IS NULL
  THEN RETURN 'snapshot_mismatch'; END IF;
  expected := p_origin || '/portal/cases/' || p_case_ref || '/payments';
  IF position('Case ' || p_case_ref IN p_subject) = 0
    OR position(p_service_name IN p_text) = 0 OR position(p_service_name IN p_html) = 0
    OR position('Service order: ' || p_order_ref IN p_text) = 0
    OR position('Service order: ' || p_order_ref IN p_html) = 0
    OR position(p_order_ref IN p_text) = 0 OR position(p_order_ref IN p_html) = 0
    OR position(p_case_ref IN p_text) = 0 OR position(p_case_ref IN p_html) = 0
    OR position(amount_label IN p_text) = 0 OR position(amount_label IN p_html) = 0
    OR position(label IN p_text) = 0 OR position(label IN p_html) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_text) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_html) = 0
    OR position('Opening this email does not start a card payment.' IN p_text) = 0
    OR position('Opening this email does not start a card payment.' IN p_html) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_text) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_html) = 0
    OR position('#t=' IN p_subject) > 0 OR position('#t=' IN p_text) > 0 OR position('#t=' IN p_html) > 0
    OR position('/action/' IN p_text) > 0 OR position('/action/' IN p_html) > 0
    OR position('Quotation:' IN p_text) > 0 OR position('Review and accept quotation' IN p_text) > 0
    OR (length(p_text) - length(replace(p_text, expected, ''))) IS DISTINCT FROM length(expected)
    OR (length(p_html) - length(replace(p_html, expected, ''))) IS DISTINCT FROM length(expected)
    OR (length(p_text) - length(replace(p_text, label, ''))) IS DISTINCT FROM length(label)
    OR (length(p_html) - length(replace(p_html, label, ''))) IS DISTINCT FROM length(label)
  THEN RETURN 'snapshot_mismatch'; END IF;
  IF p_reply_to IS NULL
    OR length(p_reply_to) > 254
    OR p_reply_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    OR position('If you have a question about this payment, simply reply to this email and keep the case reference in the subject.' IN p_text) = 0
    OR position('If you have a question about this payment, simply reply to this email and keep the case reference in the subject.' IN p_html) = 0
  THEN RETURN 'snapshot_mismatch'; END IF;
  stripped := replace(replace(p_text, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot_mismatch'; END IF;
  stripped := replace(replace(p_html, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot_mismatch'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.guided_payment_request_snapshot_reason_v1(
  text, text, text, text, text, text, text, text, integer, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.quote_offer_snapshot_reason_v1(
  p_subject text,
  p_text text,
  p_html text,
  p_origin text,
  p_action uuid,
  p_public_ref text,
  p_service_name text,
  p_amount integer,
  p_currency text,
  p_payment text,
  p_scope text,
  p_exclusions text,
  p_valid timestamptz,
  p_agreement_hash text,
  p_reply_to text,
  p_tax text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  own text;
  amount_label text;
  pay text;
  until_label text;
  expected text;
  stripped text;
  label text;
  concise boolean;
  reply_case text := 'If you have any questions about this quotation, simply reply to this email and keep your case reference in the subject.';
  case_ref text;
  reply_quote text := 'If you have any questions about this quotation, simply reply to this email and keep your quotation reference in the subject.';
  reply_legacy text := 'If you have a question about this quotation, reply to this email.';
  website text := 'If you have a question about this quotation, contact us through the ProfileRelaunch website.';
  guided_scope text := $scope$Guided Relaunch (£99 upfront). The final customer price is £99 upfront. ProfileRelaunch prepares the work and the customer submits it. We prepare it. You submit it. We organise the evidence and prepare what needs to be submitted. You remain the person who files it with Google. A Guided fee is payable upfront only after you have accepted a valid quotation and this agreement. Total price, inclusive of any applicable taxes. No additional taxes or mandatory fees charged by ProfileRelaunch.

Standard wording version SCOPE-2026-10-21.3.$scope$;
  guided_exclusions text := $exclusions$Google makes final platform decisions. Managed success fees are payable only when the defined successful outcome is achieved under the service terms. Total price, inclusive of any applicable taxes. No additional taxes or mandatory fees charged by ProfileRelaunch. ProfileRelaunch does not submit the prepared profile work to Google. This quote does not include Managed case work, a success fee, or Relaunch Guard monitoring. This is an upfront guided recovery service. Payment collection is a later step and is not taken by accepting this quote. The quoted amount is payable later through the payment workflow. Accepting this quote does not charge a card and is not payment authorisation.$exclusions$;
BEGIN
  IF p_subject IS NULL OR p_text IS NULL OR p_html IS NULL OR p_origin IS NULL OR p_action IS NULL
    OR p_public_ref IS NULL OR p_service_name IS NULL OR p_amount IS NULL OR p_currency IS NULL
    OR p_payment IS NULL OR p_valid IS NULL
    OR length(btrim(p_subject)) NOT BETWEEN 1 AND 200
    OR length(p_text) NOT BETWEEN 20 AND 100000
    OR length(p_html) NOT BETWEEN 20 AND 100000
    OR p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_currency !~ '^[A-Z]{3}$'
    OR p_amount < 0
    OR position('#t=' IN p_subject) > 0
    OR p_subject ~ '[<>]'
    OR p_subject ~* 'https?://'
  THEN RETURN 'snapshot_mismatch'; END IF;
  case_ref := substring(p_text from 'Case reference: ((PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6})');
  IF case_ref IS NOT NULL THEN
    IF position('Case ' || case_ref IN p_subject) = 0 THEN RETURN 'snapshot_mismatch'; END IF;
  ELSIF position(p_public_ref IN p_subject) = 0 THEN
    RETURN 'snapshot_mismatch';
  END IF;
  own := '£' || (p_amount / 100)::text || '.' || lpad((p_amount % 100)::text, 2, '0');
  amount_label := own || ' ' || p_currency;
  pay := CASE p_payment
    WHEN 'UPFRONT' THEN 'Upfront'
    WHEN 'SUCCESS_FEE' THEN 'Success fee'
    WHEN 'RECURRING_MONTHLY' THEN 'Recurring monthly'
    ELSE NULL
  END;
  IF pay IS NULL THEN RETURN 'snapshot_mismatch'; END IF;
  until_label := to_char(p_valid AT TIME ZONE 'Europe/London', 'FMDD FMMonth YYYY');
  expected := p_origin || '/action/' || p_action::text;
  concise := p_service_name = 'Guided Relaunch'
    AND p_amount = 9900
    AND p_currency = 'GBP'
    AND p_payment = 'UPFRONT'
    AND p_tax IN ('NOT_APPLICABLE', 'INCLUSIVE')
    AND p_scope = guided_scope
    AND p_exclusions = guided_exclusions;
  IF position('Quotation number: ' || p_public_ref IN p_text) = 0
    OR position('Service: ' || p_service_name IN p_text) = 0
    OR position('Amount: ' || amount_label IN p_text) = 0
    OR position('This quotation is valid until ' || until_label || '.' IN p_text) = 0
    OR position('Included in this quotation' IN p_text) = 0
    OR position('Not included' IN p_text) = 0
    OR position('This secure link expires before that date and no later than seven days after it is sent.' IN p_text) = 0
    OR position('Review and accept quotation' IN p_text) = 0
    OR position('Review and accept quotation' IN p_html) = 0
    OR position('Kind regards,' IN p_text) = 0
    OR position('ProfileRelaunch Support Team' IN p_text) = 0
    OR position('ProfileRelaunch is independent of Google. We do not control Google''s systems, decisions or timescales.' IN p_text) = 0
    OR position('independent of Google' IN p_html) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_text) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_html) = 0
    OR position('https://profilerelaunch.com' IN p_text) = 0
  THEN RETURN 'snapshot_mismatch'; END IF;
  IF concise THEN
    IF position('Amount: ' || amount_label || ' — inclusive of any applicable taxes.' IN p_text) = 0
      OR position('Amount: ' || amount_label || ' — inclusive of any applicable taxes.' IN p_html) = 0
      OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_text) = 0
      OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_html) = 0
      OR position('Payment: The £99 fee is payable upfront through a separate payment step after you accept this quotation and the service agreement. Acceptance does not charge your card.' IN p_text) = 0
      OR position('Payment: The £99 fee is payable upfront through a separate payment step after you accept this quotation and the service agreement. Acceptance does not charge your card.' IN p_html) = 0
      OR position('We organise your evidence and prepare the materials needed for your Google Business Profile relaunch submission.' IN p_text) = 0
      OR position('We organise your evidence and prepare the materials needed for your Google Business Profile relaunch submission.' IN p_html) = 0
      OR position('You review and submit the prepared materials to Google yourself.' IN p_text) = 0
      OR position('You review and submit the prepared materials to Google yourself.' IN p_html) = 0
      OR position('Submitting the prepared work to Google or managing the case with Google on your behalf.' IN p_text) = 0
      OR position('Submitting the prepared work to Google or managing the case with Google on your behalf.' IN p_html) = 0
      OR position('Ongoing profile and review monitoring.' IN p_text) = 0
      OR position('Ongoing profile and review monitoring.' IN p_html) = 0
      OR position('A guaranteed result or processing time; Google makes the final decision.' IN p_text) = 0
      OR position('A guaranteed result or processing time; Google makes the final decision.' IN p_html) = 0
      OR position('We prepare it. You submit it.' IN p_text) > 0
      OR position('We prepare it. You submit it.' IN p_html) > 0
      OR position('Managed success fees are payable' IN p_text) > 0
      OR position('Managed success fees are payable' IN p_html) > 0
      OR position('Payment: Upfront' IN p_text) > 0
      OR position('Payment: Upfront' IN p_html) > 0
    THEN RETURN 'snapshot_mismatch'; END IF;
  ELSE
    IF position('Payment: ' || pay IN p_text) = 0
      OR NOT admin_private.quote_offer_lines_present_v1(p_scope, p_text)
      OR NOT admin_private.quote_offer_lines_present_v1(p_exclusions, p_text)
      OR position('The £99 fee is payable upfront through a separate payment step' IN p_text) > 0
      OR position('— inclusive of any applicable taxes.' IN p_text) > 0
    THEN RETURN 'snapshot_mismatch'; END IF;
  END IF;
  IF p_reply_to IS NULL THEN
    IF position(website IN p_text) = 0 OR position(website IN p_html) = 0 THEN
      RETURN 'snapshot_mismatch';
    END IF;
  ELSIF concise THEN
    IF (position(reply_case IN p_text) = 0 OR position(reply_case IN p_html) = 0)
      AND (position(reply_quote IN p_text) = 0 OR position(reply_quote IN p_html) = 0)
    THEN RETURN 'snapshot_mismatch'; END IF;
  ELSIF NOT (
    (position(reply_legacy IN p_text) > 0 AND position(reply_legacy IN p_html) > 0)
    OR (position(reply_case IN p_text) > 0 AND position(reply_case IN p_html) > 0)
    OR (position(reply_quote IN p_text) > 0 AND position(reply_quote IN p_html) > 0)
  ) THEN
    RETURN 'snapshot_mismatch';
  END IF;
  FOR label IN SELECT unnest(ARRAY['£99.00', '£59.00', '£299.00', '£149.00', '£9.99'])
  LOOP
    IF position(label IN own) = 0 AND (
      position(label IN p_text) > 0 OR position(label IN p_html) > 0
    ) THEN RETURN 'snapshot_mismatch'; END IF;
  END LOOP;
  IF position('#t=' IN p_text) > 0 OR position('#t=' IN p_html) > 0
    OR position('SHA-256' IN p_text) > 0 OR position('SHA-256' IN p_html) > 0
    OR position('PS-' IN p_text) > 0 OR position('PS-' IN p_html) > 0
    OR position('Standard wording version ' IN p_text) > 0
    OR position('Standard wording version ' IN p_html) > 0
    OR position('<script' IN lower(p_html)) > 0
    OR (p_agreement_hash IS NOT NULL AND (
      position(p_agreement_hash IN p_text) > 0 OR position(p_agreement_hash IN p_html) > 0
    ))
    OR (length(p_text) - length(replace(p_text, expected, ''))) IS DISTINCT FROM length(expected)
    OR (length(p_html) - length(replace(p_html, expected, ''))) IS DISTINCT FROM length(expected)
  THEN RETURN 'snapshot_mismatch'; END IF;
  stripped := replace(replace(p_text, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN
    RETURN 'snapshot_mismatch';
  END IF;
  stripped := replace(replace(p_html, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN
    RETURN 'snapshot_mismatch';
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION admin_private.quote_offer_snapshot_reason_v1(
  text, text, text, text, uuid, text, text, integer, text, text, text, text, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.fulfilment_snapshot_reason_v1(
  p_case uuid, p_template text, p_subject text, p_text text, p_html text, p_origin text
) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  c public.cases;
  ord public.service_orders;
  page text;
  button text;
  expected text;
  amount_label text;
  service_name text;
  stripped text;
  settlement text;
  receipt_ref text;
BEGIN
  settlement := admin_private.guided_settlement_reason_v1(p_case);
  IF settlement IS NOT NULL THEN RETURN settlement; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT';
  service_name := CASE ord.service_code WHEN 'GUIDED_RELAUNCH' THEN 'Guided Relaunch' ELSE 'Guided Review' END;
  amount_label := '£' || (ord.amount_minor / 100)::text || '.' || lpad((ord.amount_minor % 100)::text, 2, '0') || ' GBP';
  IF p_template = 'PAYMENT_CONFIRMATION' THEN
    page := 'payments';
    button := 'View your receipt';
  ELSIF p_template IN ('GUIDED_PACK_READY', 'GUIDED_COMPLETION') THEN
    page := 'documents';
    button := 'View your completed pack';
  ELSE
    RETURN 'template';
  END IF;
  expected := p_origin || '/portal/cases/' || c.public_ref || '/' || page;
  IF p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 8 AND 200
    OR position('Case ' || c.public_ref IN p_subject) = 0
    OR position(service_name IN coalesce(p_text, '')) = 0
    OR position(amount_label IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_html, '')) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN coalesce(p_text, '')) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN coalesce(p_text, '')) = 0
    OR position('#t=' IN coalesce(p_subject, '') || coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('/action/' IN coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('pi_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR position('cus_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR admin_private.fulfilment_page_count_v1(p_text, page) IS DISTINCT FROM 1
    OR admin_private.fulfilment_page_count_v1(p_html, page) IS DISTINCT FROM 1
    OR position(expected IN coalesce(p_text, '')) = 0
    OR position(expected IN coalesce(p_html, '')) = 0
    OR position('reply to this email' IN lower(coalesce(p_text, ''))) = 0
    OR position('reply to this email' IN lower(coalesce(p_html, ''))) = 0
  THEN RETURN 'snapshot'; END IF;

  IF p_template = 'PAYMENT_CONFIRMATION' THEN
    receipt_ref := substring(coalesce(p_text, '') from 'Receipt number: (RC-[0-9]{2}-[A-HJ-NP-Z2-9]{6})');
    IF receipt_ref IS NULL
      OR position('Service order: ' || ord.public_ref IN coalesce(p_text, '')) = 0
      OR position('Service order: ' || ord.public_ref IN coalesce(p_html, '')) = 0
      OR position('Receipt number: ' || receipt_ref IN coalesce(p_html, '')) = 0
      OR NOT EXISTS (
        SELECT 1 FROM public.payment_receipts receipt
        WHERE receipt.public_ref = receipt_ref
          AND receipt.service_order_id = ord.id
          AND receipt.customer_id = c.customer_id
      )
    THEN RETURN 'snapshot'; END IF;
  END IF;
  IF p_template IN ('GUIDED_PACK_READY', 'GUIDED_COMPLETION') AND position(
    'You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you.'
    IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  IF p_template = 'GUIDED_COMPLETION' AND position(
    'Relaunch Guard is optional. This email does not enrol you.' IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  IF p_template = 'GUIDED_COMPLETION' AND position(
    'Your ' || service_name || ' service is complete. Your submission pack remains available in your account. You can tell us when you''ve submitted it to Google and update us when you hear back.'
    IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_text, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_html, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_confirmation_context_v1(p_payment_intent text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  receipt public.payment_receipts;
  ord public.service_orders;
  c public.cases;
  reason text;
BEGIN
  IF p_payment_intent IS NULL OR p_payment_intent !~ '^pi_[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object('status', 'not_applicable');
  END IF;
  SELECT * INTO receipt FROM public.payment_receipts WHERE stripe_payment_intent_id = p_payment_intent;
  IF receipt.id IS NULL THEN RETURN jsonb_build_object('status', 'not_applicable'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = receipt.service_order_id;
  IF ord.id IS NULL OR ord.service_code NOT IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW') OR ord.payment_model IS DISTINCT FROM 'UPFRONT' THEN
    RETURN jsonb_build_object('status', 'not_applicable');
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = ord.case_id;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'not_applicable'); END IF;
  reason := admin_private.guided_settlement_reason_v1(c.id);
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('status', 'not_applicable', 'reason', reason); END IF;
  RETURN jsonb_build_object(
    'status', 'applicable',
    'receiptId', receipt.id,
    'caseId', c.id,
    'caseRef', c.public_ref,
    'orderRef', ord.public_ref,
    'receiptRef', receipt.public_ref,
    'amountMinor', ord.amount_minor,
    'currency', 'GBP',
    'serviceCode', ord.service_code,
    'serviceName', CASE ord.service_code WHEN 'GUIDED_RELAUNCH' THEN 'Guided Relaunch' ELSE 'Guided Review' END,
    'alreadyQueued', EXISTS (SELECT 1 FROM public.guided_payment_confirmations existing WHERE existing.receipt_id = receipt.id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.payment_confirmation_context_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_confirmation_context_v1(text) TO service_role;

CREATE OR REPLACE FUNCTION admin_private.brand_evidence_request_snapshot_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  title text;
  item text;
  items text[] := ARRAY[]::text[];
  upload text;
  public_ref text;
  configured text;
  branded_text text;
  branded_html text;
  wants_reply boolean;
BEGIN
  IF NEW.template_key IS DISTINCT FROM 'EVIDENCE_REQUEST' OR coalesce(NEW.template_version, 0) < 3 OR NEW.lifecycle IS DISTINCT FROM 'DRAFT' THEN
    RETURN NEW;
  END IF;
  SELECT e.title INTO title FROM public.evidence_requests e WHERE e.id = NEW.evidence_request_id;
  IF title IS NULL THEN
    RAISE EXCEPTION 'evidence_request_not_specific' USING ERRCODE = 'P0001';
  END IF;
  FOREACH item IN ARRAY regexp_split_to_array(title, '; ') LOOP
    item := btrim(item);
    IF item = '' OR length(item) > 200 OR item ~ '[<>]' OR lower(item) IN (
      'other', 'other evidence', 'other document', 'other documents', 'evidence', 'document', 'documents',
      'doc', 'docs', 'n/a', 'na', 'none', 'tbd', 'misc', 'miscellaneous', 'something else'
    ) THEN
      RAISE EXCEPTION 'evidence_request_not_specific' USING ERRCODE = 'P0001';
    END IF;
    items := array_append(items, item);
  END LOOP;
  IF coalesce(array_length(items, 1), 0) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'evidence_request_not_specific' USING ERRCODE = 'P0001';
  END IF;
  upload := substring(NEW.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
  IF upload IS NULL
     OR position('#t=' in coalesce(NEW.body_text, '')) > 0
     OR position('#t=' in coalesce(NEW.body_html, '')) > 0
     OR upload IS DISTINCT FROM 'https://' || substring(upload from 'https://([A-Za-z0-9.-]+)') || '/action/' || NEW.customer_action_id::text
     OR (length(NEW.body_text) - length(replace(NEW.body_text, upload, ''))) IS DISTINCT FROM length(upload)
  THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.public_ref INTO public_ref FROM public.cases c WHERE c.id = NEW.case_id;
  IF public_ref IS NULL OR btrim(public_ref) = '' THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  configured := nullif(btrim(coalesce(current_setting('profilerelaunch.reply_to', true), '')), '');
  IF configured IS NOT NULL THEN
    IF length(configured) <= 254 AND configured ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      NEW.reply_to_address := lower(configured);
    ELSE
      NEW.reply_to_address := NULL;
    END IF;
  ELSIF coalesce(NEW.content_version, 1) <= 1 THEN
    NEW.reply_to_address := NULL;
  END IF;
  IF position('Case ' || btrim(public_ref) IN coalesce(NEW.subject, '')) = 0 THEN
    IF coalesce(NEW.content_version, 1) > 1
       AND btrim(coalesce(NEW.subject, '')) <> ''
       AND length(btrim(NEW.subject) || ' — Case ' || btrim(public_ref)) <= 200 THEN
      NEW.subject := btrim(NEW.subject) || ' — Case ' || btrim(public_ref);
    ELSE
      NEW.subject := 'Documents needed — Case ' || btrim(public_ref);
    END IF;
  END IF;
  wants_reply := NEW.reply_to_address IS NOT NULL;
  branded_text := admin_private.evidence_request_plain_text_v1(public_ref, items, upload, NEW.body_text, coalesce(NEW.content_version, 1), wants_reply);
  branded_html := admin_private.evidence_request_html_v1(public_ref, items, upload, NEW.body_text, coalesce(NEW.content_version, 1), wants_reply);
  IF branded_text IS NULL OR branded_html IS NULL
     OR position('#t=' in branded_text) > 0
     OR position('#t=' in branded_html) > 0
     OR (length(branded_text) - length(replace(branded_text, upload, ''))) IS DISTINCT FROM length(upload)
     OR (length(branded_html) - length(replace(branded_html, upload, ''))) IS DISTINCT FROM length(upload)
  THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  NEW.body_text := branded_text;
  NEW.body_html := branded_html;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION admin_private.brand_evidence_request_snapshot_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.guard_alert_customer_reference_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  case_ref text;
  order_ref text;
  suffix text;
BEGIN
  IF NEW.template_key IS DISTINCT FROM 'GUARD_ALERT' OR NEW.guard_alert_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.public_ref INTO case_ref
  FROM public.guard_alerts alert
  JOIN public.cases c ON c.id = alert.linked_primary_case_id
  WHERE alert.id = NEW.guard_alert_id
    AND c.customer_id = NEW.customer_id
    AND c.public_ref ~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$';
  IF case_ref IS NULL THEN
    SELECT c.public_ref INTO case_ref
    FROM public.guard_alerts alert
    JOIN public.guard_coverages cov ON cov.id = alert.coverage_id
    JOIN public.cases c ON c.id = cov.source_recovery_case_id
    WHERE alert.id = NEW.guard_alert_id
      AND c.customer_id = NEW.customer_id
      AND c.public_ref ~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$';
  END IF;
  IF case_ref IS NOT NULL THEN
    suffix := ' — Case ' || case_ref;
  ELSE
    SELECT ord.public_ref INTO order_ref
    FROM public.guard_alerts alert
    JOIN public.guard_coverages cov ON cov.id = alert.coverage_id
    JOIN public.service_orders ord ON ord.id = cov.service_order_id
    WHERE alert.id = NEW.guard_alert_id
      AND ord.customer_id = NEW.customer_id
      AND ord.public_ref ~ '^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$';
    IF order_ref IS NULL THEN
      SELECT ord.public_ref INTO order_ref
      FROM public.guard_alerts alert
      JOIN public.guard_subscriptions sub ON sub.coverage_id = alert.coverage_id
      JOIN public.service_orders ord ON ord.id = sub.service_order_id
      WHERE alert.id = NEW.guard_alert_id
        AND ord.customer_id = NEW.customer_id
        AND sub.customer_id = NEW.customer_id
        AND ord.public_ref ~ '^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
      ORDER BY sub.created_at DESC
      LIMIT 1;
    END IF;
    IF order_ref IS NOT NULL THEN
      suffix := ' — Service order ' || order_ref;
    END IF;
  END IF;
  IF suffix IS NULL OR position(suffix IN coalesce(NEW.subject, '')) > 0 THEN
    RETURN NEW;
  END IF;
  IF length(btrim(coalesce(NEW.subject, '')) || suffix) > 200 THEN
    RETURN NEW;
  END IF;
  NEW.subject := btrim(coalesce(NEW.subject, '')) || suffix;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.guard_alert_customer_reference_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS communications_guard_alert_customer_reference ON public.communications;
CREATE TRIGGER communications_guard_alert_customer_reference
  BEFORE INSERT ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.guard_alert_customer_reference_v1();
