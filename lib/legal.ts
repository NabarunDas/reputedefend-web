/**
 * Central legal/business identity for public legal pages.
 *
 * Confirmed for customer-facing use:
 * trading name, sole-trader legal name, correspondence address, contact email,
 * site URL, notice date, and Resend as the enquiry email processor.
 *
 * Do not invent: company registration, VAT, registered office, DPO, phone,
 * hosting provider, retention period, governing law, or courts.
 *
 * Empty optional fields must not be rendered as customer-facing placeholders.
 * Sole-trader mode must not display company registration, “Ltd”, “registered
 * office” or Companies House wording.
 *
 * Contact email remains on the existing ReputeDefend mailbox until the owner
 * migrates Workspace/Resend to @profilerelaunch.com. Do not invent a new
 * address in this stage.
 */
import { brandName, brandSiteUrl } from "@/lib/brand"

export type BusinessStructure = "sole-trader"

export type LegalIdentity = {
  tradingName: string
  siteUrl: string
  noticeUpdated: string
  businessStructure?: BusinessStructure
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
  tradingName: brandName,
  siteUrl: brandSiteUrl,
  noticeUpdated: "12 September 2026",
  businessStructure: "sole-trader",
  legalName: "Saswati Das",
  contactEmail: "contact@reputedefend.com",
  postalAddress: "6 Bradford Road\nOld Town\nSwindon\nSN1 4FE\nUnited Kingdom",
  enquiryProcessorName: "Resend",
}

export function hasLegalValue(value: string | undefined): value is string {
  return Boolean(value?.trim())
}

export function isSoleTrader(identity: LegalIdentity = legalIdentity) {
  return identity.businessStructure === "sole-trader"
}

/** “Saswati Das, trading as ProfileRelaunch” when the legal name is known. */
export function tradingAsLine(identity: LegalIdentity = legalIdentity) {
  if (!hasLegalValue(identity.legalName)) return identity.tradingName
  return `${identity.legalName}, trading as ${identity.tradingName}`
}

export function showsCompanyRegistration(identity: LegalIdentity = legalIdentity) {
  return !isSoleTrader(identity) && hasLegalValue(identity.registrationNumber)
}

export const feeWording =
  "The level of support depends on the situation. Any proposed support and associated fees will be explained clearly before you decide how to proceed."
