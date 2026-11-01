import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const adminToken = "ab".repeat(32)
const preserved = "10101010-1010-4101-8101-101010101010"
const preservedEmail = "preserved@example.com"
const preservedBusiness = "20202020-2020-4202-8202-202020202020"
const otherCustomer = "30303030-3030-4303-8303-303030303030"
const otherEmail = "other@example.com"
const otherBusiness = "40404040-4040-4404-8404-404040404040"
const sql = readFileSync(new URL("../../../../supabase/migrations/20261101190000_customer_invited_mailbox_otp_v1.sql", import.meta.url), "utf8")

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

type Status = { status: string; email?: string; customerId?: string }

async function rows<T>(statement: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(statement, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const statement = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(statement, args)).rows[0].value
}

async function count(statement: string, params: unknown[] = []): Promise<number> {
  return Number((await rows<{ n: number }>(statement, params))[0]?.n ?? 0)
}

async function fails(statement: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(statement, params)
    return ""
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function person(label: string) {
  const id = randomUUID()
  const auth = randomUUID()
  const email = `${label}.${id.slice(0, 8)}@example.com`
  await db.query(
    "insert into public.customers(id, full_name, email) values ($1, $2, $3)",
    [id, "Alex Customer", email],
  )
  await db.query(
    "insert into auth.users(id, email, email_confirmed_at) values ($1, $2, now())",
    [auth, email],
  )
  return { id, auth, email }
}

async function business(name: string) {
  const id = randomUUID()
  await db.query("insert into public.businesses(id, display_name) values ($1, $2)", [id, name])
  return id
}

async function membership(customer: string, businessId: string, status: "pending" | "verified" | "revoked") {
  const verified = status === "verified"
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      customer,
      businessId,
      status,
      verified ? new Date().toISOString() : null,
      verified ? admin : null,
      verified ? "Ownership was checked with the caller." : "Membership is waiting for an ownership check.",
    ],
  )
}

async function invite(customer: string, email: string, options: { createdAt?: string; expiresAt?: string } = {}) {
  const request = randomUUID()
  await db.query(
    `insert into public.onboarding_requests(id, customer_id, email_snapshot, product_code, plan_family, state)
     values ($1, $2, $3, 'TELLOYA', 'VOICE', 'MAILBOX_REQUIRED')`,
    [request, customer, email],
  )
  const secret = token()
  const invitationHash = hash(secret)
  if (options.createdAt && options.expiresAt) {
    await db.query(
      `insert into admin_private.onboarding_invitations(
         token_hash, onboarding_request_id, email_snapshot, customer_id, created_at, expires_at
       ) values ($1, $2, $3, $4, $5, $6)`,
      [invitationHash, request, email, customer, options.createdAt, options.expiresAt],
    )
  } else {
    await db.query(
      `insert into admin_private.onboarding_invitations(
         token_hash, onboarding_request_id, email_snapshot, customer_id, expires_at
       ) values ($1, $2, $3, $4, now() + interval '7 days')`,
      [invitationHash, request, email, customer],
    )
  }
  return { request, secret, invitationHash }
}

async function begin(invitationHash: string) {
  const pending = hash(token())
  const started = await rpc<Status>("customer_portal_begin_invited_login_v1", [invitationHash, pending])
  return { pending, started }
}

async function confirm(pending: string, invitationHash: string) {
  return rpc<Status>("customer_portal_confirm_invited_otp_sent_v1", [pending, invitationHash])
}

async function finish(pending: string, invitationHash: string, auth: string, email: string) {
  const session = hash(token())
  const finished = await rpc<Status>("customer_portal_finish_invited_otp_v1", [pending, session, auth, email, invitationHash])
  return { session, finished }
}

async function ageGap(customer: string) {
  await db.query(
    `update admin_private.customer_portal_login_rate
     set last_requested_at = now() - interval '61 seconds',
         window_started_at = least(window_started_at, now() - interval '61 seconds')
     where customer_id = $1`,
    [customer],
  )
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${adminToken}', '${admin}');
    insert into public.product_catalogue(code, name, kind, status) values ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT');
    insert into public.customers(id, full_name, email) values ('${preserved}', 'Preserved Customer', '${preservedEmail}');
    insert into public.customers(id, full_name, email) values ('${otherCustomer}', 'Other Customer', '${otherEmail}');
    insert into public.businesses(id, display_name) values ('${preservedBusiness}', 'Preserved Shop');
    insert into public.businesses(id, display_name) values ('${otherBusiness}', 'Other Shop');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${preserved}', 'email', '${preservedEmail}', '${admin}', 'Verified from a live call with the customer.');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${otherCustomer}', 'email', '${otherEmail}', '${admin}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
      values ('${otherCustomer}', '${otherBusiness}', 'verified', now(), '${admin}', 'Ownership was checked with the caller.');
    insert into auth.users(id, email, email_confirmed_at)
      values ('${"50505050-5050-4505-8505-505050505050"}', '${otherEmail}', now());
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("invited mailbox OTP", () => {
  it("adds mailbox proof without rewriting stored verification rows or enabling mail", async () => {
    expect(sql).toContain("proof_kind")
    expect(sql).toContain("MAILBOX_OTP")
    expect(sql).toContain("set_config('admin_private.mailbox_otp', '1', true)")
    expect(sql).toContain("CONTACT_VERIFIED")
    expect(sql).not.toMatch(/UPDATE\s+public\.customer_contact_verifications/i)
    expect(sql).not.toContain("SEND_EMAIL")
    expect(sql).not.toMatch(/stripe|retell/i)
    expect(sql).not.toContain("INSERT INTO public.communications")
    const preservedProof = await rows<{ proof_kind: string; verified_by: string }>(
      "select proof_kind, verified_by from public.customer_contact_verifications where customer_id = $1",
      [preserved],
    )
    expect(preservedProof).toEqual([{ proof_kind: "ADMIN_RECORDED", verified_by: admin }])
    const guest = await person("plain")
    await db.query(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
       values ($1, 'email', $2, $3, 'Verified from a live call with the customer.')`,
      [guest.id, guest.email, admin],
    )
    expect(await rows<{ proof_kind: string }>(
      "select proof_kind from public.customer_contact_verifications where customer_id = $1",
      [guest.id],
    )).toEqual([{ proof_kind: "ADMIN_RECORDED" }])
    expect(await fails(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence, proof_kind)
       values ($1, 'email', $2, null, $3, 'MAILBOX_OTP')`,
      [guest.id, guest.email, "a".repeat(64)],
    )).toMatch(/mailbox proof is not authorised/i)
    expect(await fails(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, evidence, proof_kind)
       values ($1, 'phone', '07000000000', 'Recorded without an actor.', 'ADMIN_RECORDED')`,
      [guest.id],
    )).toMatch(/recorded proof needs an actor/i)
  })

  it("keeps the admin verification command and its audit", async () => {
    const guest = await person("adminproof")
    const verified = await rpc<{ status: string }>("admin_contact_verify_v1", [
      adminToken, guest.id, 1, "email", "Verified from a live call with the customer.", randomUUID(),
    ])
    expect(verified.status).toBe("success")
    expect(await rows<{ proof_kind: string; verified_by: string }>(
      "select proof_kind, verified_by from public.customer_contact_verifications where customer_id = $1",
      [guest.id],
    )).toEqual([{ proof_kind: "ADMIN_RECORDED", verified_by: admin }])
    expect(await count(
      "select count(*)::int as n from public.admin_audit_events where action = 'CONTACT_VERIFIED' and outcome = 'success' and target_id = $1",
      [guest.id],
    )).toBe(1)
  })

  it("returns the same unavailable result for unknown, expired, consumed, changed, declined and closed invitations", async () => {
    const unknown = await begin(hash(token()))
    expect(unknown.started).toEqual({ status: "unavailable" })
    expect(JSON.stringify(unknown.started)).not.toMatch(/@|customer|business|shop/i)
    expect(await count("select count(*)::int as n from admin_private.customer_portal_login_challenges where pending_hash = $1", [unknown.pending])).toBe(0)

    const expiredPerson = await person("expired")
    const expired = await invite(expiredPerson.id, expiredPerson.email, {
      createdAt: "2026-10-01T00:00:00Z",
      expiresAt: "2026-10-02T00:00:00Z",
    })
    const expiredStart = await begin(expired.invitationHash)
    expect(expiredStart.started).toEqual(unknown.started)

    const rawPerson = await person("raw")
    const raw = await invite(rawPerson.id, rawPerson.email)
    expect((await begin(raw.secret)).started).toEqual(unknown.started)

    const changed = await person("changed")
    const changedInvite = await invite(changed.id, changed.email)
    await db.query("update public.customers set email = $2 where id = $1", [changed.id, `moved.${changed.id.slice(0, 8)}@example.com`])
    expect((await begin(changedInvite.invitationHash)).started).toEqual(unknown.started)

    const declined = await person("declined")
    const declinedInvite = await invite(declined.id, declined.email)
    await db.query(
      "update public.onboarding_requests set state = 'DECLINED', decline_reason = $2 where id = $1",
      [declinedInvite.request, "Customer declined this onboarding request."],
    )
    expect((await begin(declinedInvite.invitationHash)).started).toEqual(unknown.started)

    const closed = await person("closed")
    const closedInvite = await invite(closed.id, closed.email)
    await db.query("update public.onboarding_requests set state = 'CLOSED' where id = $1", [closedInvite.request])
    expect((await begin(closedInvite.invitationHash)).started).toEqual(unknown.started)

    expect(await count("select count(*)::int as n from admin_private.customer_portal_sessions")).toBe(0)
  })

  it("refuses an already verified customer and leaves ordinary login in place", async () => {
    const verified = await person("verified")
    await db.query(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
       values ($1, 'email', $2, $3, 'Verified from a live call with the customer.')`,
      [verified.id, verified.email, admin],
    )
    const open = await invite(verified.id, verified.email)
    const started = await begin(open.invitationHash)
    expect(started.started).toEqual({ status: "unavailable" })
    expect(await count(
      "select count(*)::int as n from admin_private.customer_portal_login_challenges where customer_id = $1 and invitation_hash is not null",
      [verified.id],
    )).toBe(0)
    const pending = hash(token())
    const ordinary = await rpc<Status>("customer_portal_begin_login_v1", [verified.email, pending])
    expect(ordinary.status).toBe("ok")
    expect(await rpc<Status>("customer_portal_confirm_otp_sent_v1", [pending])).toEqual({ status: "ok" })
    const invitedFinish = await finish(pending, open.invitationHash, verified.auth, verified.email)
    expect(invitedFinish.finished).toEqual({ status: "unavailable" })
    expect(await count("select count(*)::int as n from admin_private.customer_portal_sessions where customer_id = $1", [verified.id])).toBe(0)
    const session = hash(token())
    expect(await rpc<Status>("customer_portal_finish_otp_v1", [pending, session, verified.auth, verified.email])).toEqual({ status: "ok" })
    expect(await count("select count(*)::int as n from admin_private.customer_portal_sessions where token_hash = $1", [session])).toBe(1)
    const fresh = await person("stillunverified")
    expect((await rpc<Status>("customer_portal_begin_login_v1", [fresh.email, hash(token())])).status).toBe("ineligible")
  })

  it("does not let an ordinary OTP finish an invited challenge, or the reverse", async () => {
    const guest = await person("bound")
    const open = await invite(guest.id, guest.email)
    const started = await begin(open.invitationHash)
    expect(started.started.status).toBe("ok")
    expect(Object.keys(started.started).sort()).toEqual(["customerId", "email", "status"])
    expect(await rpc<Status>("customer_portal_confirm_otp_sent_v1", [started.pending])).toEqual({ status: "unavailable" })
    expect(await rpc<Status>("customer_portal_attempt_otp_v1", [started.pending])).toEqual({ status: "unavailable" })
    expect(await confirm(started.pending, open.invitationHash)).toEqual({ status: "ok" })
    const ordinaryFinish = await rpc<Status>("customer_portal_finish_otp_v1", [started.pending, hash(token()), guest.auth, guest.email])
    expect(ordinaryFinish).toEqual({ status: "unavailable" })
    expect(await count("select count(*)::int as n from public.customer_contact_verifications where customer_id = $1", [guest.id])).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.customer_portal_sessions where customer_id = $1", [guest.id])).toBe(0)
    const mismatch = await finish(started.pending, hash(token()), guest.auth, guest.email)
    expect(mismatch.finished).toEqual({ status: "unavailable" })
    expect(await count("select count(*)::int as n from public.customer_contact_verifications where customer_id = $1", [guest.id])).toBe(0)
  })

  it("stops after five code attempts and throttles resends", async () => {
    const guest = await person("attempts")
    const open = await invite(guest.id, guest.email)
    const started = await begin(open.invitationHash)
    expect(await confirm(started.pending, open.invitationHash)).toEqual({ status: "ok" })
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await rpc<Status>("customer_portal_attempt_invited_otp_v1", [started.pending, open.invitationHash])).status).toBe("ok")
    }
    expect(await rpc<Status>("customer_portal_attempt_invited_otp_v1", [started.pending, open.invitationHash])).toEqual({ status: "unavailable" })
    expect(await count(
      "select attempts::int as n from admin_private.customer_portal_login_challenges where pending_hash = $1",
      [started.pending],
    )).toBe(5)
    expect(await rpc<Status>("customer_portal_begin_invited_resend_v1", [started.pending, open.invitationHash])).toEqual({ status: "rate_limited" })
    await ageGap(guest.id)
    const resent = await rpc<Status>("customer_portal_begin_invited_resend_v1", [started.pending, open.invitationHash])
    expect(resent.status).toBe("ok")
    expect(await count(
      "select attempts::int as n from admin_private.customer_portal_login_challenges where pending_hash = $1",
      [started.pending],
    )).toBe(0)
    for (let send = 3; send <= 5; send += 1) {
      await ageGap(guest.id)
      expect((await rpc<Status>("customer_portal_begin_invited_resend_v1", [started.pending, open.invitationHash])).status).toBe("ok")
    }
    await ageGap(guest.id)
    expect(await rpc<Status>("customer_portal_begin_invited_resend_v1", [started.pending, open.invitationHash])).toEqual({ status: "rate_limited" })
    await db.query(
      `update admin_private.customer_portal_login_rate
       set window_started_at = now() - interval '31 minutes',
           last_requested_at = now() - interval '31 minutes'
       where customer_id = $1`,
      [guest.id],
    )
    expect((await rpc<Status>("customer_portal_begin_invited_resend_v1", [started.pending, open.invitationHash])).status).toBe("ok")
    expect(await fails(
      "update admin_private.onboarding_invitations set send_count = 1 where token_hash = $1",
      [open.invitationHash],
    )).toMatch(/invitation email is not enabled/i)
    expect(await count("select send_count::int as n from admin_private.onboarding_invitations where token_hash = $1", [open.invitationHash])).toBe(0)
  })

  it("records one mailbox proof, one portal session, and no business access", async () => {
    const beforeComms = await count("select count(*)::int as n from public.communications")
    const beforeEntitlements = await count("select count(*)::int as n from public.product_entitlements")
    const beforeSubscriptions = await count("select count(*)::int as n from public.commercial_subscriptions")
    const beforePayments = await count("select count(*)::int as n from public.commercial_payment_evidence")
    const preservedBefore = await rows(
      "select proof_kind, verified_by, evidence from public.customer_contact_verifications where customer_id = $1",
      [preserved],
    )
    const guest = await person("success")
    const pendingBusiness = await business("Pending Shop")
    const revokedBusiness = await business("Revoked Shop")
    await membership(guest.id, pendingBusiness, "pending")
    await membership(guest.id, revokedBusiness, "revoked")
    const open = await invite(guest.id, guest.email)
    const started = await begin(open.invitationHash)
    expect(started.started).toMatchObject({ status: "ok", email: guest.email, customerId: guest.id })
    expect(await confirm(started.pending, open.invitationHash)).toEqual({ status: "ok" })
    expect(await count("select count(*)::int as n from admin_private.customer_portal_sessions where customer_id = $1", [guest.id])).toBe(0)
    const done = await finish(started.pending, open.invitationHash, guest.auth, guest.email)
    expect(done.finished).toEqual({ status: "ok" })
    const proofs = await rows<{ proof_kind: string; verified_by: string | null; evidence: string }>(
      "select proof_kind, verified_by, evidence from public.customer_contact_verifications where customer_id = $1",
      [guest.id],
    )
    expect(proofs).toEqual([{ proof_kind: "MAILBOX_OTP", verified_by: null, evidence: started.pending }])
    expect(await count("select count(*)::int as n from admin_private.customer_portal_sessions where customer_id = $1", [guest.id])).toBe(1)
    const session = await rpc<Record<string, string> | null>("customer_portal_session_v1", [done.session])
    expect(session?.customerId).toBe(guest.id)
    expect(session?.email).toBe(guest.email)
    const invitation = await rows<{ consumed_at: string | null; mailbox_proved_at: string | null; send_count: number }>(
      "select consumed_at, mailbox_proved_at, send_count from admin_private.onboarding_invitations where token_hash = $1",
      [open.invitationHash],
    )
    expect(invitation[0].send_count).toBe(0)
    expect(invitation[0].consumed_at).toBeTruthy()
    expect(invitation[0].mailbox_proved_at).toEqual(invitation[0].consumed_at)
    expect((await begin(open.invitationHash)).started).toEqual({ status: "unavailable" })
    expect((await finish(started.pending, open.invitationHash, guest.auth, guest.email)).finished).toEqual({ status: "unavailable" })
    expect(await count("select count(*)::int as n from public.customer_contact_verifications where customer_id = $1", [guest.id])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.customer_portal_sessions where customer_id = $1", [guest.id])).toBe(1)
    expect(await rows(
      "select status from public.business_memberships where customer_id = $1 and business_id = $2",
      [guest.id, pendingBusiness],
    )).toEqual([{ status: "pending" }])
    expect(await rows(
      "select status from public.business_memberships where customer_id = $1 and business_id = $2",
      [guest.id, revokedBusiness],
    )).toEqual([{ status: "revoked" }])
    const own = await db.query<{ value: unknown }>(
      "select admin_private.customer_business_projection_v1($1, $2) as value",
      [guest.id, pendingBusiness],
    )
    const foreign = await db.query<{ value: unknown }>(
      "select admin_private.customer_business_projection_v1($1, $2) as value",
      [guest.id, otherBusiness],
    )
    const owner = await db.query<{ value: { name?: string } | null }>(
      "select admin_private.customer_business_projection_v1($1, $2) as value",
      [otherCustomer, otherBusiness],
    )
    expect(own.rows[0].value).toBeNull()
    expect(foreign.rows[0].value).toBeNull()
    expect(owner.rows[0].value?.name).toBe("Other Shop")
    expect(await rows(
      "select proof_kind, verified_by, evidence from public.customer_contact_verifications where customer_id = $1",
      [preserved],
    )).toEqual(preservedBefore)
    expect(await count("select count(*)::int as n from public.communications")).toBe(beforeComms)
    expect(await count("select count(*)::int as n from public.product_entitlements")).toBe(beforeEntitlements)
    expect(await count("select count(*)::int as n from public.commercial_subscriptions")).toBe(beforeSubscriptions)
    expect(await count("select count(*)::int as n from public.commercial_payment_evidence")).toBe(beforePayments)
    expect(await count(
      "select count(*)::int as n from information_schema.tables where table_schema in ('public', 'admin_private') and table_name like '%invited%'",
    )).toBe(0)

    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now() - interval '40 minutes',
           created_at = now() - interval '40 minutes',
           last_activity_at = now() - interval '31 minutes',
           expires_at = now() + interval '7 hours'
       where token_hash = $1`,
      [done.session],
    )
    expect(await rpc("customer_portal_session_v1", [done.session])).toBeNull()
    const idleTouch = await rpc<{ status: string }>("customer_portal_touch_session_v1", [done.session])
    expect(idleTouch.status).toBe("expired")
    await db.query(
      `update admin_private.customer_portal_sessions
       set last_activity_at = now(), expires_at = now() + interval '7 hours'
       where token_hash = $1`,
      [done.session],
    )
    expect(await rpc<{ customerId: string }>("customer_portal_session_v1", [done.session])).toMatchObject({ customerId: guest.id })
    await db.query(
      "update admin_private.customer_portal_sessions set expires_at = now() - interval '1 minute' where token_hash = $1",
      [done.session],
    )
    expect(await rpc("customer_portal_session_v1", [done.session])).toBeNull()
    expect(await rpc<Status>("customer_portal_sign_out_v1", [done.session])).toEqual({ status: "ok" })
    expect(await count(
      "select count(*)::int as n from admin_private.customer_portal_sessions where token_hash = $1 and revoked_at is not null",
      [done.session],
    )).toBe(1)
    expect(await rpc("customer_portal_session_v1", [done.session])).toBeNull()
    await ageGap(guest.id)
    const ordinaryPending = hash(token())
    expect((await rpc<Status>("customer_portal_begin_login_v1", [guest.email, ordinaryPending])).status).toBe("ok")
  })

  it("grants the public invited functions to service_role only", async () => {
    const names = [
      "customer_portal_begin_invited_login_v1(text,text)",
      "customer_portal_confirm_invited_otp_sent_v1(text,text)",
      "customer_portal_begin_invited_resend_v1(text,text)",
      "customer_portal_attempt_invited_otp_v1(text,text)",
      "customer_portal_finish_invited_otp_v1(text,text,uuid,text,text)",
    ]
    for (const name of names) {
      const privilege = await rows<{ anon_ok: boolean; service_ok: boolean }>(
        `select has_function_privilege('anon', 'public.${name}', 'EXECUTE') as anon_ok,
                has_function_privilege('service_role', 'public.${name}', 'EXECUTE') as service_ok`,
      )
      expect(privilege, name).toEqual([{ anon_ok: false, service_ok: true }])
    }
    expect(await rows<{ anon_ok: boolean }>(
      "select has_function_privilege('anon', 'admin_private.customer_portal_finish_invited_otp_v1(text,text,uuid,text,text)', 'EXECUTE') as anon_ok",
    )).toEqual([{ anon_ok: false }])
    expect(await rows<{ service_ok: boolean }>(
      "select has_function_privilege('service_role', 'admin_private.customer_portal_open_invitation_v1(text)', 'EXECUTE') as service_ok",
    )).toEqual([{ service_ok: false }])
  })
})
