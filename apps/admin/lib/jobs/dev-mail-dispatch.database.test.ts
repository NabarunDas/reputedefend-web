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
  idempotencyKey?: string
  jobStatus?: string
  attempts?: number
  phase?: string
  stalled?: boolean
  eligible?: number
  wake?: string
  requestId?: number
  httpStatus?: number
  automatic?: boolean
  activation?: boolean
  schedule?: boolean
  workerHealthy?: boolean
  credentials?: boolean
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
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261029010000_dev_mail_shared_dispatch_v1.sql", import.meta.url), "utf8")
    expect(sql).not.toContain("job_promote_outbox_v1")
    expect(sql).not.toContain("job_claim_batch_v1")
    expect(sql).not.toContain("DEV_MAIL_ALLOWED_RECIPIENTS")
    expect(sql).not.toContain("PR-26-GHNLB9")
    const before = await rpc<Json>("dev_mail_dispatch_inventory_v1", [origin])
    expect(before.messages?.find(row => row.communicationId === packMail)).toMatchObject({ eligible: false, reason: "before_activation" })
    expect(await rpc<Json>("dev_mail_dispatch_recovery_v1", [])).toMatchObject({ status: "success", eligible: 0, wake: "not_needed" })
    expect(await rpc("dev_mail_dispatch_claim_v1", [packMail, origin])).toMatchObject({ status: "denied", reason: "before_activation" })
    await db.query("insert into admin_private.dev_mail_dispatch_activation(id, active_from, note) values (1, now() - interval '1 day', 'Disposable activation')")
    const inventory = await rpc<Json>("dev_mail_dispatch_inventory_v1", [origin])
    expect(inventory.status).toBe("success")
    expect(inventory.messages?.find(row => row.communicationId === packMail)).toMatchObject({ eligible: true, reason: "eligible", templateKey: "GUIDED_PACK_READY" })
    expect(inventory.messages?.find(row => row.communicationId === completionMail)).toMatchObject({ eligible: true, reason: "eligible", templateKey: "GUIDED_COMPLETION" })
    expect(inventory.messages?.find(row => row.communicationId === evidenceMail)).toMatchObject({ eligible: false, reason: "origin" })
    expect(inventory.messages?.find(row => row.communicationId === mismatchMail)).toMatchObject({ eligible: false, reason: "recipient_mismatch" })
    expect(JSON.stringify(inventory)).not.toContain("@")
    const recovered = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(recovered).toMatchObject({ status: "success", wake: "not_configured" })
    expect(recovered.eligible).toBeGreaterThan(0)
    const listed = await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, origin])
    expect(listed.communications?.map(row => row.communicationId)).toEqual([packMail, completionMail])
    expect(await rpc("dev_mail_dispatch_claim_v1", [evidenceMail, origin])).toMatchObject({ status: "denied", reason: "origin" })
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
    expect(await rpc("dev_mail_dispatch_claim_v1", [completionMail, origin])).toMatchObject({ status: "denied", reason: "already_processed" })
    await db.query("update public.communications set delivery_status = 'ACCEPTANCE_UNKNOWN', first_provider_attempt_at = now() where id = $1", [completionMail])
    expect(await rpc("dev_mail_dispatch_claim_v1", [completionMail, origin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
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
    const url = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/jobs/dev-mail-dispatch"
    const bearer = "b".repeat(32)
    const bypass = "p".repeat(32)
    const credentials = async (target: string | null, token: string | null, header: string | null) =>
      (await rows<{ value: Json }>("select admin_private.dev_mail_dispatch_wake_credentials_v1($1, $2, $3) as value", [target, token, header]))[0].value
    expect(await credentials(url, bearer, bypass)).toMatchObject({ ok: true })
    expect(await credentials(url, bearer, null)).toMatchObject({ ok: false, reason: "invalid_bypass" })
    expect(await credentials(url, bearer, "short-bypass")).toMatchObject({ ok: false, reason: "invalid_bypass" })
    expect(await credentials(url, "short-bearer", bypass)).toMatchObject({ ok: false, reason: "invalid_bearer" })
    expect(await credentials(url, `${bearer.slice(0, 16)} ${bearer.slice(16)}`, bypass)).toMatchObject({ ok: false, reason: "invalid_bearer" })
    expect(await credentials("https://admin.profilerelaunch.com/api/internal/jobs/dev-mail-dispatch", bearer, bypass)).toMatchObject({ ok: false, reason: "invalid_url" })
    expect(await credentials(`${url}?x-vercel-protection-bypass=${bypass}`, bearer, bypass)).toMatchObject({ ok: false, reason: "invalid_url" })
    expect(await credentials(null, bearer, bypass)).toMatchObject({ ok: false, reason: "invalid_url" })
    expect(sql).toContain("x-vercel-protection-bypass")
    expect(sql).not.toMatch(/x-vercel-protection-bypass=/)

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
    for (const signature of [
      "public.dev_mail_dispatch_readiness_v1()",
      "admin_private.dev_mail_dispatch_wake_credentials_v1(text,text,text)",
    ]) {
      expect((await rows<{ ok: boolean }>("select has_function_privilege('anon', $1, 'EXECUTE') as ok", [signature]))[0].ok).toBe(false)
      expect((await rows<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'EXECUTE') as ok", [signature]))[0].ok).toBe(true)
    }
    expect((await rows<{ ok: boolean }>("select has_function_privilege('service_role', 'admin_private.dev_mail_retry_due_v1(uuid)', 'EXECUTE') as ok"))[0].ok).toBe(false)
  })

  it("retries an explicit rejection once and leaves uncertain acceptance unsent", async () => {
    await db.query(
      "insert into admin_private.dev_mail_dispatch_activation(id, active_from, note) values (1, now() - interval '1 day', 'Disposable activation') on conflict (id) do nothing",
    )
    const readiness = await rpc<Json>("dev_mail_dispatch_readiness_v1", [])
    expect(readiness).toMatchObject({ status: "success", automatic: false, activation: true, schedule: false, credentials: false })
    await db.query(
      `insert into admin_private.job_worker_heartbeats(worker_name, environment, last_success_at, expected_interval_seconds, late_after_seconds)
       values ('dev-mail-dispatch', 'preview', now(), 300, 600)`,
    )
    expect(await rpc<Json>("dev_mail_dispatch_readiness_v1", [])).toMatchObject({
      status: "success", automatic: false, activation: true, schedule: false, workerHealthy: true, credentials: false,
    })
    await db.query(
      "update admin_private.job_worker_heartbeats set last_success_at = now() - interval '2 hours' where worker_name = 'dev-mail-dispatch'",
    )
    expect((await rpc<Json>("dev_mail_dispatch_readiness_v1", [])).workerHealthy).toBe(false)

    const retryMail = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const unknownMail = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    const exhaustedMail = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    const page = `${origin}/portal/cases/PR-26-MALL2A/documents`
    await db.exec("alter table public.communications disable trigger communications_fulfilment_email_guard")
    for (const id of [retryMail, unknownMail, exhaustedMail]) {
      await db.query(
        `insert into public.communications(
          id, case_id, communication_type, recipient, subject, lifecycle, delivery_status, template_key, template_version,
          body_text, body_html, content_version, content_locked, customer_id
        ) values ($1,$2,'CASE_UPDATE','alex@example.com','Your preparation is complete','QUEUED','NONE','GUIDED_COMPLETION',1,$3,$4,1,true,$5)`,
        [id, caseId, `The preparation is complete.\n${page}`, `<p>The preparation is complete.</p><p>${page}</p>`, customer],
      )
      await db.query(
        `select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'communication', $2::uuid, $3::jsonb, now() - interval '10 minutes')`,
        [`send-email:${id}:v1`, id, JSON.stringify({ communicationId: id, contentVersion: 1 })],
      )
    }
    await db.exec("alter table public.communications enable trigger communications_fulfilment_email_guard")

    const first = await rpc<Json>("dev_mail_dispatch_claim_v1", [retryMail, origin])
    expect(first).toMatchObject({ status: "success", attempts: 1, idempotencyKey: `send-email:${retryMail}:v1` })
    expect(await rpc<Json>("communication_begin_provider_attempt_v1", [retryMail, 1, first.idempotencyKey])).toMatchObject({
      status: "success", providerCallPermitted: true,
    })
    expect(await rpc<Json>("job_fail_v1", [first.jobId, first.leaseToken, "Email provider rejected the message", true])).toMatchObject({
      status: "success", jobStatus: "RETRY",
    })
    expect((await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, origin])).communications?.map(row => row.communicationId)).not.toContain(retryMail)
    await db.query("update admin_private.jobs set scheduled_at = now() - interval '1 minute' where id = $1", [first.jobId])
    const again = await rpc<Json>("dev_mail_dispatch_claim_v1", [retryMail, origin])
    expect(again).toMatchObject({ status: "success", attempts: 2, idempotencyKey: first.idempotencyKey, jobId: first.jobId })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [retryMail, origin])).toMatchObject({ status: "conflict", reason: "leased" })
    expect(await count("select count(*)::int as n from admin_private.jobs where idempotency_key = $1", [`send-email:${retryMail}:v1`])).toBe(1)

    const ambiguous = await rpc<Json>("dev_mail_dispatch_claim_v1", [unknownMail, origin])
    expect(ambiguous.status).toBe("success")
    expect(await rpc<Json>("communication_begin_provider_attempt_v1", [unknownMail, 1, ambiguous.idempotencyKey])).toMatchObject({ status: "success" })
    await db.query("update admin_private.jobs set lease_expires_at = now() - interval '1 minute' where id = $1", [ambiguous.jobId])
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [unknownMail, origin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    await db.query(
      "update public.communications set delivery_status = 'ACCEPTANCE_UNKNOWN' where id = $1",
      [unknownMail],
    )
    await db.query("update admin_private.jobs set status = 'RETRY', scheduled_at = now() - interval '1 minute', lease_expires_at = null where id = $1", [ambiguous.jobId])
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [unknownMail, origin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })

    const exhausted = await rpc<Json>("dev_mail_dispatch_claim_v1", [exhaustedMail, origin])
    expect(exhausted.status).toBe("success")
    expect(await rpc<Json>("communication_begin_provider_attempt_v1", [exhaustedMail, 1, exhausted.idempotencyKey])).toMatchObject({ status: "success" })
    expect(await rpc<Json>("job_fail_v1", [exhausted.jobId, exhausted.leaseToken, "Email provider rejected the message", true])).toMatchObject({ jobStatus: "RETRY" })
    await db.query("update admin_private.jobs set attempts = max_attempts, scheduled_at = now() - interval '1 minute' where id = $1", [exhausted.jobId])
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [exhaustedMail, origin])).toMatchObject({ status: "denied", reason: "dead_letter" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [exhaustedMail, origin])).toMatchObject({ status: "denied", reason: "dead_letter" })
    expect((await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, origin])).communications?.map(row => row.communicationId)).not.toContain(exhaustedMail)
    expect((await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, origin])).communications?.map(row => row.communicationId)).not.toContain(unknownMail)
  })

  it("allows a linkless reply, rejects a foreign link, and wakes with GET by response id", async () => {
    await db.query(
      "insert into admin_private.dev_mail_dispatch_activation(id, active_from, note) values (1, now() - interval '1 day', 'Disposable activation') on conflict (id) do nothing",
    )
    const reply = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    const foreign = "ffffffff-ffff-4fff-8fff-ffffffffffff"
    const guard = "12121212-1212-4212-8212-121212121212"
    const payment = "13131313-1313-4313-8313-131313131313"
    await db.exec("alter table public.communications disable trigger communications_fulfilment_email_guard")
    await db.query(
      `insert into public.communications(
        id, case_id, communication_type, recipient, subject, lifecycle, delivery_status, template_key, template_version,
        body_text, body_html, content_version, content_locked, customer_id
      ) values
        ($1,$2,'CASE_UPDATE','alex@example.com','A note on your case','QUEUED','NONE','CONVERSATION_REPLY',1,'We have reviewed the case and will write again.','<p>We have reviewed the case and will write again.</p>',1,true,$3),
        ($4,$2,'CASE_UPDATE','alex@example.com','A note on your case','QUEUED','NONE','CASE_UPDATE',1,'Please read https://customer.profilerelaunch.com/portal/cases/PR-26-MALL2A','<p>Please read https://customer.profilerelaunch.com/portal/cases/PR-26-MALL2A</p>',1,true,$3),
        ($5,$2,'CASE_UPDATE','alex@example.com','A monitoring note','QUEUED','NONE','GUARD_ALERT',1,'A new review was posted. No action is required today.','<p>A new review was posted. No action is required today.</p>',1,true,$3),
        ($6,$2,'CASE_UPDATE','alex@example.com','Payment received','QUEUED','NONE','PAYMENT_CONFIRMATION',1,'The payment was received.','<p>The payment was received.</p>',1,true,$3)`,
      [reply, caseId, customer, foreign, guard, payment],
    )
    await db.exec("alter table public.communications enable trigger communications_fulfilment_email_guard")
    for (const id of [reply, foreign, guard, payment]) {
      await db.query(
        `select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'communication', $2::uuid, $3::jsonb, now() - interval '10 minutes')`,
        [`send-email:${id}:v1`, id, JSON.stringify({ communicationId: id, contentVersion: 1 })],
      )
    }
    const listed = (await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, origin])).communications?.map(row => row.communicationId)
    expect(listed).toContain(reply)
    expect(listed).toContain(guard)
    expect(listed).not.toContain(foreign)
    expect(listed).not.toContain(payment)
    const inventory = await rpc<Json>("dev_mail_dispatch_inventory_v1", [origin])
    expect(inventory.messages?.find(row => row.communicationId === reply)).toMatchObject({ eligible: true, reason: "eligible", templateKey: "CONVERSATION_REPLY" })
    expect(inventory.messages?.find(row => row.communicationId === guard)).toMatchObject({ eligible: true, reason: "eligible", templateKey: "GUARD_ALERT" })
    expect(inventory.messages?.find(row => row.communicationId === foreign)).toMatchObject({ eligible: false, reason: "foreign_link" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [foreign, origin])).toMatchObject({ status: "denied", reason: "foreign_link" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [payment, origin])).toMatchObject({ status: "denied", reason: "payment_worker_owned" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [reply, origin])).toMatchObject({ status: "success", jobType: "SEND_EMAIL" })

    const dispatchUrl = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/jobs/dev-mail-dispatch"
    await db.exec(`
      CREATE SCHEMA net;
      CREATE TABLE net._http_response (
        id bigint PRIMARY KEY,
        status_code integer,
        content_type text,
        headers jsonb,
        content text,
        timed_out boolean,
        error_msg text,
        created timestamptz DEFAULT now()
      );
      CREATE TABLE net._http_request (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        method text NOT NULL CHECK (method = 'GET'),
        url text NOT NULL,
        headers jsonb,
        timeout_milliseconds integer
      );
      CREATE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 1000)
      RETURNS bigint LANGUAGE plpgsql AS $fn$
      DECLARE v_id bigint;
      BEGIN
        INSERT INTO net._http_request(method, url, headers, timeout_milliseconds)
        VALUES ('GET', url, headers, timeout_milliseconds)
        RETURNING id INTO v_id;
        RETURN v_id;
      END $fn$;
      CREATE SCHEMA vault;
      CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
    `)
    await db.query(
      `insert into vault.decrypted_secrets(name, decrypted_secret) values
        ('dev_mail_dispatch_url', $1),
        ('dev_mail_dispatch_bearer', $2),
        ('dev_mail_dispatch_bypass', $3)`,
      [dispatchUrl, "b".repeat(32), "p".repeat(32)],
    )
    const columns = (await rows<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'net' and table_name = '_http_response'",
    )).map(row => row.column_name)
    expect(columns).toEqual(expect.arrayContaining(["id", "status_code", "timed_out", "error_msg", "created"]))
    expect(columns).not.toContain("url")

    const queued = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(queued.status).toBe("pending")
    expect(queued.wake).toBe("requested")
    expect(queued.requestId).toBe(1)
    expect(JSON.stringify(queued)).not.toMatch(/delivered|PROVIDER_ACCEPTED|b{32}|p{32}/)
    const calls = await rows<{ method: string; url: string; headers: { Authorization?: string; "x-vercel-protection-bypass"?: string } }>(
      "select method, url, headers from net._http_request order by id",
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toBe(dispatchUrl)
    expect(calls[0].url).not.toContain("?")
    expect(calls[0].headers.Authorization).toBe(`Bearer ${"b".repeat(32)}`)
    expect(calls[0].headers["x-vercel-protection-bypass"]).toBe("p".repeat(32))
    expect(await rpc<Json>("dev_mail_dispatch_recovery_v1", [])).toMatchObject({ status: "pending", wake: "in_flight", requestId: 1 })
    expect(await count("select count(*)::int as n from net._http_request")).toBe(1)

    await db.query("insert into net._http_response(id, status_code, timed_out) values (1, 302, false)")
    expect(await rpc<Json>("dev_mail_dispatch_recovery_v1", [])).toMatchObject({ status: "blocked", wake: "blocked", httpStatus: 302, requestId: 1 })
    expect(await count("select count(*)::int as n from net._http_request")).toBe(1)

    const again = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(again).toMatchObject({ status: "pending", wake: "requested", requestId: 2 })
    await db.query("insert into net._http_response(id, status_code, timed_out) values (2, 401, false)")
    expect(await rpc<Json>("dev_mail_dispatch_recovery_v1", [])).toMatchObject({ status: "blocked", wake: "blocked", httpStatus: 401, requestId: 2 })
    expect(await count("select count(*)::int as n from net._http_request")).toBe(2)

    const forbidden = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(forbidden).toMatchObject({ status: "pending", wake: "requested", requestId: 3 })
    await db.query("insert into net._http_response(id, status_code, timed_out) values (3, 403, false)")
    expect(await rpc<Json>("dev_mail_dispatch_recovery_v1", [])).toMatchObject({ status: "blocked", wake: "blocked", httpStatus: 403, requestId: 3 })
    expect(await count("select count(*)::int as n from net._http_request")).toBe(3)

    const timed = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(timed).toMatchObject({ status: "pending", wake: "requested", requestId: 4 })
    await db.query("insert into net._http_response(id, status_code, timed_out, error_msg) values (4, null, true, 'timeout')")
    expect(await rpc<Json>("dev_mail_dispatch_recovery_v1", [])).toMatchObject({ status: "blocked", wake: "timed_out", requestId: 4 })
    expect(await count("select count(*)::int as n from net._http_request")).toBe(4)

    const retried = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(retried).toMatchObject({ status: "pending", wake: "requested", requestId: 5 })
    await db.query("update admin_private.dev_mail_dispatch_http set requested_at = now() - interval '10 minutes' where id = 1")
    expect(await rpc<Json>("dev_mail_dispatch_recovery_v1", [])).toMatchObject({ status: "blocked", wake: "missing", requestId: 5 })
    expect(await count("select count(*)::int as n from net._http_request")).toBe(5)

    const reached = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(reached).toMatchObject({ status: "pending", wake: "requested", requestId: 6 })
    await db.query("insert into net._http_response(id, status_code, timed_out) values (6, 200, false)")
    const followed = await rpc<Json>("dev_mail_dispatch_recovery_v1", [])
    expect(followed.status).toBe("pending")
    expect(followed.wake).toBe("requested")
    expect(followed.requestId).toBe(7)
    expect(JSON.stringify(followed)).not.toMatch(/delivered|PROVIDER_ACCEPTED/)
    expect(await count("select count(*)::int as n from net._http_request")).toBe(7)
  })
})
