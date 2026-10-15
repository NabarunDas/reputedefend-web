/**
 * Records where a disposable test business belongs.
 * This is the purchasing business, not its Google listing, and it is not a tax approval.
 * No VAT number is stored.
 */
export function syntheticPurchasingEstablishmentSql(businessId: string, actorId: string, countryCode = "GB"): string {
  const evidence = "Synthetic record of where this purchasing business belongs. It is not a Google listing and not a tax approval."
  return `
    insert into public.business_establishments(
      business_id, country_code, legal_name, evidence_type, evidence_reference,
      verification_status, verified_by, verified_at, recorded_by, request_id, payload_fingerprint
    )
    select '${businessId}', '${countryCode}', 'Synthetic Purchasing Business Ltd', 'OTHER',
      '${evidence}', 'VERIFIED', '${actorId}', now(), '${actorId}', gen_random_uuid(), 'synthetic-purchasing-establishment'
    where not exists (
      select 1 from public.business_establishments
      where business_id = '${businessId}' and superseded_at is null and verification_status = 'VERIFIED'
    );
  `
}
