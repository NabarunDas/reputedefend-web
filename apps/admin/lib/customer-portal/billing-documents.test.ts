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
    expect(guard).not.toMatch(/['"]stripe|stripe_charge|stripe_payment_intent|hosted_invoice|provider_receipt/i)
    expect(sql).toContain("adjustment.kind = 'SERVICE_CREDIT'")
    expect(sql).toContain("refund.status = 'SUCCEEDED'")
    expect(sql).toContain("guard_invoice_collected_at_v1")
    expect(sql).toContain("FIRST_INVOICE_PAID")
    expect(sql).toContain("billing_party_snapshots")
    expect(sql).not.toMatch(/insert into public\.billing_party_snapshots[\s\S]{0,180}select/i)
    expect(sql).toContain("seller_legal_identity")
  })
})
