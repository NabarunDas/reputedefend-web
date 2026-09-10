/**
 * Central legal/business identity for public legal pages.
 *
 * Only `tradingName`, `siteUrl` and `noticeUpdated` are currently confirmed
 * for customer-facing use. Every other field is optional on purpose.
 *
 * TODO(owner): supply confirmed values before launch. Do not invent:
 * legal company name, registration number, registered office, postal address,
 * VAT number, DPO, phone, support email, retention period, hosting provider,
 * email/CRM provider, governing law, or courts.
 *
 * Empty optional fields must not be rendered as customer-facing placeholders.
 */
export type LegalIdentity = {
  tradingName: string
  siteUrl: string
  noticeUpdated: string
  legalName?: string
  contactEmail?: string
  postalAddress?: string
  registrationNumber?: string
  vatNumber?: string
  phone?: string
  dpoEmail?: string
  governingLaw?: string
  courts?: string
  enquiryProcessorName?: string
  hostingProvider?: string
  retentionPeriod?: string
}

export const legalIdentity: LegalIdentity = {
  tradingName: "ReputeDefend",
  siteUrl: "https://reputedefend.com",
  noticeUpdated: "10 September 2026",
}

export function hasLegalValue(value: string | undefined): value is string {
  return Boolean(value?.trim())
}

export const feeWording =
  "The level of support depends on the situation. Any proposed support and associated fees will be explained clearly before you decide how to proceed."
