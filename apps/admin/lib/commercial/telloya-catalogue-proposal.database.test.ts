/**
 * Local rehearsal of the Telloya catalogue proposal.
 * PGlite only. The installer leaves every proposal row in DRAFT.
 * One test below approves standard plans inside this database so the existing
 * offer command can be checked. That approval is not a hosted seed.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"
import { installTelloyaCatalogueProposal } from "./telloya-catalogue-proposal.fixture"
import {
  telloyaCatalogueProposal,
  telloyaDraftAgreement,
  telloyaDraftMarker,
  telloyaLocationPolicy,
  telloyaProposalPlans,
  telloyaProposedMonthlyMinor,
  telloyaTaxDecision,
} from "./telloya-catalogue-proposal"

const db = new PGlite()
const sessions = new Map<string, string>()
const admin = "c03c0000-0000-4000-8000-0000000000aa"
const token = "cd".repeat(32)
const reason = "The customer confirmed this catalogue proposal rehearsal."
const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"
const stripeCustomer = "cus_Proposal01"
const standardPlans = [telloyaProposalPlans.basic, telloyaProposalPlans.growth, telloyaProposalPlans.pro]

const people = [
  ["c03c0000-0000-4000-8000-0000000000a1", "c03c0000-0000-4000-8000-0000000000d1", "proposal.growth@example.test"],
  ["c03c0000-0000-4000-8000-0000000000a2", "c03c0000-0000-4000-8000-0000000000d2", "proposal.two@example.test"],
  ["c03c0000-0000-4000-8000-0000000000a3", "c03c0000-0000-4000-8000-0000000000d3", "proposal.stranger@example.test"],
] as const

type Result = Record<string, unknown>
type PlanChoice = { id: string; amountMinor: number | null; telloyaQuantity: number; offerable: boolean; unavailableReason: string | null; includedMinutes: number | null }

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

async function ready(email: string, locations: number) {
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
    planTier: "growth",
    guardInterested: true,
    guardLocationCount: 1,
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

async function approveStandardPlansForThisTestOnly() {
  await db.query(
    `update public.plan_versions
     set tax_behaviour = 'NOT_APPLICABLE'
     where id = any($1::uuid[]) and status = 'DRAFT' and tax_behaviour = 'EXCLUSIVE'`,
    [standardPlans],
  )
  await db.query(
    `update public.commercial_agreement_versions
     set status = 'APPROVED', approved_by = $2, approved_at = now()
     where product_code = 'TELLOYA' and version_ref = $1 and status = 'DRAFT'`,
    [telloyaDraftAgreement.versionRef, admin],
  )
  await db.query(
    `update public.commercial_plan_conditions
     set status = 'APPROVED', approved_by = $2, approved_at = now()
     where plan_version_id = any($1::uuid[]) and status = 'DRAFT'`,
    [standardPlans, admin],
  )
  await db.query(
    `update public.plan_versions
     set status = 'APPROVED', approved_by = $2, approved_at = now()
     where id = any($1::uuid[]) and status = 'DRAFT'`,
    [standardPlans, admin],
  )
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
  await installTelloyaCatalogueProposal(db)
  for (const [, auth, email] of people) sessions.set(email, await portalSession(email, auth))
}, 180000)

afterAll(async () => { await db.close() })

describe("Telloya catalogue proposal", () => {
  it("installs the proposal once and leaves it unapproved", async () => {
    const count = async () => (await rows<{ plans: number; agreements: number; conditions: number; products: string }>(
      `select
        (select count(*)::int from public.plan_versions where terms_ref = $1) as plans,
        (select count(*)::int from public.commercial_agreement_versions where version_ref = $1) as agreements,
        (select count(*)::int from public.commercial_plan_conditions where plan_version_id = any($2::uuid[])) as conditions,
        (select string_agg(status, ',' order by code) from public.product_catalogue) as products`,
      [telloyaDraftAgreement.versionRef, Object.values(telloyaProposalPlans)],
    ))[0]
    const before = await count()
    await installTelloyaCatalogueProposal(db)
    await installTelloyaCatalogueProposal(db)
    expect(await count()).toEqual(before)
    expect(before).toEqual({ plans: 4, agreements: 1, conditions: 3, products: "DRAFT,DRAFT" })
    const stored = await rows<{ status: string; tax_behaviour: string | null; amount_minor: number | null; quantity_limit: number; body_text: string | null }>(
      `select plan.status, plan.tax_behaviour, plan.amount_minor, component.quantity_limit, agreement.body_text
       from public.plan_versions plan
       join public.plan_components component on component.plan_version_id = plan.id
       left join public.commercial_agreement_versions agreement
         on agreement.product_code = plan.product_code and agreement.version_ref = plan.terms_ref
       where plan.id = any($1::uuid[])
       order by plan.version_number`,
      [Object.values(telloyaProposalPlans)],
    )
    expect(stored.every(row => row.status === "DRAFT")).toBe(true)
    expect(stored.every(row => row.body_text?.startsWith(telloyaDraftMarker))).toBe(true)
    expect(stored.every(row => !row.body_text?.includes("TEST ONLY"))).toBe(true)
    expect(stored.slice(0, 3).map(row => row.tax_behaviour)).toEqual(["EXCLUSIVE", "EXCLUSIVE", "EXCLUSIVE"])
    expect(stored.slice(0, 3).map(row => row.amount_minor)).toEqual([4900, 7900, 12000])
    expect(stored.slice(0, 3).map(row => row.quantity_limit)).toEqual([1, 1, 1])
    expect(stored[3]).toMatchObject({ amount_minor: null, tax_behaviour: null, quantity_limit: 1 })
    expect(telloyaTaxDecision.productionTaxBehaviour).toBeNull()
    expect(telloyaLocationPolicy.status).toBe("PROPOSED")
    const minutes = await rows<{ tier_code: string; included_minutes: number | null; status: string }>(
      `select tier_code, included_minutes, status from public.commercial_plan_conditions
       where plan_version_id = any($1::uuid[]) order by tier_code`,
      [standardPlans],
    )
    expect(minutes).toEqual([
      { tier_code: "BASIC", included_minutes: 120, status: "DRAFT" },
      { tier_code: "GROWTH", included_minutes: 300, status: "DRAFT" },
      { tier_code: "PRO", included_minutes: 500, status: "DRAFT" },
    ])
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_plan_conditions where plan_version_id = $1", [telloyaProposalPlans.custom]))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.plan_versions where product_code = 'COMPLETE'"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions"))[0].n).toBe(0)
  })

  it("rehearses the existing offer command only after an isolated approval", async () => {
    const draftOffer = await ready("proposal.two@example.test", 2)
    expect(await command("prepare_offer", {
      enquiryId: draftOffer.enquiryId,
      planVersionId: telloyaProposalPlans.growth,
      guardLocationIds: [],
      reason,
    }, draftOffer.version)).toMatchObject({ status: "terms_unconfigured" })

    await approveStandardPlansForThisTestOnly()
    const customApproved = await db.query(
      `update public.plan_versions
       set status = 'APPROVED', approved_by = $2, approved_at = now()
       where id = $1 and status = 'DRAFT' and amount_minor is null
       returning id`,
      [telloyaProposalPlans.custom, admin],
    )
    expect(customApproved.rows).toHaveLength(1)

    const one = await ready("proposal.growth@example.test", 1)
    const view = await rpc<Result>("admin_commercial_onboarding_v1", [token, one.enquiryId])
    const plans = view.approvedPlans as PlanChoice[]
    expect(plans.find(plan => plan.id === telloyaProposalPlans.basic)).toMatchObject({
      offerable: true, amountMinor: 4900, telloyaQuantity: 1, includedMinutes: 120,
    })
    expect(plans.find(plan => plan.id === telloyaProposalPlans.growth)).toMatchObject({
      offerable: true, amountMinor: 7900, includedMinutes: 300,
    })
    expect(plans.find(plan => plan.id === telloyaProposalPlans.pro)).toMatchObject({
      offerable: true, amountMinor: 12000, includedMinutes: 500,
    })
    expect(plans.find(plan => plan.id === telloyaProposalPlans.custom)).toMatchObject({
      offerable: false,
    })
    const twoView = await rpc<Result>("admin_commercial_onboarding_v1", [token, draftOffer.enquiryId])
    const twoPlans = twoView.approvedPlans as PlanChoice[]
    expect(twoPlans.find(plan => plan.id === telloyaProposalPlans.growth)).toMatchObject({
      offerable: false, unavailableReason: "locations",
    })
    expect(await command("prepare_offer", {
      enquiryId: draftOffer.enquiryId,
      planVersionId: telloyaProposalPlans.growth,
      guardLocationIds: [],
      reason,
    }, draftOffer.version)).toMatchObject({ status: "terms_unconfigured", reason: "locations" })
    expect(await command("prepare_offer", {
      enquiryId: one.enquiryId,
      planVersionId: telloyaProposalPlans.custom,
      guardLocationIds: [],
      reason,
    }, one.version)).toMatchObject({ status: "terms_unconfigured" })

    const guardLocation = one.locationIds[0]
    const offered = await command("prepare_offer", {
      enquiryId: one.enquiryId,
      planVersionId: telloyaProposalPlans.growth,
      guardLocationIds: [guardLocation],
      reason,
    }, one.version)
    expect(offered.status).toBe("success")
    const pinned = (await rows<{ public_ref: string; id: string; amount_minor: number; customer_id: string; record_version: number }>(
      `select sub.public_ref, sub.id, sub.amount_minor, sub.customer_id, sub.record_version
       from public.onboarding_requests request
       join public.commercial_subscriptions sub on sub.id = request.commercial_subscription_id
       where request.enquiry_id = $1`,
      [one.enquiryId],
    ))[0]
    expect(pinned.amount_minor).toBe(telloyaProposedMonthlyMinor("GROWTH", 1))
    expect(await command("prepare_offer", {
      enquiryId: one.enquiryId,
      planVersionId: telloyaProposalPlans.basic,
      guardLocationIds: [],
      reason,
    }, Number(offered.version))).toMatchObject({ status: "success", existing: true })
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.commercial_subscriptions sub join public.onboarding_requests request on request.commercial_subscription_id = sub.id where request.enquiry_id = $1",
      [one.enquiryId],
    ))[0].n).toBe(1)

    const session = sessions.get("proposal.growth@example.test") ?? ""
    const stranger = sessions.get("proposal.stranger@example.test") ?? ""
    const hidden = await rpc<Result>("customer_portal_commercial_offer_v1", [stranger, pinned.public_ref])
    expect(hidden.status).toBe("unavailable")
    expect(hidden.priceMinor).toBeUndefined()
    expect(JSON.stringify(hidden)).not.toContain(telloyaDraftMarker)
    const readyOffer = await rpc<Result>("customer_portal_commercial_offer_v1", [session, pinned.public_ref])
    expect(readyOffer.status).toBe("ready")
    expect(readyOffer.priceMinor).toBe(8899)
    const agreement = readyOffer.agreement as { versionRef: string; body: string }
    expect(agreement.versionRef).toBe(telloyaDraftAgreement.versionRef)
    expect(agreement.body.startsWith(telloyaDraftMarker)).toBe(true)
    const conditions = readyOffer.conditions as Record<string, unknown>
    expect(conditions.includedMinutes).toBe(telloyaCatalogueProposal.prices.growthMinutes)
    const payload = (priceMinor: number, agreementRef: string, overage: boolean) => JSON.stringify({
      offerVersion: readyOffer.offerVersion,
      priceMinor,
      taxBehaviour: readyOffer.taxBehaviour,
      taxMinor: readyOffer.taxMinor,
      cadence: readyOffer.cadence,
      agreementRef,
      agreementAccepted: true,
      recurringConsent: true,
      confirmations: { business_authority: true, recurring_payment: true, forwarding_duty: true },
      conditions: { ...conditions, overageOptIn: overage, overageCapMinor: overage ? 4000 : null },
    })
    expect(await rpc<Result>("customer_portal_commercial_offer_command_v1", [
      session, randomUUID(), pinned.public_ref, payload(8899, `${telloyaDraftAgreement.versionRef}-STALE`, true),
    ])).toMatchObject({ status: "conflict" })
    expect(await rpc<Result>("customer_portal_commercial_offer_command_v1", [
      session, randomUUID(), pinned.public_ref, payload(7900, agreement.versionRef, true),
    ])).toMatchObject({ status: "conflict" })
    const accepted = await rpc<Result>("customer_portal_commercial_offer_command_v1", [
      session, randomUUID(), pinned.public_ref, payload(8899, agreement.versionRef, true),
    ])
    expect(accepted.status).toBe("success")
    expect((await rows<{ overage_opt_in: boolean; overage_cap_minor: number; amount_minor: number }>(
      "select overage_opt_in, overage_cap_minor, amount_minor from public.commercial_offer_acceptances where subscription_id = $1",
      [pinned.id],
    ))[0]).toEqual({ overage_opt_in: true, overage_cap_minor: 4000, amount_minor: 8899 })

    const firstCheckout = await rpc<Result>("customer_portal_commercial_payment_prepare_v1", [session, randomUUID(), pinned.public_ref])
    const secondCheckout = await rpc<Result>("customer_portal_commercial_payment_prepare_v1", [session, randomUUID(), pinned.public_ref])
    expect(firstCheckout).toMatchObject({ status: "success", amountMinor: 8899 })
    expect(secondCheckout).toMatchObject({ status: "success", amountMinor: 8899 })
    const preparations = await rows<{ stripe_product_id: string | null; stripe_price_id: string | null; checkout_session_id: string | null; livemode: boolean }>(
      "select stripe_product_id, stripe_price_id, checkout_session_id, livemode from public.commercial_checkout_preparations where subscription_id = $1",
      [pinned.id],
    )
    expect(preparations).toEqual([{ stripe_product_id: null, stripe_price_id: null, checkout_session_id: null, livemode: false }])

    const current = await rows<{ subscription_version: number; request_id: string; request_version: number; business_id: string }>(
      `select subscription.record_version as subscription_version, request.id as request_id,
              request.record_version as request_version, subscription.business_id
       from public.commercial_subscriptions subscription
       join public.onboarding_requests request on request.commercial_subscription_id = subscription.id
       where subscription.id = $1`,
      [pinned.id],
    )
    expect(await rpc<Result>("admin_commercial_begin_setup_v1", [
      token, randomUUID(), pinned.id, current[0].subscription_version,
      JSON.stringify({
        customerId: pinned.customer_id,
        businessId: current[0].business_id,
        onboardingRequestId: current[0].request_id,
        onboardingVersion: current[0].request_version,
        reason,
      }),
    ])).toMatchObject({ status: "denied", reason: "payment" })

    const ids = {
      priceId: "price_Proposal01",
      sessionId: "cs_test_proposal01",
      eventId: "evt_proposal01",
      invoiceId: "in_proposal01",
      stripeSubscriptionId: "sub_proposal01",
    }
    expect((await rpc<Result>("commercial_payment_record_price_v1", [firstCheckout.priceOperationId, ids.priceId, "prod_Proposal01"])).status).toBe("success")
    await db.query(`insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values ($1, $2)`, [pinned.customer_id, stripeCustomer])
    expect((await rpc<Result>("commercial_payment_record_checkout_v1", [firstCheckout.providerOperationId, ids.sessionId])).status).toBe("success")
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
      amountDueMinor: 8899,
      amountPaidMinor: 8899,
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
      acceptanceId: String(firstCheckout.acceptanceId),
      checkoutOperationId: String(firstCheckout.providerOperationId),
      checkoutMode: "subscription",
      checkoutStatus: "complete",
      checkoutPaymentStatus: "paid",
      checkoutLivemode: false,
      checkoutCustomerId: stripeCustomer,
      conflictingMetadata: false,
      checkoutMetadataCustomerId: pinned.customer_id,
      checkoutMetadataSubscriptionId: pinned.id,
      checkoutMetadataAcceptanceId: String(firstCheckout.acceptanceId),
      checkoutMetadataOperationId: String(firstCheckout.providerOperationId),
      subscriptionMetadataCustomerId: pinned.customer_id,
      subscriptionMetadataSubscriptionId: pinned.id,
      subscriptionMetadataAcceptanceId: String(firstCheckout.acceptanceId),
      subscriptionMetadataOperationId: String(firstCheckout.providerOperationId),
    }
    expect((await rpc<Result>("commercial_payment_settle_initial_invoice_v1", [leased.jobId, leased.leaseToken, JSON.stringify(facts)])).status).toBe("settled")
    const refreshed = await rows<{ subscription_version: number; request_id: string; request_version: number; business_id: string }>(
      `select subscription.record_version as subscription_version, request.id as request_id,
              request.record_version as request_version, subscription.business_id
       from public.commercial_subscriptions subscription
       join public.onboarding_requests request on request.commercial_subscription_id = subscription.id
       where subscription.id = $1`,
      [pinned.id],
    )
    expect(await rpc<Result>("admin_commercial_begin_setup_v1", [
      token, randomUUID(), pinned.id, refreshed[0].subscription_version,
      JSON.stringify({
        customerId: pinned.customer_id,
        businessId: refreshed[0].business_id,
        onboardingRequestId: refreshed[0].request_id,
        onboardingVersion: refreshed[0].request_version,
        reason,
      }),
    ])).toMatchObject({ status: "success", provisionState: "PROFILE_REQUIRED" })
    const started = await rows<{ entitlements: number; guard_entitlements: number; live: number }>(
      `select
        (select count(*)::int from public.product_entitlements where commercial_subscription_id = $1) as entitlements,
        (select count(*)::int from public.product_entitlements where commercial_subscription_id = $1 and component_code = 'GUARD') as guard_entitlements,
        (select count(*)::int from public.service_provisions provision
          join public.product_entitlements entitlement on entitlement.id = provision.entitlement_id
          where entitlement.commercial_subscription_id = $1 and provision.state = 'LIVE') as live`,
      [pinned.id],
    )
    expect(started[0]).toEqual({ entitlements: 1, guard_entitlements: 0, live: 0 })
    expect((await rows<{ n: number }>("select count(*)::int as n from public.cases"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.paid_service_acceptances"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.guard_subscriptions"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_checkout_preparations where livemode = true"))[0].n).toBe(0)
  })
})
