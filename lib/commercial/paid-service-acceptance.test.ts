import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { paymentsEnabled, resolvePaymentProviderMode } from "@/lib/payments/config"
import { GUARD_RECURRING_CONSENT_TEXT, GUARD_RECURRING_CONSENT_VERSION, SUCCESS_FEE_CONSENT_TEXT, SUCCESS_FEE_CONSENT_VERSION } from "@/lib/payments/model"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreement, paidServiceAgreementBody, paidServiceAgreementContentHash } from "./paid-service-agreement"
import {
  MANAGED_CONTINGENT_FEE_KIND,
  MANAGED_CONTINGENT_FEE_TEXT,
  PAID_SERVICE_ACCEPTANCE_HASH,
  SOLICITOR_CONFIRMATION_STATEMENT,
  acceptanceFingerprint,
  assessPaidServiceAcceptance,
  com13aLiveEffects,
  paymentDistinction,
  snapshotDownloadAllowed,
  solicitorConfirmationMatches,
  solicitorConfirmationStatement,
  type AcceptanceAssessmentInput,
} from "./paid-service-acceptance"

const customer = "customer-1"
const other = "customer-2"
const quote = "quote-version-1"
const location = "location-1"

function input(overrides: Partial<AcceptanceAssessmentInput> = {}): AcceptanceAssessmentInput {
  const base: AcceptanceAssessmentInput = {
    sessionCustomerId: customer,
    membershipVerified: true,
    actionOpen: true,
    caseCustomerId: customer,
    quoteCustomerId: customer,
    quoteVersionId: quote,
    submittedQuoteVersionId: quote,
    submittedQuoteCustomerId: customer,
    currentQuoteVersionId: quote,
    quoteStatus: "OFFERED",
    quoteOpen: true,
    taxBehaviour: "NOT_APPLICABLE",
    serviceCode: "GUIDED_RELAUNCH",
    paymentModel: "UPFRONT",
    locationId: location,
    amountMinor: 9900,
    catalogueOperative: true,
    catalogueVersion: PAID_SERVICE_AGREEMENT_VERSION,
    catalogueHash: paidServiceAgreementContentHash,
    businessPurposeAccepted: true,
    termsAccepted: true,
    termsVersion: PAID_SERVICE_AGREEMENT_VERSION,
    termsHash: paidServiceAgreementContentHash,
    feeBasis: null,
    existingAcceptanceId: null,
    idempotencyKey: "request-1",
    existingIdempotencyKey: null,
    existingFingerprint: null,
    fingerprint: "fingerprint-1",
  }
  return { ...base, ...overrides }
}

describe("paid-service acceptance rules", () => {
  it("keeps PS-2026-10-14.2 unapproved until this exact hash is confirmed", () => {
    expect(PAID_SERVICE_AGREEMENT_VERSION).toBe("PS-2026-10-14.2")
    expect(PAID_SERVICE_ACCEPTANCE_HASH).toBe("0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4")
    expect(paidServiceAgreement.operative).toBe(false)
    expect(paidServiceAgreement.solicitorReviewComplete).toBe(false)
    expect(paidServiceAgreement.acceptanceActionable).toBe(false)
    expect(solicitorConfirmationMatches({
      version: "PS-2026-10-14.2",
      hash: paidServiceAgreementContentHash,
      statement: SOLICITOR_CONFIRMATION_STATEMENT,
    })).toBe(true)
    expect(solicitorConfirmationMatches({
      version: "PS-2026-10-14.1",
      hash: paidServiceAgreementContentHash,
      statement: solicitorConfirmationStatement("PS-2026-10-14.1", paidServiceAgreementContentHash),
    })).toBe(false)
    expect(solicitorConfirmationMatches({
      version: "PS-2026-10-14.2",
      hash: "bb1c1ae87d3884e92e02dc0db963a7d9dd71a2b828e9936de3c14996fcbe23b5",
      statement: solicitorConfirmationStatement("PS-2026-10-14.2", "bb1c1ae87d3884e92e02dc0db963a7d9dd71a2b828e9936de3c14996fcbe23b5"),
    })).toBe(false)
  })

  it("refuses an unauthorised, unverified or cross-customer attempt before the contract is considered", () => {
    expect(assessPaidServiceAcceptance(input({ sessionCustomerId: null })).status).toBe("unauthorised")
    expect(assessPaidServiceAcceptance(input({ actionOpen: false })).status).toBe("unauthorised")
    expect(assessPaidServiceAcceptance(input({ membershipVerified: false })).status).toBe("membership_unverified")
    expect(assessPaidServiceAcceptance(input({ quoteCustomerId: other })).status).toBe("cross_customer")
    expect(assessPaidServiceAcceptance(input({ caseCustomerId: other })).status).toBe("cross_customer")
    expect(assessPaidServiceAcceptance(input({
      submittedQuoteVersionId: "quote-version-2",
      submittedQuoteCustomerId: other,
    })).status).toBe("cross_customer")
  })

  it("refuses a stale contract, a changed quotation, unconfirmed tax and a missing acknowledgement", () => {
    expect(assessPaidServiceAcceptance(input({ catalogueOperative: false })).status).toBe("not_operative")
    expect(assessPaidServiceAcceptance(input({ catalogueVersion: "PS-2026-10-14.1" })).status).toBe("stale_version")
    expect(assessPaidServiceAcceptance(input({ termsHash: "ab".repeat(32) })).status).toBe("stale_version")
    expect(assessPaidServiceAcceptance(input({ currentQuoteVersionId: "quote-version-2" })).status).toBe("stale_quotation")
    expect(assessPaidServiceAcceptance(input({ quoteStatus: "SUPERSEDED" })).status).toBe("stale_quotation")
    expect(assessPaidServiceAcceptance(input({ submittedQuoteVersionId: "quote-version-2", submittedQuoteCustomerId: customer })).status).toBe("stale_quotation")
    expect(assessPaidServiceAcceptance(input({ taxBehaviour: "UNCONFIRMED" })).status).toBe("tax_unconfirmed")
    expect(assessPaidServiceAcceptance(input({ businessPurposeAccepted: false })).status).toBe("missing_business_purpose")
    expect(assessPaidServiceAcceptance(input({ termsAccepted: false })).status).toBe("missing_terms")
  })

  it("asks Guided for no fee consent, Managed for the contingent fee, and Guard for recurring consent", () => {
    expect(assessPaidServiceAcceptance(input()).status).toBe("success")
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "GUIDED_REVIEW",
      amountMinor: 5900,
      feeBasis: { accepted: true, kind: MANAGED_CONTINGENT_FEE_KIND },
    })).status).toBe("irrelevant_consent")
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      amountMinor: 29900,
      feeBasis: null,
    })).status).toBe("missing_fee_basis")
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "MANAGED_REVIEW",
      paymentModel: "SUCCESS_FEE",
      amountMinor: 14900,
      feeBasis: { accepted: true, kind: SUCCESS_FEE_CONSENT_VERSION },
    })).status).toBe("legacy_off_session_consent")
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      amountMinor: 29900,
      feeBasis: { accepted: true, kind: GUARD_RECURRING_CONSENT_VERSION, locationId: location, amountMinor: 29900 },
    })).status).toBe("wrong_fee_basis")
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      amountMinor: 29900,
      feeBasis: { accepted: true, kind: MANAGED_CONTINGENT_FEE_KIND },
    }))).toMatchObject({ status: "success", feeBasisKind: MANAGED_CONTINGENT_FEE_KIND })
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "RELAUNCH_GUARD",
      paymentModel: "RECURRING_MONTHLY",
      caseCustomerId: null,
      amountMinor: 999,
      feeBasis: { accepted: true, kind: GUARD_RECURRING_CONSENT_VERSION, locationId: "other-location", amountMinor: 999 },
    })).status).toBe("stale_quotation")
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "RELAUNCH_GUARD",
      paymentModel: "RECURRING_MONTHLY",
      caseCustomerId: null,
      amountMinor: 999,
      feeBasis: { accepted: true, kind: GUARD_RECURRING_CONSENT_VERSION, locationId: location, amountMinor: 999 },
    })).status).toBe("success")
    expect(SUCCESS_FEE_CONSENT_TEXT).toContain("off-session")
    expect(MANAGED_CONTINGENT_FEE_TEXT).not.toContain("off-session")
    expect(GUARD_RECURRING_CONSENT_TEXT).toContain("this exact location")
  })

  it("distinguishes upfront refunds, success-fee invoices and recurring consent", () => {
    expect(paymentDistinction("GUIDED_RELAUNCH")).toEqual({
      collectsUpfront: true,
      invoicesAfterSuccess: false,
      automaticCardCharge: false,
      recurringConsent: false,
      refundBeforeSubstantiveWork: "full",
    })
    expect(paymentDistinction("GUIDED_REVIEW").refundBeforeSubstantiveWork).toBe("full")
    expect(assessPaidServiceAcceptance(input()).payment).toEqual(paymentDistinction("GUIDED_RELAUNCH"))
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      feeBasis: { accepted: true, kind: MANAGED_CONTINGENT_FEE_KIND },
    })).payment).toEqual({
      collectsUpfront: false,
      invoicesAfterSuccess: true,
      automaticCardCharge: false,
      recurringConsent: false,
      refundBeforeSubstantiveWork: "not_applicable",
    })
    expect(assessPaidServiceAcceptance(input({
      serviceCode: "RELAUNCH_GUARD",
      paymentModel: "RECURRING_MONTHLY",
      caseCustomerId: null,
      amountMinor: 999,
      feeBasis: { accepted: true, kind: GUARD_RECURRING_CONSENT_VERSION, locationId: location, amountMinor: 999 },
    })).payment).toEqual({
      collectsUpfront: false,
      invoicesAfterSuccess: false,
      automaticCardCharge: false,
      recurringConsent: true,
      refundBeforeSubstantiveWork: "not_applicable",
    })
  })

  it("replays the same submission and refuses a second obligation or a changed payload", () => {
    const fingerprint = acceptanceFingerprint({
      quoteVersionId: quote,
      businessPurposeAccepted: true,
      termsVersion: PAID_SERVICE_AGREEMENT_VERSION,
      termsHash: paidServiceAgreementContentHash,
      feeBasis: null,
    })
    expect(assessPaidServiceAcceptance(input({
      existingAcceptanceId: "acceptance-1",
      existingIdempotencyKey: "request-1",
      existingFingerprint: fingerprint,
      fingerprint,
    })).status).toBe("replay")
    expect(assessPaidServiceAcceptance(input({
      existingAcceptanceId: "acceptance-1",
      existingIdempotencyKey: "request-1",
      existingFingerprint: "other",
      fingerprint,
    })).status).toBe("conflict")
    expect(assessPaidServiceAcceptance(input({
      existingAcceptanceId: "acceptance-1",
      existingIdempotencyKey: "request-2",
      idempotencyKey: "request-3",
      existingFingerprint: fingerprint,
      fingerprint,
    })).status).toBe("already_accepted")
    expect(assessPaidServiceAcceptance(input({
      actionOpen: false,
      existingAcceptanceId: "acceptance-1",
      existingIdempotencyKey: "request-1",
      existingFingerprint: fingerprint,
      fingerprint,
    })).status).toBe("replay")
  })

  it("lets only the accepting customer download the stored snapshot", () => {
    expect(snapshotDownloadAllowed({ sessionCustomerId: customer, acceptanceCustomerId: customer })).toBe(true)
    expect(snapshotDownloadAllowed({ sessionCustomerId: other, acceptanceCustomerId: customer })).toBe(false)
    expect(snapshotDownloadAllowed({ sessionCustomerId: null, acceptanceCustomerId: customer })).toBe(false)
  })

  it("keeps the frozen body in the additive migration and leaves live gates closed", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261014234000_paid_service_acceptance_v1.sql", import.meta.url), "utf8")
    const body = sql.split("$psabody$")[1]
    expect(body).toBe(paidServiceAgreementBody)
    expect(sql).toContain(paidServiceAgreementContentHash)
    expect(sql).toContain("'SOLICITOR_REVIEW'")
    expect(sql).toContain("operative")
    expect(sql).not.toMatch(/update\s+public\.(quote_acceptances|authorization_records|agreement_versions)/i)
    expect(sql).toContain("legacy_off_session_consent")
    expect(sql).toContain("SUCCESS_FEE_CONSENT_V1")
    expect(sql).not.toContain(SUCCESS_FEE_CONSENT_TEXT)
    expect(sql).toContain(MANAGED_CONTINGENT_FEE_TEXT)
    expect(sql).toContain(GUARD_RECURRING_CONSENT_TEXT)
    expect(sql).toContain("tax_behaviour = 'UNCONFIRMED'")
    expect(sql).toContain("Do not apply this file to DEV or Production")
    const gate = readFileSync(new URL("../../supabase/migrations/20261015013000_paid_service_acceptance_gate_v1.sql", import.meta.url), "utf8")
    expect(gate).toContain("Do not apply this file to DEV or Production")
    expect(gate).toContain("consent_required")
    expect(gate).toContain("admin_confirm_paid_service_agreement_v1")
    expect(gate).toContain("RETURN jsonb_build_object('status', 'unauthorised');")
    expect(gate).toContain("quotation_snapshot")
    expect(gate).toContain("paid_service_quote_disclosure_v1")
    expect(gate).toContain("commercialAgreementBody")
    expect(gate).not.toMatch(/^update\s+public\.(quote_acceptances|authorization_records|agreement_versions)\b/im)
    expect(gate).not.toContain("stripe_live")
    expect(com13aLiveEffects).toEqual({
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
    })
    expect(resolvePaymentProviderMode({})).toBe("disabled")
    expect(paymentsEnabled({})).toBe(false)
    const portal = readFileSync(new URL("../../apps/customer/lib/portal/config.ts", import.meta.url), "utf8")
    expect(portal).toContain('process.env.CUSTOMER_PORTAL_ENABLED === "true"')
  })
})
