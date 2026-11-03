import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const alex = "a032a000-0000-4000-8000-0000000000a1"
const sam = "a032a000-0000-4000-8000-0000000000b2"
const alexAuth = "a032a000-0000-4000-8000-0000000000d4"
const samAuth = "a032a000-0000-4000-8000-0000000000e5"
const actor = "a032a000-0000-4000-8000-0000000000aa"
const bakery = "a032a000-0000-4000-8000-000000000011"
const yard = "a032a000-0000-4000-8000-000000000012"
const pendingShop = "a032a000-0000-4000-8000-000000000013"
const revokedShop = "a032a000-0000-4000-8000-000000000014"
const high = "a032a000-0000-4000-8000-000000000021"
const dock = "a032a000-0000-4000-8000-000000000022"
const yardLoc = "a032a000-0000-4000-8000-000000000023"

type Offer = Record<string, unknown>
let alexSession = ""
let samSession = ""
let planNumber = 10

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

async function agreement(product: "TELLOYA" | "COMPLETE", versionRef: string, status: "APPROVED" | "DRAFT" = "APPROVED") {
  const title = `${product === "TELLOYA" ? "Telloya" : "Complete"} service agreement`
  const body = `This agreement covers the named ${product === "TELLOYA" ? "Telloya" : "Complete"} service for the selected locations only.`
  const cancellation = "Cancel in writing before the next billing date."
  const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }])
  const id = randomUUID()
  await db.query(
    `insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    ) values (
      $1, $2, $3, $4, $5, $6,
      admin_private.commercial_agreement_hash_v1($2, $3, $4, $5, $6, $7::jsonb),
      $7::jsonb, $8, $9, case when $8 = 'APPROVED' then now() else null end
    )`,
    [id, product, versionRef, title, body, cancellation, confirmations, status, status === "APPROVED" ? actor : null],
  )
  return { id, title, body, cancellation, versionRef }
}

async function plan(options: {
  product?: "TELLOYA" | "COMPLETE"
  cadence?: "MONTH" | "YEAR" | "ONCE"
  amount?: number
  terms?: string
  approve?: boolean
  effectiveTo?: string | null
  limit?: number
}) {
  const id = randomUUID()
  const product = options.product ?? "TELLOYA"
  const version = ++planNumber
  const limit = options.limit ?? (product === "COMPLETE" ? 1 : 2)
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, effective_to, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, $2, $3, 'DRAFT', now() - interval '1 day', $4::timestamptz, $5, 'GBP', $6, 'NOT_APPLICABLE', $7)`,
    [id, product, version, options.effectiveTo ?? null, options.cadence ?? "MONTH", options.amount ?? 4900, options.terms ?? `${product}-TERMS-1`],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
     values ($1, 'TELLOYA', $2, 'LOCATION')`,
    [id, limit],
  )
  if (product === "COMPLETE") {
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
       values ($1, 'GUARD', 1, 'LOCATION')`,
      [id],
    )
  }
  if (options.approve !== false) {
    await db.query(
      `update public.plan_versions
       set status = 'APPROVED', approved_by = $2, approved_at = now()
       where id = $1`,
      [id, actor],
    )
  }
  return id
}

async function offer(options: {
  ref: string
  customer?: string
  business?: string
  product?: "TELLOYA" | "COMPLETE"
  locations?: string[]
  cadence?: "MONTH" | "YEAR" | "ONCE"
  amount?: number
  terms?: string
  approvePlan?: boolean
  agreementStatus?: "APPROVED" | "DRAFT" | "none"
  state?: string
  replica?: boolean
}) {
  const product = options.product ?? "TELLOYA"
  const terms = options.terms ?? `${product}-TERMS-${options.ref.slice(-4)}`
  const quantity = Math.max(options.locations?.length ?? (product === "COMPLETE" ? 1 : 2), 1)
  const planId = await plan({
    product,
    cadence: options.cadence,
    amount: options.amount,
    terms,
    approve: options.approvePlan !== false && !options.replica,
    limit: product === "COMPLETE" ? 1 : quantity,
  })
  if (options.agreementStatus !== "none") {
    await agreement(product, terms, options.agreementStatus ?? "APPROVED")
  }
  const subscription = randomUUID()
  const business = options.business ?? bakery
  const customer = options.customer ?? alex
  const locations = options.locations ?? [high, dock]
  if (options.replica || options.approvePlan === false) await db.exec("set local session_replication_role = replica")
  await db.query(
    `insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
    ) values ($1, $2, $3, $4, 'VOICE', $5, 'BILLABLE', 'DRAFT', $6, 'GBP', 'NOT_APPLICABLE', $7, $8)`,
    [subscription, options.ref, customer, business, planId, options.amount ?? 4900, options.cadence ?? "MONTH", terms],
  )
  await db.query(
    `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
     values ($1, 'TELLOYA', $2, $2)`,
    [subscription, product === "COMPLETE" ? 1 : quantity],
  )
  if (product === "COMPLETE") {
    await db.query(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ($1, 'GUARD', 1, 1)`,
      [subscription],
    )
  }
  if (options.replica || options.approvePlan === false) await db.exec("set local session_replication_role = origin")
  const nextState = options.state ?? "OFFERED"
  if (nextState !== "DRAFT") {
    if (options.replica || options.approvePlan === false) await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set state = $2 where id = $1`, [subscription, nextState])
    if (options.replica || options.approvePlan === false) await db.exec("set local session_replication_role = origin")
  }
  const request = randomUUID()
  await db.query(
    `insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
    ) values ($1, $2, $3, 'alex.onboarding@example.com', $4, 'VOICE', 'OFFERED', $5)`,
    [request, customer, business, product, subscription],
  )
  for (const location of locations) {
    await db.query(
      `insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)`,
      [request, location],
    )
  }
  const version = await rows<{ record_version: number }>(
    `select record_version from public.commercial_subscriptions where id = $1`,
    [subscription],
  )
  return { subscription, request, planId, terms, version: version[0].record_version, ref: options.ref }
}

function consent(prepared: { version: number; terms: string; amount?: number; cadence?: string }, recurring = true) {
  return {
    offerVersion: prepared.version,
    priceMinor: prepared.amount ?? 4900,
    taxBehaviour: "NOT_APPLICABLE",
    taxMinor: null,
    cadence: prepared.cadence ?? "MONTH",
    agreementRef: prepared.terms,
    agreementAccepted: true,
    recurringConsent: recurring,
    confirmations: { business_authority: true },
  }
}

async function command(session: string, selector: string, data: unknown, request = randomUUID()) {
  return rpc<Offer | null>("customer_portal_commercial_offer_command_v1", [session, request, selector, JSON.stringify(data)])
}

async function read(session: string, selector: string) {
  return rpc<Offer | null>("customer_portal_commercial_offer_v1", [session, selector])
}

async function sideEffects() {
  const found = await rows<{
    acceptances: number
    entitlements: number
    provisions: number
    payments: number
    guard_subscriptions: number
    recovery_acceptances: number
    case_agreements: number
    allocations: number
  }>(
    `select
      (select count(*)::int from public.commercial_offer_acceptances) as acceptances,
      (select count(*)::int from public.product_entitlements) as entitlements,
      (select count(*)::int from public.service_provisions) as provisions,
      (select count(*)::int from public.commercial_payment_evidence) as payments,
      (select count(*)::int from public.guard_subscriptions) as guard_subscriptions,
      (select count(*)::int from public.paid_service_acceptances) as recovery_acceptances,
      (select count(*)::int from public.agreement_versions) as case_agreements,
      (select count(*)::int from public.bundle_guard_allocations) as allocations`,
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
      ('${actor}', 'actor.offer@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.onboarding@example.com'),
      ('${sam}', 'Sam Cole', 'sam.onboarding@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.onboarding@example.com', '${actor}', 'Verified from a live call with the customer.'),
      ('${sam}', 'email', 'sam.onboarding@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values
      ('${bakery}', 'Harbour Bakery'),
      ('${yard}', 'North Yard'),
      ('${pendingShop}', 'Pending Pantry'),
      ('${revokedShop}', 'Revoked Roastery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock'),
      ('${yardLoc}', '${yard}', 'GB', 'Yard Gate');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
      ('${alex}', '${yard}', 'verified', now(), '${actor}', 'Mailbox already proved for Yard'),
      ('${alex}', '${pendingShop}', 'pending', null, null, 'Membership is waiting for an ownership check.'),
      ('${alex}', '${revokedShop}', 'revoked', null, null, 'Membership was revoked after a failed ownership check.'),
      ('${sam}', '${yard}', 'verified', now(), '${actor}', 'Mailbox already proved for Sam');
  `)
  await db.query(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
     on conflict (code) do nothing`,
  )
  alexSession = await portalSession("alex.onboarding@example.com", alexAuth)
  samSession = await portalSession("sam.onboarding@example.com", samAuth)
}, 300000)

beforeEach(async () => {
  await db.exec("SAVEPOINT commercial_offer")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT commercial_offer")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

describe("customer commercial offer acceptance", () => {
  it("grants the read and command to service_role only", async () => {
    const privilege = await rows<{ anon_ok: boolean; auth_ok: boolean; service_ok: boolean }>(
      `select has_function_privilege('anon', 'public.customer_portal_commercial_offer_v1(text, text)', 'EXECUTE') as anon_ok,
              has_function_privilege('authenticated', 'public.customer_portal_commercial_offer_v1(text, text)', 'EXECUTE') as auth_ok,
              has_function_privilege('service_role', 'public.customer_portal_commercial_offer_v1(text, text)', 'EXECUTE') as service_ok`,
    )
    expect(privilege[0]).toEqual({ anon_ok: false, auth_ok: false, service_ok: true })
    const commandPrivilege = await rows<{ anon_ok: boolean; service_ok: boolean }>(
      `select has_function_privilege('anon', 'public.customer_portal_commercial_offer_command_v1(text, uuid, text, jsonb)', 'EXECUTE') as anon_ok,
              has_function_privilege('service_role', 'public.customer_portal_commercial_offer_command_v1(text, uuid, text, jsonb)', 'EXECUTE') as service_ok`,
    )
    expect(commandPrivilege[0]).toEqual({ anon_ok: false, service_ok: true })
  })

  it("shows one customer's eligible Telloya and Complete offers, and hides another customer's offer", async () => {
    const telloya = await offer({ ref: "VC-26-AB2347" })
    const complete = await offer({
      ref: "VC-26-CD5678",
      business: yard,
      product: "COMPLETE",
      locations: [yardLoc],
      amount: 9900,
    })
    const first = await read(alexSession, telloya.ref)
    const second = await read(alexSession, complete.ref)
    expect(first).toMatchObject({
      status: "ready",
      offerRef: "VC-26-AB2347",
      product: "Telloya",
      businessName: "Harbour Bakery",
      locations: ["Dock", "High Street"],
      services: ["Telloya"],
      priceMinor: 4900,
      totalMinor: 4900,
      cadence: "MONTH",
      recurring: true,
      taxBehaviour: "NOT_APPLICABLE",
    })
    expect(second).toMatchObject({
      status: "ready",
      product: "Complete",
      businessName: "North Yard",
      locations: ["Yard Gate"],
      services: ["Telloya", "Relaunch Guard"],
      priceMinor: 9900,
    })
    expect(JSON.stringify(first)).not.toMatch(/cus_|sub_|si_|amount_minor|stripe|agreementHash|contentHash/)
    const hidden = await read(samSession, telloya.ref)
    expect(hidden).toEqual({ status: "unavailable" })
    expect(JSON.stringify(hidden)).not.toContain("Harbour")
    expect(await read(alexSession, "VC-26-ZZZZZZ")).toEqual({ status: "unavailable" })
    expect(await read("not-a-session", telloya.ref)).toBeNull()
  })

  it("withholds commercial detail when authority is pending or revoked", async () => {
    await offer({ ref: "VC-26-PEND23", business: pendingShop, locations: [], replica: true })
    await offer({ ref: "VC-26-REVK24", business: revokedShop, locations: [], replica: true })
    const pending = await read(alexSession, "VC-26-PEND23")
    const revoked = await read(alexSession, "VC-26-REVK24")
    expect(pending).toMatchObject({ status: "unavailable", reason: "authority" })
    expect(revoked).toMatchObject({ status: "unavailable", reason: "authority" })
    expect(JSON.stringify(pending)).not.toMatch(/4900|Pending Pantry|priceMinor/)
    expect(JSON.stringify(revoked)).not.toMatch(/4900|Revoked Roastery|priceMinor/)
  })

  it("refuses an offer with no approved agreement or no approved plan", async () => {
    const plain = "a032a000-0000-4000-8000-000000000017"
    const plainLoc = "a032a000-0000-4000-8000-000000000027"
    await db.query(`insert into public.businesses(id, display_name) values ($1, 'Plain Pantry')`, [plain])
    await db.query(`insert into public.locations(id, business_id, country, location_name) values ($1, $2, 'GB', 'Plain Counter')`, [plainLoc, plain])
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
       values ($1, $2, 'verified', now(), $3, 'Mailbox already proved for Plain Pantry')`,
      [alex, plain, actor],
    )
    const missing = await offer({ ref: "VC-26-TERM25", agreementStatus: "none" })
    const draft = await offer({ ref: "VC-26-DRFT26", business: yard, product: "COMPLETE", agreementStatus: "DRAFT", locations: [yardLoc] })
    const unpriced = await offer({ ref: "VC-26-PLAN27", business: plain, locations: [plainLoc], approvePlan: false, replica: true })
    expect(await read(alexSession, missing.ref)).toMatchObject({ status: "terms_pending", product: "Telloya" })
    expect(JSON.stringify(await read(alexSession, missing.ref))).not.toContain("priceMinor")
    expect((await read(alexSession, draft.ref))?.status).toBe("terms_pending")
    expect((await read(alexSession, unpriced.ref))?.status).toBe("changed")
    const refused = await command(alexSession, missing.ref, consent(missing))
    expect(refused).toMatchObject({ status: "terms_pending" })
    expect((await sideEffects()).acceptances).toBe(0)
  })

  it("accepts once, records the exact agreement, and leaves payment and coverage untouched", async () => {
    const prepared = await offer({ ref: "VC-26-ACPT28" })
    const before = await sideEffects()
    const request = randomUUID()
    const body = "This agreement covers the named Telloya service for the selected locations only."
    const first = await command(alexSession, prepared.ref, consent(prepared), request)
    expect(first).toMatchObject({ status: "success", existing: false, offerRef: prepared.ref })
    const again = await command(alexSession, prepared.ref, consent(prepared), request)
    expect(again).toEqual(first)
    const later = await command(alexSession, prepared.ref, consent(prepared))
    expect(later).toMatchObject({ status: "success", existing: true, offerRef: prepared.ref })
    const changedTax = await command(alexSession, prepared.ref, { ...consent(prepared), taxMinor: 100 })
    expect(changedTax).toMatchObject({ status: "conflict" })
    const changedConfirmations = await command(alexSession, prepared.ref, {
      ...consent(prepared),
      confirmations: { business_authority: true, extra_notice: true },
    })
    expect(changedConfirmations).toMatchObject({ status: "conflict" })
    const stored = await rows<{
      body: string
      hash: string
      email: string
      actor: string
      cadence: string
      version: number
      consent: string | null
    }>(
      `select agreement_body as body, agreement_content_hash as hash, email_snapshot as email,
              auth_user_id::text as actor, cadence, subscription_record_version as version,
              recurring_consent_at::text as consent
       from public.commercial_offer_acceptances`,
    )
    expect(stored).toHaveLength(1)
    expect(stored[0].body).toBe(body)
    expect(stored[0].email).toBe("alex.onboarding@example.com")
    expect(stored[0].actor).toBe(alexAuth)
    expect(stored[0].cadence).toBe("MONTH")
    expect(stored[0].version).toBe(prepared.version)
    expect(stored[0].consent).toBeTruthy()
    const state = await rows<{ state: string; request_state: string }>(
      `select subscription.state, request.state as request_state
       from public.commercial_subscriptions subscription
       join public.onboarding_requests request on request.commercial_subscription_id = subscription.id`,
    )
    expect(state[0]).toEqual({ state: "ACCEPTED", request_state: "OFFERED" })
    const seen = await read(alexSession, prepared.ref)
    expect(seen).toMatchObject({ status: "accepted", product: "Telloya" })
    expect(JSON.stringify(seen)).toContain(body)
    const progress = await rpc<{ requests: { statusLabel: string; offerState: string; nextStep: string }[] }>(
      "customer_portal_onboarding_status_v1",
      [alexSession],
    )
    expect(progress.requests[0]).toMatchObject({
      statusLabel: "Offer accepted",
      offerState: "accepted",
    })
    expect(progress.requests[0].nextStep).toContain("Payment and service setup follow separately")
    expect(JSON.stringify(progress)).not.toMatch(/4900|Active|cus_|sub_/)
    await db.exec("SAVEPOINT acceptance_guard")
    await expect(db.query(`update public.commercial_offer_acceptances set agreement_body = 'changed'`)).rejects.toThrow(/immutable/)
    await db.exec("ROLLBACK TO SAVEPOINT acceptance_guard")
    const after = await sideEffects()
    expect(after).toEqual({ ...before, acceptances: 1 })
  })

  it("rejects a stale price, a withdrawal, a missing recurring consent, and a substituted selector", async () => {
    const prepared = await offer({ ref: "VC-26-STAL29" })
    const other = await offer({
      ref: "VC-26-THRS32",
      business: yard,
      product: "COMPLETE",
      locations: [yardLoc],
      amount: 9900,
    })
    const stale = await command(alexSession, prepared.ref, { ...consent(prepared), priceMinor: 100 })
    expect(stale).toMatchObject({ status: "conflict" })
    const once = await command(alexSession, prepared.ref, { ...consent(prepared), recurringConsent: false })
    expect(once).toMatchObject({ status: "invalid" })
    await db.query(
      `update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where public_ref = $1`,
      [prepared.ref],
    )
    const withdrawn = await command(alexSession, prepared.ref, consent(prepared))
    expect(withdrawn).toMatchObject({ status: "withdrawn", offerRef: prepared.ref })
    const swapped = await command(alexSession, other.ref, consent(prepared))
    expect(swapped?.status === "success").toBe(false)
    const otherState = await rows<{ state: string }>(
      `select state from public.commercial_subscriptions where public_ref = $1`,
      [other.ref],
    )
    expect(otherState[0].state).toBe("OFFERED")
    expect((await sideEffects()).acceptances).toBe(0)
  })

  it("treats a changed, expired or superseded plan as ineligible", async () => {
    const prepared = await offer({ ref: "VC-26-CHNG33" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.plan_versions set amount_minor = 5100 where terms_ref = $1`, [prepared.terms])
    await db.exec("set local session_replication_role = origin")
    expect((await read(alexSession, prepared.ref))?.status).toBe("changed")
    expect(await command(alexSession, prepared.ref, consent(prepared))).toMatchObject({ status: "changed" })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.plan_versions set status = 'RETIRED', retired_by = $2, retired_at = now(), amount_minor = 4900 where terms_ref = $1`,
      [prepared.terms, actor],
    )
    await db.exec("set local session_replication_role = origin")
    expect((await read(alexSession, prepared.ref))?.status).toBe("superseded")
    const expired = await offer({ ref: "VC-26-EXP234", business: yard, locations: [yardLoc] })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.plan_versions set effective_to = now() - interval '1 minute' where terms_ref = $1`, [expired.terms])
    await db.exec("set local session_replication_role = origin")
    expect((await read(alexSession, expired.ref))?.status).toBe("expired")
    expect((await sideEffects()).acceptances).toBe(0)
  })

  it("requires recurring consent only for a recurring cadence", async () => {
    const prepared = await offer({ ref: "VC-26-SNGL36", cadence: "ONCE", business: yard, locations: [yardLoc] })
    const refused = await command(alexSession, prepared.ref, { ...consent(prepared, true), cadence: "ONCE", recurringConsent: true })
    expect(refused).toMatchObject({ status: "invalid" })
    const accepted = await command(alexSession, prepared.ref, { ...consent(prepared, false), cadence: "ONCE", recurringConsent: false })
    expect(accepted).toMatchObject({ status: "success", existing: false })
    const consentAt = await rows<{ consent: string | null }>(
      `select recurring_consent_at::text as consent from public.commercial_offer_acceptances`,
    )
    expect(consentAt[0].consent).toBeNull()
  })
})
