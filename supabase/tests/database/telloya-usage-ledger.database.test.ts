/**
 * Local usage-ledger checks. This builds a disposable database from the
 * repository chain. It does not connect to hosted DEV or Production and it
 * does not create a Stripe charge.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"

import { applyChain, preparePlatform } from "../../../apps/admin/lib/recovery/harness"

const db = new PGlite()
const BUSINESS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const LOCATION = "22222222-2222-4222-8222-222222222222"
const CUSTOMER = "11111111-1111-4111-8111-111111111111"
const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into public.customers(id, full_name, email) values
      ('${CUSTOMER}', 'Ada Usage', 'ada.usage@example.com');
    insert into public.businesses(id, display_name) values ('${BUSINESS}', 'Usage Business');
    insert into public.locations(id, business_id, country, location_name) values
      ('${LOCATION}', '${BUSINESS}', 'GB', 'Usage Lane');
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("subscription usage ledger", () => {
  it("records an internal web call once and keeps it out of customer seconds", async () => {
    const args = ["dev", "web_qa_1", "admin_web_qa", null, null, null, null, null, 30, "confirmed", null, HASH_A, null, false, null, null]
    const first = (await rows<{ result: { status: string } }>(
      "select admin_private.commercial_usage_record_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) as result",
      args,
    ))[0]?.result
    expect(first?.status).toBe("accepted")
    const replay = (await rows<{ result: { status: string } }>(
      "select admin_private.commercial_usage_record_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) as result",
      args,
    ))[0]?.result
    expect(replay?.status).toBe("replay")
    const conflict = (await rows<{ result: { status: string } }>(
      "select admin_private.commercial_usage_record_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) as result",
      ["dev", "web_qa_1", "admin_web_qa", null, null, null, null, null, 30, "confirmed", null, HASH_B, null, false, null, null],
    ))[0]?.result
    expect(conflict?.status).toBe("conflict")
    expect(await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'web_qa_1'")).toEqual([{ n: 1 }])
    const seconds = (await rows<{ n: number }>(
      "select admin_private.commercial_usage_customer_seconds_v1('99999999-9999-4999-8999-999999999999', now(), now() + interval '1 day') as n",
    ))[0]?.n
    expect(Number(seconds)).toBe(0)
  })

  it("rejects a change to recorded usage evidence", async () => {
    await db.exec("begin")
    try {
      await db.query("update admin_private.commercial_usage_events set duration_seconds = 1 where provider_call_ref = 'web_qa_1'")
      throw new Error("expected the usage row to stay immutable")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.exec("rollback")
      expect(message).toMatch(/immutable/)
    }
  })

  it("redacts a lead after 90 days and keeps a legal hold", async () => {
    await db.query(
      `insert into public.telloya_voice_leads(
        environment, business_id, location_id, provider_call_ref, caller_name, callback_number,
        summary, incomplete, call_status, finalised, finalised_by, created_at
      ) values
        ('dev', $1, $2, 'lead_old', 'Ada', '+447700900111', 'Old summary', false, 'completed', true, 'analysis', now() - interval '91 days'),
        ('dev', $1, $2, 'lead_new', 'Bea', '+447700900222', 'New summary', false, 'completed', true, 'analysis', now() - interval '10 days'),
        ('dev', $1, $2, 'lead_held', 'Cara', '+447700900333', 'Held summary', false, 'completed', true, 'analysis', now() - interval '91 days')`,
      [BUSINESS, LOCATION],
    )
    const held = (await rows<{ id: string }>("select id::text from public.telloya_voice_leads where provider_call_ref = 'lead_held'"))[0]
    await db.query(
      "insert into admin_private.telloya_lead_legal_holds(lead_id, reason) values ($1, 'legal_hold')",
      [held?.id],
    )
    const redacted = (await rows<{ n: number }>(
      "select admin_private.telloya_voice_redact_expired_leads_v1(now()) as n",
    ))[0]?.n
    expect(Number(redacted)).toBe(1)
    const leads = await rows<{ provider_call_ref: string; caller_name: string | null; summary: string }>(
      "select provider_call_ref, caller_name, summary from public.telloya_voice_leads order by provider_call_ref",
    )
    expect(leads).toEqual([
      { provider_call_ref: "lead_held", caller_name: "Cara", summary: "Held summary" },
      { provider_call_ref: "lead_new", caller_name: "Bea", summary: "New summary" },
      { provider_call_ref: "lead_old", caller_name: null, summary: "redacted" },
    ])
    expect(await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events")).toEqual([{ n: 1 }])
  })
})
