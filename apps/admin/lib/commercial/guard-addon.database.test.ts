/**
 * Synthetic Telloya plus Relaunch Guard offers.
 * Checkout preparation reserves local rows only. It does not create a Stripe object.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "c0b10000-0000-4000-8000-0000000000aa"
const token = "ce".repeat(32)
const reason = "The customer confirmed this commercial offer today."

type Result = Record<string, unknown>
type PlanChoice = {
  tierCode: string | null
  offerable: boolean
  unavailableReason: string | null
  telloyaQuantity: number | null
  amountMinor: number | null
}

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[]) {
  const params = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: T }>(`select public.${name}(${params}) as value`, args)).rows[0].value
}

const command = (operation: string, payload: object, version = 0, key = randomUUID()) =>
  rpc<Result>("admin_commercial_command_v1", [token, key, operation, payload, version])

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function agreement(product: "TELLOYA" | "COMPLETE", versionRef: string) {
  const title = "Telloya service agreement"
  const body = "This agreement covers the named Telloya service for the selected locations only."
  const cancellation = "Cancel in writing before the next billing date."
  const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }])
  await db.query(
    `insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    ) values (
      $1, $2, $3, $4, $5, $6,
      admin_private.commercial_agreement_hash_v1($2, $3, $4, $5, $6, $7::jsonb),
      $7::jsonb, 'APPROVED', $8, now()
    )`,
    [randomUUID(), product, versionRef, title, body, cancellation, confirmations, admin],
  )
}

async function approvePlan(options: {
  tier: "BASIC" | "GROWTH" | "PRO" | "CUSTOM"
  version: number
  amount: number
  minutes: number | null
  telloya: number
  base?: number
  guardUnit?: number | null
  conditions?: boolean
  agreed?: boolean
}) {
  const id = randomUUID()
  const terms = `TELLOYA-${options.tier}-${options.version}`
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, 'TELLOYA', $2, $3, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', $4, 'NOT_APPLICABLE', $5)`,
    [id, options.version, options.tier, options.amount, terms],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', $2, 'LOCATION')`,
    [id, options.telloya],
  )
  if (options.conditions !== false) {
    const label = options.tier === "BASIC" ? "Basic" : options.tier === "GROWTH" ? "Growth" : options.tier === "PRO" ? "Pro" : "Custom"
    const base = options.base ?? options.amount
    const unit = options.guardUnit === undefined ? 999 : options.guardUnit
    await db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      ) values (
        $1, $2, $3, $4, $5, false, $6, $7, 25,
        admin_private.commercial_plan_conditions_hash_v1($3, $5, false, $6, $7, 25),
        'APPROVED', $8, now()
      )`,
      [randomUUID(), id, options.tier, label, options.minutes, base, unit, admin],
    )
  }
  await db.query(
    `update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`,
    [id, admin],
  )
  if (options.agreed !== false) await agreement("TELLOYA", terms)
  return id
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(randomBytes(32).toString("hex"))
  const started = await rpc<Result>("customer_portal_begin_login_v1", [email, pending])
  if (started.status !== "ok") throw new Error(`login did not start: ${JSON.stringify(started)}`)
  const confirmed = await rpc<Result>("customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(`otp confirm failed: ${JSON.stringify(confirmed)}`)
  const sessionHash = hash(randomBytes(32).toString("hex"))
  const finished = await rpc<Result>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(`otp finish failed: ${JSON.stringify(finished)}`)
  return sessionHash
}

async function ready(email: string, locations: number, planTier = "growth") {
  const payload = {
    fullName: "North Owner",
    email,
    phone: "07123456789",
    businessName: `${email} shop`,
    country: "United Kingdom",
    service: "telloya",
    subject: "Telloya receptionist",
    details: "Please set up Telloya for this shop.",
    websiteUrl: "",
    businessProfileUrl: "",
    reviewUrl: "",
    source: "phone",
    planTier,
    guardInterested: true,
    guardLocationCount: 2,
    overageInterested: false,
  }
  const enquiryId = (await db.query<{ id: string }>(
    `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
     values (gen_random_uuid(), md5($1::text), 'phone', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
    [JSON.stringify(payload)],
  )).rows[0].id
  const opened = await command("classify", { enquiryId, product: "TELLOYA", reason })
  const customer = (await rows<{ id: string }>("select id from public.customers where lower(email) = lower($1)", [email]))[0].id
  const matched = await command("match_customer", { enquiryId, customerId: customer, reason }, Number(opened.version))
  const business = await command("match_business", {
    enquiryId, create: true, name: `${email} shop`, website: "", membership: "verified", reason,
  }, Number(matched.version))
  let version = Number(business.version)
  const ids: string[] = []
  for (let index = 0; index < locations; index += 1) {
    const located = await command("select_locations", {
      enquiryId,
      locationIds: ids,
      create: true,
      locationName: `${email} shop ${index + 1}`,
      country: "United Kingdom",
      reason,
    }, version)
    if (located.status !== "success") throw new Error(`location ${JSON.stringify(located)}`)
    version = Number(located.version)
    ids.splice(0, ids.length, ...(await rows<{ location_id: string }>(
      `select location_id from admin_private.onboarding_request_locations
       where onboarding_request_id = (select id from public.onboarding_requests where enquiry_id = $1 and state not in ('DECLINED','CLOSED'))
       order by location_id`,
      [enquiryId],
    )).map(row => row.location_id))
  }
  return { enquiryId, version, locationIds: ids }
}

async function offerRef(enquiryId: string) {
  return (await rows<{ public_ref: string; id: string; amount_minor: number }>(
    `select sub.public_ref, sub.id, sub.amount_minor
     from public.onboarding_requests request
     join public.commercial_subscriptions sub on sub.id = request.commercial_subscription_id
     where request.enquiry_id = $1 and request.state = 'OFFERED'`,
    [enquiryId],
  ))[0]
}

async function accept(session: string, selector: string, priceMinor: number) {
  const readyOffer = await rpc<Result>("customer_portal_commercial_offer_v1", [session, selector])
  if (readyOffer.status !== "ready") throw new Error(`offer not ready ${JSON.stringify(readyOffer)}`)
  const agreement = readyOffer.agreement as { versionRef: string }
  const conditions = readyOffer.conditions as Record<string, unknown>
  return rpc<Result>("customer_portal_commercial_offer_command_v1", [
    session,
    randomUUID(),
    selector,
    JSON.stringify({
      offerVersion: readyOffer.offerVersion,
      priceMinor,
      taxBehaviour: readyOffer.taxBehaviour,
      taxMinor: readyOffer.taxMinor,
      cadence: readyOffer.cadence,
      agreementRef: agreement.versionRef,
      agreementAccepted: true,
      recurringConsent: true,
      confirmations: { business_authority: true },
      conditions: { ...conditions, overageOptIn: false, overageCapMinor: null },
    }),
  ])
}

async function unchangedPayments() {
  const found = await rows<{
    guard_subscriptions: number
    recovery_acceptances: number
    provisions: number
    entitlements: number
    allocations: number
    evidence: number
  }>(
    `select
      (select count(*)::int from public.guard_subscriptions) as guard_subscriptions,
      (select count(*)::int from public.paid_service_acceptances) as recovery_acceptances,
      (select count(*)::int from public.service_provisions) as provisions,
      (select count(*)::int from public.product_entitlements) as entitlements,
      (select count(*)::int from public.bundle_guard_allocations) as allocations,
      (select count(*)::int from public.commercial_payment_evidence) as evidence`,
  )
  expect(found[0]).toEqual({
    guard_subscriptions: 0,
    recovery_acceptances: 0,
    provisions: 0,
    entitlements: 0,
    allocations: 0,
    evidence: 0,
  })
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('c0b10000-0000-4000-8000-0000000000d1', 'alone.guard@example.com', now()),
      ('c0b10000-0000-4000-8000-0000000000d2', 'one.guard@example.com', now()),
      ('c0b10000-0000-4000-8000-0000000000d3', 'two.guard@example.com', now()),
      ('c0b10000-0000-4000-8000-0000000000d4', 'mixed.guard@example.com', now()),
      ('c0b10000-0000-4000-8000-0000000000d5', 'stranger.guard@example.com', now()),
      ('c0b10000-0000-4000-8000-0000000000d6', 'three.guard@example.com', now()),
      ('c0b10000-0000-4000-8000-0000000000d7', 'pair.guard@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
    insert into public.customers(id, full_name, email) values
      ('c0b10000-0000-4000-8000-0000000000a1', 'Alone Owner', 'alone.guard@example.com'),
      ('c0b10000-0000-4000-8000-0000000000a2', 'One Owner', 'one.guard@example.com'),
      ('c0b10000-0000-4000-8000-0000000000a3', 'Two Owner', 'two.guard@example.com'),
      ('c0b10000-0000-4000-8000-0000000000a4', 'Mixed Owner', 'mixed.guard@example.com'),
      ('c0b10000-0000-4000-8000-0000000000a5', 'Stranger Owner', 'stranger.guard@example.com'),
      ('c0b10000-0000-4000-8000-0000000000a6', 'Three Owner', 'three.guard@example.com'),
      ('c0b10000-0000-4000-8000-0000000000a7', 'Pair Owner', 'pair.guard@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
    select id, 'email', email, '${admin}', '${reason}' from public.customers where email like '%guard@example.com';
  `)
  await db.exec("BEGIN")
  await db.exec(`
    insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
    on conflict (code) do nothing;
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("Telloya and optional Relaunch Guard offers", () => {
  let growthOne = ""
  let growthTwo = ""

  it("shows only an offerable version as selectable and rechecks that choice", async () => {
    growthOne = await approvePlan({ tier: "GROWTH", version: 1, amount: 7900, minutes: 300, telloya: 1 })
    growthTwo = await approvePlan({ tier: "GROWTH", version: 2, amount: 7900, minutes: 300, telloya: 2 })
    await approvePlan({ tier: "GROWTH", version: 4, amount: 7900, minutes: 300, telloya: 4, base: 1000 })
    await approvePlan({ tier: "GROWTH", version: 5, amount: 7900, minutes: 300, telloya: 5, agreed: false })
    await approvePlan({ tier: "CUSTOM", version: 8, amount: 15000, minutes: null, telloya: 2, conditions: false, guardUnit: null })
    await db.exec("set local session_replication_role = replica")
    const mismatched = randomUUID()
    await db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref, approved_by, approved_at
      ) values ($1, 'TELLOYA', 6, 'BASIC', 'APPROVED', now() - interval '1 day', 'MONTH', 'GBP', 4900, 'NOT_APPLICABLE', 'TELLOYA-BASIC-6', $2, now())`,
      [mismatched, admin],
    )
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', 2, 'LOCATION')`,
      [mismatched],
    )
    await db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      ) values (
        $1, $2, 'GROWTH', 'Growth', 300, false, 4900, 999, 25,
        admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 4900, 999, 25),
        'APPROVED', $3, now()
      )`,
      [randomUUID(), mismatched, admin],
    )
    await db.exec("set local session_replication_role = origin")

    const opened = await ready("alone.guard@example.com", 2, "basic")
    const view = await rpc<Result>("admin_commercial_onboarding_v1", [token, opened.enquiryId])
    expect(view.requestedTier).toBe("basic")
    expect(view.requestedGuardInterest).toBe(true)
    expect(view.requestedGuardLocationCount).toBe(2)
    const plans = view.approvedPlans as PlanChoice[]
    expect(plans.find(plan => plan.telloyaQuantity === 2 && plan.tierCode === "GROWTH")).toMatchObject({ offerable: true, unavailableReason: null, amountMinor: 7900 })
    expect(plans.find(plan => plan.telloyaQuantity === 1)).toMatchObject({ offerable: false, unavailableReason: "locations" })
    expect(plans.find(plan => plan.telloyaQuantity === 4)).toMatchObject({ offerable: false, unavailableReason: "price" })
    expect(plans.find(plan => plan.telloyaQuantity === 5)).toMatchObject({ offerable: false, unavailableReason: "agreement" })
    expect(plans.find(plan => plan.tierCode === "CUSTOM")).toMatchObject({ offerable: false, unavailableReason: "quotation" })
    expect(plans.find(plan => plan.tierCode === "BASIC")).toMatchObject({ offerable: false, unavailableReason: "tier" })
    expect(await command("prepare_offer", { enquiryId: opened.enquiryId, reason }, opened.version)).toMatchObject({ status: "tier_required" })
    expect(await command("prepare_offer", { enquiryId: opened.enquiryId, planVersionId: growthOne, reason }, opened.version)).toMatchObject({ status: "terms_unconfigured", reason: "locations" })
    const payload = await rows<{ plan_tier: string }>("select payload->>'planTier' as plan_tier from public.enquiries where id = $1", [opened.enquiryId])
    expect(payload[0].plan_tier).toBe("basic")
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions"))[0].n).toBe(0)

    await db.exec("SAVEPOINT same_cap")
    await expect(db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      ) values ($1, 'TELLOYA', 7, 'GROWTH', 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', 7900, 'NOT_APPLICABLE', 'TELLOYA-GROWTH-7')`,
      [randomUUID()],
    ).then(() => db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
       select id, 'TELLOYA', 2, 'LOCATION' from public.plan_versions where version_number = 7 and tier_code = 'GROWTH'`,
    )).then(() => db.query(
      `update public.plan_versions set status = 'APPROVED', approved_by = $1, approved_at = now()
       where version_number = 7 and tier_code = 'GROWTH'`,
      [admin],
    ))).rejects.toThrow(/overlapping approved plan versions are not allowed/)
    await db.exec("ROLLBACK TO SAVEPOINT same_cap")

    const growthThree = await approvePlan({ tier: "GROWTH", version: 3, amount: 7900, minutes: 300, telloya: 3 })
    const three = await ready("three.guard@example.com", 3, "growth")
    const threeView = await rpc<Result>("admin_commercial_onboarding_v1", [token, three.enquiryId])
    const threePlans = threeView.approvedPlans as PlanChoice[]
    expect(threePlans.find(plan => plan.telloyaQuantity === 3)).toMatchObject({ offerable: true, tierCode: "GROWTH", amountMinor: 7900 })
    expect(threePlans.filter(plan => plan.tierCode === "GROWTH" && plan.telloyaQuantity !== 3).every(plan => plan.offerable === false)).toBe(true)
    const flat = await command("prepare_offer", { enquiryId: three.enquiryId, planVersionId: growthThree, guardLocationIds: [], reason }, three.version)
    expect(flat.status).toBe("success")
    expect((await offerRef(three.enquiryId)).amount_minor).toBe(7900)
  })

  it("keeps Guard interest off the Growth price until a location is confirmed", async () => {
    const opened = await ready("one.guard@example.com", 1, "growth")
    const key = randomUUID()
    const offered = await command("prepare_offer", { enquiryId: opened.enquiryId, planVersionId: growthOne, reason }, opened.version, key)
    expect(offered.status).toBe("success")
    expect(await command("prepare_offer", { enquiryId: opened.enquiryId, planVersionId: growthOne, reason }, opened.version, key)).toEqual(offered)
    const pinned = await offerRef(opened.enquiryId)
    expect(pinned.amount_minor).toBe(7900)
    expect(await rows(
      "select component_code, quantity from public.commercial_subscription_items where subscription_id = $1",
      [pinned.id],
    )).toEqual([{ component_code: "TELLOYA", quantity: 1 }])
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_offer_guard_locations where subscription_id = $1",
      [pinned.id],
    ))[0].n).toBe(0)
    const stranger = randomUUID()
    await db.query(
      `insert into public.businesses(id, display_name) values ($1, 'Somewhere else')`,
      [stranger],
    )
    const foreign = (await db.query<{ id: string }>(
      `insert into public.locations(business_id, location_name, country) values ($1, 'Foreign yard', 'United Kingdom') returning id`,
      [stranger],
    )).rows[0].id
    const other = await ready("stranger.guard@example.com", 1, "growth")
    expect(await command("prepare_offer", {
      enquiryId: other.enquiryId, planVersionId: growthOne, guardLocationIds: [foreign], reason,
    }, other.version)).toMatchObject({ status: "terms_unconfigured", reason: "guard" })
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.commercial_subscriptions where customer_id = 'c0b10000-0000-4000-8000-0000000000a5'",
    ))[0].n).toBe(0)
  })

  it("freezes Growth plus one Guard location at £88.99 and checks out that amount", async () => {
    const opened = await ready("two.guard@example.com", 1, "growth")
    const session = await portalSession("two.guard@example.com", "c0b10000-0000-4000-8000-0000000000d3")
    const stranger = await portalSession("stranger.guard@example.com", "c0b10000-0000-4000-8000-0000000000d5")
    const offered = await command("prepare_offer", {
      enquiryId: opened.enquiryId, planVersionId: growthOne, guardLocationIds: [opened.locationIds[0]], reason,
    }, opened.version)
    expect(offered.status).toBe("success")
    const pinned = await offerRef(opened.enquiryId)
    expect(pinned.amount_minor).toBe(8899)
    expect(await rows(
      "select component_code, quantity, quantity_limit_snapshot from public.commercial_subscription_items where subscription_id = $1 order by component_code",
      [pinned.id],
    )).toEqual([
      { component_code: "GUARD", quantity: 1, quantity_limit_snapshot: 1 },
      { component_code: "TELLOYA", quantity: 1, quantity_limit_snapshot: 1 },
    ])
    const hidden = await rpc<Result>("customer_portal_commercial_offer_v1", [stranger, pinned.public_ref])
    expect(hidden).toEqual({ status: "unavailable" })
    expect(JSON.stringify(hidden)).not.toContain("8899")
    const readyView = await rpc<Result>("customer_portal_commercial_offer_v1", [session, pinned.public_ref])
    expect(readyView).toMatchObject({
      status: "ready",
      priceMinor: 8899,
      totalMinor: 8899,
      locations: ["two.guard@example.com shop 1"],
      guardLocations: [{ locationId: opened.locationIds[0], locationName: "two.guard@example.com shop 1" }],
    })
    const rejected = await accept(session, pinned.public_ref, 7900)
    expect(rejected.status).toBe("conflict")
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_offer_acceptances where subscription_id = $1", [pinned.id]))[0].n).toBe(0)
    const accepted = await accept(session, pinned.public_ref, 8899)
    expect(accepted.status).toBe("success")
    expect(await rows(
      `select amount_minor, base_amount_minor, guard_included, guard_unit_amount_minor, guard_quantity
       from public.commercial_offer_acceptances where subscription_id = $1`,
      [pinned.id],
    )).toEqual([{
      amount_minor: 8899,
      base_amount_minor: 7900,
      guard_included: true,
      guard_unit_amount_minor: 999,
      guard_quantity: 1,
    }])
    const snapshot = await rows<{ terms_snapshot: { priceMinor: number; guardLocations: unknown[] } }>(
      "select terms_snapshot from public.commercial_offer_acceptances where subscription_id = $1",
      [pinned.id],
    )
    expect(snapshot[0].terms_snapshot.priceMinor).toBe(8899)
    expect(snapshot[0].terms_snapshot.guardLocations).toHaveLength(1)
    const acceptedView = await rpc<Result>("customer_portal_commercial_offer_v1", [session, pinned.public_ref])
    expect(acceptedView).toMatchObject({
      status: "accepted",
      priceMinor: 8899,
      totalMinor: 8899,
      guardLocations: [{ locationId: opened.locationIds[0], locationName: "two.guard@example.com shop 1" }],
    })
    const checkout = await rpc<Result>("customer_portal_commercial_payment_prepare_v1", [session, randomUUID(), pinned.public_ref])
    expect(checkout.status).toBe("success")
    expect(checkout.amountMinor).toBe(8899)
    expect(await rows(
      `select amount_minor, guard_quantity, guard_charge_minor, stripe_product_id, stripe_price_id, checkout_session_id
       from public.commercial_checkout_preparations where subscription_id = $1`,
      [pinned.id],
    )).toEqual([{
      amount_minor: 8899,
      guard_quantity: 1,
      guard_charge_minor: 999,
      stripe_product_id: null,
      stripe_price_id: null,
      checkout_session_id: null,
    }])
    await unchangedPayments()
  })

  it("prices two Guard locations separately from two Telloya locations", async () => {
    const both = await ready("mixed.guard@example.com", 2, "growth")
    const oneGuard = await command("prepare_offer", {
      enquiryId: both.enquiryId,
      planVersionId: growthTwo,
      guardLocationIds: [both.locationIds[0]],
      reason,
    }, both.version)
    expect(oneGuard.status).toBe("success")
    const pinned = await offerRef(both.enquiryId)
    expect(pinned.amount_minor).toBe(8899)
    expect(await rows(
      "select component_code, quantity from public.commercial_subscription_items where subscription_id = $1 order by component_code",
      [pinned.id],
    )).toEqual([
      { component_code: "GUARD", quantity: 1 },
      { component_code: "TELLOYA", quantity: 2 },
    ])
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_offer_guard_locations where subscription_id = $1",
      [pinned.id],
    ))[0].n).toBe(1)
    const mixedSession = await portalSession("mixed.guard@example.com", "c0b10000-0000-4000-8000-0000000000d4")
    const mixedGuard = (await rows<{ location_name: string }>(
      "select location_name from public.locations where id = $1",
      [both.locationIds[0]],
    ))[0].location_name
    const mixedCovered = (await rows<{ location_name: string }>(
      "select location_name from public.locations where id = any($1::uuid[]) order by location_name",
      [both.locationIds],
    )).map(row => row.location_name)
    expect(await rpc<Result>("customer_portal_commercial_offer_v1", [mixedSession, pinned.public_ref])).toMatchObject({
      status: "ready",
      priceMinor: 8899,
      locations: mixedCovered,
      guardLocations: [{ locationId: both.locationIds[0], locationName: mixedGuard }],
    })

    const pair = await ready("pair.guard@example.com", 2, "growth")
    const bothGuards = await command("prepare_offer", {
      enquiryId: pair.enquiryId,
      planVersionId: growthTwo,
      guardLocationIds: pair.locationIds,
      reason,
    }, pair.version)
    expect(bothGuards.status).toBe("success")
    const pairOffer = await offerRef(pair.enquiryId)
    expect(pairOffer.amount_minor).toBe(9898)
    expect(await rows(
      "select component_code, quantity from public.commercial_subscription_items where subscription_id = $1 order by component_code",
      [pairOffer.id],
    )).toEqual([
      { component_code: "GUARD", quantity: 2 },
      { component_code: "TELLOYA", quantity: 2 },
    ])
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_offer_guard_locations where subscription_id = $1",
      [pairOffer.id],
    ))[0].n).toBe(2)
    const pairSession = await portalSession("pair.guard@example.com", "c0b10000-0000-4000-8000-0000000000d7")
    const pairAccepted = await accept(pairSession, pairOffer.public_ref, 9898)
    expect(pairAccepted.status).toBe("success")
    const pairNames = (await rows<{ id: string; location_name: string }>(
      "select id, location_name from public.locations where id = any($1::uuid[]) order by location_name",
      [pair.locationIds],
    ))
    expect(await rpc<Result>("customer_portal_commercial_offer_v1", [pairSession, pairOffer.public_ref])).toMatchObject({
      status: "accepted",
      priceMinor: 9898,
      totalMinor: 9898,
      locations: pairNames.map(row => row.location_name),
      guardLocations: pairNames.map(row => ({ locationId: row.id, locationName: row.location_name })),
    })
    const pairCheckout = await rpc<Result>("customer_portal_commercial_payment_prepare_v1", [pairSession, randomUUID(), pairOffer.public_ref])
    expect(pairCheckout).toMatchObject({ status: "success", amountMinor: 9898 })
    expect((await rows<{ stripe_price_id: string | null; amount_minor: number }>(
      "select amount_minor, stripe_price_id from public.commercial_checkout_preparations where subscription_id = $1",
      [pairOffer.id],
    ))[0]).toEqual({ amount_minor: 9898, stripe_price_id: null })
    await unchangedPayments()
  })
})
