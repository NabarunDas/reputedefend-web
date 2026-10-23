import { isUuid } from "../records/model"
import { catalogueOperations, quoteOperations, serviceCodes, taxBehaviours, type CatalogueOperation, type QuoteOperation } from "./model"

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  return next.length >= min && next.length <= max ? next : null
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function futureTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const at = Date.parse(value)
  if (!Number.isFinite(at) || at <= Date.now()) return null
  return value
}

export function catalogueArgs(operation: CatalogueOperation, body: Record<string, unknown>) {
  if (operation === "create_price_version") {
    const serviceCode = typeof body.serviceCode === "string" && serviceCodes.includes(body.serviceCode as typeof serviceCodes[number]) ? body.serviceCode : null
    const displayName = text(body.displayName, 1, 120)
    const amountMinor = integer(body.amountMinor)
    const effectiveFrom = futureTimestamp(body.effectiveFrom)
    const taxBehaviour = typeof body.taxBehaviour === "string" && taxBehaviours.includes(body.taxBehaviour as typeof taxBehaviours[number]) ? body.taxBehaviour : "UNCONFIRMED"
    if (!serviceCode || !displayName || amountMinor === null || !effectiveFrom) return null
    return { serviceCode, displayName, amountMinor, effectiveFrom, taxBehaviour, notes: text(body.notes, 0, 2000) || undefined }
  }
  if (!isUuid(body.priceVersionId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  return { priceVersionId: body.priceVersionId, version: body.version }
}

export function quoteArgs(operation: QuoteOperation, body: Record<string, unknown>) {
  if (operation === "record_qualification") {
    const serviceCode = typeof body.serviceCode === "string" && serviceCodes.includes(body.serviceCode as typeof serviceCodes[number]) ? body.serviceCode : null
    if (!serviceCode || !isUuid(body.priceVersionId)) return null
    const qualificationResult = body.qualificationResult === "QUALIFIED" ? "QUALIFIED" : "NOT_QUALIFIED"
    const coverageId = isUuid(body.coverageId) ? body.coverageId : (isUuid(body.futureCoverageId) ? body.futureCoverageId : undefined)
    if (qualificationResult === "QUALIFIED" && (!coverageId || !isUuid(body.locationId) || typeof body.issueObservedAt !== "string" || !body.issueObservedAt)) {
      return null
    }
    return {
      serviceCode,
      priceVersionId: body.priceVersionId,
      qualificationResult,
      coverageId,
      coverageBasis: typeof body.coverageBasis === "string" ? body.coverageBasis : undefined,
      coverageStatus: typeof body.coverageStatus === "string" ? body.coverageStatus : undefined,
      coverageType: typeof body.coverageType === "string" ? body.coverageType : undefined,
      paidVsIncluded: typeof body.paidVsIncluded === "string" ? body.paidVsIncluded : undefined,
      issuePredatesPaidCoverage: body.issuePredatesPaidCoverage === false || body.issuePredatesPaidCoverage === "false" ? "false" : "true",
      locationId: isUuid(body.locationId) ? body.locationId : undefined,
      issueObservedAt: typeof body.issueObservedAt === "string" ? body.issueObservedAt : undefined,
      reasonCode: text(body.reasonCode, 3, 80) || undefined,
      evidenceNotes: text(body.evidenceNotes, 0, 2000) || undefined,
    }
  }
  if (operation === "create_draft") {
    const serviceCode = typeof body.serviceCode === "string" && serviceCodes.includes(body.serviceCode as typeof serviceCodes[number]) ? body.serviceCode : null
    const scope = text(body.scope, 10, 5000)
    const exclusions = text(body.exclusions, 10, 5000)
    if (!serviceCode || !isUuid(body.customerId) || !isUuid(body.businessId) || !isUuid(body.priceVersionId) || !scope || !exclusions || typeof body.validUntil !== "string") return null
    return {
      serviceCode, customerId: body.customerId, businessId: body.businessId, priceVersionId: body.priceVersionId,
      caseId: isUuid(body.caseId) ? body.caseId : undefined,
      locationId: isUuid(body.locationId) ? body.locationId : undefined,
      monitoringRequestId: isUuid(body.monitoringRequestId) ? body.monitoringRequestId : undefined,
      scope, exclusions, validUntil: body.validUntil,
      applyDiscount: body.applyDiscount === true,
      qualificationId: isUuid(body.qualificationId) ? body.qualificationId : undefined,
      taxBehaviour: typeof body.taxBehaviour === "string" ? body.taxBehaviour : undefined,
    }
  }
  if (operation === "create_quote_acceptance_action") {
    if (!isUuid(body.quoteId) || typeof body.expiresAt !== "string") return null
    return { quoteId: body.quoteId, expiresAt: body.expiresAt }
  }
  if (operation === "queue_quote_offer_email") {
    if (!isUuid(body.quoteId)) return null
    const subject = body.subject == null || body.subject === "" ? undefined : text(body.subject, 10, 200)
    const introduction = body.introduction == null || body.introduction === "" ? undefined : text(body.introduction, 20, 4000)
    if (body.subject != null && body.subject !== "" && !subject) return null
    if (body.introduction != null && body.introduction !== "" && !introduction) return null
    return { quoteId: body.quoteId, subject, introduction }
  }
  if (operation === "revoke_action") {
    if (!isUuid(body.quoteId) || !isUuid(body.actionId) || !text(body.reason, 10, 2000)) return null
    return { quoteId: body.quoteId, actionId: body.actionId, reason: text(body.reason, 10, 2000) }
  }
  if (!isUuid(body.quoteId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  return {
    quoteId: body.quoteId,
    version: body.version,
    quoteVersionId: isUuid(body.quoteVersionId) ? body.quoteVersionId : undefined,
    taxBehaviour: typeof body.taxBehaviour === "string" ? body.taxBehaviour : undefined,
    taxRateBps: integer(body.taxRateBps) ?? undefined,
    taxJurisdiction: text(body.taxJurisdiction, 2, 2) || undefined,
    taxCode: text(body.taxCode, 1, 40) || undefined,
    applyDiscount: body.applyDiscount === true,
    qualificationId: isUuid(body.qualificationId) ? body.qualificationId : undefined,
    scope: text(body.scope, 10, 5000) || undefined,
    exclusions: text(body.exclusions, 10, 5000) || undefined,
    validUntil: typeof body.validUntil === "string" ? body.validUntil : undefined,
    serviceCode: typeof body.serviceCode === "string" ? body.serviceCode : undefined,
    priceVersionId: isUuid(body.priceVersionId) ? body.priceVersionId : undefined,
  }
}

export function isCatalogueOperation(value: string): value is CatalogueOperation {
  return catalogueOperations.includes(value as CatalogueOperation)
}

export function isQuoteOperation(value: string): value is QuoteOperation {
  return quoteOperations.includes(value as QuoteOperation)
}

/**
 * An approved inclusive percentage, with at most two decimal places, as basis points.
 * 20 is 2000. 20.5 is 2050. A missing or rounded value is not an approved rate.
 */
export function approvedInclusiveRateBps(value: unknown): number | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ""] = text.split(".")
  const bps = Number(whole) * 100 + Number((fraction + "00").slice(0, 2))
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) return null
  return bps
}

/** A specific tax-entry problem, before the quote command runs. */
export function quoteTaxIssue(operation: string, body: Record<string, unknown>): string | null {
  if (operation !== "set_draft_tax") return null
  const behaviour = typeof body.taxBehaviour === "string" ? body.taxBehaviour : ""
  if (behaviour === "EXCLUSIVE") return "A published quotation cannot add tax on top of the customer price."
  if (behaviour === "INCLUSIVE" && integer(body.taxRateBps) === null) {
    return "Enter the approved tax percentage before saving. The customer total stays the advertised price."
  }
  if (behaviour === "NOT_APPLICABLE" && (body.taxRateBps != null || body.taxJurisdiction != null || body.taxCode != null)) {
    return "VAT not charged does not take a tax rate, jurisdiction, or tax code."
  }
  return null
}
