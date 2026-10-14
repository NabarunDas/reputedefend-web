import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { guardFaqs, guardIncluded, guardIntervention } from "@/app/relaunch-guard/content"
import {
  checksPerDay,
  deliveryMethod,
  guardOffer,
  includedRecoveryDays,
  managedDiscountPercent,
  timezone,
} from "@/lib/guard-offer"
import { legalIdentity, registeredOfficeInline } from "@/lib/legal"
import { paymentsEnabled, resolvePaymentProviderMode } from "@/lib/payments/config"
import { SUCCESS_FEE_CONSENT_TEXT, SUCCESS_FEE_CONSENT_VERSION } from "@/lib/payments/model"
import { pricingGroups } from "@/lib/pricing"
import {
  PAID_SERVICE_AGREEMENT_VERSION,
  catalogueAmounts,
  collectionOfDisputedAmount,
  com12aLiveEffects,
  guidedRefund,
  paidServiceAgreement,
  paidServiceAgreementBody,
  paidServiceAgreementContentHash,
  presentmentReady,
  profileRecoveryVerdict,
  quoteAcceptanceBlockedByTax,
  reviewRemovalVerdict,
  solicitorReviewOpen,
  successFeeObligation,
  verificationWindowSatisfied,
  type ProfileRecoveryInput,
  type ReviewRemovalInput,
} from "./paid-service-agreement"

const draft = readFileSync(new URL("../../docs/commercial/paid-service-agreement-draft.md", import.meta.url), "utf8")
const spec = readFileSync(new URL("../../docs/commercial/com-13a-acceptance-specification.md", import.meta.url), "utf8")
const catalogueSql = readFileSync(new URL("../../supabase/migrations/20260929233953_catalogue_quotes_orders_v1.sql", import.meta.url), "utf8")
const portalSql = readFileSync(new URL("../../supabase/migrations/20261003204538_customer_portal_quotes_agreements_permissions_v1.sql", import.meta.url), "utf8")
const portalConfig = readFileSync(new URL("../../apps/customer/lib/portal/config.ts", import.meta.url), "utf8")

const first = "2026-10-01T09:00:00.000Z"
const exactly48h = "2026-10-03T09:00:00.000Z"
const shortByOneMinute = "2026-10-03T08:59:00.000Z"

const recoveryBase: ProfileRecoveryInput = {
  profileIdentified: true,
  incidentIdentified: true,
  baselineRestrictionRecorded: true,
  initial: "restored",
  later: "restored",
  firstCheckedAt: first,
  secondCheckedAt: exactly48h,
  originalRestrictionReturned: false,
  whollyUnrelated: false,
}

const reviewBase: ReviewRemovalInput = {
  reviewIdentified: true,
  baselineRecorded: true,
  initial: "absent",
  later: "absent",
  firstCheckedAt: first,
  secondCheckedAt: exactly48h,
  sameReviewReturned: false,
  differentNewReview: false,
  whollyUnrelated: false,
}

describe("paid-service agreement draft", () => {
  it("keeps version PS-2026-10-14.2 under solicitor review and off the customer path", () => {
    expect(paidServiceAgreement.version).toBe("PS-2026-10-14.2")
    expect(PAID_SERVICE_AGREEMENT_VERSION).toBe("PS-2026-10-14.2")
    expect(paidServiceAgreement.status).toBe("SOLICITOR_REVIEW")
    expect(paidServiceAgreement.operative).toBe(false)
    expect(paidServiceAgreement.customerVisible).toBe(false)
    expect(paidServiceAgreement.acceptanceActionable).toBe(false)
    expect(paidServiceAgreement.solicitorReviewComplete).toBe(false)
    expect(paidServiceAgreement.retainedTaxBehaviour).toBe("UNCONFIRMED")
    expect(paidServiceAgreement.vatRegistered).toBe(false)
    expect(paidServiceAgreement.vatNumber).toBeNull()
    expect(paidServiceAgreement.liabilityCap.solicitorApproval).toBe(false)
    expect(paidServiceAgreement.governingLaw.solicitorApproval).toBe(false)
    expect(paidServiceAgreement.governingLaw.proposed).toBe("England and Wales")
    expect(solicitorReviewOpen).toEqual([
      "the whole of this version",
      "whether the liability cap is reasonable",
      "consumer misclassification",
      "international customers and jurisdiction",
      "professional indemnity",
      "privacy and data-processing terms",
    ])
    expect(draft).toContain(paidServiceAgreementBody)
    expect(draft).toContain("SOLICITOR REVIEW REQUIRED")
    expect(draft).toContain("Operative: false")
    expect(draft).toContain("PS-2026-10-14.1")
    expect(draft).toContain("UNCONFIRMED")
    expect(draft).toContain("NOT_APPLICABLE")
    expect(paidServiceAgreementBody).toContain("greater of £1,000 or twice the fee")
    expect(paidServiceAgreementBody).toContain("not a statement that a supply is zero-rated or exempt")
    expect(paidServiceAgreementBody).not.toMatch(/GB\d{9}|VAT number/)
    expect(paidServiceAgreementBody).not.toMatch(/SOLICITOR_REVIEW|SOLICITOR REVIEW|UNCONFIRMED|NOT_APPLICABLE|SHA-256|content hash|does not authorise|Stripe Checkout|agreement_versions|professional indemnity/)
    expect(paidServiceAgreementBody).toContain("## 1. Formation")
    expect(paidServiceAgreementBody).toContain("## 2. Authority")
    expect(paidServiceAgreementBody).toContain("## 8. Your obligations")
    expect(paidServiceAgreementBody).toContain("## 9. Our obligations")
    expect(paidServiceAgreementBody).toContain("## 10. Evidence, duplicate fees and disputes")
    expect(paidServiceAgreementBody).toContain("## 14. Confidentiality and personal information")
    expect(paidServiceAgreementBody).toContain("## 15. Intellectual property")
    expect(paidServiceAgreementBody).toContain("## 16. Liability")
    expect(paidServiceAgreementBody).toContain("## 18. Termination")
    expect(paidServiceAgreementBody).toContain("## 19. Governing law and disputes")
    expect(paidServiceAgreementBody).toContain("law of England and Wales")
    expect(paidServiceAgreementBody).toContain("Where Stripe supports presenting the charge in another currency")
  })

  it("pins the canonical SHA-256 so a wording change cannot reuse this version", () => {
    const recomputed = createHash("sha256").update(paidServiceAgreementBody, "utf8").digest("hex")
    expect(recomputed).toBe(paidServiceAgreementContentHash)
    expect(paidServiceAgreementContentHash).toBe("0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4")
    expect(draft).toContain(paidServiceAgreementContentHash)
    const canonicalAt = draft.indexOf("## Canonical body")
    expect(canonicalAt).toBeGreaterThan(0)
    expect(draft.slice(0, canonicalAt)).toContain("SOLICITOR REVIEW REQUIRED")
    expect(draft.slice(canonicalAt)).not.toMatch(/SOLICITOR_REVIEW|SOLICITOR REVIEW|UNCONFIRMED|NOT_APPLICABLE|SHA-256/)
  })

  it("freezes this version independently of the marketing modules it must still match", () => {
    const source = readFileSync(new URL("./paid-service-agreement.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from "@\/(?:lib\/pricing|lib\/legal|lib\/guard-offer|app\/relaunch-guard\/content)"/)
    expect(pricingGroups.flatMap(group => group.items.map(item => item.price))).toEqual([
      catalogueAmounts.guidedRelaunch.price,
      catalogueAmounts.managedProfileRecovery.price,
      catalogueAmounts.guidedReview.price,
      catalogueAmounts.managedReviewProtection.price,
      catalogueAmounts.relaunchGuard.price,
    ])
    expect(paidServiceAgreementBody).toContain(`${legalIdentity.legalName} (company number ${legalIdentity.registrationNumber})`)
    expect(paidServiceAgreementBody).toContain(`registered in ${legalIdentity.placeOfRegistration}`)
    expect(paidServiceAgreementBody).toContain(`incorporated on ${legalIdentity.incorporatedOn}`)
    expect(paidServiceAgreementBody).toContain(registeredOfficeInline())
    expect(paidServiceAgreementBody).toContain(legalIdentity.contactEmail!)
    const cancel = guardFaqs.find(item => item.q === "How do I cancel?")
    expect(cancel).toBeTruthy()
    expect(paidServiceAgreementBody).toContain(cancel!.a.join(" "))
    expect(paidServiceAgreementBody).toContain([guardIncluded.body, guardIncluded.followUp, guardIncluded.supporting].join(" "))
    expect(checksPerDay).toBe(2)
    expect(paidServiceAgreementBody).toContain("twice each day")
    expect(deliveryMethod).toBe("manual")
    expect(paidServiceAgreementBody).toContain(`using a ${timezone} schedule`)
    expect(paidServiceAgreementBody).toContain(`${includedRecoveryDays} days of Guard`)
    expect(guardOffer.includedRecoveryDays).toBe(includedRecoveryDays)
    expect(paidServiceAgreementBody).toContain(`${managedDiscountPercent}% off our standard Managed Profile Recovery and Managed Review Protection fees`)
    expect(guardIntervention.benefitBody).toContain(`${managedDiscountPercent}% off our standard Managed Profile Recovery and Managed Review Protection fees`)
  })

  it("uses the published GBP catalogue and does not invent a price", () => {
    expect(pricingGroups.flatMap(group => group.items.map(item => item.price))).toEqual(["£99", "£299", "£59", "£149", "£9.99"])
    expect(catalogueAmounts.guidedRelaunch).toMatchObject({ price: "£99", minor: 9900 })
    expect(catalogueAmounts.guidedReview).toMatchObject({ price: "£59", minor: 5900 })
    expect(catalogueAmounts.managedProfileRecovery).toMatchObject({ price: "£299", minor: 29900 })
    expect(catalogueAmounts.managedReviewProtection).toMatchObject({ price: "£149", minor: 14900 })
    expect(catalogueAmounts.relaunchGuard).toMatchObject({ price: "£9.99", minor: 999 })
    expect(paidServiceAgreement.catalogueCurrency).toBe("GBP")
    expect(paidServiceAgreementBody).toContain("£99 upfront")
    expect(paidServiceAgreementBody).toContain("£59 upfront")
    expect(paidServiceAgreementBody).toContain("£299")
    expect(paidServiceAgreementBody).toContain("£149")
    expect(paidServiceAgreementBody).toContain("£9.99")
    expect(paidServiceAgreementBody).toContain("won’t automatically start charging you")
    expect(paidServiceAgreementBody).toContain("There is no cancellation fee")
    expect(paidServiceAgreementBody).toContain("unused portion of that month")
  })

  it("requires 48 hours for Managed Profile Recovery and leaves unknown results pending", () => {
    expect(verificationWindowSatisfied(first, exactly48h)).toBe(true)
    expect(verificationWindowSatisfied(first, shortByOneMinute)).toBe(false)
    expect(profileRecoveryVerdict(recoveryBase)).toBe("qualified")
    expect(profileRecoveryVerdict({ ...recoveryBase, secondCheckedAt: shortByOneMinute })).toBe("pending")
    expect(profileRecoveryVerdict({ ...recoveryBase, originalRestrictionReturned: true })).toBe("not_qualified")
    expect(profileRecoveryVerdict({ ...recoveryBase, later: "unknown" })).toBe("pending")
    expect(profileRecoveryVerdict({ ...recoveryBase, whollyUnrelated: true })).toBe("not_qualified")
    expect(profileRecoveryVerdict({ ...recoveryBase, profileIdentified: false })).toBe("pending")
    expect(paidServiceAgreementBody).toContain("at least 48 hours later")
    expect(paidServiceAgreementBody).toContain("not uninterrupted surveillance")
  })

  it("requires two absences 48 hours apart and rejects a non-removal", () => {
    expect(reviewRemovalVerdict(reviewBase)).toBe("qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, differentNewReview: true })).toBe("qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, secondCheckedAt: shortByOneMinute })).toBe("pending")
    expect(reviewRemovalVerdict({ ...reviewBase, sameReviewReturned: true })).toBe("not_qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, later: "hidden" })).toBe("not_qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, initial: "reported_only" })).toBe("not_qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, later: "rating_changed" })).toBe("not_qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, initial: "acknowledged" })).toBe("not_qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, later: "unknown" })).toBe("pending")
    expect(reviewRemovalVerdict({ ...reviewBase, whollyUnrelated: true })).toBe("not_qualified")
    expect(reviewRemovalVerdict({ ...reviewBase, reviewIdentified: false })).toBe("pending")
  })

  it("refunds Guided fees in full before work and only an evidenced portion after", () => {
    expect(guidedRefund({ feeMinor: 9900, substantiveWorkBegun: false, evidencedWorkMinor: null })).toEqual({
      status: "full_refund",
      refundMinor: 9900,
    })
    expect(guidedRefund({ feeMinor: 5900, substantiveWorkBegun: true, evidencedWorkMinor: 2000 })).toEqual({
      status: "partial_refund",
      refundMinor: 3900,
      retainedMinor: 2000,
    })
    expect(guidedRefund({ feeMinor: 9900, substantiveWorkBegun: true, evidencedWorkMinor: null })).toEqual({
      status: "awaiting_evidence",
    })
    expect(() => guidedRefund({ feeMinor: 9900, substantiveWorkBegun: true, evidencedWorkMinor: 9901 })).toThrow(/within the fee/)
    expect(paidServiceAgreementBody).toContain("do not exclude legal remedies for deficient work")
  })

  it("refuses a duplicate success fee and pauses a genuinely disputed amount", () => {
    expect(successFeeObligation({
      serviceOrderId: "order-1",
      outcomeKey: "profile-restored",
      existing: [{ serviceOrderId: "order-1", outcomeKey: "profile-restored" }],
    })).toBe("duplicate_refused")
    expect(successFeeObligation({
      serviceOrderId: "order-1",
      outcomeKey: "review-absent",
      existing: [{ serviceOrderId: "order-1", outcomeKey: "profile-restored" }],
    })).toBe("create")
    expect(collectionOfDisputedAmount(true)).toBe("paused")
    expect(collectionOfDisputedAmount(false)).toBe("collectable")
    expect(paidServiceAgreementBody).toContain("within 14 calendar days")
    expect(paidServiceAgreementBody).toContain("no automatic card charge")
  })

  it("keeps UNCONFIRMED tax as an acceptance block and does not authorise undisclosed presentment", () => {
    expect(quoteAcceptanceBlockedByTax("UNCONFIRMED")).toBe(true)
    expect(quoteAcceptanceBlockedByTax("NOT_APPLICABLE")).toBe(false)
    expect(paidServiceAgreement.retainedTaxBehaviour).toBe("UNCONFIRMED")
    expect(catalogueSql).toContain("tax_behaviour text NOT NULL DEFAULT 'UNCONFIRMED'")
    expect(catalogueSql).toMatch(/IF qv\.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object\('status', 'denied'\)/)
    expect(catalogueSql).toContain("'UNCONFIRMED'")
    expect(catalogueSql).not.toContain("tax_behaviour text NOT NULL DEFAULT 'NOT_APPLICABLE'")
    expect(portalSql).toContain("can_accept := qv.tax_behaviour <> 'UNCONFIRMED'")
    expect(presentmentReady({
      catalogueCurrency: "GBP",
      catalogueAmountMinor: 9900,
      presentedCurrency: "EUR",
      presentedAmountMinor: 11500,
      disclosedBeforePayment: true,
    })).toBe(true)
    expect(presentmentReady({
      catalogueCurrency: "GBP",
      catalogueAmountMinor: 9900,
      presentedCurrency: "EUR",
      presentedAmountMinor: 11500,
      disclosedBeforePayment: false,
    })).toBe(false)
  })

  it("creates no live payment, portal or provider effect", () => {
    expect(com12aLiveEffects).toEqual({
      stripeLiveMode: false,
      checkout: false,
      subscriptions: false,
      refunds: false,
      invoiceIssuance: false,
      charges: false,
      automaticManagedCardCharge: false,
      customerPortal: false,
      guardActivation: false,
      mailAutomation: false,
      databaseMigration: false,
      awsChange: false,
      vercelChange: false,
    })
    expect(resolvePaymentProviderMode({})).toBe("disabled")
    expect(paymentsEnabled({})).toBe(false)
    expect(portalConfig).toContain('process.env.CUSTOMER_PORTAL_ENABLED === "true"')
    expect(SUCCESS_FEE_CONSENT_VERSION).toBe("SUCCESS_FEE_CONSENT_V1")
    expect(SUCCESS_FEE_CONSENT_TEXT).toContain("off-session")
    expect(spec).toContain("SUCCESS_FEE_CONSENT_V1")
    expect(spec).toContain("must not treat `SUCCESS_FEE_CONSENT_V1`")
    expect(spec).toContain("No such migration is in COM-12A")
    expect(spec).toContain("tax_behaviour` is `UNCONFIRMED`")
  })
})
