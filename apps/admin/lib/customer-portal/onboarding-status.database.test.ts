import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const alex = "a031a000-0000-4000-8000-0000000000a1"
const sam = "a031a000-0000-4000-8000-0000000000b2"
const guest = "a031a000-0000-4000-8000-0000000000c3"
const alexAuth = "a031a000-0000-4000-8000-0000000000d4"
const samAuth = "a031a000-0000-4000-8000-0000000000e5"
const guestAuth = "a031a000-0000-4000-8000-0000000000f6"
const actor = "a031a000-0000-4000-8000-0000000000aa"
const bakery = "a031a000-0000-4000-8000-000000000011"
const yard = "a031a000-0000-4000-8000-000000000012"
const pendingShop = "a031a000-0000-4000-8000-000000000013"
const revokedShop = "a031a000-0000-4000-8000-000000000014"
const samShop = "a031a000-0000-4000-8000-000000000015"
const guestShop = "a031a000-0000-4000-8000-000000000016"
const high = "a031a000-0000-4000-8000-000000000021"
const dock = "a031a000-0000-4000-8000-000000000022"
const yardLoc = "a031a000-0000-4000-8000-000000000023"
const guestLoc = "a031a000-0000-4000-8000-000000000024"
const plan = "a031a000-0000-4000-8000-000000000031"

type RequestView = {
  product: string
  stage: string
  statusLabel: string
  waitingFor: string
  customerActionRequired: boolean
  businessName: string | null
  locations: string[] | null
  completed: string[]
  nextStep: string
  receivedAt: string
  updatedAt: string
}
type Status = { requests: RequestView[] }

let alexSession = ""
let samSession = ""

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

function token() {
  return randomBytes(32).toString("hex")
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", [email, pending])
  if (started.status !== "ok") throw new Error(`login did not start: ${started.status}`)
  const confirmed = await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(`otp confirm failed: ${confirmed.status}`)
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(`otp finish failed: ${JSON.stringify(finished)}`)
  return sessionHash
}

async function status(session: string) {
  return rpc<Status | null>("customer_portal_onboarding_status_v1", [session])
}

async function request(options: {
  id?: string
  customer?: string
  business?: string | null
  email?: string
  product?: "TELLOYA" | "COMPLETE"
  state?: string
  createdAt?: string
  subscription?: string | null
  decline?: string | null
}) {
  const id = options.id ?? randomUUID()
  await db.query(
    `insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id, decline_reason, created_at
    ) values ($1, $2, $3, $4, $5, 'VOICE', $6, $7, $8, coalesce($9::timestamptz, now()))`,
    [
      id,
      options.customer ?? alex,
      options.business === undefined ? bakery : options.business,
      options.email ?? "alex.onboarding@example.com",
      options.product ?? "TELLOYA",
      options.state ?? "IN_REVIEW",
      options.subscription ?? null,
      options.decline ?? null,
      options.createdAt ?? null,
    ],
  )
  return id
}

async function counts() {
  const found = await rows<{
    requests: number
    subscriptions: number
    entitlements: number
    provisions: number
    payments: number
    guard_subscriptions: number
  }>(
    `select
      (select count(*)::int from public.onboarding_requests) as requests,
      (select count(*)::int from public.commercial_subscriptions) as subscriptions,
      (select count(*)::int from public.product_entitlements) as entitlements,
      (select count(*)::int from public.service_provisions) as provisions,
      (select count(*)::int from public.commercial_payment_evidence) as payments,
      (select count(*)::int from public.guard_subscriptions) as guard_subscriptions`,
  )
  return found[0]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec("BEGIN")
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.onboarding@example.com', now()),
      ('${samAuth}', 'sam.onboarding@example.com', now()),
      ('${guestAuth}', 'guest.onboarding@example.com', now()),
      ('${actor}', 'actor.onboarding@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.onboarding@example.com'),
      ('${sam}', 'Sam Cole', 'sam.onboarding@example.com'),
      ('${guest}', 'Guest Lane', 'guest.onboarding@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.onboarding@example.com', '${actor}', 'Verified from a live call with the customer.'),
      ('${sam}', 'email', 'sam.onboarding@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values
      ('${bakery}', 'Harbour Bakery'),
      ('${yard}', 'North Yard'),
      ('${pendingShop}', 'Pending Pantry'),
      ('${revokedShop}', 'Revoked Roastery'),
      ('${samShop}', 'Sam Supplies'),
      ('${guestShop}', 'Guest Goods');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock'),
      ('${yardLoc}', '${yard}', 'GB', 'Yard Gate'),
      ('${guestLoc}', '${guestShop}', 'GB', 'Guest Counter');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
      ('${alex}', '${yard}', 'verified', now(), '${actor}', 'Mailbox already proved for Yard'),
      ('${alex}', '${pendingShop}', 'pending', null, null, 'Membership is waiting for an ownership check.'),
      ('${alex}', '${revokedShop}', 'revoked', null, null, 'Membership was revoked after a failed ownership check.'),
      ('${sam}', '${samShop}', 'verified', now(), '${actor}', 'Mailbox already proved for Sam');
    insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT');
    insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency, terms_ref
    ) values ('${plan}', 'TELLOYA', 1, 'DRAFT', now(), 'MONTH', 'GBP', 'TELLOYA-TERMS-1');
  `)
  alexSession = await portalSession("alex.onboarding@example.com", alexAuth)
  samSession = await portalSession("sam.onboarding@example.com", samAuth)
}, 300000)

beforeEach(async () => {
  await db.exec("SAVEPOINT onboarding_case")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT onboarding_case")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

describe("customer_portal_onboarding_status_v1", () => {
  it("accepts only a portal session token hash and grants execute to service_role", async () => {
    const privilege = await rows<{
      anon_ok: boolean
      auth_ok: boolean
      service_ok: boolean
      private_service: boolean
      args: string
      nargs: number
    }>(
      `select has_function_privilege('anon', 'public.customer_portal_onboarding_status_v1(text)', 'EXECUTE') as anon_ok,
              has_function_privilege('authenticated', 'public.customer_portal_onboarding_status_v1(text)', 'EXECUTE') as auth_ok,
              has_function_privilege('service_role', 'public.customer_portal_onboarding_status_v1(text)', 'EXECUTE') as service_ok,
              has_function_privilege('service_role', 'admin_private.customer_portal_onboarding_status_v1(text)', 'EXECUTE') as private_service,
              pg_get_function_identity_arguments(p.oid) as args,
              p.pronargs as nargs
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'customer_portal_onboarding_status_v1'`,
    )
    expect(privilege).toEqual([{
      anon_ok: false,
      auth_ok: false,
      service_ok: true,
      private_service: false,
      args: "p_token_hash text",
      nargs: 1,
    }])
    const body = await rows<{ def: string }>(
      `select pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'customer_portal_onboarding_status_v1'`,
    )
    expect(body.map(item => item.def).join("\n")).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM/i)
    expect(await status("not-a-hash")).toBeNull()
    expect(await status(hash(token()))).toBeNull()
    expect(await status(alexSession)).toEqual({ requests: [] })
  })

  it("shows a verified customer's Telloya request and hides another customer's request", async () => {
    const before = await counts()
    const id = await request({})
    await db.query(
      `insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2), ($1, $3)`,
      [id, high, dock],
    )
    await db.query(
      `insert into admin_private.onboarding_request_events(onboarding_request_id, actor_id, operation, to_state, reason)
       values ($1, $2, 'review', 'IN_REVIEW', 'private admin note should stay hidden')`,
      [id, actor],
    )
    const samRequest = await request({
      customer: sam,
      business: samShop,
      email: "sam.onboarding@example.com",
      state: "IN_REVIEW",
    })
    const seen = await status(alexSession)
    expect(seen?.requests).toHaveLength(1)
    expect(seen?.requests[0]).toMatchObject({
      product: "Telloya",
      stage: "under_review",
      statusLabel: "Request in progress",
      waitingFor: "us",
      customerActionRequired: false,
      businessName: "Harbour Bakery",
      locations: ["Dock", "High Street"],
      nextStep: "We are reviewing this request.",
    })
    const serialised = JSON.stringify(seen)
    expect(serialised).not.toContain("private admin note")
    expect(serialised).not.toContain(samRequest)
    expect(serialised).not.toContain("Sam Supplies")
    expect(serialised).not.toContain(alex)
    expect(serialised).not.toContain("@")
    expect(await status(samSession)).toMatchObject({
      requests: [{ product: "Telloya", businessName: "Sam Supplies" }],
    })
    expect(await counts()).toEqual({ ...before, requests: before.requests + 2 })
  })

  it("lets a newly invited customer see limited progress after OTP without a business name or token", async () => {
    const opened = randomUUID()
    const location = randomUUID()
    await db.query("insert into public.locations(id, business_id, country, location_name) values ($1, $2, 'GB', 'Invitation Counter')", [location, guestShop])
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
       values ($1, $2, 'pending', null, null, 'Membership is waiting for an ownership check.')`,
      [guest, guestShop],
    )
    await db.query(
      `insert into public.onboarding_requests(id, customer_id, business_id, email_snapshot, product_code, plan_family, state)
       values ($1, $2, $3, 'guest.onboarding@example.com', 'TELLOYA', 'VOICE', 'MAILBOX_REQUIRED')`,
      [opened, guest, guestShop],
    )
    await db.query(
      "insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)",
      [opened, location],
    )
    await db.query(
      `insert into admin_private.onboarding_request_events(onboarding_request_id, actor_id, operation, to_state, reason)
       values ($1, $2, 'mark_ready', 'MAILBOX_REQUIRED', 'Admin marked this request ready for invitation.')`,
      [opened, actor],
    )
    const secret = token()
    const invitationHash = hash(secret)
    await db.query(
      `insert into admin_private.onboarding_invitations(token_hash, onboarding_request_id, email_snapshot, customer_id, expires_at)
       values ($1, $2, 'guest.onboarding@example.com', $3, now() + interval '7 days')`,
      [invitationHash, opened, guest],
    )
    const pending = hash(token())
    expect(await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [invitationHash, pending])).toMatchObject({ status: "ok" })
    expect(await rpc<{ status: string }>("customer_portal_confirm_invited_otp_sent_v1", [pending, invitationHash])).toMatchObject({ status: "ok" })
    const sessionHash = hash(token())
    expect(await rpc<{ status: string }>("customer_portal_finish_invited_otp_v1", [pending, sessionHash, guestAuth, "guest.onboarding@example.com", invitationHash])).toMatchObject({ status: "ok" })
    const seen = await status(sessionHash)
    expect(seen?.requests).toEqual([expect.objectContaining({
      product: "Telloya",
      stage: "verification",
      statusLabel: "Awaiting verification",
      waitingFor: "us",
      customerActionRequired: false,
      businessName: null,
      locations: null,
      nextStep: "We are checking that you can act for this business.",
    })])
    const serialised = JSON.stringify(seen)
    expect(serialised).not.toContain(secret)
    expect(serialised).not.toContain(invitationHash)
    expect(serialised).not.toContain("Invitation Counter")
    expect(serialised).not.toContain("Guest Goods")
    const stored = await rows<{ state: string }>("select state from public.onboarding_requests where id = $1", [opened])
    expect(stored).toEqual([{ state: "MAILBOX_REQUIRED" }])
  })

  it("withholds business details for a pending membership and a revoked membership", async () => {
    await request({
      business: pendingShop,
      state: "IN_REVIEW",
      createdAt: "2026-11-01T09:00:00.000Z",
    })
    await db.query(
      `insert into public.locations(id, business_id, country, location_name) values ($1, $2, 'GB', 'Secret Pantry')`,
      [randomUUID(), pendingShop],
    )
    const revoked = await request({
      business: revokedShop,
      state: "OFFERED",
      createdAt: "2026-11-02T09:00:00.000Z",
    })
    await db.query(
      `insert into admin_private.onboarding_request_events(onboarding_request_id, actor_id, operation, to_state, reason)
       values ($1, $2, 'prepare_offer', 'OFFERED', 'private offer note should stay hidden')`,
      [revoked, actor],
    )
    const seen = await status(alexSession)
    expect(seen?.requests.map(item => item.businessName)).toEqual([null, null])
    expect(seen?.requests.map(item => item.stage)).toEqual(["verification", "under_review"])
    expect(seen?.requests[0].statusLabel).toBe("Awaiting verification")
    expect(seen?.requests[0].customerActionRequired).toBe(false)
    const serialised = JSON.stringify(seen)
    expect(serialised).not.toContain("Pending Pantry")
    expect(serialised).not.toContain("Revoked Roastery")
    expect(serialised).not.toContain("Secret Pantry")
    expect(serialised).not.toContain("private offer note")
    expect(serialised).not.toContain("Offer being prepared")
  })

  it("keeps Telloya and Complete apart and orders duplicate requests stably", async () => {
    await request({
      id: "a031a000-0000-4000-8000-0000000000c1",
      business: bakery,
      product: "TELLOYA",
      state: "DECLINED",
      decline: "private decline note should stay hidden",
      createdAt: "2026-11-01T09:00:00.000Z",
    })
    await request({
      id: "a031a000-0000-4000-8000-0000000000c2",
      business: bakery,
      product: "TELLOYA",
      state: "IN_REVIEW",
      createdAt: "2026-11-03T09:00:00.000Z",
    })
    const complete = await request({
      id: "a031a000-0000-4000-8000-0000000000c3",
      business: yard,
      product: "COMPLETE",
      state: "IN_REVIEW",
      createdAt: "2026-11-02T09:00:00.000Z",
    })
    await db.query(
      "insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)",
      [complete, yardLoc],
    )
    const seen = await status(alexSession)
    expect(seen?.requests.map(item => [item.product, item.statusLabel, item.businessName])).toEqual([
      ["Telloya", "Request closed", "Harbour Bakery"],
      ["Complete", "Request in progress", "North Yard"],
      ["Telloya", "Request in progress", "Harbour Bakery"],
    ])
    expect(seen?.requests[1].locations).toEqual(["Yard Gate"])
    expect(JSON.stringify(seen)).not.toContain("private decline note")
    expect(seen?.requests.every(item => item.stage !== "ready" && item.customerActionRequired === false)).toBe(true)
  })

  it("does not invent acceptance, payment, or activation from an offered draft plan", async () => {
    const sub = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref, stripe_customer_id, stripe_subscription_id
      ) values ($1, 'VC-26-AB2347', $2, $3, 'VOICE', $4, 'BILLABLE', 'OFFERED', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1', 'cus_OnboardingHidden1', 'sub_OnboardingHidden1')`,
      [sub, alex, bakery, plan],
    )
    await db.exec("set local session_replication_role = origin")
    await request({ state: "OFFERED", subscription: sub })
    const before = await counts()
    const seen = await status(alexSession)
    expect(seen?.requests[0]).toMatchObject({
      stage: "offer_preparation",
      statusLabel: "Offer prepared",
      waitingFor: "us",
      customerActionRequired: false,
      nextStep: "An offer has been prepared. There is nothing to accept or pay on this page.",
    })
    const preparing = await rows<{ value: { statusLabel: string; nextStep: string; completed: string[] } }>(
      `select admin_private.customer_portal_onboarding_projection_v1(
        'OFFERED', 'verified', true, 1, true, null, false, null, false
      ) as value`,
    )
    expect(preparing[0].value.statusLabel).toBe("Offer being prepared")
    expect(preparing[0].value.nextStep).toContain("nothing to accept or pay yet")
    expect(preparing[0].value.completed).not.toContain("Offer recorded")
    expect(seen?.requests[0].completed).toContain("Offer recorded")
    const serialised = JSON.stringify(seen)
    expect(serialised).not.toMatch(/cus_|sub_|4900|Awaiting your payment|Ready for use|Active/)
    expect(await counts()).toEqual(before)
  })

  it("reports a recorded payment step without a payment identifier, and refuses LIVE without evidence", async () => {
    const before = await counts()
    const sub = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values ($1, 'VC-26-BB2347', $2, $3, 'VOICE', $4, 'BILLABLE', 'PAYMENT_PENDING', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [sub, alex, bakery, plan],
    )
    await db.query(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, now() - interval '1 day', now() + interval '20 days', 4900, 'GBP', 'evt_OnboardingHidden1')`,
      [sub],
    )
    await db.exec("set local session_replication_role = origin")
    await request({ state: "AWAITING_PAYMENT", subscription: sub })
    const paid = await status(alexSession)
    expect(paid?.requests[0]).toMatchObject({
      stage: "awaiting_customer",
      statusLabel: "Payment recorded",
      waitingFor: "us",
      customerActionRequired: false,
      nextStep: "A payment has been recorded. We are checking it.",
    })
    expect(paid?.requests[0].completed).toContain("Offer recorded")
    expect(paid?.requests[0].completed).toContain("Payment recorded")
    expect(JSON.stringify(paid)).not.toContain("Awaiting your payment")
    expect(JSON.stringify(paid)).not.toContain("evt_OnboardingHidden1")
    expect(JSON.stringify(paid)).not.toContain("4900")

    const projected = await rows<{ value: { stage: string; statusLabel: string } }>(
      `select admin_private.customer_portal_onboarding_projection_v1(
        'READY', 'verified', true, 1, true, 'ACTIVE', false, 'LIVE', false
      ) as value`,
    )
    expect(projected[0].value.stage).not.toBe("ready")
    expect(projected[0].value.statusLabel).not.toBe("Ready for use")
    const ready = await rows<{ value: { stage: string; statusLabel: string; customerActionRequired: boolean } }>(
      `select admin_private.customer_portal_onboarding_projection_v1(
        'PROVISIONING', 'verified', true, 1, true, 'ACTIVE', true, 'LIVE', true
      ) as value`,
    )
    expect(ready[0].value).toMatchObject({ stage: "ready", statusLabel: "Ready for use", customerActionRequired: false })
    const closed = await rows<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
       from pg_constraint
       where conname = 'service_provisions_live_closed'`,
    )
    expect(closed[0]?.definition).toMatch(/LIVE/)
    await db.exec("SAVEPOINT live_closed")
    await db.exec("set local session_replication_role = replica")
    const blocked = randomUUID()
    await db.query(
      `insert into public.product_entitlements(
        id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) values ($1, $2, $3, 'TELLOYA', 'COMMERCIAL_SUBSCRIPTION', $4, 'PENDING')`,
      [blocked, bakery, high, sub],
    )
    await expect(db.query(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state)
       values ($1, $2, $3, 'LIVE')`,
      [blocked, bakery, high],
    )).rejects.toThrow(/service_provisions_live_closed/)
    await db.exec("ROLLBACK TO SAVEPOINT live_closed")
    expect(await counts()).toMatchObject({ provisions: 0, guard_subscriptions: before.guard_subscriptions, entitlements: before.entitlements })
  })

  it("does not let one subscription's provision advance another request", async () => {
    const older = randomUUID()
    const newer = randomUUID()
    const entitlement = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values ($1, 'VC-26-CB2347', $2, $3, 'VOICE', $4, 'BILLABLE', 'ACTIVE', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [older, alex, bakery, plan],
    )
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values ($1, 'VC-26-DB2347', $2, $3, 'VOICE', $4, 'BILLABLE', 'OFFERED', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [newer, alex, bakery, plan],
    )
    await db.query(
      `insert into public.product_entitlements(
        id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) values ($1, $2, $3, 'TELLOYA', 'COMMERCIAL_SUBSCRIPTION', $4, 'ELIGIBLE')`,
      [entitlement, bakery, high, older],
    )
    await db.query(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state)
       values ($1, $2, $3, 'AWAITING_CONFIRMATION')`,
      [entitlement, bakery, high],
    )
    await db.exec("set local session_replication_role = origin")
    const closedRequest = await request({
      state: "DECLINED",
      subscription: older,
      decline: "An earlier request was declined.",
      createdAt: "2026-11-01T09:00:00.000Z",
    })
    await db.query(
      "insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)",
      [closedRequest, high],
    )
    const openRequest = await request({
      state: "IN_REVIEW",
      subscription: newer,
      createdAt: "2026-11-03T09:00:00.000Z",
    })
    await db.query(
      "insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2), ($1, $3)",
      [openRequest, high, dock],
    )
    const unlinked = await request({
      business: yard,
      state: "IN_REVIEW",
      subscription: null,
      createdAt: "2026-11-02T09:00:00.000Z",
    })
    await db.query(
      "insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)",
      [unlinked, yardLoc],
    )
    const seen = await status(alexSession)
    expect(seen?.requests.map(item => [item.businessName, item.statusLabel, item.stage])).toEqual([
      ["Harbour Bakery", "Request closed", "declined"],
      ["North Yard", "Request in progress", "under_review"],
      ["Harbour Bakery", "Offer prepared", "offer_preparation"],
    ])
    expect(JSON.stringify(seen)).not.toMatch(/Ready for use|Service setup|Active/)
  })

  it("does not treat one provisioned location as ready while another is not", async () => {
    const sub = randomUUID()
    const entitled = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values ($1, 'VC-26-EB2347', $2, $3, 'VOICE', $4, 'BILLABLE', 'ACTIVE', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [sub, alex, bakery, plan],
    )
    await db.query(
      `insert into public.product_entitlements(
        id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) values ($1, $2, $3, 'TELLOYA', 'COMMERCIAL_SUBSCRIPTION', $4, 'ELIGIBLE')`,
      [entitled, bakery, high, sub],
    )
    await db.query(
      `insert into public.service_provisions(
        entitlement_id, business_id, location_id, state,
        profile_ready_at, agent_configured_at, number_allocated_at, forwarding_instructed_at,
        customer_confirmed_at, provider_binding_ref, provider_test_outcome, provider_test_call_ref, agent_test_passed_at
      ) values (
        $1, $2, $3, 'READY_FOR_PROVIDER_VERIFICATION',
        now(), now(), now(), now(), now(), 'bind-hidden', 'PASSED', 'call-hidden', now()
      )`,
      [entitled, bakery, high],
    )
    await db.exec("set local session_replication_role = origin")
    const openRequest = await request({ state: "PROVISIONING", subscription: sub })
    await db.query(
      "insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2), ($1, $3)",
      [openRequest, high, dock],
    )
    const seen = await status(alexSession)
    expect(seen?.requests).toHaveLength(1)
    expect(seen?.requests[0].statusLabel).not.toBe("Ready for use")
    expect(seen?.requests[0].stage).toBe("service_setup")
    expect(seen?.requests[0].completed).not.toContain("Service setup recorded")
    expect(seen?.requests[0].completed).not.toContain("Ready for use")
    expect(seen?.requests[0].completed).toContain("Offer recorded")
    expect(seen?.requests[0].customerActionRequired).toBe(false)
    expect(seen?.requests[0].locations).toEqual(["Dock", "High Street"])
    expect(JSON.stringify(seen)).not.toMatch(/bind-hidden|call-hidden|Active/)
  })

  it("does not complete an offer or setup without the recorded evidence", async () => {
    const projected = async (args: unknown[]) => rows<{ value: { stage: string; statusLabel: string; completed: string[] } }>(
      `select admin_private.customer_portal_onboarding_projection_v1(
        $1, 'verified', true, 2, true, $2, false, $3, $4
      ) as value`,
      args,
    )
    const offered = await projected(["OFFERED", null, null, false])
    expect(offered[0].value).toMatchObject({ stage: "offer_preparation", statusLabel: "Offer being prepared" })
    expect(offered[0].value.completed).not.toContain("Offer recorded")

    const activeOnly = await projected(["IN_REVIEW", "ACTIVE", null, false])
    expect(activeOnly[0].value).toMatchObject({ stage: "service_setup", statusLabel: "Service setup" })
    expect(activeOnly[0].value.completed).toContain("Offer recorded")
    expect(activeOnly[0].value.completed).not.toContain("Service setup recorded")
    expect(activeOnly[0].value.completed).not.toContain("Ready for use")

    const provisioningOnly = await projected(["PROVISIONING", null, null, false])
    expect(provisioningOnly[0].value).toMatchObject({ stage: "service_setup", statusLabel: "Service setup" })
    expect(provisioningOnly[0].value.completed).not.toContain("Offer recorded")
    expect(provisioningOnly[0].value.completed).not.toContain("Service setup recorded")

    const evidenced = await projected(["PROVISIONING", "ACTIVE", "AWAITING_CONFIRMATION", false])
    expect(evidenced[0].value.statusLabel).toBe("Service setup")
    expect(evidenced[0].value.completed).toContain("Service setup recorded")
    expect(evidenced[0].value.completed).not.toContain("Ready for use")

    const unverifiedLive = await projected(["READY", "ACTIVE", "LIVE", false])
    expect(unverifiedLive[0].value.statusLabel).not.toBe("Ready for use")
    expect(unverifiedLive[0].value.completed).not.toContain("Service setup recorded")
    expect(unverifiedLive[0].value.completed).not.toContain("Ready for use")

    const ready = await projected(["PROVISIONING", "ACTIVE", "LIVE", true])
    expect(ready[0].value).toMatchObject({ stage: "ready", statusLabel: "Ready for use" })
    expect(ready[0].value.completed).toEqual(expect.arrayContaining(["Offer recorded", "Service setup recorded", "Ready for use"]))

    const opened = await request({ state: "OFFERED", subscription: null })
    const seen = await status(alexSession)
    expect(seen?.requests).toEqual([expect.objectContaining({
      statusLabel: "Offer being prepared",
      stage: "offer_preparation",
    })])
    expect(seen?.requests[0].completed).not.toContain("Offer recorded")
    expect(seen?.requests[0].completed).not.toContain("Service setup recorded")
    const stored = await rows<{ commercial_subscription_id: string | null }>(
      "select commercial_subscription_id from public.onboarding_requests where id = $1",
      [opened],
    )
    expect(stored[0].commercial_subscription_id).toBeNull()
  })

  it("returns nothing after sign-out, idle timeout, or expiry", async () => {
    await request({})
    expect((await status(alexSession))?.requests).toHaveLength(1)
    expect(await rpc("customer_portal_sign_out_v1", [alexSession])).toMatchObject({ status: "ok" })
    expect(await status(alexSession)).toBeNull()

    await db.query(
      `update admin_private.customer_portal_sessions
       set revoked_at = null,
           authenticated_at = now() - interval '2 hours',
           created_at = now() - interval '2 hours',
           last_activity_at = now() - interval '31 minutes',
           expires_at = now() + interval '6 hours'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await status(alexSession)).toBeNull()

    await db.query(
      `update admin_private.customer_portal_sessions
       set revoked_at = null,
           authenticated_at = now() - interval '9 hours',
           created_at = now() - interval '9 hours',
           last_activity_at = now() - interval '1 hour',
           expires_at = now() - interval '1 hour'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await status(alexSession)).toBeNull()
  })

  it("does not treat a mailbox state as an email action once verification is already recorded", async () => {
    const unverified = await rows<{ value: { stage: string; customerActionRequired: boolean; nextStep: string } }>(
      `select admin_private.customer_portal_onboarding_projection_v1(
        'MAILBOX_REQUIRED', null, false, 0, false, null, false, null, false
      ) as value`,
    )
    expect(unverified[0].value).toMatchObject({
      stage: "verification",
      customerActionRequired: true,
    })
    expect(unverified[0].value.nextStep).toContain("Signing in does not complete that check")
    await request({ state: "MAILBOX_REQUIRED" })
    const seen = await status(alexSession)
    expect(seen?.requests[0].stage).toBe("under_review")
    expect(seen?.requests[0].customerActionRequired).toBe(false)
    expect(seen?.requests[0].nextStep).not.toContain("Signing in does not complete")
  })
})
