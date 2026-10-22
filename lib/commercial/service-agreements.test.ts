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

  it("preserves five hashed source bodies and records a distinct migration for DEV activation", () => {
    expect(proposedServiceAgreements).toHaveLength(5)
    expect(new Set(proposedServiceAgreements.map(item => item.version)).size).toBe(5)
    expect(new Set(proposedServiceAgreements.map(item => item.contentHash)).size).toBe(5)
    expect(Object.fromEntries(proposedServiceAgreements.map(item => [item.version, item.contentHash]))).toEqual({
      "PS-2026-10-22.GR": "705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3",
      "PS-2026-10-22.GV": "56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9",
      "PS-2026-10-22.MR": "725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269",
      "PS-2026-10-22.MV": "62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784",
      "PS-2026-10-22.GD": "51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23",
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
    const schema = "20261022105500_service_specific_agreement_schema_v1.sql"
    const activation = new URL("../../supabase/dev-activation/20261022_five_owner_approved_agreements.sql", import.meta.url)
    const sql = readFileSync(activation, "utf8")
    const schemaSql = readFileSync(new URL(schema, migrations), "utf8")
    for (const item of proposedServiceAgreements) {
      expect(sql).toContain(item.version)
      expect(sql).toContain(item.contentHash)
      expect(sql).toContain(item.body)
    }
    expect(sql).toContain("OWNER_DECLARATION_IN_PROJECT_CONVERSATION")
    expect(sql).toContain("owner_approved_at")
    expect(schemaSql).toContain("paid_service_expected_version_v2")
    expect(schemaSql).toContain("paid_service_acceptances_exact_agreement_v2")
    expect(schemaSql).toContain("'LEGACY'")
    expect(sql).toContain("SET mode='SERVICE_SPECIFIC'")
    expect(sql).toContain("Old operative agreement does not match approved baseline")
    expect(sql).not.toContain("UPDATE public.quotes")
    expect(sql).not.toContain("UPDATE public.quote_versions")
    for (const file of readdirSync(migrations).filter(file => file !== schema)) {
      const otherSql = readFileSync(new URL(file, migrations), "utf8")
      expect(otherSql).not.toContain("PS-2026-10-22")
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

  it("aligns each draft to the published promise for that service", () => {
    const body = (code: string) => proposedServiceAgreements.find(item => item.serviceCode === code)!.body
    const gbp = "That pound amount is our agreed fee. If you pay from an account in another currency, your bank or payment provider may convert it or charge its own fee. We do not set or guarantee that rate."
    for (const code of ["GUIDED_RELAUNCH", "GUIDED_REVIEW", "MANAGED_RELAUNCH", "MANAGED_REVIEW", "RELAUNCH_GUARD"]) {
      expect(body(code)).toContain(gbp)
      expect(body(code)).not.toContain("Stripe")
    }

    for (const code of ["GUIDED_RELAUNCH", "GUIDED_REVIEW"]) {
      const guided = body(code)
      expect(guided).toContain("We prepare it. You submit it.")
      expect(guided).toContain("due after you accept the quotation and before work begins")
      expect(guided).toContain("Accepting the quotation does not take payment. Payment is a later step.")
      expect(guided).toContain("Ending this service does not end a different service order.")
    }

    for (const code of ["MANAGED_RELAUNCH", "MANAGED_REVIEW"]) {
      const managed = body(code)
      expect(managed).toContain("We record the time of each check and what we observed.")
      expect(managed).toContain("not invoiced as success")
      expect(managed).toContain("There is no automatic card charge and no collection of that success fee in advance.")
      expect(managed).toContain("Either of us may still bring a claim.")
      expect(managed).toContain("We do not change the profile unless you separately approve that change.")
      expect(managed).toContain("you add us as a Manager for this service only")
      expect(managed).toContain("Ending this service does not end a different service order.")
    }

    const recovery = body("MANAGED_RELAUNCH")
    expect(recovery).toContain("If an observation is missing, unknown or ambiguous, or the checks are less than 48 hours apart, the outcome stays pending. A pending outcome is not invoiced as success.")
    const removal = body("MANAGED_REVIEW")
    expect(removal).toContain("A missing, unknown or ambiguous observation stays pending and is not invoiced as success.")

    const guard = body("RELAUNCH_GUARD")
    expect(guard).toContain("The 20% reduction below does not apply during those 30 days.")
    expect(guard).toContain("The reduction does not apply during the included 30 days, to Guided support")
    expect(guard).toContain("While you are paying the monthly price for a location")
    expect(guard).toContain("Once we agree a reduced fee for a case, cancelling monitoring does not remove that reduction.")
    expect(guard).toContain("at least 30 days' notice of that price and the date it would apply, and you have agreed to it")
    expect(guard).toContain("We will not start the higher price automatically.")
    expect(guard).toContain("If we cannot complete a scheduled check, we retry, record what happened, and tell you if it stays incomplete.")
    expect(guard).toContain("we pause billing for the coverage we cannot provide")
    expect(guard).toContain("we pause the service and the billing")
    expect(guard).toContain("A phone number you have given us may be used only to resolve a failed email.")
    expect(guard).toContain("We check a replacement email address before we use it.")
    expect(guard).toContain("not a promise of continuous monitoring")
    expect(guard).toContain("We do not change the profile unless you separately approve that change.")
    expect(guard).toContain("Ending monitoring does not end a different service order.")
    expect(guard).not.toMatch(/\+44|telephone number/)
  })

  it("documents a later Guided reissue that ends QT-26-H6JSMB before the new offer", () => {
    const doc = readFileSync(new URL("../../docs/customer/customer-quote-01.md", import.meta.url), "utf8")
    const offer = readFileSync(new URL("20261001220255_quote_surface_fixes_v1.sql", migrations), "utf8")
    const gate = readFileSync(new URL("20261015013000_paid_service_acceptance_gate_v1.sql", migrations), "utf8")
    expect(doc).toContain("QT-26-H6JSMB")
    expect(doc).toContain("create_draft")
    expect(doc).toContain("Do not call `create_version` and then `offer` on QT-26-H6JSMB")
    expect(doc).toContain("Do not leave QT-26-H6JSMB offered while the new quotation is also offered")
    expect(doc).toContain("`cancel`")
    expect(doc).not.toContain("Leave QT-26-H6JSMB offered")
    expect(offer).toContain("UPDATE public.quote_versions SET status = 'SUPERSEDED' WHERE id = qu.current_version_id AND status = 'OFFERED'")
    expect(gate).toContain("Offered or accepted quote versions are immutable")
    expect(gate).toContain("OLD.status = 'DRAFT' AND NEW.status = 'OFFERED'")
    expect(gate).toContain("commercial_agreement_version = 'PS-2026-10-14.2'")
  })

  it("requires an operative catalogue row even for a matching service-specific version", () => {
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
      catalogueOperative: false,
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
    expect(status).toBe("not_operative")
    expect(PAID_SERVICE_AGREEMENT_VERSION).not.toBe(proposed.version)
  })

  it("accepts an operative exact Guided agreement and refuses another service or changed terms", () => {
    const guided = proposedServiceAgreements.find(a => a.serviceCode === "GUIDED_RELAUNCH")!
    const input = {
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
      serviceCode: "GUIDED_RELAUNCH" as const,
      paymentModel: "UPFRONT" as const,
      locationId: "location",
      amountMinor: 9900,
      catalogueOperative: true,
      catalogueVersion: guided.version,
      catalogueHash: guided.contentHash,
      businessPurposeAccepted: true,
      termsAccepted: true,
      termsVersion: guided.version,
      termsHash: guided.contentHash,
      feeBasis: null,
      existingAcceptanceId: null,
      idempotencyKey: "key",
      existingIdempotencyKey: null,
      existingFingerprint: null,
      fingerprint: "fingerprint",
    }
    expect(assessPaidServiceAcceptance(input).status).toBe("success")
    expect(assessPaidServiceAcceptance({ ...input, serviceCode: "GUIDED_REVIEW" }).status).toBe("stale_version")
    expect(assessPaidServiceAcceptance({ ...input, termsHash: "a".repeat(64) }).status).toBe("stale_version")
    expect(assessPaidServiceAcceptance({ ...input, catalogueOperative: false }).status).toBe("not_operative")
    expect(assessPaidServiceAcceptance({ ...input, membershipVerified: false }).status).toBe("membership_unverified")
  })
})
