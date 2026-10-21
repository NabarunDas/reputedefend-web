/**
 * Staff record of the legal purchaser for a binding quote.
 *
 * This uses the existing establishment command. A self-declared note stays
 * PENDING. VERIFIED requires the staff member to confirm a real check.
 * Companies House is one optional source for a limited company, not a
 * requirement for every customer. The Google listing country is not an input.
 */

const purchaserTypes = ["LIMITED_COMPANY", "SOLE_TRADER", "INDIVIDUAL", "OTHER"] as const
export type PurchaserType = (typeof purchaserTypes)[number]

export const purchaserTypeChoices: { id: PurchaserType; label: string; sentence: string }[] = [
  { id: "LIMITED_COMPANY", label: "UK limited company", sentence: "Purchaser is a UK limited company" },
  { id: "SOLE_TRADER", label: "Sole trader", sentence: "Purchaser is a sole trader" },
  { id: "INDIVIDUAL", label: "Individual", sentence: "Purchaser is an individual" },
  { id: "OTHER", label: "Other permitted purchaser", sentence: "Purchaser is another permitted customer" },
]

const evidenceByType: Record<PurchaserType, readonly string[]> = {
  LIMITED_COMPANY: ["COMPANIES_HOUSE", "REGISTRY_EXTRACT", "OTHER"],
  SOLE_TRADER: ["OTHER", "ACCOUNTANT_CONFIRMED"],
  INDIVIDUAL: ["OTHER", "ACCOUNTANT_CONFIRMED"],
  OTHER: ["OTHER", "REGISTRY_EXTRACT", "ACCOUNTANT_CONFIRMED"],
}

export const evidenceTypeLabels: Record<string, string> = {
  COMPANIES_HOUSE: "Companies House record, if you already checked one",
  REGISTRY_EXTRACT: "Registry extract",
  ACCOUNTANT_CONFIRMED: "Accountant confirmation",
  OTHER: "Other evidence you checked",
}

const outcomes = ["pending", "verified", "rejected"] as const
export type PurchaserOutcome = (typeof outcomes)[number]

const allowedKeys = [
  "businessId",
  "purchaserType",
  "countryCode",
  "subdivisionCode",
  "legalName",
  "evidenceType",
  "evidenceReference",
  "registrationId",
  "taxId",
  "outcome",
  "confirmed",
] as const

export type PurchaserPayload = {
  businessId: string
  countryCode: string
  subdivisionCode?: string
  legalName: string
  evidenceType: string
  evidenceReference: string
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED"
  registrationId?: string
  taxId?: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isPurchaserType(value: unknown): value is PurchaserType {
  return typeof value === "string" && (purchaserTypes as readonly string[]).includes(value)
}

function choice(type: PurchaserType) {
  return purchaserTypeChoices.find(item => item.id === type)!
}

function rejectedEvidence(evidence: string, country: string): boolean {
  const text = evidence.trim()
  const lower = text.toLowerCase()
  return text === country
    || ["zero", "not vat registered", "not vat-registered", "worldwide zero-rated", "worldwide zero rated"].includes(lower)
    || lower.includes("worldwide zero")
    || lower.includes("dev synthetic")
    || lower.includes("synthetic-purchasing-establishment")
}

function optionalId(value: unknown, label: string): { ok: true; value?: string } | { ok: false; message: string } {
  if (value === undefined || value === null || value === "") return { ok: true }
  if (typeof value !== "string") return { ok: false, message: `Check the ${label} and try again.` }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true }
  if (trimmed.length > 64 || /[\r\n]/.test(trimmed)) {
    return { ok: false, message: `Check the ${label} and try again.` }
  }
  return { ok: true, value: trimmed }
}

/** Map a staff form onto the existing establishment command, or say what is missing. */
export function buildPurchaserRecord(raw: unknown): { ok: true; payload: PurchaserPayload } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Check the purchaser details and try again." }
  }
  const body = raw as Record<string, unknown>
  const keys = Object.keys(body)
  if (keys.some(key => !(allowedKeys as readonly string[]).includes(key))) {
    return { ok: false, message: "Check the purchaser details and try again." }
  }
  if (typeof body.businessId !== "string" || !uuidPattern.test(body.businessId)) {
    return { ok: false, message: "Open this record from the case again before saving." }
  }
  if (!isPurchaserType(body.purchaserType)) {
    return { ok: false, message: "Choose whether the purchaser is a limited company, a sole trader, an individual, or another permitted customer." }
  }
  const purchaserType = body.purchaserType
  const country = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : ""
  if (!/^[A-Z]{2}$/.test(country) || country === "UK" || country === "EU" || country === "XX") {
    return { ok: false, message: "Choose the purchasing country. The Google listing country is not that country." }
  }
  const subdivisionRaw = body.subdivisionCode
  let subdivision: string | undefined
  if (subdivisionRaw !== undefined && subdivisionRaw !== null && subdivisionRaw !== "") {
    if (typeof subdivisionRaw !== "string") return { ok: false, message: "Check the state or province and try again." }
    subdivision = subdivisionRaw.trim().toUpperCase()
    if (!/^[A-Z0-9]{1,6}$/.test(subdivision)) return { ok: false, message: "Check the state or province and try again." }
  }
  if (typeof body.legalName !== "string" || body.legalName.trim().length < 2 || body.legalName.trim().length > 200) {
    return { ok: false, message: "Enter the legal purchasing name. The business record name can be used when it is that name." }
  }
  if (typeof body.evidenceType !== "string" || !evidenceByType[purchaserType].includes(body.evidenceType)) {
    return purchaserType === "SOLE_TRADER" || purchaserType === "INDIVIDUAL"
      ? { ok: false, message: "Companies House is not required for this purchaser. Record the evidence you actually checked." }
      : { ok: false, message: "Choose the evidence you actually checked. Companies House is optional." }
  }
  if (typeof body.evidenceReference !== "string") {
    return { ok: false, message: "Describe the evidence you checked, in at least 20 characters." }
  }
  const staffEvidence = body.evidenceReference.trim()
  if (staffEvidence.length < 20 || staffEvidence.length > 450) {
    return { ok: false, message: "Describe the evidence you checked, in 20 to 450 characters." }
  }
  if (rejectedEvidence(staffEvidence, country)) {
    return { ok: false, message: "Describe the check you made. A synthetic test label, a country code alone, or a tax slogan is not evidence." }
  }
  if (typeof body.outcome !== "string" || !(outcomes as readonly string[]).includes(body.outcome)) {
    return { ok: false, message: "Choose whether this is not yet verified, verified from a real check, or not sufficient." }
  }
  const outcome = body.outcome as PurchaserOutcome
  if (outcome === "verified" && body.confirmed !== true) {
    return { ok: false, message: "Confirm that you checked the genuine purchasing establishment before marking it verified." }
  }
  if (outcome !== "verified" && body.confirmed === true) {
    return { ok: false, message: "A confirmation is only for a verified purchasing establishment." }
  }
  if (outcome === "verified" && (country === "US" || country === "CA") && !subdivision) {
    return { ok: false, message: "A United States or Canada establishment needs a state or province before it can be verified." }
  }
  const registration = optionalId(body.registrationId, "registration number")
  if (!registration.ok) return registration
  const tax = optionalId(body.taxId, "tax identifier")
  if (!tax.ok) return tax
  const evidenceReference = `${choice(purchaserType).sentence}. ${staffEvidence}`
  if (evidenceReference.length > 500) {
    return { ok: false, message: "Shorten the evidence so the saved record stays within 500 characters." }
  }
  return {
    ok: true,
    payload: {
      businessId: body.businessId,
      countryCode: country,
      ...(subdivision ? { subdivisionCode: subdivision } : {}),
      legalName: body.legalName.trim(),
      evidenceType: body.evidenceType,
      evidenceReference,
      verificationStatus: outcome === "verified" ? "VERIFIED" : outcome === "rejected" ? "REJECTED" : "PENDING",
      ...(registration.value ? { registrationId: registration.value } : {}),
      ...(tax.value ? { taxId: tax.value } : {}),
    },
  }
}

export function purchaserSavedMessage(payload: PurchaserPayload): string {
  if (payload.verificationStatus === "PENDING") {
    return "Saved as not yet verified. The quote cannot be offered on this record until genuine purchasing-establishment evidence is verified."
  }
  if (payload.verificationStatus === "REJECTED") {
    return "Recorded as not sufficient. Offer stays closed until genuine purchasing-establishment evidence is verified."
  }
  if (payload.countryCode === "GB") {
    return "Verified UK purchasing establishment recorded. While ProfileRelaunch is not VAT-registered, set the internal tax record to Not applicable. The customer price stays the advertised total. The offer command still decides."
  }
  return "Purchasing establishment recorded for review. A country other than the United Kingdom does not by itself clear a binding quote."
}

export function establishmentFailureMessage(status: string | undefined, reason: unknown): string {
  if (status === "unauthorised") return "Your session has ended. Sign in again."
  if (status === "conflict" && reason === "conflicting_establishment") {
    return "A different verified purchasing establishment is already current. Review the business record before recording another."
  }
  if (status === "conflict") return "That record changed, or this request was already used for different details. Reload and try again."
  if (reason === "evidence_rejected") return "That evidence cannot be saved. Describe the check you made. Do not use a synthetic test label or a tax slogan."
  if (reason === "subdivision_required") return "A United States or Canada establishment needs a state or province before it can be verified."
  if (status === "invalid") return "Check the purchaser details and try again."
  return "The purchasing establishment could not be confirmed. Reload before trying again."
}
