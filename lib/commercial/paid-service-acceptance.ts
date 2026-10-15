/**
 * COM-13A acceptance rules for the frozen paid-service agreement.
 *
 * The catalogue copy in the database starts unapproved. A caller-supplied
 * actor and the predictable solicitor statement are not approval. The
 * privileged database procedure records an authenticated operator and an
 * external evidence reference, and this module does not mark the agreement
 * operative. A report that an earlier draft was reviewed does not do that.
 * These rules describe the server decision; the migration enforces them.
 */
import { createHash } from "node:crypto"
import {
  PAID_SERVICE_AGREEMENT_VERSION,
  paidServiceAgreementBody,
  paidServiceAgreementContentHash,
} from "@/lib/commercial/paid-service-agreement"
import { GUARD_RECURRING_CONSENT_VERSION, SUCCESS_FEE_CONSENT_VERSION } from "@/lib/payments/model"

export const PAID_SERVICE_ACCEPTANCE_VERSION = PAID_SERVICE_AGREEMENT_VERSION
export const PAID_SERVICE_ACCEPTANCE_HASH = paidServiceAgreementContentHash

export const MANAGED_CONTINGENT_FEE_KIND = "MANAGED_CONTINGENT_SUCCESS_FEE_V1" as const
export const MANAGED_CONTINGENT_FEE_TEXT =
  "I acknowledge that the Managed success fee is payable only after documented success, within 14 calendar days of the invoice. No card is charged automatically and the fee is not collected before that documented success."

export const solicitorConfirmationStatement = (version = PAID_SERVICE_AGREEMENT_VERSION, hash = paidServiceAgreementContentHash) =>
  `Solicitor reviewed paid-service agreement ${version} with SHA-256 ${hash}.`

export const SOLICITOR_CONFIRMATION_STATEMENT = solicitorConfirmationStatement()

export const com13aLiveEffects = {
  stripeLiveMode: false,
  checkout: false,
  customerPortal: false,
  guardActivation: false,
  mailAutomation: false,
  migrationAppliedToDev: false,
  migrationAppliedToProduction: false,
  awsChange: false,
  vercelChange: false,
  historicalAcceptanceRewrite: false,
} as const

const GUIDED = new Set(["GUIDED_RELAUNCH", "GUIDED_REVIEW"])
const MANAGED = new Set(["MANAGED_RELAUNCH", "MANAGED_REVIEW"])

export type ServiceCode = "GUIDED_RELAUNCH" | "GUIDED_REVIEW" | "MANAGED_RELAUNCH" | "MANAGED_REVIEW" | "RELAUNCH_GUARD"
export type PaymentModel = "UPFRONT" | "SUCCESS_FEE" | "RECURRING_MONTHLY"

export type PaymentDistinction = {
  collectsUpfront: boolean
  invoicesAfterSuccess: boolean
  automaticCardCharge: false
  recurringConsent: boolean
  refundBeforeSubstantiveWork: "full" | "not_applicable"
}

export function paymentDistinction(serviceCode: ServiceCode): PaymentDistinction {
  if (GUIDED.has(serviceCode)) {
    return {
      collectsUpfront: true,
      invoicesAfterSuccess: false,
      automaticCardCharge: false,
      recurringConsent: false,
      refundBeforeSubstantiveWork: "full",
    }
  }
  if (MANAGED.has(serviceCode)) {
    return {
      collectsUpfront: false,
      invoicesAfterSuccess: true,
      automaticCardCharge: false,
      recurringConsent: false,
      refundBeforeSubstantiveWork: "not_applicable",
    }
  }
  return {
    collectsUpfront: false,
    invoicesAfterSuccess: false,
    automaticCardCharge: false,
    recurringConsent: true,
    refundBeforeSubstantiveWork: "not_applicable",
  }
}

export type FeeBasis = {
  accepted?: unknown
  kind?: unknown
  locationId?: unknown
  amountMinor?: unknown
} | null

export type AcceptanceAssessmentInput = {
  sessionCustomerId: string | null
  membershipVerified: boolean
  actionOpen: boolean
  caseCustomerId: string | null
  quoteCustomerId: string
  quoteVersionId: string
  submittedQuoteVersionId: string
  submittedQuoteCustomerId: string | null
  currentQuoteVersionId: string
  quoteStatus: string
  quoteOpen: boolean
  taxBehaviour: string
  serviceCode: ServiceCode
  paymentModel: PaymentModel
  locationId: string
  amountMinor: number
  catalogueOperative: boolean
  catalogueVersion: string
  catalogueHash: string
  businessPurposeAccepted: boolean
  termsAccepted: boolean
  termsVersion: string | null
  termsHash: string | null
  feeBasis: FeeBasis
  existingAcceptanceId: string | null
  idempotencyKey: string
  existingIdempotencyKey: string | null
  existingFingerprint: string | null
  fingerprint: string
}

export type AcceptanceStatus =
  | "success"
  | "replay"
  | "already_accepted"
  | "conflict"
  | "unauthorised"
  | "membership_unverified"
  | "cross_customer"
  | "not_operative"
  | "stale_version"
  | "stale_quotation"
  | "tax_unconfirmed"
  | "missing_business_purpose"
  | "missing_terms"
  | "missing_fee_basis"
  | "irrelevant_consent"
  | "legacy_off_session_consent"
  | "wrong_fee_basis"

export function acceptanceFingerprint(input: {
  quoteVersionId: string
  businessPurposeAccepted: boolean
  termsVersion: string | null
  termsHash: string | null
  feeBasis: FeeBasis
}) {
  return createHash("sha256").update(JSON.stringify({
    quoteVersionId: input.quoteVersionId,
    businessPurposeAccepted: input.businessPurposeAccepted,
    termsVersion: input.termsVersion,
    termsHash: input.termsHash,
    feeBasis: input.feeBasis,
  }), "utf8").digest("hex")
}

function feeKind(feeBasis: FeeBasis) {
  return typeof feeBasis?.kind === "string" ? feeBasis.kind : null
}

export function assessPaidServiceAcceptance(input: AcceptanceAssessmentInput): {
  status: AcceptanceStatus
  feeBasisKind: string | null
  payment: PaymentDistinction | null
} {
  if (!input.sessionCustomerId) return { status: "unauthorised", feeBasisKind: null, payment: null }
  if (!input.membershipVerified) return { status: "membership_unverified", feeBasisKind: null, payment: null }
  if (
    input.quoteCustomerId !== input.sessionCustomerId
    || (input.caseCustomerId !== null && input.caseCustomerId !== input.sessionCustomerId)
  ) {
    return { status: "cross_customer", feeBasisKind: null, payment: null }
  }
  if (input.submittedQuoteVersionId !== input.quoteVersionId) {
    if (input.submittedQuoteCustomerId !== null && input.submittedQuoteCustomerId !== input.sessionCustomerId) {
      return { status: "cross_customer", feeBasisKind: null, payment: null }
    }
    return { status: "stale_quotation", feeBasisKind: null, payment: null }
  }
  if (input.existingAcceptanceId) {
    if (input.existingIdempotencyKey === input.idempotencyKey && input.existingFingerprint === input.fingerprint) {
      return { status: "replay", feeBasisKind: feeKind(input.feeBasis), payment: paymentDistinction(input.serviceCode) }
    }
    if (input.existingIdempotencyKey === input.idempotencyKey) {
      return { status: "conflict", feeBasisKind: null, payment: null }
    }
    return { status: "already_accepted", feeBasisKind: feeKind(input.feeBasis), payment: paymentDistinction(input.serviceCode) }
  }
  if (!input.actionOpen) return { status: "unauthorised", feeBasisKind: null, payment: null }
  if (!input.catalogueOperative) return { status: "not_operative", feeBasisKind: null, payment: null }
  if (input.catalogueVersion !== PAID_SERVICE_AGREEMENT_VERSION || input.catalogueHash !== paidServiceAgreementContentHash) {
    return { status: "stale_version", feeBasisKind: null, payment: null }
  }
  if (!input.quoteOpen || input.quoteStatus !== "OFFERED" || input.currentQuoteVersionId !== input.quoteVersionId) {
    return { status: "stale_quotation", feeBasisKind: null, payment: null }
  }
  if (input.taxBehaviour === "UNCONFIRMED") return { status: "tax_unconfirmed", feeBasisKind: null, payment: null }
  if (!input.businessPurposeAccepted) return { status: "missing_business_purpose", feeBasisKind: null, payment: null }
  if (!input.termsAccepted) return { status: "missing_terms", feeBasisKind: null, payment: null }
  if (input.termsVersion !== PAID_SERVICE_AGREEMENT_VERSION || input.termsHash !== paidServiceAgreementContentHash) {
    return { status: "stale_version", feeBasisKind: null, payment: null }
  }

  const kind = feeKind(input.feeBasis)
  if (GUIDED.has(input.serviceCode)) {
    if (input.paymentModel !== "UPFRONT") return { status: "stale_quotation", feeBasisKind: null, payment: null }
    if (input.feeBasis !== null) return { status: "irrelevant_consent", feeBasisKind: kind, payment: null }
  } else if (MANAGED.has(input.serviceCode)) {
    if (input.paymentModel !== "SUCCESS_FEE") return { status: "stale_quotation", feeBasisKind: null, payment: null }
    if (input.feeBasis === null || input.feeBasis.accepted !== true) return { status: "missing_fee_basis", feeBasisKind: null, payment: null }
    if (kind === SUCCESS_FEE_CONSENT_VERSION) return { status: "legacy_off_session_consent", feeBasisKind: kind, payment: null }
    if (kind !== MANAGED_CONTINGENT_FEE_KIND) return { status: "wrong_fee_basis", feeBasisKind: kind, payment: null }
  } else {
    if (input.paymentModel !== "RECURRING_MONTHLY") return { status: "stale_quotation", feeBasisKind: null, payment: null }
    if (input.feeBasis === null || input.feeBasis.accepted !== true) return { status: "missing_fee_basis", feeBasisKind: null, payment: null }
    if (kind === SUCCESS_FEE_CONSENT_VERSION) return { status: "legacy_off_session_consent", feeBasisKind: kind, payment: null }
    if (kind !== GUARD_RECURRING_CONSENT_VERSION) return { status: "wrong_fee_basis", feeBasisKind: kind, payment: null }
    if (input.feeBasis.locationId !== input.locationId || input.feeBasis.amountMinor !== input.amountMinor) {
      return { status: "stale_quotation", feeBasisKind: kind, payment: null }
    }
  }

  return { status: "success", feeBasisKind: kind, payment: paymentDistinction(input.serviceCode) }
}

export function solicitorConfirmationMatches(input: { version: string; hash: string; statement: string }) {
  return input.version === PAID_SERVICE_AGREEMENT_VERSION
    && input.hash === paidServiceAgreementContentHash
    && input.statement === SOLICITOR_CONFIRMATION_STATEMENT
    && input.statement === solicitorConfirmationStatement(input.version, input.hash)
}

export function snapshotDownloadAllowed(input: { sessionCustomerId: string | null; acceptanceCustomerId: string }) {
  return input.sessionCustomerId !== null && input.sessionCustomerId === input.acceptanceCustomerId
}

export { paidServiceAgreementBody, GUARD_RECURRING_CONSENT_VERSION, SUCCESS_FEE_CONSENT_VERSION }
