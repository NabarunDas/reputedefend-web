import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "c0a10000-0000-4000-8000-0000000000aa"
const alex = "c0a10000-0000-4000-8000-0000000000a1"
const sam = "c0a10000-0000-4000-8000-0000000000b2"
const alexAuth = "c0a10000-0000-4000-8000-0000000000d4"
const samAuth = "c0a10000-0000-4000-8000-0000000000e5"
const token = "cd".repeat(32)
const reason = "The customer agreed the tier on a call today."

type Result = Record<string, unknown>
type PlanRow = {
  id: string
  tierCode: string | null
  amountMinor: number
  includedMinutes: number | null
  guardAddonUnitMinor: number | null
  offerable: boolean
  unavailableReason: string | null
  guardQuantity: number | null
  telloyaQuantity: number | null
  matchesApprovedSchedule: boolean
  selectedLocations: number
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

async function portalSession(email: string, authUser: string) {
  const pending = hash(randomBytes(32).toString("hex"))
  const started = await rpc<Result>("customer_portal_begin_login_v1", [email, pending])
  if (started.status !== "ok") throw new Error(`login did not start: ${started.status}`)
  const confirmed = await rpc<Result>("customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(`otp confirm failed: ${confirmed.status}`)
  const sessionHash = hash(randomBytes(32).toString("hex"))
  const finished = await rpc<Result>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(`otp finish failed: ${JSON.stringify(finished)}`)
  return sessionHash
}

async function enquiry(email: string, planTier: string) {
  const payload = {
    fullName: "North Owner",
    email,
    phone: "07123456789",
    businessName: "North Plumbing",
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
  const row = await db.query<{ id: string }>(
    `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
     values (gen_random_uuid(), md5($1::text), 'phone', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
    [JSON.stringify(payload)],
  )
  return row.rows[0].id
}

async function readyEnquiry(email: string, planTier: string, product: "TELLOYA" | "COMPLETE", locations: number) {
  const id = await enquiry(email, planTier)
  const opened = await command("classify", { enquiryId: id, product, reason })
  const customer = (await rows<{ id: string }>("select id from public.customers where lower(email) = lower($1)", [email]))[0].id
  const matched = await command("match_customer", { enquiryId: id, customerId: customer, reason }, Number(opened.version))
  const business = await command("match_business", {
    enquiryId: id, create: true, name: `${planTier} ${product} shop`, website: "", membership: "verified", reason,
  }, Number(matched.version))
  let version = Number(business.version)
  let ids: string[] = []
  for (let index = 0; index < locations; index += 1) {
    const located = await command("select_locations", {
      enquiryId: id,
      locationIds: ids,
      create: true,
      locationName: `Shop ${index + 1}`,
      country: "United Kingdom",
      reason,
    }, version)
    expect(located.status).toBe("success")
    version = Number(located.version)
    ids = (await rows<{ location_id: string }>(
      `select location_id from admin_private.onboarding_request_locations
       where onboarding_request_id = (select id from public.onboarding_requests where enquiry_id = $1 and state not in ('DECLINED','CLOSED'))`,
      [id],
    )).map(row => row.location_id)
  }
  return { id, version }
}

async function approvePlan(options: {
  product: "TELLOYA" | "COMPLETE"
  tier: "BASIC" | "GROWTH" | "PRO" | "CUSTOM" | null
  version: number
  amount: number
  minutes: number | null
  telloya: number
  guard?: number | null
  guardUnit?: number | null
  overage?: number | null
}) {
  const id = randomUUID()
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, $2, $3, $4, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', $5, 'NOT_APPLICABLE', $6)`,
    [id, options.product, options.version, options.tier, options.amount, `${options.product}-${options.tier ?? "LEGACY"}-${options.version}`],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', $2, 'LOCATION')`,
    [id, options.telloya],
  )
  if (options.guard) {
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'GUARD', $2, 'LOCATION')`,
      [id, options.guard],
    )
  }
  if (options.tier) {
    const label = options.tier === "BASIC" ? "Basic" : options.tier === "GROWTH" ? "Growth" : options.tier === "PRO" ? "Pro" : "Custom"
    const unit = options.guardUnit ?? null
    const guardQty = options.guard ?? 0
    const base = options.product === "COMPLETE" && unit && guardQty ? options.amount - unit * guardQty : options.amount
    await db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      ) values (
        $1, $2, $3, $4, $5, false, $6, $7, $8,
        admin_private.commercial_plan_conditions_hash_v1($3, $5, false, $6, $7, $8),
        'APPROVED', $9, now()
      )`,
      [randomUUID(), id, options.tier, label, options.minutes, base, unit, options.overage === undefined ? 25 : options.overage, admin],
    )
  }
  await db.query(
    `update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`,
    [id, admin],
  )
  await agreement(options.product, `${options.product}-${options.tier ?? "LEGACY"}-${options.version}`)
  return id
}

async function agreement(product: "TELLOYA" | "COMPLETE", versionRef: string) {
  const title = `${product === "TELLOYA" ? "Telloya" : "Complete"} service agreement`
  const body = `This agreement covers the named ${product === "TELLOYA" ? "Telloya" : "Complete"} service for the selected locations only.`
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

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex.tier@example.com', now()),
      ('${samAuth}', 'sam.tier@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.tier@example.com'),
      ('${sam}', 'Sam Cole', 'sam.tier@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.tier@example.com', '${admin}', '${reason}'),
      ('${sam}', 'email', 'sam.tier@example.com', '${admin}', '${reason}');
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

describe("tier-aware commercial catalogue", () => {
  it("keeps one unscoped approved plan and rejects a second overlapping one", async () => {
    await db.exec("SAVEPOINT legacy_plan")
    const id = await enquiry("alex.tier@example.com", "growth")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const matched = await command("match_customer", { enquiryId: id, customerId: alex, reason }, Number(opened.version))
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Legacy Plumbing", website: "", membership: "verified", reason,
    }, Number(matched.version))
    const located = await command("select_locations", {
      enquiryId: id, locationIds: [], create: true, locationName: "Depot", country: "United Kingdom", reason,
    }, Number(business.version))
    const first = randomUUID()
    await db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, status, effective_from, billing_cadence, currency, amount_minor, tax_behaviour, terms_ref
      ) values ($1, 'TELLOYA', 80, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', 4900, 'NOT_APPLICABLE', 'legacy-terms')`,
      [first],
    )
    await db.query(`insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', 1, 'LOCATION')`, [first])
    await db.query(`update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`, [first, admin])
    await db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      ) values (
        $1, $2, 'GROWTH', 'Growth', 300, false, 4900, null, 25,
        admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 4900, null, 25),
        'APPROVED', $3, now()
      )`,
      [randomUUID(), first, admin],
    )
    await agreement("TELLOYA", "legacy-terms")
    const offered = await command("prepare_offer", { enquiryId: id, reason }, Number(located.version))
    expect(offered).toMatchObject({ status: "success" })
    const pinned = await rows<{ plan_version_id: string; amount_minor: number }>(
      "select plan_version_id, amount_minor from public.commercial_subscriptions",
    )
    expect(pinned).toEqual([{ plan_version_id: first, amount_minor: 4900 }])
    const second = randomUUID()
    await db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, status, effective_from, billing_cadence, currency, amount_minor, tax_behaviour, terms_ref
      ) values ($1, 'TELLOYA', 81, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', 7900, 'NOT_APPLICABLE', 'legacy-terms-2')`,
      [second],
    )
    await db.query(`insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', 1, 'LOCATION')`, [second])
    await expect(db.query(
      `update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`,
      [second, admin],
    )).rejects.toThrow(/overlapping approved plan versions are not allowed/)
    await db.exec("ROLLBACK TO SAVEPOINT legacy_plan")
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions"))[0].n).toBe(0)
  })

  it("offers Basic, Growth, Pro and Custom together and pins the selected version", async () => {
    await db.exec("SAVEPOINT standard_cap")
    await expect(approvePlan({ product: "TELLOYA", tier: "BASIC", version: 11, amount: 4900, minutes: 120, telloya: 2, guardUnit: 999 })).rejects.toThrow(/standard Telloya plan includes exactly one location/)
    await db.exec("ROLLBACK TO SAVEPOINT standard_cap")
    const basic = await approvePlan({ product: "TELLOYA", tier: "BASIC", version: 1, amount: 4900, minutes: 120, telloya: 1, guardUnit: 999 })
    const growth = await approvePlan({ product: "TELLOYA", tier: "GROWTH", version: 2, amount: 7900, minutes: 300, telloya: 1, guardUnit: 999 })
    const pro = await approvePlan({ product: "TELLOYA", tier: "PRO", version: 3, amount: 12000, minutes: 500, telloya: 1, guardUnit: 999 })
    const custom = await approvePlan({ product: "TELLOYA", tier: "CUSTOM", version: 4, amount: 15000, minutes: null, telloya: 2, guardUnit: null, overage: null })
    await db.exec("SAVEPOINT complete_cap")
    await expect(approvePlan({ product: "COMPLETE", tier: "GROWTH", version: 12, amount: 19900, minutes: 300, telloya: 2, guard: 1, guardUnit: 999 })).rejects.toThrow(/standard Telloya plan includes exactly one location/)
    await db.exec("ROLLBACK TO SAVEPOINT complete_cap")
    const complete = await approvePlan({ product: "COMPLETE", tier: "GROWTH", version: 1, amount: 19900, minutes: 300, telloya: 1, guard: 1, guardUnit: 999 })
    const approved = await rows<{ tier_code: string; product_code: string }>(
      "select product_code, tier_code from public.plan_versions where status = 'APPROVED' order by product_code, tier_code",
    )
    expect(approved).toEqual([
      { product_code: "COMPLETE", tier_code: "GROWTH" },
      { product_code: "TELLOYA", tier_code: "BASIC" },
      { product_code: "TELLOYA", tier_code: "CUSTOM" },
      { product_code: "TELLOYA", tier_code: "GROWTH" },
      { product_code: "TELLOYA", tier_code: "PRO" },
    ])

    const alexEnquiry = await readyEnquiry("alex.tier@example.com", "growth", "TELLOYA", 1)
    const before = (await rows<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions"))[0].n
    const view = await rpc<Result>("admin_commercial_onboarding_v1", [token, alexEnquiry.id])
    expect(view.requestedTier).toBe("growth")
    expect(before).toBe(0)
    const plans = view.approvedPlans as PlanRow[]
    expect(plans.map(plan => plan.tierCode)).toEqual(["BASIC", "GROWTH", "PRO", "CUSTOM"])
    expect(plans.find(plan => plan.tierCode === "BASIC")).toMatchObject({ amountMinor: 4900, includedMinutes: 120, guardAddonUnitMinor: 999, offerable: true, unavailableReason: null, matchesApprovedSchedule: true, selectedLocations: 1, telloyaQuantity: 1 })
    expect(plans.find(plan => plan.tierCode === "GROWTH")).toMatchObject({ amountMinor: 7900, includedMinutes: 300, offerable: true, matchesApprovedSchedule: true, telloyaQuantity: 1 })
    expect(view.requestedGuardInterest).toBe(true)
    expect(view.requestedGuardLocationCount).toBe(2)
    expect(plans.find(plan => plan.tierCode === "PRO")).toMatchObject({ amountMinor: 12000, includedMinutes: 500, matchesApprovedSchedule: true, telloyaQuantity: 1 })
    expect(plans.find(plan => plan.tierCode === "CUSTOM")).toMatchObject({ amountMinor: 15000, includedMinutes: null, matchesApprovedSchedule: true, guardAddonUnitMinor: null, offerable: false, unavailableReason: "locations", telloyaQuantity: 2 })

    expect(await command("prepare_offer", { enquiryId: alexEnquiry.id, reason }, alexEnquiry.version)).toMatchObject({ status: "tier_required" })
    expect(await command("prepare_offer", { enquiryId: alexEnquiry.id, planVersionId: complete, reason }, alexEnquiry.version)).toMatchObject({ status: "terms_unconfigured" })
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions"))[0].n).toBe(0)

    const key = randomUUID()
    const offered = await command("prepare_offer", { enquiryId: alexEnquiry.id, planVersionId: basic, reason }, alexEnquiry.version, key)
    expect(offered.status).toBe("success")
    expect(await command("prepare_offer", { enquiryId: alexEnquiry.id, planVersionId: basic, reason }, alexEnquiry.version, key)).toEqual(offered)
    expect(await command("prepare_offer", { enquiryId: alexEnquiry.id, planVersionId: growth, reason }, alexEnquiry.version, key)).toMatchObject({ status: "conflict" })
    const alexSub = (await rows<{ customer_id: string; amount_minor: number; plan_version_id: string; public_ref: string; state: string }>(
      "select customer_id, amount_minor, plan_version_id, public_ref, state from public.commercial_subscriptions",
    ))[0]
    expect(alexSub).toMatchObject({ customer_id: alex, amount_minor: 4900, plan_version_id: basic, state: "OFFERED" })
    expect((await rows<{ component_code: string; quantity: number }>(
      "select component_code, quantity from public.commercial_subscription_items order by component_code",
    ))).toEqual([{ component_code: "TELLOYA", quantity: 1 }])
    await db.exec("SAVEPOINT immutable_price")
    await expect(db.query("update public.plan_versions set amount_minor = 5000 where id = $1", [basic])).rejects.toThrow(/immutable/)
    await db.exec("ROLLBACK TO SAVEPOINT immutable_price")

    const samEnquiry = await readyEnquiry("sam.tier@example.com", "basic", "TELLOYA", 1)
    const samOffer = await command("prepare_offer", { enquiryId: samEnquiry.id, planVersionId: growth, reason }, samEnquiry.version)
    expect(samOffer.status).toBe("success")
    const subs = await rows<{ customer_id: string; amount_minor: number; plan_version_id: string; public_ref: string }>(
      "select customer_id, amount_minor, plan_version_id, public_ref from public.commercial_subscriptions order by amount_minor",
    )
    expect(subs.map(row => row.customer_id)).toEqual([alex, sam])
    expect(subs.map(row => row.plan_version_id)).toEqual([basic, growth])
    expect(subs.map(row => row.amount_minor)).toEqual([4900, 7900])

    const quotedCustomer = randomUUID()
    await db.query(
      `insert into public.customers(id, full_name, email) values ($1, 'Quoted Owner', 'quoted.tier@example.com')`,
      [quotedCustomer],
    )
    await db.query(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
       values ($1, 'email', 'quoted.tier@example.com', $2, $3)`,
      [quotedCustomer, admin, reason],
    )
    const quotedEnquiry = await readyEnquiry("quoted.tier@example.com", "custom", "TELLOYA", 2)
    const quotedPlans = (await rpc<Result>("admin_commercial_onboarding_v1", [token, quotedEnquiry.id])).approvedPlans as PlanRow[]
    expect(quotedPlans.find(plan => plan.tierCode === "BASIC")).toMatchObject({ offerable: false, unavailableReason: "locations" })
    expect(quotedPlans.find(plan => plan.tierCode === "GROWTH")).toMatchObject({ offerable: false, unavailableReason: "locations" })
    expect(quotedPlans.find(plan => plan.tierCode === "PRO")).toMatchObject({ offerable: false, unavailableReason: "locations" })
    expect(quotedPlans.find(plan => plan.tierCode === "CUSTOM")).toMatchObject({ offerable: true, amountMinor: 15000, telloyaQuantity: 2 })
    expect((await command("prepare_offer", { enquiryId: quotedEnquiry.id, planVersionId: custom, reason }, quotedEnquiry.version)).status).toBe("success")
    expect((await rows<{ amount_minor: number }>(
      `select amount_minor from public.commercial_subscriptions sub
       join public.onboarding_requests request on request.commercial_subscription_id = sub.id
       where request.enquiry_id = $1`,
      [quotedEnquiry.id],
    ))[0].amount_minor).toBe(15000)

    const alexSession = await portalSession("alex.tier@example.com", alexAuth)
    const samSession = await portalSession("sam.tier@example.com", samAuth)
    const hidden = await rpc<Result>("customer_portal_commercial_offer_v1", [samSession, alexSub.public_ref])
    expect(hidden).toEqual({ status: "unavailable" })
    expect(JSON.stringify(hidden)).not.toContain("4900")

    await db.query(
      `update public.plan_versions set status = 'RETIRED', retired_by = $2, retired_at = now() where id = $1`,
      [basic, admin],
    )
    const offerVersion = (await rows<{ record_version: number }>(
      "select record_version from public.commercial_subscriptions where public_ref = $1",
      [alexSub.public_ref],
    ))[0].record_version
    const stale = await rpc<Result>("customer_portal_commercial_offer_command_v1", [
      alexSession,
      randomUUID(),
      alexSub.public_ref,
      {
        offerVersion,
        priceMinor: 4900,
        taxBehaviour: "NOT_APPLICABLE",
        taxMinor: null,
        cadence: "MONTH",
        agreementRef: "TELLOYA-BASIC-1",
        agreementAccepted: true,
        recurringConsent: true,
        confirmations: { business_authority: true },
        conditions: {
          tier: "Basic",
          includedMinutes: 120,
          minutesRollover: false,
          baseAmountMinor: 4900,
          guardIncluded: false,
          guardUnitMinor: 999,
          guardQuantity: 0,
          overagePermitted: true,
          overageRateMinor: 25,
          overageOptIn: false,
          overageCapMinor: null,
        },
      },
    ])
    expect(stale).toMatchObject({ status: "superseded" })
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_offer_acceptances"))[0].n).toBe(0)
    expect((await rows<{ state: string }>("select state from public.commercial_subscriptions where customer_id = $1", [alex]))[0].state).toBe("OFFERED")

    const completeEnquiry = await readyEnquiry("alex.tier@example.com", "growth", "COMPLETE", 1)
    const completeOffer = await command("prepare_offer", { enquiryId: completeEnquiry.id, planVersionId: complete, reason }, completeEnquiry.version)
    expect(completeOffer.status).toBe("success")
    const guard = await rows<{ component_code: string; quantity: number }>(
      `select item.component_code, item.quantity
       from public.commercial_subscription_items item
       join public.commercial_subscriptions sub on sub.id = item.subscription_id
       where sub.plan_version_id = $1
       order by item.component_code`,
      [complete],
    )
    expect(guard).toEqual([
      { component_code: "GUARD", quantity: 1 },
      { component_code: "TELLOYA", quantity: 1 },
    ])
    const completeAmount = await rows<{ amount_minor: number }>(
      "select amount_minor from public.commercial_subscriptions where plan_version_id = $1",
      [complete],
    )
    expect(completeAmount[0].amount_minor).toBe(19900)
    expect(pro).toBeTruthy()
    expect(custom).toBeTruthy()
    expect((await rows<{ n: number }>("select count(*)::int as n from public.product_entitlements"))[0].n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_payment_evidence"))[0].n).toBe(0)
  })

  it("rejects conditions whose tier differs from the plan", async () => {
    const id = randomUUID()
    await db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      ) values ($1, 'TELLOYA', 9, 'BASIC', 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', 4900, 'NOT_APPLICABLE', 'mismatch-terms')`,
      [id],
    )
    await db.exec("SAVEPOINT mismatched_tier")
    await expect(db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash, status
      ) values (
        $1, $2, 'GROWTH', 'Growth', 300, false, 4900, null, 25,
        admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 4900, null, 25),
        'DRAFT'
      )`,
      [randomUUID(), id],
    )).rejects.toThrow(/plan tier does not match commercial conditions/)
    await db.exec("ROLLBACK TO SAVEPOINT mismatched_tier")
  })
})
