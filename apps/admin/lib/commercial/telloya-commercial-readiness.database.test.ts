/**
 * Local rehearsal of the Telloya commercial journey.
 * PGlite only. No hosted migration, catalogue row, Stripe call, or email.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"
import { appliedMigrationHead, chainAfter, findMigration, pendingMigrations } from "../recovery/manifest"
import {
  installTelloyaCatalogueFixture,
  telloyaCatalogueFixtureMarker,
  telloyaCataloguePlans,
  telloyaLocationCapDecision,
  telloyaPublishedPrices,
} from "./telloya-catalogue.fixture"

const commercialTail = [
  "20261105130000_admin_commercial_begin_setup_v1.sql",
  "20261105144256_admin_commercial_confirm_preferences_v1.sql",
  "20261105172055_admin_commercial_confirm_ai_configuration_v1.sql",
  "20261105180000_telloya_tier_catalogue_v1.sql",
  "20261105190000_telloya_guard_addon_v1.sql",
  "20261105200000_admin_commercial_record_number_allocation_v1.sql",
  "20261106003939_admin_commercial_record_forwarding_instructions_v1.sql",
]

describe("Telloya commercial migration chain", () => {
  it("records the commercial tail as applied and leaves nothing pending", () => {
    expect(appliedMigrationHead.filename).toBe("20261111130000_telloya_marketing_enquiry_retention_v1.sql")
    expect(appliedMigrationHead.appliedToDev).toBe(true)
    expect(appliedMigrationHead.containsDataChange).toBe(false)
    expect(appliedMigrationHead.safeToReplay).toBe(false)
    const pending = pendingMigrations()
    const afterPreviousHead = chainAfter("20261105120000")
    expect(afterPreviousHead.slice(0, commercialTail.length).map(entry => entry.filename)).toEqual(commercialTail)
    expect(pending.map(entry => entry.filename)).toEqual(chainAfter(appliedMigrationHead.version).map(entry => entry.filename))
    expect(pending.every(entry => entry.appliedToDev === false && entry.containsDataChange === false && entry.safeToReplay === false)).toBe(true)
    for (const filename of commercialTail) {
      expect(pending.map(entry => entry.filename)).not.toContain(filename)
      expect(findMigration(filename)).toMatchObject({
        appliedToDev: true,
        containsDataChange: false,
        safeToReplay: false,
      })
      const source = readFileSync(new URL(`../../../../supabase/migrations/${filename}`, import.meta.url), "utf8")
      expect(source).toContain("Do not apply")
      expect(source).toContain("Production")
    }
    const allocation = readFileSync(new URL("../../../../supabase/migrations/20261105200000_admin_commercial_record_number_allocation_v1.sql", import.meta.url), "utf8")
    const forwarding = readFileSync(new URL("../../../../supabase/migrations/20261106003939_admin_commercial_record_forwarding_instructions_v1.sql", import.meta.url), "utf8")
    expect(allocation).toContain("Does not buy a number")
    expect(allocation).not.toContain("state = 'LIVE'")
    expect(forwarding).toContain("It does not enable forwarding, place a test call, or")
    expect(forwarding).not.toContain("state = 'LIVE'")
  })
})

const db = new PGlite()
const sessions = new Map<string, string>()
const admin = "c01c0000-0000-4000-8000-0000000000aa"
const token = "ab".repeat(32)
const reason = "The customer confirmed this commercial offer today."
const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"
const stripeCustomer = "cus_ReadyAlone01"

const people = [
  ["c01c0000-0000-4000-8000-0000000000a1", "c01c0000-0000-4000-8000-0000000000d1", "growth.alone@example.test"],
  ["c01c0000-0000-4000-8000-0000000000a2", "c01c0000-0000-4000-8000-0000000000d2", "growth.one@example.test"],
  ["c01c0000-0000-4000-8000-0000000000a3", "c01c0000-0000-4000-8000-0000000000d3", "growth.two@example.test"],
  ["c01c0000-0000-4000-8000-0000000000a4", "c01c0000-0000-4000-8000-0000000000d4", "custom.match@example.test"],
  ["c01c0000-0000-4000-8000-0000000000a5", "c01c0000-0000-4000-8000-0000000000d5", "custom.miss@example.test"],
  ["c01c0000-0000-4000-8000-0000000000a6", "c01c0000-0000-4000-8000-0000000000d6", "stranger.ready@example.test"],
  ["c01c0000-0000-4000-8000-0000000000a7", "c01c0000-0000-4000-8000-0000000000d7", "amend.open@example.test"],
  ["c01c0000-0000-4000-8000-0000000000a8", "c01c0000-0000-4000-8000-0000000000d8", "amend.mail@example.test"],
] as const

type Result = Record<string, unknown>
type PlanChoice = { id: string; tierCode: string; telloyaQuantity: number; amountMinor: number; offerable: boolean; unavailableReason: string | null }

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

async function ready(email: string, locations: number, planTier: string) {
  const payload = {
    fullName: "North Owner",
    email,
    phone: "07123456789",
    businessName: `${email} shop`,
    country: "United Kingdom",
    service: "telloya",
    subject: "Telloya receptionist",
    details: "Please set up Telloya for this shop.",
    source: "phone",
    planTier,
    guardInterested: true,
    guardLocationCount: 2,
    overageInterested: true,
    overageMonthlyCapGbp: 40,
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

async function offerRow(enquiryId: string) {
  return (await rows<{ public_ref: string; id: string; amount_minor: number; customer_id: string; business_id: string; record_version: number }>(
    `select sub.public_ref, sub.id, sub.amount_minor, sub.customer_id, sub.business_id, sub.record_version
     from public.onboarding_requests request
     join public.commercial_subscriptions sub on sub.id = request.commercial_subscription_id
     where request.enquiry_id = $1 and request.state = 'OFFERED'`,
    [enquiryId],
  ))[0]
}

async function submit(session: string, selector: string, priceMinor: number) {
  const readyOffer = await rpc<Result>("customer_portal_commercial_offer_v1", [session, selector])
  if (readyOffer.status !== "ready" && readyOffer.status !== "accepted") throw new Error(`offer not ready ${JSON.stringify(readyOffer)}`)
  const agreement = readyOffer.agreement as { versionRef: string }
  const conditions = readyOffer.conditions as Record<string, unknown>
  expect(String(agreement.versionRef)).toContain("TELLOYA-TEST-")
  expect(String(JSON.stringify(readyOffer))).toContain(telloyaCatalogueFixtureMarker)
  const accepted = await rpc<Result>("customer_portal_commercial_offer_command_v1", [
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
  return { accepted, agreementRef: agreement.versionRef, offer: readyOffer }
}

async function activation(subscriptionId: string) {
  return (await rows<{
    entitlements: number
    guard_entitlements: number
    live: number
    provisions: number
    allocations: number
    guard_coverages: number
    evidence: number
  }>(
    `select
      (select count(*)::int from public.product_entitlements where commercial_subscription_id = $1) as entitlements,
      (select count(*)::int from public.product_entitlements where commercial_subscription_id = $1 and component_code = 'GUARD') as guard_entitlements,
      (select count(*)::int from public.service_provisions provision
        join public.product_entitlements entitlement on entitlement.id = provision.entitlement_id
        where entitlement.commercial_subscription_id = $1 and provision.state = 'LIVE') as live,
      (select count(*)::int from public.service_provisions provision
        join public.product_entitlements entitlement on entitlement.id = provision.entitlement_id
        where entitlement.commercial_subscription_id = $1) as provisions,
      (select count(*)::int from admin_private.commercial_location_allocations allocation
        join public.product_entitlements entitlement on entitlement.id = allocation.entitlement_id
        where entitlement.commercial_subscription_id = $1) as allocations,
      (select count(*)::int from public.guard_coverages) as guard_coverages,
      (select count(*)::int from public.commercial_payment_evidence where subscription_id = $1) as evidence`,
    [subscriptionId],
  ))[0]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ${people.map(([, auth, email]) => `('${auth}', '${email}', now())`).join(",\n")};
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
    insert into public.customers(id, full_name, email) values
      ${people.map(([id, , email]) => `('${id}', 'Owner', '${email}')`).join(",\n")};
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
    select id, 'email', email, '${admin}', '${reason}' from public.customers where email like '%@example.test';
  `)
  await installTelloyaCatalogueFixture(db, admin)
  await installTelloyaCatalogueFixture(db, admin)
  for (const [, auth, email] of people) sessions.set(email, await portalSession(email, auth))
}, 180000)

afterAll(async () => { await db.close() })

describe("Telloya commercial readiness rehearsal", () => {
  it("installs the rehearsal catalogue once and keeps the cap-2 Growth row as a rehearsal", async () => {
    const before = await rows<{ plans: number; agreements: number; caps: number; products: string }>(
      `select
        (select count(*)::int from public.plan_versions where terms_ref like 'TELLOYA-TEST-%') as plans,
        (select count(*)::int from public.commercial_agreement_versions where version_ref like 'TELLOYA-TEST-%') as agreements,
        (select count(*)::int from public.plan_components where plan_version_id = any($1::uuid[])) as caps,
        (select string_agg(status, ',' order by code) from public.product_catalogue) as products`,
      [Object.values(telloyaCataloguePlans)],
    )
    const versions = await rows<{ record_version: number }>(
      "select record_version from public.plan_versions where id = $1",
      [telloyaCataloguePlans.growthCap1],
    )
    await installTelloyaCatalogueFixture(db, admin)
    const after = await rows<{ plans: number; agreements: number; caps: number; products: string }>(
      `select
        (select count(*)::int from public.plan_versions where terms_ref like 'TELLOYA-TEST-%') as plans,
        (select count(*)::int from public.commercial_agreement_versions where version_ref like 'TELLOYA-TEST-%') as agreements,
        (select count(*)::int from public.plan_components where plan_version_id = any($1::uuid[])) as caps,
        (select string_agg(status, ',' order by code) from public.product_catalogue) as products`,
      [Object.values(telloyaCataloguePlans)],
    )
    expect(after).toEqual(before)
    expect(after[0]).toEqual({ plans: 6, agreements: 6, caps: 6, products: "DRAFT,DRAFT" })
    expect((await rows<{ record_version: number }>("select record_version from public.plan_versions where id = $1", [telloyaCataloguePlans.growthCap1]))[0]).toEqual(versions[0])
    const stored = await rows<{ body_text: string; quantity_limit: number }>(
      `select agreement.body_text, component.quantity_limit
       from public.plan_versions plan
       join public.commercial_agreement_versions agreement
         on agreement.product_code = plan.product_code and agreement.version_ref = plan.terms_ref
       join public.plan_components component on component.plan_version_id = plan.id
       where plan.id = any($1::uuid[])`,
      [Object.values(telloyaCataloguePlans)],
    )
    expect(stored.every(row => row.body_text.startsWith(telloyaCatalogueFixtureMarker))).toBe(true)
    expect(stored.map(row => row.quantity_limit).sort()).toEqual([1, 1, 1, 1, 2, 2])
    const statuses = await rows<{ id: string; status: string }>(
      `select id::text as id, status from public.plan_versions where id = any($1::uuid[])`,
      [Object.values(telloyaCataloguePlans)],
    )
    expect(statuses.find(row => row.id === telloyaCataloguePlans.growthCap2)?.status).toBe("DRAFT")
    expect(statuses.filter(row => row.id !== telloyaCataloguePlans.growthCap2).every(row => row.status === "APPROVED")).toBe(true)
    await expect(db.query(
      `update public.plan_versions
       set status = 'APPROVED', approved_by = $2, approved_at = now()
       where id = $1`,
      [telloyaCataloguePlans.growthCap2, admin],
    )).rejects.toThrow(/standard Telloya plan includes exactly one location/)
    expect((await rows<{ status: string }>(
      "select status from public.plan_versions where id = $1",
      [telloyaCataloguePlans.growthCap2],
    ))[0].status).toBe("DRAFT")
    expect(telloyaLocationCapDecision.status).toBe("REHEARSAL ONLY")
    expect(telloyaLocationCapDecision.approvedStandardLocations).toBe(1)
    expect(telloyaLocationCapDecision.approvedStandardNumbers).toBe(1)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.plan_versions where product_code = 'COMPLETE'"))[0].n).toBe(0)
    const installed = await rows<{ proname: string }>(
      `select proname from pg_proc
       where proname in (
         'admin_commercial_begin_setup_v1',
         'admin_commercial_confirm_preferences_v1',
         'admin_commercial_confirm_ai_configuration_v1',
         'admin_commercial_record_number_allocation_v1',
         'admin_commercial_record_forwarding_instructions_v1'
       )`,
    )
    expect(installed.map(row => row.proname).sort()).toEqual([
      "admin_commercial_begin_setup_v1",
      "admin_commercial_confirm_ai_configuration_v1",
      "admin_commercial_confirm_preferences_v1",
      "admin_commercial_record_forwarding_instructions_v1",
      "admin_commercial_record_number_allocation_v1",
    ])
    const guardCommand = await rows<{ present: boolean }>(
      `select pg_get_functiondef(p.oid) like '%commercial_offer_guard_locations%' as present
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_commercial_command_v1'`,
    )
    expect(guardCommand[0].present).toBe(true)
    expect((await rows<{ present: string | null }>("select to_regclass('admin_private.commercial_offer_guard_locations') as present"))[0].present).toBe("admin_private.commercial_offer_guard_locations")
  })

  it("prices confirmed Guard separately from enquiry interest and retries the same submission key", async () => {
    const one = await ready("growth.one@example.test", 1, "growth")
    const oneSession = sessions.get("growth.one@example.test") ?? ""
    const stranger = sessions.get("stranger.ready@example.test") ?? ""
    const oneKey = randomUUID()
    expect(await command("prepare_offer", {
      enquiryId: one.enquiryId, planVersionId: telloyaCataloguePlans.growthCap1, guardLocationIds: [one.locationIds[0]], reason,
    }, one.version - 1, oneKey)).toMatchObject({ status: "conflict", reason: "version" })
    const oneOffer = await command("prepare_offer", {
      enquiryId: one.enquiryId, planVersionId: telloyaCataloguePlans.growthCap1, guardLocationIds: [one.locationIds[0]], reason,
    }, one.version, oneKey)
    expect(oneOffer.status).toBe("success")
    expect(await command("prepare_offer", {
      enquiryId: one.enquiryId, planVersionId: telloyaCataloguePlans.growthCap1, guardLocationIds: [one.locationIds[0]], reason,
    }, one.version, oneKey)).toEqual(oneOffer)
    const oneRow = await offerRow(one.enquiryId)
    expect(oneRow.amount_minor).toBe(8899)
    expect(await rpc<Result>("customer_portal_commercial_offer_v1", [stranger, oneRow.public_ref])).toEqual({ status: "unavailable" })
    const oneView = await rpc<Result>("customer_portal_commercial_offer_v1", [oneSession, oneRow.public_ref])
    expect(oneView).toMatchObject({
      status: "ready",
      priceMinor: 8899,
      totalMinor: 8899,
      guardLocations: [{ locationId: one.locationIds[0], locationName: "growth.one@example.test shop 1" }],
    })
    const rejected = await submit(oneSession, oneRow.public_ref, 7900)
    expect(rejected.accepted.status).toBe("conflict")
    const acceptedOne = await submit(oneSession, oneRow.public_ref, 8899)
    expect(acceptedOne.accepted.status).toBe("success")
    expect(acceptedOne.agreementRef).toBe("TELLOYA-TEST-GROWTH-CAP-1")
    const checkout = await rpc<Result>("customer_portal_commercial_payment_prepare_v1", [oneSession, randomUUID(), oneRow.public_ref])
    expect(checkout).toMatchObject({ status: "success", amountMinor: 8899 })
    expect((await rows<{ stripe_product_id: string | null; stripe_price_id: string | null; checkout_session_id: string | null; livemode: boolean }>(
      "select stripe_product_id, stripe_price_id, checkout_session_id, livemode from public.commercial_checkout_preparations where subscription_id = $1",
      [oneRow.id],
    ))[0]).toEqual({ stripe_product_id: null, stripe_price_id: null, checkout_session_id: null, livemode: false })
    const pendingHandover = await rpc<{ subscriptions: Result[] }>("customer_portal_setup_handover_v1", [oneSession])
    const pending = pendingHandover.subscriptions.find(entry => entry.reference === oneRow.public_ref)
    expect(pending?.financialStatus).not.toBe("verified")
    expect((pending?.guard as Result).monitoringActive).toBe(false)
    expect(await activation(oneRow.id)).toMatchObject({ entitlements: 0, live: 0, provisions: 0, allocations: 0, evidence: 0, guard_coverages: 0 })

    const two = await ready("growth.two@example.test", 1, "growth")
    const secondGuard = (await db.query<{ id: string }>(
      `insert into public.locations(business_id, location_name, country)
       values ((select business_id from public.onboarding_requests where enquiry_id = $1), 'Guard only yard', 'United Kingdom')
       returning id`,
      [two.enquiryId],
    )).rows[0].id
    const twoOffer = await command("prepare_offer", {
      enquiryId: two.enquiryId,
      planVersionId: telloyaCataloguePlans.growthCap1,
      guardLocationIds: [two.locationIds[0], secondGuard],
      reason,
    }, two.version)
    expect(twoOffer.status).toBe("success")
    const twoRow = await offerRow(two.enquiryId)
    expect(twoRow.amount_minor).toBe(9898)
    const twoSession = sessions.get("growth.two@example.test") ?? ""
    expect((await submit(twoSession, twoRow.public_ref, 9898)).accepted.status).toBe("success")
    expect(await rpc<Result>("customer_portal_commercial_payment_prepare_v1", [twoSession, randomUUID(), twoRow.public_ref])).toMatchObject({ status: "success", amountMinor: 9898 })
    const overage = await rows<{ overage_opt_in: boolean; overage_cap_minor: number | null }>(
      "select overage_opt_in, overage_cap_minor from public.commercial_offer_acceptances where subscription_id = any($1::uuid[])",
      [[oneRow.id, twoRow.id]],
    )
    expect(overage).toHaveLength(2)
    expect(overage.every(row => row.overage_opt_in === false && row.overage_cap_minor === null)).toBe(true)
  })

  it("settles Growth at the accepted £79 and leaves setup, numbering and activation separate", async () => {
    const opened = await ready("growth.alone@example.test", 1, "growth")
    const session = sessions.get("growth.alone@example.test") ?? ""
    expect((await command("prepare_offer", {
      enquiryId: opened.enquiryId, planVersionId: telloyaCataloguePlans.growthCap1, guardLocationIds: [], reason,
    }, opened.version)).status).toBe("success")
    const pinned = await offerRow(opened.enquiryId)
    expect((await submit(session, pinned.public_ref, 7900)).accepted.status).toBe("success")
    const started = await rpc<Result>("customer_portal_commercial_payment_prepare_v1", [session, randomUUID(), pinned.public_ref])
    expect(started).toMatchObject({ status: "success", amountMinor: 7900 })
    expect((await rows<{ stripe_product_id: string | null; stripe_price_id: string | null; checkout_session_id: string | null; livemode: boolean }>(
      "select stripe_product_id, stripe_price_id, checkout_session_id, livemode from public.commercial_checkout_preparations where subscription_id = $1",
      [pinned.id],
    ))[0]).toEqual({ stripe_product_id: null, stripe_price_id: null, checkout_session_id: null, livemode: false })
    const current = await rows<{ subscription_version: number; request_id: string; request_version: number; business_id: string }>(
      `select subscription.record_version as subscription_version, request.id as request_id,
              request.record_version as request_version, subscription.business_id
       from public.commercial_subscriptions subscription
       join public.onboarding_requests request on request.commercial_subscription_id = subscription.id
       where subscription.id = $1`,
      [pinned.id],
    )
    const early = await rpc<Result>("admin_commercial_begin_setup_v1", [
      token, randomUUID(), pinned.id, current[0].subscription_version,
      JSON.stringify({
        customerId: pinned.customer_id,
        businessId: current[0].business_id,
        onboardingRequestId: current[0].request_id,
        onboardingVersion: current[0].request_version,
        reason,
      }),
    ])
    expect(early).toMatchObject({ status: "denied", reason: "payment" })
    expect((await activation(pinned.id)).entitlements).toBe(0)

    const ids = {
      priceId: "price_ReadyAlone01",
      sessionId: "cs_test_ready0001",
      eventId: "evt_ready0001",
      invoiceId: "in_ready0001",
      stripeSubscriptionId: "sub_ready0001",
    }
    expect((await rpc<Result>("commercial_payment_record_price_v1", [started.priceOperationId, ids.priceId, "prod_ReadyAlone01"])).status).toBe("success")
    await db.query(
      `insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values ($1, $2)`,
      [pinned.customer_id, stripeCustomer],
    )
    expect((await rpc<Result>("commercial_payment_record_checkout_v1", [started.providerOperationId, ids.sessionId])).status).toBe("success")
    await rpc("payment_receive_stripe_event_v1", [ids.eventId, "invoice.paid", ids.invoiceId, false])
    const leased = await rpc<Result>("commercial_payment_invoice_claim_v1", [ids.eventId, ids.priceId, stripeCustomer])
    const facts = {
      eventId: ids.eventId,
      invoiceId: ids.invoiceId,
      checkoutSessionId: ids.sessionId,
      stripeCustomerId: stripeCustomer,
      stripeSubscriptionId: ids.stripeSubscriptionId,
      checkoutSubscriptionId: ids.stripeSubscriptionId,
      stripePriceId: ids.priceId,
      currency: "gbp",
      invoiceStatus: "paid",
      amountDueMinor: 7900,
      amountPaidMinor: 7900,
      quantity: 1,
      lineCount: 1,
      discountMinor: 0,
      taxMinor: 0,
      periodStart,
      periodEnd,
      billingReason: "subscription_create",
      livemode: false,
      automaticTax: false,
      trial: false,
      refunded: false,
      disputed: false,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      schedulePresent: false,
      subscriptionLivemode: false,
      subscriptionCustomerId: stripeCustomer,
      subscriptionPriceId: ids.priceId,
      subscriptionQuantity: 1,
      subscriptionPeriodStart: periodStart,
      subscriptionPeriodEnd: periodEnd,
      commercialCustomerId: pinned.customer_id,
      commercialSubscriptionId: pinned.id,
      acceptanceId: String(started.acceptanceId),
      checkoutOperationId: String(started.providerOperationId),
      checkoutMode: "subscription",
      checkoutStatus: "complete",
      checkoutPaymentStatus: "paid",
      checkoutLivemode: false,
      checkoutCustomerId: stripeCustomer,
      conflictingMetadata: false,
      checkoutMetadataCustomerId: pinned.customer_id,
      checkoutMetadataSubscriptionId: pinned.id,
      checkoutMetadataAcceptanceId: String(started.acceptanceId),
      checkoutMetadataOperationId: String(started.providerOperationId),
      subscriptionMetadataCustomerId: pinned.customer_id,
      subscriptionMetadataSubscriptionId: pinned.id,
      subscriptionMetadataAcceptanceId: String(started.acceptanceId),
      subscriptionMetadataOperationId: String(started.providerOperationId),
    }
    const settled = await rpc<Result>("commercial_payment_settle_initial_invoice_v1", [leased.jobId, leased.leaseToken, JSON.stringify(facts)])
    expect(settled.status).toBe("settled")
    expect((await rows<{ amount_minor: number }>("select amount_minor from public.commercial_payment_evidence where subscription_id = $1", [pinned.id]))[0].amount_minor).toBe(7900)
    const paid = await rpc<{ subscriptions: Result[] }>("customer_portal_setup_handover_v1", [session])
    expect(paid.subscriptions.find(entry => entry.reference === pinned.public_ref)).toMatchObject({
      financialStatus: "verified",
      operationalStatus: "not_started",
      customerDisplay: "Payment received — setup pending",
    })
    expect((await activation(pinned.id)).entitlements).toBe(0)

    const refreshed = await rows<{ subscription_version: number; request_id: string; request_version: number; business_id: string }>(
      `select subscription.record_version as subscription_version, request.id as request_id,
              request.record_version as request_version, subscription.business_id
       from public.commercial_subscriptions subscription
       join public.onboarding_requests request on request.commercial_subscription_id = subscription.id
       where subscription.id = $1`,
      [pinned.id],
    )
    const staleSetup = await rpc<Result>("admin_commercial_begin_setup_v1", [
      token, randomUUID(), pinned.id, refreshed[0].subscription_version - 1,
      JSON.stringify({
        customerId: pinned.customer_id,
        businessId: refreshed[0].business_id,
        onboardingRequestId: refreshed[0].request_id,
        onboardingVersion: refreshed[0].request_version,
        reason,
      }),
    ])
    expect(staleSetup).toMatchObject({ status: "conflict", reason: "version" })
    const startedSetup = await rpc<Result>("admin_commercial_begin_setup_v1", [
      token, randomUUID(), pinned.id, refreshed[0].subscription_version,
      JSON.stringify({
        customerId: pinned.customer_id,
        businessId: refreshed[0].business_id,
        onboardingRequestId: refreshed[0].request_id,
        onboardingVersion: refreshed[0].request_version,
        reason,
      }),
    ])
    expect(startedSetup).toMatchObject({ status: "success", operationalStatus: "setup_started", provisionState: "PROFILE_REQUIRED" })
    expect(await activation(pinned.id)).toMatchObject({
      entitlements: 1,
      guard_entitlements: 0,
      live: 0,
      provisions: 1,
      allocations: 0,
      guard_coverages: 0,
      evidence: 1,
    })
    const hidden = await rpc<{ subscriptions: Result[] }>("customer_portal_setup_handover_v1", [
      sessions.get("stranger.ready@example.test") ?? "",
    ])
    expect(hidden.subscriptions.find(entry => entry.reference === pinned.public_ref)).toBeUndefined()
    expect((await rows<{ n: number }>("select count(*)::int as n from public.cases"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.paid_service_acceptances"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.guard_subscriptions"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_checkout_preparations where livemode = true"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_forwarding_instructions"))[0].n).toBe(0)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.service_provisions where state = 'LIVE' or forwarding_instructed_at is not null or live_at is not null",
    ))[0].n).toBe(0)
  })

  it("offers a matching Custom quotation and refuses a location cap that was not approved", async () => {
    const matched = await ready("custom.match@example.test", 1, "custom")
    const matchedView = await rpc<Result>("admin_commercial_onboarding_v1", [token, matched.enquiryId])
    const matchedPlans = matchedView.approvedPlans as PlanChoice[]
    expect(matchedPlans.find(plan => plan.id === telloyaCataloguePlans.customCap1)).toMatchObject({
      offerable: true, unavailableReason: null, amountMinor: telloyaPublishedPrices.testCustomQuotationMinor, telloyaQuantity: 1,
    })
    expect(matchedPlans.find(plan => plan.id === telloyaCataloguePlans.customCap2)).toMatchObject({ offerable: false, unavailableReason: "locations" })
    expect(matchedPlans.find(plan => plan.id === telloyaCataloguePlans.growthCap2)).toBeUndefined()
    const quoted = await command("prepare_offer", {
      enquiryId: matched.enquiryId, planVersionId: telloyaCataloguePlans.customCap1, guardLocationIds: [], reason,
    }, matched.version)
    expect(quoted.status).toBe("success")
    expect((await offerRow(matched.enquiryId)).amount_minor).toBe(15000)

    const missed = await ready("custom.miss@example.test", 2, "custom")
    const missedView = await rpc<Result>("admin_commercial_onboarding_v1", [token, missed.enquiryId])
    const missedPlans = missedView.approvedPlans as PlanChoice[]
    expect(missedPlans.find(plan => plan.id === telloyaCataloguePlans.customCap1)).toMatchObject({ offerable: false, unavailableReason: "locations" })
    expect(missedPlans.find(plan => plan.id === telloyaCataloguePlans.growthCap1)).toMatchObject({ offerable: false, unavailableReason: "locations" })
    expect(missedPlans.find(plan => plan.id === telloyaCataloguePlans.customCap2)).toMatchObject({
      offerable: true,
      amountMinor: telloyaPublishedPrices.testCustomTwoLocationMinor,
      telloyaQuantity: 2,
    })
    expect(missedPlans.find(plan => plan.id === telloyaCataloguePlans.growthCap2)).toBeUndefined()
    expect(await command("prepare_offer", {
      enquiryId: missed.enquiryId, planVersionId: telloyaCataloguePlans.growthCap1, guardLocationIds: [], reason,
    }, missed.version)).toMatchObject({ status: "terms_unconfigured", reason: "locations" })
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.commercial_subscriptions sub join public.onboarding_requests request on request.commercial_subscription_id = sub.id where request.enquiry_id = $1",
      [missed.enquiryId],
    ))[0].n).toBe(0)

    const foreignBusiness = randomUUID()
    await db.query("insert into public.businesses(id, display_name) values ($1, 'Somewhere else')", [foreignBusiness])
    const foreign = (await db.query<{ id: string }>(
      "insert into public.locations(business_id, location_name, country) values ($1, 'Foreign yard', 'United Kingdom') returning id",
      [foreignBusiness],
    )).rows[0].id
    expect(await command("prepare_offer", {
      enquiryId: missed.enquiryId, planVersionId: telloyaCataloguePlans.customCap2, guardLocationIds: [foreign], reason,
    }, missed.version)).toMatchObject({ status: "terms_unconfigured", reason: "guard" })
    expect((await command("prepare_offer", {
      enquiryId: missed.enquiryId, planVersionId: telloyaCataloguePlans.customCap2, guardLocationIds: [], reason,
    }, missed.version)).status).toBe("success")
    expect((await offerRow(missed.enquiryId)).amount_minor).toBe(telloyaPublishedPrices.testCustomTwoLocationMinor)
  })

  it("keeps amendments and offer mail on the commercial subscription", async () => {
    const opened = await ready("amend.open@example.test", 1, "growth")
    const session = sessions.get("amend.open@example.test") ?? ""
    expect((await command("prepare_offer", {
      enquiryId: opened.enquiryId, planVersionId: telloyaCataloguePlans.growthCap1, guardLocationIds: [], reason,
    }, opened.version)).status).toBe("success")
    const offer = await offerRow(opened.enquiryId)
    const amended = await rpc<Result>("telloya_offer_amendment_v1", [
      session, randomUUID(), offer.public_ref, "Please change the greeting.",
    ])
    expect(amended).toMatchObject({ status: "recorded", version: 1, subscriptionVersion: offer.record_version })
    const view = await rpc<Result>("customer_portal_commercial_offer_v1", [session, offer.public_ref])
    const agreement = view.agreement as { versionRef: string }
    const conditions = view.conditions as Record<string, unknown>
    await expect(rpc("customer_portal_commercial_offer_command_v1", [
      session,
      randomUUID(),
      offer.public_ref,
      JSON.stringify({
        offerVersion: view.offerVersion,
        priceMinor: offer.amount_minor,
        taxBehaviour: view.taxBehaviour,
        taxMinor: view.taxMinor,
        cadence: view.cadence,
        agreementRef: agreement.versionRef,
        agreementAccepted: true,
        recurringConsent: true,
        confirmations: { business_authority: true },
        conditions: { ...conditions, overageOptIn: false, overageCapMinor: null },
      }),
    ])).rejects.toThrow(/telloya_amendment_pending/)
    expect((await rows<{ state: string }>("select state from public.commercial_subscriptions where id = $1", [offer.id]))[0].state).toBe("OFFERED")
    expect(await rpc<Result>("telloya_offer_revision_v1", [token, randomUUID(), amended.amendmentId, 0, "APPROVED"])).toMatchObject({ status: "stale_version" })
    const revised = await rpc<Result>("telloya_offer_revision_v1", [token, randomUUID(), amended.amendmentId, 1, "APPROVED"])
    expect(revised).toMatchObject({ status: "recorded", decision: "APPROVED" })
    expect(revised.subscriptionId).not.toBe(offer.id)
    const chain = await rows<{ id: string; state: string; amount_minor: number }>(
      "select id, state, amount_minor from public.commercial_subscriptions where id = any($1::uuid[]) order by state",
      [[offer.id, revised.subscriptionId]],
    )
    expect(chain).toEqual([
      { id: offer.id, state: "CANCELED", amount_minor: offer.amount_minor },
      { id: revised.subscriptionId, state: "OFFERED", amount_minor: offer.amount_minor },
    ])
    expect((await rows<{ revision_subscription_id: string }>(
      "select revision_subscription_id from admin_private.telloya_offer_amendments where id = $1",
      [amended.amendmentId],
    ))[0].revision_subscription_id).toBe(revised.subscriptionId)

    const mailed = await ready("amend.mail@example.test", 1, "growth")
    const mailSession = sessions.get("amend.mail@example.test") ?? ""
    expect((await command("prepare_offer", {
      enquiryId: mailed.enquiryId, planVersionId: telloyaCataloguePlans.growthCap1, guardLocationIds: [], reason,
    }, mailed.version)).status).toBe("success")
    const mailOffer = await offerRow(mailed.enquiryId)
    expect(await rpc<Result>("telloya_offer_mail_v1", [
      token, randomUUID(), mailOffer.id, mailOffer.record_version, "https://customer.profilerelaunch.com",
    ])).toMatchObject({ status: "mail_disabled" })
    expect((await rows<{ n: number }>("select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'"))[0].n).toBe(0)
    await db.query("insert into admin_private.telloya_offer_mail_control(singleton, mail_enabled) values (true, true)")
    expect(await rpc<Result>("telloya_offer_mail_v1", [
      token, randomUUID(), mailOffer.id, mailOffer.record_version + 1, "https://customer.profilerelaunch.com",
    ])).toMatchObject({ status: "stale_version" })
    const queued = await rpc<Result>("telloya_offer_mail_v1", [
      token, randomUUID(), mailOffer.id, mailOffer.record_version, "https://customer.profilerelaunch.com",
    ])
    expect(queued).toMatchObject({ status: "queued", deliveryStatus: "NONE" })
    expect(await rpc<Result>("telloya_offer_mail_v1", [
      token, randomUUID(), mailOffer.id, mailOffer.record_version, "https://evil.example",
    ])).toMatchObject({ status: "invalid" })
    expect(await rpc<Result>("telloya_offer_mail_v1", [
      token, randomUUID(), mailOffer.id, mailOffer.record_version, "https://customer.profilerelaunch.com",
    ])).toMatchObject({ status: "replay", communicationId: queued.communicationId, deliveryStatus: "NONE" })
    const stored = (await rows<{ delivery_status: string; body_html: string; n: number }>(
      `select delivery_status, body_html, (select count(*)::int from public.communications where commercial_subscription_id = $1) as n
       from public.communications where id = $2`,
      [mailOffer.id, queued.communicationId],
    ))[0]
    expect(stored.n).toBe(1)
    expect(stored.delivery_status).toBe("NONE")
    expect(stored.body_html).toContain(mailOffer.public_ref)
    expect(stored.body_html).not.toContain("<script")
    expect((await rows<{ event_type: string }>(
      "select event_type from admin_private.communication_delivery_events where communication_id = $1",
      [queued.communicationId],
    )).map(row => row.event_type)).toEqual(["QUEUED"])
    expect(await rpc<Result>("telloya_offer_amendment_v1", [
      mailSession, randomUUID(), "<p>not a selector</p>", "Please change this.",
    ])).toMatchObject({ status: "invalid" })
    const accepted = await submit(mailSession, mailOffer.public_ref, mailOffer.amount_minor)
    expect(accepted.accepted.status).toBe("success")
    expect(await rpc<Result>("telloya_offer_amendment_v1", [
      mailSession, randomUUID(), mailOffer.public_ref, "Please change this after acceptance.",
    ])).toMatchObject({ status: "offer_not_open" })
    expect((await rows<{ value: string }>("select admin_private.telloya_offer_html_v1('<script>\"&') as value"))[0].value).toBe("&lt;script&gt;&quot;&amp;")
    await db.query("delete from admin_private.telloya_offer_mail_control")
  })
})
