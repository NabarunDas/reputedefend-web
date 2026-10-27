import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const sql = readFileSync(new URL("../../../../supabase/migrations/20261027120000_billing_documents_v1.sql", import.meta.url), "utf8")

describe("billing document migration", () => {
  it("does not rewrite an existing payment receipt", () => {
    const statements = sql.split("\n").filter(line => !line.trim().startsWith("--")).join("\n")
    expect(statements).not.toMatch(/update\s+public\.payment_receipts/i)
    expect(sql).not.toContain("RC-26-NSV9PP")
    expect(sql).toContain("customer_portal_receipt_v1")
    expect(sql).toContain("'receiptRef', v_receipt.public_ref")
  })

  it("issues a Guard receipt only for a paid billing period", () => {
    const guard = sql.slice(sql.indexOf("customer_portal_guard_document_v1"))
    expect(guard).toContain("inv.status = 'PAID'")
    expect(guard).not.toMatch(/stripe_invoice|stripe_charge|stripe_payment_intent|hosted_invoice/i)
    expect(sql).toContain("adjustment.kind = 'SERVICE_CREDIT'")
    expect(sql).toContain("refund.status = 'SUCCEEDED'")
  })
})
