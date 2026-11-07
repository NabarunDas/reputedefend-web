import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { telloyaDraftAgreement, telloyaTaxDecision } from "./telloya-catalogue-proposal"

const pack = readFileSync(new URL("../../../../docs/telloya/phase-c/06a-commercial-agreement-decision-pack.md", import.meta.url), "utf8")

describe("Telloya commercial agreement decision pack", () => {
  it("keeps the proposal unapproved and the prices unchanged", () => {
    expect(telloyaDraftAgreement.versionRef).toBe("TELLOYA-DRAFT-2026-11-1")
    expect(telloyaTaxDecision.productionTaxBehaviour).toBeNull()
    expect(telloyaTaxDecision.status).toBe("OWNER DECISION REQUIRED")
    expect(pack).toContain("TELLOYA-PROPOSED-2026-11-1")
    expect(pack).toContain("PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED")
    expect(pack).toContain("£49")
    expect(pack).toContain("120 minutes")
    expect(pack).toContain("£79")
    expect(pack).toContain("£120")
    expect(pack).toContain("£9.99")
    expect(pack).toContain("£0.25")
    expect(pack).toContain("NOT_VAT_REGISTERED")
    expect(pack).toContain("NOT_APPLICABLE")
    expect(pack).toContain("minutes_rollover")
    expect(pack).toContain("version number 9301")
    expect(pack).toContain("Do not run it from this change.")
    expect(pack).toContain("Do not insert `TELLOYA-DRAFT-2026-11-1` or any `TELLOYA-TEST-` fixture as the customer agreement.")
  })
})
