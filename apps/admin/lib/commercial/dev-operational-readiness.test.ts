import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const readiness = readFileSync(new URL("../../../../docs/customer-platform/03A-03-03-02-08-dev-operational-readiness.md", import.meta.url), "utf8")
const commercial = readFileSync(new URL("../../../../docs/telloya/phase-c/commercial-readiness.md", import.meta.url), "utf8")

describe("controlled Retell DEV operational readiness", () => {
  it("records the applied initiation file and the DEV-only provider variables", () => {
    expect(commercial).not.toContain("unapplied initiation file")
    expect(commercial).toContain("`20261106200000_admin_commercial_initiate_agent_test_call_v1.sql` was applied once to DEV.")
    expect(readiness).toContain("TELLOYA_RETELL_DEV_API_KEY")
    expect(readiness).toContain("TELLOYA_RETELL_PRODUCTION_API_KEY")
    expect(readiness).toContain("ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED")
    expect(readiness).toContain("retell-client-js-sdk")
    expect(readiness).toContain("3.0.4")
    expect(readiness).toContain("POST https://api.retellai.com/v3/create-web-call")
    expect(readiness).toContain("600 seconds")
    expect(readiness).toContain("pendingMigrations()` is empty.")
    expect(readiness).toContain("I understand this controlled web call may incur a provider usage charge.")
  })
})
