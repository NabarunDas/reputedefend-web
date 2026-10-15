/**
 * Synthetic eligibility fixtures for database tests.
 * These values are not an accountant approval, tax opinion, or payment authorisation.
 * Production approval must be recorded by an authenticated operator with real external evidence.
 * No country is approved by the migration.
 */
export const SYNTHETIC_ELIGIBILITY_EVIDENCE =
  "Synthetic test fixture only. This is not an accountant tax approval or payment authorisation."

export function syntheticGbEligibilitySql(businessId: string, actorId: string): string {
  const evidence = SYNTHETIC_ELIGIBILITY_EVIDENCE.replace(/'/g, "''")
  return `
    insert into public.business_establishments(
      business_id, country_code, legal_name, registration_id, evidence_type, evidence_reference,
      verification_status, verified_by, verified_at, recorded_by, request_id, payload_fingerprint
    )
    select '${businessId}', 'GB', 'Synthetic Test Bakery Ltd', 'SYNTHETIC-REG', 'REGISTRY_EXTRACT',
      '${evidence}', 'VERIFIED', '${actorId}', now(), '${actorId}', gen_random_uuid(), 'synthetic-establishment'
    where not exists (
      select 1 from public.business_establishments
      where business_id = '${businessId}' and superseded_at is null and verification_status = 'VERIFIED'
    );
    insert into public.commercial_eligibility_decisions(
      request_id, country_code, service_class, payment_flow, b2b_requirement, tax_determination,
      destination_requirements, seller_registration_status, stripe_flow_ready, presentment_mode,
      presentment_currency, status, effective_from, review_due_at, approved_by, evidence_reference,
      decision_version, payload_fingerprint
    )
    -- OTHER_ACCOUNTANT_APPROVED matches the tax behaviours these tests already store.
    -- It is not a ruling that non-VAT registration zeroes tax outside the United Kingdom.
    select gen_random_uuid(), 'GB', f.service_class, f.payment_flow, 'B2B_VERIFIED',
      'OTHER_ACCOUNTANT_APPROVED',
      'Synthetic GB establishment for this test database only.',
      'NOT_VAT_REGISTERED', true, 'GBP_ONLY', 'GBP', 'APPROVED', now(), now() + interval '365 days',
      '${actorId}', '${evidence} ' || f.service_class || ' ' || f.payment_flow,
      coalesce((
        select max(d.decision_version) from public.commercial_eligibility_decisions d
        where d.country_code = 'GB' and d.subdivision_code is null
          and d.service_class = f.service_class and d.payment_flow = f.payment_flow
      ), 0) + 1,
      'synthetic-' || f.service_class || '-' || f.payment_flow
    from (values
      ('GUIDED','CHECKOUT_UPFRONT'),
      ('MANAGED','HOSTED_INVOICE_SUCCESS_FEE'),
      ('GUARD','GUARD_RECURRING')
    ) as f(service_class, payment_flow)
    where not exists (
      select 1 from public.commercial_eligibility_decisions d
      where d.country_code = 'GB' and d.subdivision_code is null
        and d.service_class = f.service_class and d.payment_flow = f.payment_flow
        and d.status = 'APPROVED' and d.effective_until is null
    );
  `
}
