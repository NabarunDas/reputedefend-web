/**
 * Central legal identity for public pages.
 *
 * ProfileRelaunch Ltd (company number 17520826), registered in England and
 * Wales. The trading brand remains ProfileRelaunch. VAT is not registered:
 * do not invent a VAT number. Do not invent a telephone number, a data
 * protection officer, a second correspondence address, governing law, or courts.
 *
 * Historical customer records and previously accepted agreements are not
 * rewritten by this identity. Public pages read only this object.
 */
import { brandName, brandSiteUrl } from "@/lib/brand"

export type BusinessStructure = "private-limited-company"

export type LegalIdentity = {
  tradingName: string
  siteUrl: string
  noticeUpdated: string
  businessStructure?: BusinessStructure
  legalName?: string
  contactEmail?: string
  /** Registered office. There is no separate public correspondence address. */
  postalAddress?: string
  registrationNumber?: string
  placeOfRegistration?: string
  incorporatedOn?: string
  /** False means not registered. Never pair this with an invented VAT number. */
  vatRegistered?: boolean
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
  noticeUpdated: "14 October 2026",
  businessStructure: "private-limited-company",
  legalName: "ProfileRelaunch Ltd",
  contactEmail: "contact@profilerelaunch.com",
  postalAddress: "71–75 Shelton Street\nCovent Garden\nLondon\nWC2H 9JQ\nUnited Kingdom",
  registrationNumber: "17520826",
  placeOfRegistration: "England and Wales",
  incorporatedOn: "14 October 2026",
  vatRegistered: false,
  enquiryProcessorName: "Resend",
}

export function hasLegalValue(value: string | undefined): value is string {
  return Boolean(value?.trim())
}

export function isLimitedCompany(identity: LegalIdentity = legalIdentity) {
  return identity.businessStructure === "private-limited-company"
}

/** “ProfileRelaunch Ltd, trading as ProfileRelaunch” when the legal name is known. */
export function tradingAsLine(identity: LegalIdentity = legalIdentity) {
  if (!hasLegalValue(identity.legalName)) return identity.tradingName
  return `${identity.legalName}, trading as ${identity.tradingName}`
}

export function showsCompanyRegistration(identity: LegalIdentity = legalIdentity) {
  return isLimitedCompany(identity) && hasLegalValue(identity.registrationNumber)
}

export function registeredOfficeLines(identity: LegalIdentity = legalIdentity) {
  if (!hasLegalValue(identity.postalAddress)) return []
  return identity.postalAddress.split("\n").map(line => line.trim()).filter(Boolean)
}

export function registeredOfficeInline(identity: LegalIdentity = legalIdentity) {
  return registeredOfficeLines(identity).join(", ")
}

export type PublicLegalDisclosure = {
  operator: string
  tradingStatement: string
  companyNumber: string
  placeOfRegistration: string
  incorporated: string
  registeredOfficeLabel: string
  registeredOffice: string
  registeredOfficeInline: string
}

/** The disclosure every public surface must show, taken from the central identity. */
export function publicLegalDisclosure(identity: LegalIdentity = legalIdentity): PublicLegalDisclosure {
  if (!isLimitedCompany(identity)) {
    throw new Error("public legal disclosure requires the limited-company identity")
  }
  if (!hasLegalValue(identity.legalName) || !hasLegalValue(identity.registrationNumber) || !hasLegalValue(identity.placeOfRegistration) || !hasLegalValue(identity.postalAddress) || !hasLegalValue(identity.incorporatedOn)) {
    throw new Error("public legal identity is incomplete")
  }
  return {
    operator: tradingAsLine(identity),
    tradingStatement: `${identity.tradingName} is a trading name of ${identity.legalName}.`,
    companyNumber: `Company number ${identity.registrationNumber}.`,
    placeOfRegistration: `Registered in ${identity.placeOfRegistration}.`,
    incorporated: `Incorporated ${identity.incorporatedOn}.`,
    registeredOfficeLabel: "Registered office",
    registeredOffice: identity.postalAddress,
    registeredOfficeInline: registeredOfficeInline(identity),
  }
}

export const feeWording =
  "The level of support depends on the situation. Any proposed support and associated fees will be explained clearly before you decide how to proceed."
