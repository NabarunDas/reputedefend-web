import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const alex = "c10a0000-0000-4000-8000-0000000000a1"
const sam = "c10a0000-0000-4000-8000-0000000000b2"
const alexAuth = "c10a0000-0000-4000-8000-0000000000d4"
const samAuth = "c10a0000-0000-4000-8000-0000000000e5"
const verifier = "c10a0000-0000-4000-8000-0000000000a7"
const alexBusiness = "c10a0000-0000-4000-8000-000000000011"
const samBusiness = "c10a0000-0000-4000-8000-000000000012"
const alexLocation = "c10a0000-0000-4000-8000-000000000021"
const samLocation = "c10a0000-0000-4000-8000-000000000022"
const alexCase = "c10a0000-0000-4000-8000-000000000031"
const samCase = "c10a0000-0000-4000-8000-000000000032"
const sharedCase = "c10a0000-0000-4000-8000-000000000033"
const alexRef = "PR-26-AAAAAA"
const samRef = "PR-26-BBBBBB"
const sharedRef = "PR-26-CCCCCC"
const guessed = "PR-26-ZZZZZZ"
const hex = "ab".repeat(32)

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

let alexSession = ""
let samSession = ""

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}
async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}
async function verify(customer: string, email: string) {
  await db.query("delete from public.customer_contact_verifications where customer_id = $1 and channel = 'email'", [customer])
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1, 'email', $2, $3, 'Verified from a live call with the customer.')`,
    [customer, email, verifier],
  )
}
async function releaseCooldown(email: string) {
  await db.query(
    `update admin_private.customer_portal_login_rate r
     set last_requested_at = now() - interval '61 seconds',
         window_started_at = case
           when r.send_count >= 5 then now() - interval '31 minutes'
           else least(r.window_started_at, now() - interval '61 seconds')
         end
     from public.customers c
     where c.id = r.customer_id and lower(c.email) = $1`,
    [email],
  )
}
async function portalSession(email: string, authUser: string) {
  await releaseCooldown(email)
  const pending = hash(token())
  const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", [email, pending])
  if (started.status !== "ok") throw new Error(started.status)
  await rpc("customer_portal_confirm_otp_sent_v1", [pending])
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(finished.status)
  return sessionHash
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${verifier}', 'verifier@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now());
    insert into public.customers(id, full_name, email, phone) values
      ('${alex}', 'Alex Customer', 'alex@example.com', '+447700900111'),
      ('${sam}', 'Sam Customer', 'sam@example.com', '+447700900222');
    insert into public.businesses(id, display_name) values
      ('${alexBusiness}', 'ALEX_BUSINESS_SECRET'),
      ('${samBusiness}', 'SAM_BUSINESS_SECRET');
    insert into public.locations(id, business_id, country, location_name) values
      ('${alexLocation}', '${alexBusiness}', 'UK', 'ALEX_LOCATION_SECRET'),
      ('${samLocation}', '${samBusiness}', 'UK', 'SAM_LOCATION_SECRET');
  `)
  await verify(alex, "alex@example.com")
  await verify(sam, "sam@example.com")
  for (const item of [
    [alexCase, alexRef, alex, alexBusiness, alexLocation],
    [samCase, samRef, sam, samBusiness, samLocation],
    [sharedCase, sharedRef, sam, alexBusiness, alexLocation],
  ] as const) {
    await db.query(
      `insert into public.cases(
        id, public_ref, case_type, status, customer_id, business_id, location_id, issue_description,
        information_accurate_at, privacy_accepted_at, service_track, work_stage, submitted_at
      ) values ($1, $2, 'PROFILE_RECOVERY', 'UNDER_REVIEW', $3, $4, $5, 'Synthetic issue', now(), now(), 'GUIDED', 'EVIDENCE_COLLECTION', now())`,
      [...item],
    )
  }
  alexSession = await portalSession("alex@example.com", alexAuth)
  samSession = await portalSession("sam@example.com", samAuth)
}, 180000)

afterAll(async () => { await db.close() })

function serialised(value: unknown) {
  return JSON.stringify(value)
}

describe("whole customer portal ownership", () => {
  it("shows Alex only Alex's cases, including when Sam shares the business and location", async () => {
    const dashboard = await rpc("customer_portal_dashboard_v1", [alexSession])
    const cases = await rpc("customer_portal_cases_v1", [alexSession, "all", null, null])
    const text = `${serialised(dashboard)}\n${serialised(cases)}`
    expect(text).toContain(alexRef)
    expect(text).toContain("ALEX_BUSINESS_SECRET")
    expect(text).not.toContain(samRef)
    expect(text).not.toContain(sharedRef)
    expect(text).not.toContain("SAM_BUSINESS_SECRET")
    expect(text).not.toContain("sam@example.com")
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  it("returns the same not-found result for a missing reference and for Sam's references", async () => {
    const reads = [
      "customer_portal_case_v1",
      "customer_portal_case_documents_v1",
      "customer_portal_case_service_v1",
      "customer_portal_case_payments_v1",
    ]
    for (const name of reads) {
      const missing = await rpc(name, [alexSession, guessed])
      const other = await rpc(name, [alexSession, samRef])
      const shared = await rpc(name, [alexSession, sharedRef])
      const own = await rpc(name, [alexSession, alexRef])
      expect(other).toEqual(missing)
      expect(shared).toEqual(missing)
      expect(serialised(own)).toContain(alexRef)
      expect(serialised(other)).not.toContain(samRef)
      expect(serialised(shared)).not.toContain(sharedRef)
      expect(serialised(other)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    }
    const ownCase = await rpc<{ found?: boolean }>("customer_portal_case_v1", [samSession, samRef])
    expect(ownCase.found).toBe(true)
  })

  it("keeps Sam's business name out of Alex's document, payment, Guard, and message lists", async () => {
    const documents = serialised(await rpc("customer_portal_documents_v1", [alexSession]))
    const payments = serialised(await rpc("customer_portal_payments_v1", [alexSession]))
    const guard = serialised(await rpc("customer_portal_guard_v1", [alexSession]))
    const messages = serialised(await rpc("customer_portal_messages_v1", [alexSession, null, null]))
    expect(`${documents}\n${payments}\n${guard}\n${messages}`).not.toContain("SAM_BUSINESS_SECRET")
  })

  // These selectors were never created. A matching not-found result shows that
  // an unknown selector is refused. Real Customer B selector denial is proved
  // in documents-evidence, quotes-agreements, payments-receipts,
  // relaunch-guard, and messages-account database tests.
  it("returns not-found for unknown document, receipt, invoice, Guard, and message selectors", async () => {
    expect(await rpc("customer_portal_document_resolve_v1", [alexSession, samRef, "pd-1"])).toEqual(
      await rpc("customer_portal_document_resolve_v1", [alexSession, guessed, "pd-1"]),
    )
    expect(await rpc("customer_portal_receipt_v1", [alexSession, `rc-${hex}`])).toEqual({ status: "not_found" })
    expect(await rpc("customer_portal_invoice_target_v1", [alexSession, samRef, `ca-${hex}`])).toEqual(
      await rpc("customer_portal_invoice_target_v1", [alexSession, guessed, `ca-${hex}`]),
    )
    expect(await rpc("customer_portal_guard_location_v1", [alexSession, `gd-${hex}`])).toEqual({ found: false })
    expect(await rpc("customer_portal_message_v1", [alexSession, `mc-${hex}`])).toEqual({ found: false })
    expect(await rpc("customer_portal_message_v1", [alexSession, `mm-${hex}`])).toEqual({ found: false })
    const evidence = await rpc<{ status?: string }>("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), samRef, "er-1", "note.pdf", "application/pdf", 1200, "evidence-bucket",
    ])
    const missingEvidence = await rpc<{ status?: string }>("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), guessed, "er-1", "note.pdf", "application/pdf", 1200, "evidence-bucket",
    ])
    expect(evidence).toEqual(missingEvidence)
    expect(evidence.status).not.toBe("success")
    const service = await rpc<{ status?: string }>("customer_portal_service_command_v1", [
      alexSession, randomUUID(), sharedRef, `ca-${hex}`, "accept_quote", {},
    ])
    expect(service.status).not.toBe("success")
    expect(serialised(service)).not.toContain("SAM_BUSINESS_SECRET")
    const payment = await rpc<{ status?: string }>("customer_portal_payment_command_v1", [
      alexSession, randomUUID(), samRef, `ca-${hex}`, "start_checkout", {},
    ])
    expect(payment.status).not.toBe("success")
    const guardCommand = await rpc<{ status?: string }>("customer_portal_guard_command_v1", [
      alexSession, randomUUID(), `gd-${hex}`, `ca-${hex}`, "accept", {},
    ])
    expect(guardCommand.status).not.toBe("success")
  })

  it("returns only the signed-in account and fails closed when the verified email changes", async () => {
    const account = await rpc<{ email?: string; name?: string }>("customer_portal_account_v1", [alexSession])
    expect(account).toMatchObject({ name: "Alex Customer", email: "alex@example.com", emailVerified: true })
    expect(serialised(account)).not.toContain("sam@example.com")
    expect(serialised(account)).not.toContain(alex)
    try {
      await db.query("update public.customers set email = 'alex.moved@example.com' where id = $1", [alex])
      await verify(alex, "alex.moved@example.com")
      await db.query("update auth.users set email = 'alex.moved@example.com' where id = $1", [alexAuth])
      for (const call of [
        () => rpc("customer_portal_dashboard_v1", [alexSession]),
        () => rpc("customer_portal_cases_v1", [alexSession, "active", null, null]),
        () => rpc("customer_portal_case_v1", [alexSession, alexRef]),
        () => rpc("customer_portal_documents_v1", [alexSession]),
        () => rpc("customer_portal_case_documents_v1", [alexSession, alexRef]),
        () => rpc("customer_portal_case_service_v1", [alexSession, alexRef]),
        () => rpc("customer_portal_payments_v1", [alexSession]),
        () => rpc("customer_portal_case_payments_v1", [alexSession, alexRef]),
        () => rpc("customer_portal_guard_v1", [alexSession]),
        () => rpc("customer_portal_messages_v1", [alexSession, null, null]),
        () => rpc("customer_portal_account_v1", [alexSession]),
      ]) expect(await call()).toBeNull()
    } finally {
      await db.query("update public.customers set email = 'alex@example.com' where id = $1", [alex])
      await verify(alex, "alex@example.com")
      await db.query("update auth.users set email = 'alex@example.com' where id = $1", [alexAuth])
    }
    expect(await rpc("customer_portal_account_v1", [alexSession])).toMatchObject({ email: "alex@example.com" })
    await db.query("update auth.users set email_confirmed_at = null where id = $1", [alexAuth])
    expect(await rpc("customer_portal_messages_v1", [alexSession, null, null])).toBeNull()
    await db.query("update auth.users set email_confirmed_at = now(), banned_until = now() + interval '1 day' where id = $1", [alexAuth])
    expect(await rpc("customer_portal_guard_v1", [alexSession])).toBeNull()
    await db.query("update auth.users set banned_until = null where id = $1", [alexAuth])
    expect(await rpc("customer_portal_account_v1", [alexSession])).toMatchObject({ email: "alex@example.com" })
  })

  it("revokes only the portal session and keeps the eight-hour lifetime fixed", async () => {
    const actionCount = async () => (await rows<{ n: number }>("select count(*)::int as n from admin_private.customer_action_sessions"))[0].n
    const before = await actionCount()
    const current = await portalSession("alex@example.com", alexAuth)
    const lifetime = await rows<{ hours: number }>(
      `select extract(epoch from (expires_at - authenticated_at)) / 3600 as hours
       from admin_private.customer_portal_sessions where token_hash = $1`,
      [current],
    )
    expect(Number(lifetime[0].hours)).toBe(8)
    const source = await rows<{ body: string }>(
      `select p.prosrc as body from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'admin_private' and p.proname = 'customer_portal_session_v1'`,
    )
    expect(source[0].body).not.toMatch(/update\s+admin_private\.customer_portal_sessions/i)
    expect(await rpc("customer_portal_sign_out_v1", [current])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_portal_account_v1", [current])).toBeNull()
    expect(await rpc("customer_portal_dashboard_v1", [alexSession])).toMatchObject({ summary: expect.any(Object) })
    expect(await actionCount()).toBe(before)
    expect(await rpc("customer_portal_account_v1", [hash(token())])).toBeNull()
  })
})

describe("whole customer portal privileges", () => {
  it("keeps public portal RPCs on service_role and private helpers unexecutable", async () => {
    const functions = await rows<{ schema: string; name: string; args: string; oid: string; definer: boolean; config: string[] | null }>(
      `select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
              p.oid::text as oid, p.prosecdef as definer, p.proconfig as config
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.proname like 'customer_portal\\_%' escape '\\'
         and n.nspname in ('public', 'admin_private')
       order by 1, 2, 3`,
    )
    expect(functions.length).toBeGreaterThan(20)
    const failures: string[] = []
    for (const item of functions) {
      const signature = `${item.schema}.${item.name}(${item.args})`
      const config = (item.config ?? []).join(" ")
      if (!/search_path=/.test(config) || /search_path=(?!"")\S/.test(config)) failures.push(`${signature} search_path ${config || "unset"}`)
      if (item.schema === "public" && !item.definer) failures.push(`${signature} is not security definer`)
      for (const role of ["public", "anon", "authenticated"]) {
        const allowed = (await rows<{ ok: boolean }>("select has_function_privilege($1, $2::oid, 'EXECUTE') as ok", [role, item.oid]))[0].ok
        if (allowed) failures.push(`${role} can execute ${signature}`)
      }
      const service = (await rows<{ ok: boolean }>("select has_function_privilege('service_role', $1::oid, 'EXECUTE') as ok", [item.oid]))[0].ok
      if (item.schema === "public" && !service) failures.push(`service_role cannot execute ${signature}`)
      if (item.schema === "admin_private" && service) failures.push(`service_role can execute ${signature}`)
    }
    expect(failures).toEqual([])
  })

  it("keeps portal auth tables private and row-protected", async () => {
    const tables = await rows<{ name: string; rls: boolean }>(
      `select c.relname as name, c.relrowsecurity as rls
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'admin_private' and c.relkind = 'r' and c.relname like 'customer_portal%'
       order by 1`,
    )
    expect(tables.map(table => table.name)).toEqual([
      "customer_portal_login_challenges",
      "customer_portal_login_rate",
      "customer_portal_sessions",
    ])
    expect(tables.every(table => table.rls)).toBe(true)
    const grants = await rows<{ name: string; grantee: string }>(
      `select table_name as name, grantee
       from information_schema.role_table_grants
       where table_schema = 'admin_private' and table_name like 'customer_portal%'
         and grantee in ('anon', 'authenticated', 'PUBLIC', 'public')`,
    )
    expect(grants).toEqual([])
    const policies = await rows<{ name: string }>(
      `select pol.polname as name
       from pg_policy pol
       join pg_class c on c.oid = pol.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'admin_private' and c.relname like 'customer_portal%'`,
    )
    expect(policies).toEqual([])
  })
})
