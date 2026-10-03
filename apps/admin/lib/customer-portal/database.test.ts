import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, applyUpgrade, migrationSql, preparePlatform } from "../recovery/harness"

const appliedHead = "20261003120000"
const migration = "20261003125151_customer_portal_auth_foundation_v1.sql"
const db = new PGlite()

const alex = "22222222-2222-4222-8222-222222222222"
const sam = "77777777-7777-4777-8777-777777777777"
const pat = "33333333-3333-4333-8333-333333333333"
const riley = "44444444-4444-4444-8444-444444444444"
const quinn = "55555555-5555-4555-8555-555555555555"
const nia = "99999999-9999-4999-8999-999999999999"
const casey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const adminCustomer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const samAuth = "88888888-8888-4888-8888-888888888888"
const caseyAuth = "99991111-1111-4111-8111-111111111111"
const adminAuth = "11111111-1111-4111-8111-111111111111"
const verifier = "12121212-1212-4121-8121-121212121212"
const business = "34343434-3434-4343-8343-343434343434"
const location = "45454545-4545-4454-8454-454545454545"
const caseId = "56565656-5656-4565-8565-565656565656"

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

async function verify(customer: string, email: string) {
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1, 'email', $2, $3, 'Verified from a live call with the customer.')`,
    [customer, email, verifier],
  )
}

async function ageSend(customer: string) {
  await db.query(
    `update admin_private.customer_portal_login_rate
     set last_requested_at = now() - interval '61 seconds',
         window_started_at = case
           when send_count >= 5 then now() - interval '31 minutes'
           else least(window_started_at, now() - interval '61 seconds')
         end
     where customer_id = $1`,
    [customer],
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

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db, { through: appliedHead })
  const before = await count(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'customer_portal_session_v1'",
  )
  if (before !== 0) throw new Error("portal session function existed before the UX-10A upgrade")
  const upgraded = await applyUpgrade(db, appliedHead)
  if (upgraded.applied.map(item => item.entry.filename).join(",")) {
    if (upgraded.applied.at(-1)?.entry.filename !== migration) throw new Error(`upgrade stopped at ${upgraded.head}`)
  }
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now()),
      ('${caseyAuth}', 'casey@example.com', now()),
      ('${adminAuth}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${adminAuth}', enabled = true where singleton;
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com'),
      ('${pat}', 'Pat', 'pat@example.com'),
      ('${riley}', 'Riley', 'riley@example.com'),
      ('${quinn}', 'Quinn', 'quinn@example.com'),
      ('${nia}', 'Nia', 'nia@example.com'),
      ('${casey}', 'Casey', 'casey@example.com'),
      ('${adminCustomer}', 'Admin Customer', 'admin@profilerelaunch.com');
  `)
  for (const [id, email] of [
    [alex, "alex@example.com"],
    [sam, "sam@example.com"],
    [quinn, "quinn@example.com"],
    [nia, "nia@example.com"],
    [casey, "casey@example.com"],
    [adminCustomer, "admin@profilerelaunch.com"],
  ] as const) await verify(id, email)
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1, 'email', 'old@example.com', $2, 'Verified from a live call with the customer.')`,
    [riley, verifier],
  )
}, 180000)

afterAll(async () => { await db.close() })

describe("customer portal authentication migration", () => {
  it("upgrades the applied dev head and does not use active-service as a login gate", () => {
    const sql = migrationSql(migration)
    expect(sql).toContain("admin_private.verified_current_email_v1")
    expect(sql).not.toContain("customer_is_active_service_v1")
    expect(sql).not.toMatch(/ip_address|user_agent|refresh_token|otp_code/i)
  })

  it("stores only the declared columns", async () => {
    const columns = await rows<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'admin_private' and table_name like 'customer_portal_%'
       order by table_name, ordinal_position`,
    )
    const byTable = new Map<string, string[]>()
    for (const column of columns) byTable.set(column.table_name, [...(byTable.get(column.table_name) ?? []), column.column_name])
    expect(byTable.get("customer_portal_login_rate")).toEqual(["customer_id", "window_started_at", "send_count", "last_requested_at", "updated_at"])
    expect(byTable.get("customer_portal_login_challenges")).toEqual([
      "pending_hash", "customer_id", "expected_email_snapshot", "requested_at", "sent_at", "attempts", "expires_at", "consumed_at",
    ])
    expect(byTable.get("customer_portal_sessions")).toEqual([
      "token_hash", "customer_id", "auth_user_id", "email_snapshot", "authenticated_at", "created_at", "expires_at", "revoked_at", "revocation_reason",
    ])
  })

  it("rejects a pending hash that is not SHA-256 shaped", async () => {
    await expect(db.query(
      `insert into admin_private.customer_portal_login_challenges(
        pending_hash, customer_id, expected_email_snapshot, requested_at, expires_at
      ) values ('not-a-hash', $1, 'alex@example.com', now(), now() + interval '10 minutes')`,
      [alex],
    )).rejects.toThrow(/check|violates/i)
  })
})

describe("verified email eligibility", () => {
  it("lets the current verified email start and refuses unverified, stale, and Admin emails", async () => {
    const pending = hash(token())
    const started = await rpc<{ status: string; email?: string; customerId?: string }>("customer_portal_begin_login_v1", ["alex@example.com", pending])
    expect(started.status).toBe("ok")
    expect(started.email).toBe("alex@example.com")
    expect(started.customerId).toBe(alex)
    expect(await rpc<{ status: string }>("customer_portal_begin_login_v1", ["pat@example.com", hash(token())])).toEqual({ status: "ineligible" })
    expect(await rpc<{ status: string }>("customer_portal_begin_login_v1", ["riley@example.com", hash(token())])).toEqual({ status: "ineligible" })
    expect(await rpc<{ status: string }>("customer_portal_begin_login_v1", ["admin@profilerelaunch.com", hash(token())])).toEqual({ status: "ineligible" })
    expect(await rpc<{ status: string }>("customer_portal_begin_login_v1", ["missing@example.com", hash(token())])).toEqual({ status: "ineligible" })
    expect(await count("select count(*)::int as n from admin_private.customer_portal_login_challenges where pending_hash = $1", [pending])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.customer_portal_login_challenges where customer_id = $1", [pat])).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.customer_portal_login_challenges where customer_id = $1", [adminCustomer])).toBe(0)
  })

  it("does not persist the raw pending token and does not record a send until confirm", async () => {
    const raw = token()
    const pending = hash(raw)
    const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", ["sam@example.com", pending])
    expect(started.status).toBe("ok")
    const challenge = await rows<{ pending_hash: string; sent_at: string | null }>(
      "select pending_hash, sent_at from admin_private.customer_portal_login_challenges where pending_hash = $1",
      [pending],
    )
    expect(challenge[0].pending_hash).toBe(pending)
    expect(challenge[0].pending_hash).not.toBe(raw)
    expect(challenge[0].sent_at).toBeNull()
    expect(await count("select count(*)::int as n from admin_private.customer_portal_login_challenges where pending_hash = $1 or expected_email_snapshot = $1", [raw])).toBe(0)
    expect(await rpc<{ status: string }>("customer_portal_attempt_otp_v1", [pending])).toEqual({ status: "unavailable" })
    expect(await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])).toEqual({ status: "ok" })
    const sent = await rows<{ sent_at: string | null }>("select sent_at from admin_private.customer_portal_login_challenges where pending_hash = $1", [pending])
    expect(sent[0].sent_at).not.toBeNull()
  })
})

describe("customer-level OTP send throttling", () => {
  it("denies a second send inside 60 seconds even with a new pending token", async () => {
    const first = hash(token())
    const second = hash(token())
    expect((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["quinn@example.com", first])).status).toBe("ok")
    expect(await rpc<{ status: string }>("customer_portal_begin_login_v1", ["quinn@example.com", second])).toEqual({ status: "rate_limited" })
    expect(await count("select count(*)::int as n from admin_private.customer_portal_login_challenges where pending_hash = $1", [second])).toBe(0)
    expect(await count("select send_count::int as n from admin_private.customer_portal_login_rate where customer_id = $1", [quinn])).toBe(1)
  })

  it("allows five sends in the window and a different customer at the same time", async () => {
    await ageSend(quinn)
    for (let send = 2; send <= 5; send += 1) {
      const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", ["quinn@example.com", hash(token())])
      expect(started.status).toBe("ok")
      if (send < 5) await ageSend(quinn)
    }
    expect(await rpc<{ status: string }>("customer_portal_begin_login_v1", ["quinn@example.com", hash(token())])).toEqual({ status: "rate_limited" })
    expect(await count("select send_count::int as n from admin_private.customer_portal_login_rate where customer_id = $1", [quinn])).toBe(5)
    expect((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["nia@example.com", hash(token())])).status).toBe("ok")
    expect(await count("select send_count::int as n from admin_private.customer_portal_login_rate where customer_id = $1", [nia])).toBe(1)
  })

  it("does not let concurrent start requests exceed one send inside the cooldown", async () => {
    await ageSend(nia)
    const before = await count("select send_count::int as n from admin_private.customer_portal_login_rate where customer_id = $1", [nia])
    const results = await Promise.all([
      rpc<{ status: string }>("customer_portal_begin_login_v1", ["nia@example.com", hash(token())]),
      rpc<{ status: string }>("customer_portal_begin_login_v1", ["nia@example.com", hash(token())]),
    ])
    expect(results.map(result => result.status).sort()).toEqual(["ok", "rate_limited"])
    expect(await count("select send_count::int as n from admin_private.customer_portal_login_rate where customer_id = $1", [nia])).toBe(before + 1)
    expect(await count("select count(*)::int as n from admin_private.customer_portal_login_challenges where customer_id = $1", [nia])).toBe(before + 1)
  })
})

describe("portal challenges and sessions", () => {
  async function sentChallenge(email: string) {
    await releaseCooldown(email)
    const raw = token()
    const pending = hash(raw)
    const started = await rpc<{ status: string; email: string }>("customer_portal_begin_login_v1", [email, pending])
    expect(started.status).toBe("ok")
    expect(await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])).toEqual({ status: "ok" })
    return pending
  }

  it("stops after five verification attempts and refuses an expired or consumed challenge", async () => {
    const pending = await sentChallenge("alex@example.com")
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const allowed = await rpc<{ status: string; email?: string }>("customer_portal_attempt_otp_v1", [pending])
      expect(allowed).toMatchObject({ status: "ok", email: "alex@example.com" })
    }
    expect(await rpc<{ status: string }>("customer_portal_attempt_otp_v1", [pending])).toEqual({ status: "unavailable" })
    expect(await count("select attempts::int as n from admin_private.customer_portal_login_challenges where pending_hash = $1", [pending])).toBe(5)

    const expired = await sentChallenge("sam@example.com")
    await db.query(
      `update admin_private.customer_portal_login_challenges
       set requested_at = now() - interval '20 minutes', sent_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute'
       where pending_hash = $1`,
      [expired],
    )
    expect(await rpc<{ status: string }>("customer_portal_attempt_otp_v1", [expired])).toEqual({ status: "unavailable" })
  })

  it("keeps the previous sent fact when resend is cooled down and clears it only after a reserved resend", async () => {
    const pending = await sentChallenge("sam@example.com")
    expect(await rpc<{ status: string }>("customer_portal_begin_resend_v1", [pending])).toEqual({ status: "rate_limited" })
    expect((await rows<{ sent_at: string | null }>("select sent_at from admin_private.customer_portal_login_challenges where pending_hash = $1", [pending]))[0].sent_at).not.toBeNull()
    await releaseCooldown("sam@example.com")
    const resent = await rpc<{ status: string; email?: string }>("customer_portal_begin_resend_v1", [pending])
    expect(resent).toMatchObject({ status: "ok", email: "sam@example.com" })
    expect((await rows<{ sent_at: string | null }>("select sent_at from admin_private.customer_portal_login_challenges where pending_hash = $1", [pending]))[0].sent_at).toBeNull()
    expect(await rpc<{ status: string }>("customer_portal_attempt_otp_v1", [pending])).toEqual({ status: "unavailable" })
    expect(await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])).toEqual({ status: "ok" })
    expect((await rpc<{ status: string }>("customer_portal_attempt_otp_v1", [pending])).status).toBe("ok")
  })

  it("mints an eight-hour session from a new hash and refuses to replay the challenge", async () => {
    const pending = await sentChallenge("casey@example.com")
    const sessionRaw = token()
    const sessionHash = hash(sessionRaw)
    expect(sessionHash).not.toBe(pending)
    expect(await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, pending, alexAuth, "casey@example.com"])).toEqual({ status: "unavailable" })
    expect(await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, alexAuth, "someone@example.com"])).toEqual({ status: "unavailable" })
    expect(await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, adminAuth, "casey@example.com"])).toEqual({ status: "unavailable" })
    const finished = await rpc<{ status: string; customerId?: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, caseyAuth, "casey@example.com"])
    expect(finished).toEqual({ status: "ok" })
    expect(finished.customerId).toBeUndefined()
    const stored = await rows<{ token_hash: string; expires_at: string; authenticated_at: string }>(
      "select token_hash, expires_at, authenticated_at from admin_private.customer_portal_sessions where token_hash = $1",
      [sessionHash],
    )
    expect(stored[0].token_hash).toBe(sessionHash)
    expect(stored[0].token_hash).not.toBe(sessionRaw)
    const lifetime = new Date(stored[0].expires_at).getTime() - new Date(stored[0].authenticated_at).getTime()
    expect(lifetime).toBe(8 * 60 * 60 * 1000)
    const session = await rpc<{ customerId: string; email: string } | null>("customer_portal_session_v1", [sessionHash])
    expect(session).toMatchObject({ customerId: casey, email: "casey@example.com" })
    expect(await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, hash(token()), alexAuth, "casey@example.com"])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_portal_session_v1", [hash(token())])).toBeNull()
  })

  it("invalidates the session when the email changes or verification no longer matches", async () => {
    const pending = await sentChallenge("casey@example.com")
    await ageSend(casey)
    const sessionHash = hash(token())
    expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, caseyAuth, "casey@example.com"])).status).toBe("ok")
    await db.query("update public.customers set email = 'casey.new@example.com' where id = $1", [casey])
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()

    const again = hash(token())
    await db.query("update public.customers set email = 'casey@example.com' where id = $1", [casey])
    await verify(casey, "casey@example.com")
    await ageSend(casey)
    const replacement = await sentChallenge("casey@example.com")
    expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [replacement, again, caseyAuth, "casey@example.com"])).status).toBe("ok")
    await db.query(
      "update public.customer_contact_verifications set verified_value = 'stale@example.com' where customer_id = $1 and channel = 'email'",
      [casey],
    )
    expect(await rpc("customer_portal_session_v1", [again])).toBeNull()
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()
  })

  it("returns null for an expired or revoked session and sign-out is idempotent", async () => {
    await db.query("update public.customer_contact_verifications set verified_value = 'casey@example.com' where customer_id = $1 and channel = 'email'", [casey])
    await ageSend(casey)
    const pending = await sentChallenge("casey@example.com")
    const sessionHash = hash(token())
    expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, caseyAuth, "casey@example.com"])).status).toBe("ok")
    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now() - interval '2 hours', created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
       where token_hash = $1`,
      [sessionHash],
    )
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()
    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now(), created_at = now(), expires_at = now() + interval '8 hours', revoked_at = null
       where token_hash = $1`,
      [sessionHash],
    )
    expect(await rpc<{ customerId: string } | null>("customer_portal_session_v1", [sessionHash])).toMatchObject({ customerId: casey })
    expect(await rpc<{ status: string }>("customer_portal_sign_out_v1", [sessionHash])).toEqual({ status: "ok" })
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()
    expect(await rpc<{ status: string }>("customer_portal_sign_out_v1", [sessionHash])).toEqual({ status: "ok" })
    expect(await rpc<{ status: string }>("customer_portal_sign_out_v1", [hash(token())])).toEqual({ status: "ok" })
  })

  it("returns null when the Auth identity changes, is unconfirmed, deleted, or actively banned", async () => {
    await releaseCooldown("alex@example.com")
    const pending = await sentChallenge("alex@example.com")
    const sessionHash = hash(token())
    expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, alexAuth, "alex@example.com"])).status).toBe("ok")

    await db.query("update auth.users set email = 'moved@example.com' where id = $1", [alexAuth])
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()
    await db.query("update auth.users set email = 'alex@example.com' where id = $1", [alexAuth])
    expect(await rpc<{ customerId: string } | null>("customer_portal_session_v1", [sessionHash])).toMatchObject({ customerId: alex })

    await db.query("update auth.users set email_confirmed_at = null where id = $1", [alexAuth])
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [alexAuth])
    expect(await rpc<{ email: string } | null>("customer_portal_session_v1", [sessionHash])).toMatchObject({ email: "alex@example.com" })

    await db.query("update auth.users set deleted_at = now() where id = $1", [alexAuth])
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()
    await db.query("update auth.users set deleted_at = null where id = $1", [alexAuth])
    expect(await rpc<{ customerId: string } | null>("customer_portal_session_v1", [sessionHash])).toMatchObject({ customerId: alex })

    await db.query("update auth.users set banned_until = now() + interval '1 hour' where id = $1", [alexAuth])
    expect(await rpc("customer_portal_session_v1", [sessionHash])).toBeNull()
    const bannedPending = await sentChallenge("alex@example.com")
    expect(await rpc<{ status: string }>("customer_portal_finish_otp_v1", [bannedPending, hash(token()), alexAuth, "alex@example.com"])).toEqual({ status: "unavailable" })
    await db.query("update auth.users set banned_until = now() - interval '1 hour' where id = $1", [alexAuth])
    expect(await rpc<{ customerId: string } | null>("customer_portal_session_v1", [sessionHash])).toMatchObject({ customerId: alex })
  })
})

describe("action session and portal session stay separate", () => {
  it("does not accept either token as the other kind of session", async () => {
    await ageSend(alex)
    const pending = hash(token())
    expect((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["alex@example.com", pending])).status).toBe("ok")
    expect((await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])).status).toBe("ok")
    const portalHash = hash(token())
    expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, portalHash, alexAuth, "alex@example.com"])).status).toBe("ok")
    expect(await rpc("customer_action_session_v1", [portalHash])).toBeNull()

    await db.exec(`
      insert into public.businesses(id, display_name) values ('${business}', 'Bakery');
      insert into public.locations(id, business_id, country) values ('${location}', '${business}', 'UK');
      insert into public.cases(id, case_type, customer_id, business_id, location_id, issue_description, information_accurate_at, privacy_accepted_at, service_track)
      values ('${caseId}', 'PROFILE_RECOVERY', '${alex}', '${business}', '${location}', 'Profile suspended', now(), now(), 'MANAGED');
    `)
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
       values ($1, $2, 'verified', now(), $3, 'Companies House match discussed on a live call.')`,
      [alex, business, verifier],
    )
    const actionHash = hash(token())
    await db.query(
      `insert into public.customer_actions(
        customer_id, business_id, location_id, case_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by
      ) values ($1, $2, $3, $4, 'CASE_ACCESS', $5, 'alex@example.com', now() + interval '1 day', $6)`,
      [alex, business, location, caseId, hash(token()), verifier],
    )
    const actionId = (await rows<{ id: string }>("select id from public.customer_actions where case_id = $1", [caseId]))[0].id
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [actionHash, actionId, alexAuth],
    )
    const actionSession = await rpc<{ actionId?: string } | null>("customer_action_session_v1", [actionHash])
    expect(actionSession?.actionId).toBe(actionId)
    expect(await rpc("customer_portal_session_v1", [actionHash])).toBeNull()
    expect(await rpc("customer_action_session_v1", [portalHash])).toBeNull()
    const actionRows = await count("select count(*)::int as n from admin_private.customer_action_sessions")
    expect(await rpc<{ status: string }>("customer_portal_sign_out_v1", [portalHash])).toEqual({ status: "ok" })
    expect(await count("select count(*)::int as n from admin_private.customer_action_sessions")).toBe(actionRows)
    expect(await rpc<{ actionId?: string } | null>("customer_action_session_v1", [actionHash])).toMatchObject({ actionId })
  })
})

describe("portal privileges", () => {
  const wrappers = [
    "public.customer_portal_begin_login_v1(text,text)",
    "public.customer_portal_confirm_otp_sent_v1(text)",
    "public.customer_portal_begin_resend_v1(text)",
    "public.customer_portal_attempt_otp_v1(text)",
    "public.customer_portal_finish_otp_v1(text,text,uuid,text)",
    "public.customer_portal_session_v1(text)",
    "public.customer_portal_sign_out_v1(text)",
  ]
  const cores = [
    "admin_private.customer_portal_email_current_v1(uuid,text)",
    "admin_private.customer_portal_auth_identity_current_v1(uuid,text)",
    "admin_private.customer_portal_reserve_send_v1(uuid)",
    ...wrappers.map(signature => signature.replace("public.", "admin_private.")),
  ]

  async function canExecute(role: string, signature: string) {
    return (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
  }

  it("lets service_role execute only the public wrappers", async () => {
    for (const signature of wrappers) {
      expect(await canExecute("anon", signature)).toBe(false)
      expect(await canExecute("authenticated", signature)).toBe(false)
      expect(await canExecute("service_role", signature)).toBe(true)
    }
    for (const signature of cores) {
      expect(await canExecute("anon", signature)).toBe(false)
      expect(await canExecute("authenticated", signature)).toBe(false)
      expect(await canExecute("service_role", signature)).toBe(false)
    }
    const publicExecute = await rows<{ proname: string }>(
      `select p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.proname like 'customer_portal_%'
         and (p.proacl is null or exists (
           select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ))`,
    )
    expect(publicExecute).toEqual([])
  })

  it("does not grant browser roles or service_role direct table access", async () => {
    const tables = ["customer_portal_login_rate", "customer_portal_login_challenges", "customer_portal_sessions"]
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const table of tables) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          const allowed = await rows<{ ok: boolean }>("select has_table_privilege($1, $2, $3) as ok", [role, `admin_private.${table}`, privilege])
          expect(allowed[0].ok).toBe(false)
        }
      }
    }
    const secured = await rows<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'admin_private' and c.relkind = 'r' and c.relname like 'customer_portal_%'`,
    )
    expect(secured.map(row => row.relname).sort()).toEqual(tables.sort())
    expect(secured.every(row => row.relrowsecurity)).toBe(true)
    const policies = await count(
      `select count(*)::int as n from pg_policy pol
       join pg_class c on c.oid = pol.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'admin_private' and c.relname like 'customer_portal_%'`,
    )
    expect(policies).toBe(0)
    await db.exec("set role service_role")
    try {
      await expect(db.query("select * from admin_private.customer_portal_sessions")).rejects.toThrow(/permission denied/)
      await expect(db.query("select admin_private.customer_portal_session_v1('aa')")).rejects.toThrow(/permission denied/)
      expect(await rpc("customer_portal_session_v1", ["a".repeat(64)])).toBeNull()
    } finally {
      await db.exec("reset role")
    }
  })
})
