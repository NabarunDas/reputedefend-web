BEGIN;

-- PAYMENT-CHECKOUT-BRANDING-DEV-01. Source only. Do not apply to DEV or
-- Production from this change. It does not send mail, charge a card, edit a
-- case, or create a Checkout Session.
--
-- Reads the accepted order's service code and amount, and the customer's
-- verified email only when that email is the address stored on the customer.
-- The function takes no email and no service-name argument.

CREATE FUNCTION public.payment_checkout_presentation_v1(p_customer uuid, p_service_order uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ord public.service_orders;
  cust public.customers;
  verified text;
BEGIN
  IF p_customer IS NULL OR p_service_order IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = p_service_order;
  IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM p_customer THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'order_mismatch');
  END IF;
  IF ord.service_code NOT IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW', 'MANAGED_RELAUNCH', 'MANAGED_REVIEW') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unsupported_service');
  END IF;
  IF ord.currency IS DISTINCT FROM 'GBP' OR ord.amount_minor IS NULL OR ord.amount_minor < 0 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'amount');
  END IF;
  SELECT * INTO cust FROM public.customers WHERE id = p_customer;
  IF cust.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'order_mismatch');
  END IF;
  verified := lower(cust.email);
  IF verified IS NULL
    OR verified <> btrim(verified)
    OR NOT admin_private.contact_verified_v1(cust.id, 'email')
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'email_unverified');
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'serviceCode', ord.service_code,
    'amountMinor', ord.amount_minor,
    'currency', ord.currency,
    'verifiedEmail', verified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payment_checkout_presentation_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_checkout_presentation_v1(uuid, uuid) TO service_role;

COMMIT;
