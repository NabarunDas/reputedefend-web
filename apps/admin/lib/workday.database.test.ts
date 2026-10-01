/**
 * Step 23 acceptance: a single synthetic Admin working day.
 *
 * Every other SQL suite exercises one domain in isolation against a
 * hand-picked subset of the migration chain. This one applies the whole chain
 * exactly as a rebuilt project would receive it, then walks one enquiry from
 * the moment it arrives to the moment it is a case with reviewed evidence, an
 * approved pack and an offered quote — checking that each surface the operator
 * would actually open reflects the work done by the previous step.
 *
 * The data is synthetic. Provider-facing steps stay readiness-only: no mail is
 * sent, no job is executed, no Guard automation runs and no Google or Stripe
 * call is made.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "./recovery/harness"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const challenge = "c".repeat(64)
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const note = "Reviewed the caller’s request and confirmed the details on the phone."

// Heterogeneous database JSON results are intentionally inspected in this SQL integration harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function rpc(name: string, args: unknown[] = []): Promise<Json> {
  const result = await db.query<{ value: Json }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)
  return result.rows[0].value
}

async function count(table: string): Promise<number> {
  return (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  // A later migration seeds the singleton identity row, so the rehearsal
  // points it at the synthetic Admin user rather than inserting a second one.
  await db.exec(`insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;`)
}, 120000)
afterAll(async () => { await db.close() })

describe("a synthetic Admin working day", () => {
  it("carries one enquiry through triage, a case, evidence, a pack and a quote", async () => {
    // 1. The Admin signs in. The session comes from the real one-time-code
    // flow rather than an inserted row, so everything below runs against a
    // session the database itself issued.
    expect(await rpc("admin_begin_otp_v1", [challenge])).toBe(uid)
    expect(await rpc("admin_attempt_otp_v1", [challenge])).toBe(uid)
    expect(await rpc("admin_finish_otp_v1", [challenge, token, uid])).toBe(true)
    expect(await rpc("admin_session_v1", [token])).toMatchObject({ userId: uid })

    // 2. Today opens on an empty desk.
    const openingToday = await rpc("admin_dashboard_today_v1", [token, "today"])
    expect(openingToday.status).not.toBe("invalid")
    expect(openingToday.metrics.openEnquiries.count).toBe(0)
    expect(openingToday.metrics.openCases.count).toBe(0)

    // 3. A general enquiry arrives from the marketing site and shows up in the
    // active queue.
    const submission = key()
    const enquiry = await rpc("create_general_enquiry_v1", [submission, {
      fullName: "Alex Morgan", email: "alex@example.com", phone: "07123456789", businessName: "Example Bakery",
      country: "UK", service: "general", subject: "general-question",
      details: "Our Google listing was suspended last week and we cannot get it back.",
      websiteUrl: "", businessProfileUrl: "", reviewUrl: "", informationAccurate: false, privacyAccepted: false, source: "contact",
    }, false])
    expect(enquiry.status).toBe("created")
    const queue = await rpc("admin_enquiry_list_v1", [token, "active", "", null, null, "all"])
    expect(queue.map((row: Json) => row.id)).toContain(enquiry.id)
    expect((await rpc("admin_dashboard_today_v1", [token, "today"])).metrics.openEnquiries.count).toBe(1)

    // 4. The Admin triages it: assigned, with a dated next action.
    expect((await rpc("admin_enquiry_triage_v1", [
      token, enquiry.id, 1, "open", true, "Call the owner back", "2026-02-01T12:00:00Z", note, key(),
    ])).status).toBe("success")
    expect(await rpc("admin_enquiry_detail_v1", [token, enquiry.id])).toMatchObject({
      status: "open", assigned: true, nextAction: "Call the owner back", version: 2,
    })

    // 5. The customer, business and location records are created and the
    // relationship between them is verified. Converting an enquiry needs real
    // records, and the later quote needs the verified membership.
    const client = await rpc("admin_record_save_v1", [
      token, "client", null, 0, { name: "Alex Morgan", email: "alex@example.com", phone: "07123456789" },
      "Captured from the enquiry after speaking to the owner.", key(),
    ])
    expect(client.status).toBe("success")
    const businessRecord = await rpc("admin_record_save_v1", [
      token, "business", null, 0, { name: "Example Bakery", website: "https://example-bakery.test" },
      "Captured from the enquiry after speaking to the owner.", key(),
    ])
    expect(businessRecord.status).toBe("success")
    const locationRecord = await rpc("admin_record_save_v1", [
      token, "location", null, 0, { name: "High Street", country: "UK", profileUrl: "", businessId: businessRecord.id },
      "Captured from the enquiry after speaking to the owner.", key(),
    ])
    expect(locationRecord.status).toBe("success")
    expect((await rpc("admin_contact_verify_v1", [
      token, client.id, 1, "email", "Confirmed the address by reading it back on the call.", key(),
    ])).status).toBe("success")
    expect((await rpc("admin_membership_save_v1", [
      token, client.id, businessRecord.id, 0, "verified", "Companies House record matched on the call.", key(),
    ])).status).toBe("success")

    // 6. The enquiry converts into a profile recovery case.
    const converted = await rpc("admin_enquiry_convert_v1", [
      token, enquiry.id, 2, "PROFILE_RECOVERY", client.id, locationRecord.id, null, note, key(),
    ])
    expect(converted.status).toBe("success")
    const convertedDetail = await rpc("admin_enquiry_detail_v1", [token, enquiry.id])
    expect(convertedDetail.status).toBe("converted")
    const caseId: string = convertedDetail.caseId
    const opened = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(opened.reference).toMatch(/^PR-/)
    expect(opened.stage).toBe("INITIAL_REVIEW")
    const reference: string = opened.reference

    // 7. Case workflow progresses onto the guided track and into evidence
    // collection, which is a customer-waiting stage.
    const caseCmd = async (operation: string, data: Record<string, unknown>) => {
      const current = await rpc("admin_case_detail_v1", [token, caseId, null])
      return rpc("admin_case_command_v1", [token, key(), caseId, current.version, operation, { note, ...data }])
    }
    expect((await caseCmd("plan", {
      track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Collect the supporting documents",
      due: null, firstResponseDue: null,
    })).status).toBe("success")
    expect((await caseCmd("transition", {
      target: "EVIDENCE_COLLECTION", nextAction: "Chase the owner for the invoice", due: "2026-02-10T12:00:00Z",
    })).status).toBe("success")
    const collecting = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(collecting.stage).toBe("EVIDENCE_COLLECTION")
    expect(collecting.status).toBe("AWAITING_CUSTOMER")

    // 8. Evidence is requested from the customer.
    const request = await rpc("admin_evidence_request_v1", [
      token, key(), caseId, null, null, "create", "Utility bill",
      "Please upload a recent utility bill showing the trading address.", null, null,
    ])
    expect(request.status).toBe("success")
    expect((await rpc("admin_evidence_case_v1", [token, caseId])).requests).toHaveLength(1)

    // 9. A file arrives. The upload is driven through the same begin/finalize/
    // scan boundary the browser uses; no object is written anywhere.
    const upload = await rpc("admin_evidence_begin_v1", [
      token, key(), caseId, null, "utility-bill.pdf", "application/pdf", 2048, "Utility bill", "test-evidence", request.id,
    ])
    expect(upload.status).toBe("success")
    expect((await rpc("admin_evidence_finalize_v1", [token, key(), caseId, upload.versionId])).status).toBe("success")
    expect((await rpc("admin_evidence_refresh_scan_v1", [
      token, key(), caseId, upload.versionId, "NO_THREATS_FOUND", "VALID", null,
    ])).status).toBe("success")

    // 10. The Admin reviews and accepts it.
    const versionMeta = await rpc("admin_evidence_version_v1", [token, caseId, upload.versionId])
    expect((await rpc("admin_evidence_review_v1", [
      token, key(), caseId, upload.versionId, versionMeta.recordVersion, "accept", "Accepted after a clean scan.", null,
    ])).status).toBe("success")
    expect((await rpc("admin_evidence_request_v1", [
      token, key(), caseId, request.id, request.version, "fulfill", null, null, null,
      "The owner sent the bill and it has been accepted.",
    ])).requestStatus).toBe("FULFILLED")

    // 11. A prepared pack is assembled from the accepted evidence.
    const packCmd = (operation: string, data: Record<string, unknown> = {}, pack: string | null = null, version: number | null = null) =>
      rpc("admin_prepared_pack_command_v1", [token, key(), caseId, pack, version, operation, data])
    const pack = await packCmd("create")
    expect(pack.status).toBe("success")
    expect((await packCmd("add_item", { versionId: upload.versionId }, pack.id, pack.recordVersion)).status).toBe("success")

    // 12. The pack is approved. Approval is deliberate: it needs an explicit
    // confirmation as well as a reason.
    const draft = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect((await packCmd("approve", {
      note: "This selection is the prepared pack we will rely on for the appeal.", confirmed: false,
    }, pack.id, draft.packs[0].recordVersion)).status).toBe("invalid")
    expect(await packCmd("approve", {
      note: "This selection is the prepared pack we will rely on for the appeal.", confirmed: true,
    }, pack.id, draft.packs[0].recordVersion)).toMatchObject({ status: "success", packStatus: "APPROVED" })

    // 13. Customer-action readiness is evaluated. It reports the parts that
    // are satisfied and the parts that are not; nothing is released to the
    // customer by reading it.
    const readiness = await rpc("admin_case_authorization_readiness_v1", [token, caseId])
    expect(readiness).toMatchObject({
      businessAuthorityVerified: true, customerEmailVerified: true,
      serviceAgreementAccepted: false, caseManagementPermissionActive: false,
    })
    expect(readiness.authorizationReady).toBe(false)
    expect(await count("public.customer_actions")).toBe(0)

    // 14. Commercial state. A quote is drafted and offered against the case,
    // and the order list stays empty because nothing has been accepted.
    const priceVersionId = (await db.query<{ id: string }>(
      "select id from public.price_versions where service_code='GUIDED_RELAUNCH' and seed_key is not null",
    )).rows[0].id
    const quote = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
      serviceCode: "GUIDED_RELAUNCH", customerId: client.id, businessId: businessRecord.id, caseId,
      locationId: locationRecord.id, priceVersionId,
      scope: "Prepare and submit the reinstatement appeal for this location only.",
      exclusions: "Google decisions, Manager access and later payment collection are excluded.",
      validUntil: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(), applyDiscount: false,
    }, null])
    expect(quote.status).toBe("success")
    expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", {
      quoteId: quote.id, taxBehaviour: "NOT_APPLICABLE",
    }, quote.version])).status).toBe("success")
    expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: quote.id }, quote.version + 1])).status).toBe("success")
    const offered = await rpc("admin_quote_list_v1", [token, "OFFERED", null])
    expect(offered.quotes.map((row: Json) => row.id)).toEqual([quote.id])
    expect((await rpc("admin_quote_list_v1", [token, "DRAFT", null])).quotes).toEqual([])
    expect((await rpc("admin_order_list_v1", [token])).orders).toEqual([])

    // 15. Job and outbox health is visible, and looking at it executes
    // nothing: no job is claimed, started or completed by the read.
    const jobsBefore = await count("admin_private.jobs")
    const attemptsBefore = await count("admin_private.job_attempts")
    const health = await rpc("admin_job_health_v1", [token])
    expect(health.heartbeat.status).toBe("NEVER_RUN")
    expect(health.jobs).toEqual([])
    expect(await count("admin_private.jobs")).toBe(jobsBefore)
    expect(await count("admin_private.job_attempts")).toBe(attemptsBefore)

    // 16. Communications for the case are visible and nothing has been sent.
    const communications = await rpc("admin_communication_list_v1", [token, caseId])
    expect(communications.communications).toEqual([])
    expect(communications.templates.length).toBeGreaterThan(0)
    expect(await count("public.communications")).toBe(0)
    expect((await rpc("admin_conversation_list_v1", [token, null])).conversations).toEqual([])

    // 17. Guard monitoring stays manual. There is no subscription, so there is
    // no check queue, and no automation created one while the day ran.
    const checks = await rpc("admin_guard_check_list_v1", [token, null, null, null, null, 50, null])
    expect(checks.obligations).toEqual([])
    expect(checks.scheduleConfigured).toBe(false)
    expect(await count("public.guard_check_obligations")).toBe(0)
    expect(await count("public.guard_check_attempts")).toBe(0)
    expect(await count("public.guard_alerts")).toBe(0)

    // 18. The audit trail reflects the mutations, and the activity feed never
    // exposes session material.
    const audited = await db.query<{ action: string; outcome: string }>(
      "select distinct action, outcome from public.admin_audit_events order by action",
    )
    expect(audited.rows.map(row => row.action)).toEqual([
      "CASE_CHANGED", "COMMERCE_CHANGED", "CONTACT_VERIFIED", "ENQUIRY_CONVERTED", "ENQUIRY_TRIAGED",
      "EVIDENCE_CHANGED", "MEMBERSHIP_CHANGED", "RECORD_CREATED", "SIGNED_IN",
    ])
    expect(audited.rows.every(row => row.outcome === "success")).toBe(true)
    const caseTrail = await db.query<{ reason: string }>(
      "select reason from public.admin_audit_events where target_id=$1 order by id", [caseId],
    )
    expect(caseTrail.rows.map(row => row.reason)).toContain("Prepared pack approved")
    const activity = await rpc("admin_audit_list_v1", [token, null, null, null])
    expect(JSON.stringify(activity)).not.toContain(token)

    // 19. The reporting surfaces reflect the day's work.
    const closingToday = await rpc("admin_dashboard_today_v1", [token, "today"])
    expect(closingToday.metrics.openEnquiries.count).toBe(0)
    expect(closingToday.metrics.openCases.count).toBe(1)
    const found = await rpc("admin_global_search_v1", [token, reference, null, 20])
    expect(found.results.some((row: Json) => row.id === caseId)).toBe(true)
    const report = await rpc("admin_report_summary_v1", [token, "open_cases", "today", null, null, null])
    expect(report.status).not.toBe("invalid")
    expect(report.summary.count).toBe(1)

    // 20. Returning to the record shows one coherent history rather than a set
    // of unrelated fragments.
    const final = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(final.reference).toBe(reference)
    expect(final.stage).toBe("EVIDENCE_COLLECTION")
    expect(final.track).toBe("GUIDED")
    expect(final.events.map((event: Json) => event.event)).toEqual(["transition", "plan"])
    const evidence = await rpc("admin_evidence_case_v1", [token, caseId])
    expect(evidence.requests[0].status).toBe("FULFILLED")
    expect(evidence.documents[0].versions[0].reviewStatus).toBe("ACCEPTED")
    const packs = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect(packs.packs[0]).toMatchObject({ status: "APPROVED" })
    expect(packs.packs[0].items).toHaveLength(1)
  }, 120000)
})
