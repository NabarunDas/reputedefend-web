import { readFileSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { assessPaidServiceAcceptance } from "./paid-service-acceptance"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementBody, paidServiceAgreementContentHash } from "./paid-service-agreement"
import {
  proposedAgreementAcceptanceClosed,
  proposedServiceAgreements,
  proposedServiceAgreementVersions,
} from "./service-agreements"

const migrations = new URL("../../supabase/migrations/", import.meta.url)

describe("proposed service agreements", () => {
  it("leaves PS-2026-10-14.2 and its hash unchanged", () => {
    expect(PAID_SERVICE_AGREEMENT_VERSION).toBe("PS-2026-10-14.2")
    expect(paidServiceAgreementContentHash).toBe("0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4")
    expect(createHash("sha256").update(paidServiceAgreementBody, "utf8").digest("hex")).toBe(paidServiceAgreementContentHash)
    const gate = readFileSync(new URL("20261015013000_paid_service_acceptance_gate_v1.sql", migrations), "utf8")
    expect(gate).toContain("commercial_agreement_version = 'PS-2026-10-14.2'")
    expect(gate).toContain(paidServiceAgreementContentHash)
    expect(gate).toContain("WHERE version_id = 'PS-2026-10-14.2'")
  })

  it("proposes five closed versions with distinct hashes and does not migrate them", () => {
    expect(proposedServiceAgreements).toHaveLength(5)
    expect(new Set(proposedServiceAgreements.map(item => item.version)).size).toBe(5)
    expect(new Set(proposedServiceAgreements.map(item => item.contentHash)).size).toBe(5)
    expect(Object.fromEntries(proposedServiceAgreements.map(item => [item.version, item.contentHash]))).toEqual({
      "PS-2026-10-21.GR": "e08731b8138122a692a69e704a79ba0dfee4c9edd05138548e7b0f1e7f9bd76a",
      "PS-2026-10-21.GV": "9249604f97b6fb1a599636b3eb3d18f3da9db2eae56b8e9021e69ab252a68bb7",
      "PS-2026-10-21.MR": "97ad2d9685735791d8b60f2f1304c7d78f6d82e11406b3c8c63c1fab0c532f54",
      "PS-2026-10-21.MV": "db5f0b66042bfa811c9b79f3e72e9027fa0caf785cbac7fabbc50b6fd77d427d",
      "PS-2026-10-21.GD": "e48450fed19cb3e5c77f82666c586cf4f09ece0dd5fe2fc51fa4d695da5124fa",
    })
    for (const item of proposedServiceAgreements) {
      expect(item.version).toBe(proposedServiceAgreementVersions[item.serviceCode])
      expect(item.status).toBe("SOLICITOR_REVIEW")
      expect(item.operative).toBe(false)
      expect(item.customerVisible).toBe(false)
      expect(item.acceptanceActionable).toBe(false)
      expect(item.solicitorReviewComplete).toBe(false)
      expect(item.contentHash).toBe(createHash("sha256").update(item.body, "utf8").digest("hex"))
      expect(item.contentHash).not.toBe(paidServiceAgreementContentHash)
      expect(item.body).not.toContain(paidServiceAgreementBody)
      expect(item.body).toContain("greater of £1,000 or twice the fee")
      expect(item.body).toContain("death or personal injury caused by negligence")
      expect(item.body).toContain("not a statement that a supply is zero-rated or exempt")
      expect(item.body).toContain("law of England and Wales")
      expect(item.body).toContain("contact@profilerelaunch.com")
      expect(item.body).toContain("Contracts (Rights of Third Parties) Act 1999")
      expect(item.body).not.toMatch(/SHA-256|SOLICITOR_REVIEW|UNCONFIRMED|NOT_APPLICABLE/)
      expect(proposedAgreementAcceptanceClosed(item.version, item.contentHash)).toBe(true)
    }
    for (const file of readdirSync(migrations)) {
      const sql = readFileSync(new URL(file, migrations), "utf8")
      expect(sql).not.toContain("PS-2026-10-21")
    }
  })

  it("keeps each service agreement free of the other services' prices", () => {
    const body = (code: string) => proposedServiceAgreements.find(item => item.serviceCode === code)!.body
    const guided = body("GUIDED_RELAUNCH")
    expect(guided).toContain("Guided Relaunch")
    expect(guided).toContain("The price is £99")
    expect(guided).toContain("does not require you to add us as a Manager")
    expect(guided).toContain("full refund of the fee you have paid")
    expect(guided).not.toMatch(/£59|£299|£149|£9\.99|Relaunch Guard|Managed|success fee|48 hours|per month/)

    const review = body("GUIDED_REVIEW")
    expect(review).toContain("The price is £59")
    expect(review).toContain("does not require you to add us as a Manager")
    expect(review).not.toMatch(/£99|£299|£149|£9\.99|Relaunch Guard|Managed|success fee|48 hours|per month/)

    const recovery = body("MANAGED_RELAUNCH")
    expect(recovery).toContain("The price is a success fee of £299")
    expect(recovery).toContain("at least 48 hours later")
    expect(recovery).toContain("you add us as a Manager")
    expect(recovery).toContain("no collection of that success fee in advance")
    expect(recovery).toContain("within 14 calendar days")
    expect(recovery).not.toMatch(/£99|£59|£149|£9\.99|Guided|Relaunch Guard|per month/)

    const removal = body("MANAGED_REVIEW")
    expect(removal).toContain("The price is a success fee of £149")
    expect(removal).toContain("at least 48 hours apart")
    expect(removal).toContain("Reporting, hiding, a rating change, or an acknowledgement is not by itself removal")
    expect(removal).not.toMatch(/£99|£59|£299|£9\.99|Guided|Relaunch Guard|per month/)

    const guard = body("RELAUNCH_GUARD")
    expect(guard).toContain("The price is £9.99 per month per location")
    expect(guard).toContain("30 days of Relaunch Guard")
    expect(guard).toContain("There is no cancellation fee")
    expect(guard).toContain("return the unused portion of that month")
    expect(guard).toContain("you add us as a Manager")
    expect(guard).not.toMatch(/£99|£59|£299|£149/)
  })

  it("does not let a proposed version pass the current acceptance gate", () => {
    const proposed = proposedServiceAgreements[0]
    const status = assessPaidServiceAcceptance({
      sessionCustomerId: "customer",
      membershipVerified: true,
      actionOpen: true,
      caseCustomerId: "customer",
      quoteCustomerId: "customer",
      quoteVersionId: "version",
      submittedQuoteVersionId: "version",
      submittedQuoteCustomerId: "customer",
      currentQuoteVersionId: "version",
      quoteStatus: "OFFERED",
      quoteOpen: true,
      taxBehaviour: "NOT_APPLICABLE",
      serviceCode: "GUIDED_RELAUNCH",
      paymentModel: "UPFRONT",
      locationId: "location",
      amountMinor: 9900,
      catalogueOperative: true,
      catalogueVersion: proposed.version,
      catalogueHash: proposed.contentHash,
      businessPurposeAccepted: true,
      termsAccepted: true,
      termsVersion: proposed.version,
      termsHash: proposed.contentHash,
      feeBasis: null,
      existingAcceptanceId: null,
      idempotencyKey: "key",
      existingIdempotencyKey: null,
      existingFingerprint: null,
      fingerprint: "fingerprint",
    }).status
    expect(status).toBe("stale_version")
    expect(PAID_SERVICE_AGREEMENT_VERSION).not.toBe(proposed.version)
  })
})
