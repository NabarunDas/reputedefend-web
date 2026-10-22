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
    expect(paidServiceAgreementBody).toContain("Version PS-2026-10-14.2")
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
      "PS-2026-10-21.GR": "e4f9ecb589f0e4efa8f46a25faa750bb2db3cf3ad1665b511f34fb486fbe8c88",
      "PS-2026-10-21.GV": "6b4c26493e4e3450cfca9a5c41908ec44c22b329f85228a536c8192d1803a2ff",
      "PS-2026-10-21.MR": "1a7188c9d9f1b054cf3bf6627a66a9206f042dbf5684c5615c870be72f4699ee",
      "PS-2026-10-21.MV": "6dded927728a4cec7226712eccbf1d3243645602f58a56f94275b76235549214",
      "PS-2026-10-21.GD": "b48fdffe3ff8ec15543fec0e0717fdabba73c4ffe128fc1b2600b8d2ca61c9e6",
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
      expect(item.body.startsWith("ProfileRelaunch Ltd — Paid-service agreement for ")).toBe(true)
      expect(item.body).toContain("22 October 2026")
      expect(item.body).not.toContain(item.version)
      expect(item.body).not.toContain("Version ")
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

  it("documents a later Guided reissue that leaves QT-26-H6JSMB offered", () => {
    const doc = readFileSync(new URL("../../docs/customer/customer-quote-01.md", import.meta.url), "utf8")
    const offer = readFileSync(new URL("20261001220255_quote_surface_fixes_v1.sql", migrations), "utf8")
    const gate = readFileSync(new URL("20261015013000_paid_service_acceptance_gate_v1.sql", migrations), "utf8")
    expect(doc).toContain("QT-26-H6JSMB")
    expect(doc).toContain("create_draft")
    expect(doc).toContain("Do not call `create_version` and then `offer` on QT-26-H6JSMB")
    expect(offer).toContain("UPDATE public.quote_versions SET status = 'SUPERSEDED' WHERE id = qu.current_version_id AND status = 'OFFERED'")
    expect(gate).toContain("Offered or accepted quote versions are immutable")
    expect(gate).toContain("OLD.status = 'DRAFT' AND NEW.status = 'OFFERED'")
    expect(gate).toContain("commercial_agreement_version = 'PS-2026-10-14.2'")
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
