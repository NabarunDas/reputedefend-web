/**
 * AUTO-EMAIL-VERIFY on a disposable database.
 * The migration is applied only inside this test. It is not applied to DEV
 * or Production, and no email is sent.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import {
  deriveEmailConfirmationChallengeId,
  deriveEmailConfirmationToken,
  emailConfirmationTokenHash,
  newEmailConfirmationChallengeId,
} from "../../../../lib/cases/email-confirmation"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "c2800000-0000-4000-8000-0000000000a1"
const customer = "c2800000-0000-4000-8000-0000000000c1"
const otherCustomer = "c2800000-0000-4000-8000-0000000000c2"
const business = "c2800000-0000-4000-8000-000000000022"
const location = "c2800000-0000-4000-8000-000000000023"
const adminToken = "e".repeat(64)
const secret = "email-confirmation-database-secret32"

type Json = Record<string, unknown> & { status?: string; state?: string; publicRef?: string }

async function rpc<T = Json>(name: string, args: unknown[] = []) {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await db.query<{ n: number }>(sql, params)).rows[0]?.n ?? 0)
}

async function createCase() {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, case_type, customer_id, business_id, location_id, issue_description, created_at,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1, 'PROFILE_RECOVERY', $2, $3, $4, 'Synthetic issue kept inside this database.', '2026-01-01', now(), now(), 'UNDECIDED')`,
    [id, customer, business, location],
  )
  const row = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [id])).rows[0]
  return { id, publicRef: row.public_ref }
}

function material(caseId: string, generation = 1) {
  const challengeId = generation === 1 ? deriveEmailConfirmationChallengeId(caseId, 1) : newEmailConfirmationChallengeId()
  const token = deriveEmailConfirmationToken(challengeId, secret, 1)
  return { challengeId, token, hash: emailConfirmationTokenHash(token) }
}

async function prepare(caseId: string, link = material(caseId)) {
  return {
    link,
    result: await rpc("prepare_email_confirmation_challenge_v1", [caseId, link.challengeId, "alex@example.com", "development", link.hash, 1]),
  }
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${customer}', 'alex@example.com', now());
    insert into public.admin_identity(singleton, auth_user_id, enabled) values (true, '${admin}', true)
      on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values
      ('${customer}', 'Alex', 'alex@example.com'),
      ('${otherCustomer}', 'Sam', 'sam@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${location}', '${business}', 'UK', 'High Street');
    insert into public.business_memberships(customer_id, business_id, status, evidence) values
      ('${customer}', '${business}', 'pending', 'Membership is pending and must stay pending.');
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("email confirmation challenges", () => {
  it("prepares one initial challenge, ignores a read, and confirms exactly once", async () => {
    const created = await createCase()
    const first = await prepare(created.id)
    expect(first.result.status).toBe("ready")
    const again = await prepare(created.id, first.link)
    expect(again.result.status).toBe("ready")
    expect(await count("select count(*)::int as n from public.email_confirmation_challenges where case_id = $1", [created.id])).toBe(1)
    const verifiedBefore = (await db.query<{ ok: boolean }>(
      "select admin_private.contact_verified_v1($1, 'email') as ok",
      [customer],
    )).rows[0].ok
    expect(verifiedBefore).toBe(false)

    const read = await rpc("read_email_confirmation_challenge_v1", [first.link.challengeId])
    expect(read.status).toBe("pending")
    expect(read.publicRef).toBe(created.publicRef)
    expect(read.maskedEmail).toBe("a***@example.com")
    expect(JSON.stringify(read)).not.toContain(first.link.token)
    expect(JSON.stringify(read)).not.toContain(first.link.hash)
    expect(await count("select count(*)::int as n from public.email_confirmation_challenges where id = $1 and consumed_at is null", [first.link.challengeId])).toBe(1)

    const wrong = await rpc("confirm_email_challenge_v1", [first.link.challengeId, "ab".repeat(32), "development"])
    expect(wrong.status).toBe("mismatch")
    expect(await count("select count(*)::int as n from public.email_confirmation_challenges where id = $1 and consumed_at is null", [first.link.challengeId])).toBe(1)

    const confirmed = await rpc("confirm_email_challenge_v1", [first.link.challengeId, first.link.hash, "development"])
    expect(confirmed.status).toBe("confirmed")
    expect(confirmed.publicRef).toBe(created.publicRef)
    expect(JSON.stringify(confirmed)).not.toContain(first.link.token)
    expect(JSON.stringify(confirmed)).not.toContain(first.link.hash)
    const replay = await rpc("confirm_email_challenge_v1", [first.link.challengeId, first.link.hash, "development"])
    expect(replay.status).toBe("already_confirmed")
    expect(await count(
      "select count(*)::int as n from public.customer_contact_verifications where customer_id = $1 and channel = 'email'",
      [customer],
    )).toBe(1)
    const proof = (await db.query<{ verified_by: string; evidence: string; verified_value: string }>(
      "select verified_by, evidence, verified_value from public.customer_contact_verifications where customer_id = $1 and channel = 'email'",
      [customer],
    )).rows[0]
    expect(proof.verified_by).toBe(customer)
    expect(proof.verified_value).toBe("alex@example.com")
    expect(proof.evidence).toBe(`CUSTOMER_EMAIL_LINK_CHALLENGE ${first.link.challengeId}`)
    expect(proof.evidence).not.toContain(first.link.token)
    expect((await db.query<{ ok: boolean }>("select admin_private.contact_verified_v1($1, 'email') as ok", [customer])).rows[0].ok).toBe(true)
    expect((await db.query<{ status: string }>(
      "select status from public.business_memberships where customer_id = $1 and business_id = $2",
      [customer, business],
    )).rows[0].status).toBe("pending")

    const status = await rpc("admin_email_confirmation_status_v1", [adminToken, created.id])
    expect(status.state).toBe("verified")
    expect(status.label).toBe("Verified")
    await db.query("delete from public.customer_contact_verifications where customer_id = $1", [customer])
  })

  it("refuses the wrong environment, an expired link, a suppression and a mismatched customer", async () => {
    const created = await createCase()
    const first = await prepare(created.id)
    expect(first.result.status).toBe("ready")
    const environment = await rpc("confirm_email_challenge_v1", [first.link.challengeId, first.link.hash, "preview"])
    expect(environment.status).toBe("environment")
    await db.query(
      "update public.email_confirmation_challenges set created_at = clock_timestamp() - interval '4 days', expires_at = clock_timestamp() - interval '1 day' where id = $1",
      [first.link.challengeId],
    )
    const expired = await rpc("confirm_email_challenge_v1", [first.link.challengeId, first.link.hash, "development"])
    expect(expired.status).toBe("expired")
    expect(await count("select count(*)::int as n from public.customer_contact_verifications where customer_id = $1", [customer])).toBe(0)

    const suppressedCase = await createCase()
    const suppressedLink = await prepare(suppressedCase.id)
    await db.query(
      "insert into admin_private.email_suppressions(address_normalized, reason) values ('alex@example.com', 'BOUNCED')",
    )
    const suppressed = await rpc("confirm_email_challenge_v1", [suppressedLink.link.challengeId, suppressedLink.link.hash, "development"])
    expect(suppressed.status).toBe("suppressed")
    expect(await count("select count(*)::int as n from public.email_confirmation_challenges where id = $1 and consumed_at is null", [suppressedLink.link.challengeId])).toBe(1)
    await db.query("delete from admin_private.email_suppressions where address_normalized = 'alex@example.com'")

    const moved = await createCase()
    const movedLink = await prepare(moved.id)
    await db.query("update public.email_confirmation_challenges set customer_id = $2 where id = $1", [movedLink.link.challengeId, otherCustomer])
    const mismatch = await rpc("confirm_email_challenge_v1", [movedLink.link.challengeId, movedLink.link.hash, "development"])
    expect(mismatch.status).toBe("mismatch")
    expect((await db.query<{ ok: boolean }>("select admin_private.contact_verified_v1($1, 'email') as ok", [otherCustomer])).rows[0].ok).toBe(false)
  })

  it("cools down a fresh customer resend, then restores the previous challenge if sending is abandoned", async () => {
    const created = await createCase()
    const first = await prepare(created.id)
    const replacement = material(created.id, 2)
    const cooled = await rpc("resend_email_confirmation_challenge_v1", [
      first.link.challengeId, first.link.hash, replacement.challengeId, replacement.hash, "development", 1, null,
    ])
    expect(cooled.status).toBe("cooldown")
    expect(await count("select count(*)::int as n from public.email_confirmation_challenges where case_id = $1", [created.id])).toBe(1)

    await db.query(
      "update public.email_confirmation_challenges set created_at = clock_timestamp() - interval '20 minutes' where id = $1",
      [first.link.challengeId],
    )
    const resent = await rpc("resend_email_confirmation_challenge_v1", [
      first.link.challengeId, first.link.hash, replacement.challengeId, replacement.hash, "development", 1, "other@example.com",
    ])
    expect(resent.status).toBe("mismatch")
    const ready = await rpc("resend_email_confirmation_challenge_v1", [
      first.link.challengeId, first.link.hash, replacement.challengeId, replacement.hash, "development", 1, null,
    ])
    expect(ready.status).toBe("ready")
    expect(ready.email).toBe("alex@example.com")
    expect(JSON.stringify({ status: ready.status, publicRef: ready.publicRef })).not.toContain(replacement.token)
    const abandoned = await rpc("abandon_email_confirmation_resend_v1", [replacement.challengeId, "development"])
    expect(abandoned.status).toBe("abandoned")
    expect(await count(
      "select count(*)::int as n from public.email_confirmation_challenges where id = $1 and superseded_at is null and consumed_at is null",
      [first.link.challengeId],
    )).toBe(1)
    expect(await count(
      "select count(*)::int as n from public.email_confirmation_challenges where id = $1 and superseded_at is not null",
      [replacement.challengeId],
    )).toBe(1)
    expect((await db.query<{ status: string }>(
      "select status from public.business_memberships where customer_id = $1",
      [customer],
    )).rows[0].status).toBe("pending")
  })

  it("shows the pending receipt sentence and lets staff prepare a resend without verifying the address", async () => {
    await db.query("delete from public.customer_contact_verifications where customer_id = $1", [customer])
    const created = await createCase()
    const first = await prepare(created.id)
    expect(first.result.status).toBe("ready")
    const preparedOnly = await rpc("admin_email_confirmation_status_v1", [adminToken, created.id])
    expect(preparedOnly).toMatchObject({
      state: "none",
      provenance: "none",
      recovery: "send",
      label: "Not verified",
      nextGeneration: 2,
    })
    expect(preparedOnly.label).not.toContain("requested automatically")
    await db.query(
      `insert into public.communications
        (case_id, communication_type, channel, direction, recipient, status)
        values ($1, 'CASE_RECEIVED_CUSTOMER', 'EMAIL', 'OUTBOUND', 'alex@example.com', 'SENT')`,
      [created.id],
    )
    const sentOnly = await rpc("admin_email_confirmation_status_v1", [adminToken, created.id])
    expect(sentOnly).toMatchObject({
      state: "none",
      provenance: "none",
      recovery: "send",
      label: "Not verified",
    })
    expect(sentOnly.label).not.toContain("requested automatically")
    const accepted = await rpc("record_email_confirmation_delivery_v1", [first.link.challengeId, "development", "accepted"])
    expect(accepted.status).toBe("accepted")
    const pending = await rpc("admin_email_confirmation_status_v1", [adminToken, created.id])
    expect(pending).toMatchObject({
      state: "pending",
      provenance: "initial_receipt",
      recovery: "resend",
      label: "Email confirmation pending — requested automatically in your case receipt",
      nextGeneration: 2,
    })
    const next = material(created.id, 2)
    const prepared = await rpc("admin_prepare_email_confirmation_resend_v1", [
      adminToken, created.id, next.challengeId, next.hash, "development", 1, 2,
    ])
    expect(prepared.status).toBe("ready")
    expect(await count("select count(*)::int as n from public.customer_contact_verifications where customer_id = $1", [customer])).toBe(0)
    expect((await db.query<{ status: string }>(
      "select status from public.business_memberships where customer_id = $1",
      [customer],
    )).rows[0].status).toBe("pending")
    const anon = (await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.confirm_email_challenge_v1(uuid, text, text)', 'execute') as ok",
    )).rows[0].ok
    const authenticated = (await db.query<{ ok: boolean }>(
      "select has_function_privilege('authenticated', 'public.confirm_email_challenge_v1(uuid, text, text)', 'execute') as ok",
    )).rows[0].ok
    const service = (await db.query<{ ok: boolean }>(
      "select has_function_privilege('service_role', 'public.confirm_email_challenge_v1(uuid, text, text)', 'execute') as ok",
    )).rows[0].ok
    expect(anon).toBe(false)
    expect(authenticated).toBe(false)
    expect(service).toBe(true)
    const recorder = (await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.record_email_confirmation_delivery_v1(uuid, text, text)', 'execute') as ok",
    )).rows[0].ok
    expect(recorder).toBe(false)
  })

  it("offers recovery for a case with no accepted email, an expired link, or a separate recovery email", async () => {
    await db.query("delete from public.customer_contact_verifications where customer_id = $1", [customer])
    const untouched = await createCase()
    const none = await rpc("admin_email_confirmation_status_v1", [adminToken, untouched.id])
    expect(none).toMatchObject({
      state: "none",
      provenance: "none",
      recovery: "send",
      label: "Not verified",
      nextGeneration: 1,
    })
    expect(none.label).not.toContain("requested automatically")

    const expiredCase = await createCase()
    const expiredLink = await prepare(expiredCase.id)
    expect((await rpc("record_email_confirmation_delivery_v1", [expiredLink.link.challengeId, "development", "accepted"])).status).toBe("accepted")
    await db.query(
      "update public.email_confirmation_challenges set created_at = clock_timestamp() - interval '4 days', expires_at = clock_timestamp() - interval '1 hour' where id = $1",
      [expiredLink.link.challengeId],
    )
    const expired = await rpc("admin_email_confirmation_status_v1", [adminToken, expiredCase.id])
    expect(expired).toMatchObject({
      state: "none",
      provenance: "initial_receipt",
      recovery: "resend",
      label: "Not verified",
    })
    expect(expired.label).not.toContain("requested automatically")

    const rejectedCase = await createCase()
    const rejectedLink = await prepare(rejectedCase.id)
    expect((await rpc("record_email_confirmation_delivery_v1", [rejectedLink.link.challengeId, "development", "rejected"])).status).toBe("rejected")
    const rejected = await rpc("admin_email_confirmation_status_v1", [adminToken, rejectedCase.id])
    expect(rejected).toMatchObject({ state: "none", provenance: "none", recovery: "send", label: "Not verified" })

    const recoveryCase = await createCase()
    const initial = await prepare(recoveryCase.id)
    expect((await rpc("record_email_confirmation_delivery_v1", [initial.link.challengeId, "development", "accepted"])).status).toBe("accepted")
    const next = material(recoveryCase.id, 2)
    const prepared = await rpc("admin_prepare_email_confirmation_resend_v1", [
      adminToken, recoveryCase.id, next.challengeId, next.hash, "development", 1, 2,
    ])
    expect(prepared.status).toBe("ready")
    const beforeAcceptance = await rpc("admin_email_confirmation_status_v1", [adminToken, recoveryCase.id])
    expect(beforeAcceptance).toMatchObject({ state: "none", provenance: "initial_receipt", recovery: "resend", label: "Not verified" })
    expect((await rpc("record_email_confirmation_delivery_v1", [next.challengeId, "development", "accepted"])).status).toBe("accepted")
    const recovery = await rpc("admin_email_confirmation_status_v1", [adminToken, recoveryCase.id])
    expect(recovery).toMatchObject({
      state: "pending",
      provenance: "recovery",
      recovery: "resend",
      label: "Email confirmation pending — requested in a separate recovery email",
    })
    expect(recovery.label).not.toContain("requested automatically in your case receipt")
    expect(await count("select count(*)::int as n from public.customer_contact_verifications where customer_id = $1", [customer])).toBe(0)
  })

  it("supersedes an open challenge when the customer email changes and does not verify the new address", async () => {
    const created = await createCase()
    const first = await prepare(created.id)
    expect(first.result.status).toBe("ready")
    await db.query("update public.customers set email = 'changed@example.com' where id = $1", [customer])
    expect(await count(
      "select count(*)::int as n from public.email_confirmation_challenges where id = $1 and superseded_at is not null",
      [first.link.challengeId],
    )).toBe(1)
    const refused = await rpc("confirm_email_challenge_v1", [first.link.challengeId, first.link.hash, "development"])
    expect(refused.status).not.toBe("confirmed")
    expect((await db.query<{ ok: boolean }>("select admin_private.contact_verified_v1($1, 'email') as ok", [customer])).rows[0].ok).toBe(false)
    await db.query("update public.customers set email = 'alex@example.com' where id = $1", [customer])
  })
})
