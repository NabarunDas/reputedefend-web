/**
 * Disposable check for the develop SEND_EMAIL dispatcher.
 * Nothing here connects to a live database, sends mail, or collects a payment.
 */
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const packMail = "66666666-6666-4666-8666-666666666666"
const completionMail = "77777777-7777-4777-8777-777777777777"
const evidenceMail = "88888888-8888-4888-8888-888888888888"
const mismatchMail = "99999999-9999-4999-8999-999999999999"
const token = "c".repeat(64)
const origin = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const packPage = `${origin}/portal/cases/PR-26-MALL2A/documents`
const closePage = `${origin}/portal/cases/PR-26-MALL2A/documents`

type Json = {
  status?: string
  reason?: string
  jobId?: string
  jobType?: string
  leaseToken?: string
  attempts?: number
  phase?: string
  stalled?: boolean
  communications?: Array<{ communicationId?: string }>
  messages?: Array<{ communicationId?: string; templateKey?: string; eligible?: boolean; reason?: string }>
  workers?: Array<{ workerName?: string }>
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await rows<{ value: T }>(sql, args))[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at, last_seen_at) values ('${token}', '${admin}', now(), now());
    insert into public.customers(id, full_name, email) values ('${customer}', 'Alex', 'alex@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1,'PR-26-MALL2A','PROFILE_RECOVERY',$2,$3,$4,'Profile suspended', now(), now(), 'GUIDED')`,
    [caseId, customer, business, location],
  )
  await db.exec("alter table public.communications disable trigger communications_fulfilment_email_guard")
  await db.query(
    `insert into public.communications(
      id, case_id, communication_type, recipient, subject, lifecycle, delivery_status, template_key, template_version,
      body_text, body_html, content_version, content_locked, customer_id
    ) values
      ($1,$2,'CASE_UPDATE','alex@example.com','Your documents are ready','QUEUED','NONE','GUIDED_PACK_READY',1,$3,$4,1,true,$5),
      ($6,$2,'CASE_UPDATE','alex@example.com','Your preparation is complete','QUEUED','NONE','GUIDED_COMPLETION',1,$7,$8,1,true,$5),
      ($9,$2,'CASE_UPDATE','alex@example.com','Please send evidence','QUEUED','NONE','EVIDENCE_REQUEST',1,'Please upload.', '<p>Please upload.</p>',1,true,$5),
      ($10,$2,'CASE_UPDATE','other@example.com','Your documents are ready','QUEUED','NONE','GUIDED_PACK_READY',1,$3,$4,1,true,$5)`,
    [packMail, caseId, `The pack is ready.\n${packPage}`, `<p>The pack is ready.</p><p>${packPage}</p>`, customer, completionMail, `The preparation is complete.\n${closePage}`, `<p>The preparation is complete.</p><p>${closePage}</p>`, evidenceMail, mismatchMail],
  )
  await db.exec("alter table public.communications enable trigger communications_fulfilment_email_guard")
  await db.query(
    `select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'communication', $2::uuid, $3::jsonb, now() - interval '10 minutes')`,
    [`send-email:${packMail}:v1`, packMail, JSON.stringify({ communicationId: packMail, contentVersion: 1 })],
  )
  await db.query(
    `select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'communication', $2::uuid, $3::jsonb, now() - interval '10 minutes')`,
    [`send-email:${completionMail}:v1`, completionMail, JSON.stringify({ communicationId: completionMail, contentVersion: 1 })],
  )
  await db.query(
    `select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'communication', $2::uuid, $3::jsonb, now() - interval '10 minutes')`,
    [`send-email:${evidenceMail}:v1`, evidenceMail, JSON.stringify({ communicationId: evidenceMail, contentVersion: 1 })],
  )
  await db.query(
    `select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'communication', $2::uuid, $3::jsonb, now() - interval '10 minutes')`,
    [`send-email:${mismatchMail}:v1`, mismatchMail, JSON.stringify({ communicationId: mismatchMail, contentVersion: 1 })],
  )
  await db.query(
    `select admin_private.enqueue_outbox_v1($1, 'COLLECT_PAYMENT', 'operator', null, '{}'::jsonb, now() - interval '1 hour')`,
    ["collect-mail-0001"],
  )
}, 180000)

afterAll(async () => { await db.close() })

describe("develop mail dispatch", () => {
  it("leases one SEND_EMAIL job and leaves every other topic untouched", async () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261029000000_dev_mail_dispatch_v1.sql", import.meta.url), "utf8")
    expect(sql).not.toContain("job_promote_outbox_v1")
    expect(sql).not.toContain("job_claim_batch_v1")
    expect(sql).not.toContain("DEV_MAIL_ALLOWED_RECIPIENTS")
    expect(sql).not.toContain("PR-26-GHNLB9")
    const inventory = await rpc<Json>("dev_mail_dispatch_inventory_v1", [origin])
    expect(inventory.status).toBe("success")
    expect(inventory.messages?.find(row => row.communicationId === packMail)).toMatchObject({ eligible: true, reason: "pack_ready", templateKey: "GUIDED_PACK_READY" })
    expect(inventory.messages?.find(row => row.communicationId === completionMail)).toMatchObject({ eligible: false, reason: "template_out_of_scope" })
    expect(inventory.messages?.find(row => row.communicationId === evidenceMail)).toMatchObject({ eligible: false, reason: "template_out_of_scope" })
    expect(inventory.messages?.find(row => row.communicationId === mismatchMail)).toMatchObject({ eligible: false, reason: "recipient_mismatch" })
    expect(JSON.stringify(inventory)).not.toContain("@")
    const listed = await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, origin])
    expect(listed.communications?.map(row => row.communicationId)).toEqual([packMail])
    expect(await rpc("dev_mail_dispatch_claim_v1", [completionMail, origin])).toMatchObject({ status: "denied", reason: "not_send_email" })
    expect(await rpc("dev_mail_dispatch_claim_v1", [evidenceMail, origin])).toMatchObject({ status: "denied", reason: "not_send_email" })
    expect(await rpc("dev_mail_dispatch_claim_v1", [mismatchMail, origin])).toMatchObject({ status: "denied", reason: "recipient_mismatch" })
    await db.query("insert into admin_private.email_suppressions(address_normalized, reason) values ('alex@example.com', 'SUPPRESSED')")
    expect(await rpc("dev_mail_dispatch_claim_v1", [packMail, origin])).toMatchObject({ status: "denied", reason: "suppressed" })
    expect((await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, origin])).communications).toEqual([])
    await db.query("delete from admin_private.email_suppressions where address_normalized = 'alex@example.com'")
    expect(await count("select count(*)::int as n from admin_private.jobs")).toBe(0)
    const claimed = await rpc<Json>("dev_mail_dispatch_claim_v1", [packMail, origin])
    expect(claimed).toMatchObject({ status: "success", jobType: "SEND_EMAIL", attempts: 1 })
    expect(await rows<{ lease_owner: string; job_type: string }>("select lease_owner, job_type from admin_private.jobs")).toEqual([
      { lease_owner: "dev-mail-dispatch", job_type: "SEND_EMAIL" },
    ])
    expect(await rpc("dev_mail_dispatch_claim_v1", [packMail, origin])).toMatchObject({ status: "conflict", reason: "leased" })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'collect-mail-0001' and promoted_at is null")).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.jobs where job_type <> 'SEND_EMAIL'")).toBe(0)

    await db.query("update public.communications set delivery_status = 'PROVIDER_ACCEPTED' where id = $1", [completionMail])
    expect(await rpc("dev_mail_dispatch_claim_v1", [completionMail, origin])).toMatchObject({ status: "denied", reason: "not_send_email" })
    await db.query("update public.communications set delivery_status = 'ACCEPTANCE_UNKNOWN', first_provider_attempt_at = now() where id = $1", [completionMail])
    expect(await rpc("dev_mail_dispatch_claim_v1", [completionMail, origin])).toMatchObject({ status: "denied", reason: "not_send_email" })
    await db.exec("alter table public.communications disable trigger communications_fulfilment_email_guard")
    await db.query(
      `insert into public.communications(
        id, case_id, communication_type, recipient, subject, lifecycle, delivery_status, template_key, template_version,
        body_text, body_html, content_version, content_locked, customer_id, first_provider_attempt_at
      ) values ($1,$2,'CASE_UPDATE','alex@example.com','Your documents are ready','QUEUED','PROVIDER_ACCEPTED','GUIDED_PACK_READY',1,$3,$4,1,true,$5,now())`,
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", caseId, `The pack is ready.\n${packPage}`, `<p>The pack is ready.</p><p>${packPage}</p>`, customer],
    )
    await db.exec("alter table public.communications enable trigger communications_fulfilment_email_guard")
    expect(await rpc("dev_mail_dispatch_claim_v1", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", origin])).toMatchObject({ status: "denied", reason: "already_processed" })
    await db.query("update public.communications set lifecycle = 'CANCELLED' where id = any($1::uuid[])", [[mismatchMail, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]])
    expect(await count("select count(*)::int as n from admin_private.jobs")).toBe(1)

    const marker = await rows<{ provolatile: string; proconfig: string[] | null }>(
      "select provolatile, proconfig from pg_proc where oid = 'public.admin_pack_notification_status_v1(text,uuid,integer)'::regprocedure",
    )
    expect(marker).toEqual([{ provolatile: "v", proconfig: ["search_path=\"\""] }])
    const status = await rpc<Json>("admin_pack_notification_status_v1", [token, caseId, 300])
    expect(status.phase).toBe("processing")
    expect(status.stalled).toBe(false)
    const heartbeats = await rpc<Json>("admin_worker_heartbeats_v1", [token])
    expect(heartbeats.status).toBe("success")
    for (const signature of [
      "public.dev_mail_dispatch_candidates_v1(integer,text)",
      "public.dev_mail_dispatch_claim_v1(uuid,text)",
      "public.dev_mail_dispatch_inventory_v1(text)",
      "public.admin_pack_notification_status_v1(text,uuid,integer)",
      "public.admin_worker_heartbeats_v1(text)",
    ]) {
      expect((await rows<{ ok: boolean }>("select has_function_privilege('anon', $1, 'EXECUTE') as ok", [signature]))[0].ok).toBe(false)
      expect((await rows<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'EXECUTE') as ok", [signature]))[0].ok).toBe(true)
    }
  })
})
