/**
 * Step 23 quote surface fixes, against the COMPLETE migration chain.
 *
 * commerce/database.test.ts deliberately stops at the Step 13 catalogue and
 * quote migration, because that is the schema the rest of its assertions were
 * written against. That makes it the wrong place to check a Step 23 migration:
 * Step 15 moved the quote command out of `public` and put a Guard-aware
 * wrapper in its place, and a suite that never applies Step 15 cannot notice a
 * Step 23 change that would undo it.
 *
 * So this file runs the whole chain through Step 23 using the recovery
 * harness, and asserts the architecture the chain actually ends in:
 *
 *   public.admin_quote_command_v1            (Step 15 wrapper, service_role)
 *     ├── every operation except record_qualification
 *     │     └── admin_private.admin_quote_command_core_v1   (Step 13 body,
 *     │           patched here, reachable from no role at all)
 *     └── record_qualification
 *           └── admin_private.record_guard_linked_qualification_v1
 *                 └── admin_private.paid_guard_discount_ready_v1
 *
 * The regression this guards against is a Step 23 migration that replaces the
 * public wrapper instead of the private core, which would put the Step 13
 * qualification branch back in front of the Guard-linked one.
 */

import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { createHash, randomBytes } from "node:crypto"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const relaunchCase = "55555555-5555-4555-8555-555555555555"
const reviewCase = "99999999-9999-4999-8999-999999999999"
const token = "a".repeat(64)

const key = () => crypto.randomUUID()
const secretHash = (value = randomBytes(32).toString("hex")) => createHash("sha256").update(value).digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number }

async function rpc(name: string, args: unknown[] = []): Promise<Json | null> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: Json | null }>(`select public.${name}(${placeholders}) as value`, args)).rows[0].value
}

async function priceId(serviceCode: string): Promise<string> {
  return (await db.query<{ id: string }>(
    "select id from public.price_versions where service_code=$1 and seed_key is not null", [serviceCode],
  )).rows[0].id
}

async function createDraft(overrides: Record<string, unknown> = {}): Promise<Json | null> {
  const serviceCode = String(overrides.serviceCode ?? "GUIDED_RELAUNCH")
  return rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    serviceCode,
    customerId: customer,
    businessId: business,
    caseId: relaunchCase,
    locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions, Manager access, and later payment collection are excluded.",
    validUntil: later(),
    applyDiscount: false,
    priceVersionId: await priceId(serviceCode),
    ...overrides,
    serviceCode,
  }, null])
}

const setTax = (quoteId: string, version: number) =>
  rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId, taxBehaviour: "NOT_APPLICABLE" }, version])

const offer = (quoteId: string, version: number) =>
  rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId }, version])

async function issue(quoteId: string) {
  const raw = randomBytes(32).toString("hex")
  const hash = createHash("sha256").update(raw).digest("hex")
  const result = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", {
    quoteId, expiresAt: actionExpiry(), secretHash: hash,
  }, null])
  return { hash, result }
}

/** Takes a quote from draft to an issued, OPEN acceptance action. */
async function offeredQuoteWithAction(overrides: Record<string, unknown> = {}) {
  const quote = await createDraft(overrides)
  expect(quote?.status).toBe("success")
  expect((await setTax(quote!.id!, quote!.version!))?.status).toBe("success")
  expect((await offer(quote!.id!, quote!.version! + 1))?.status).toBe("success")
  const action = await issue(quote!.id!)
  expect(action.result?.status).toBe("success")
  return { quote: quote!, action: action.result!, hash: action.hash }
}

async function completeOtp(actionId: string, hash: string) {
  const pending = secretHash(), session = secretHash()
  expect(await rpc("customer_action_exchange_v1", [actionId, hash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"]))
    .toMatchObject({ status: "ok" })
  return session
}

/**
 * Builds the real Guard relationship `paid_guard_discount_ready_v1` demands:
 * an accepted recurring Guard order, a DIRECT_GUARD coverage that is ACTIVE
 * and activated before the issue was seen, and provider billing paid into the
 * future. Nothing here is faked at the payload level — the order comes out of
 * the actual acceptance flow.
 */
async function qualifyingCoverage(): Promise<{ coverageId: string; activatedAt: string }> {
  const guard = await offeredQuoteWithAction({ serviceCode: "RELAUNCH_GUARD", caseId: null })
  const session = await completeOtp(guard.action.id!, guard.hash)
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted).toMatchObject({ orderState: "ACCEPTED_RECURRING" })
  const orderId = String(accepted!.orderId)

  const activatedAt = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const coverage = await db.query<{ id: string }>(
    `insert into public.guard_coverages(
       customer_id, business_id, location_id, service_order_id,
       coverage_basis, coverage_origin, state, activated_at
     ) values($1,$2,$3,$4,'DIRECT_GUARD','DIRECT_GUARD','ACTIVE',$5::timestamptz) returning id`,
    [customer, business, location, orderId, activatedAt],
  )
  await db.query(
    `insert into public.guard_billing(coverage_id, billing_state, entitlement_source, paid_through_at)
     values($1,'CURRENT','PROVIDER', now() + interval '30 days')`,
    [coverage.rows[0].id],
  )
  return { coverageId: coverage.rows[0].id, activatedAt }
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  // A later migration seeds the singleton identity row, so this points it at
  // the synthetic Admin user rather than inserting a second one.
  await db.exec(`insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country,location_name)
      values('${location}','${business}','UK','High Street');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track)
      values('${relaunchCase}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'UNDECIDED');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track)
      values('${reviewCase}','REVIEW_PROTECTION','${customer}','${business}','${location}','Review dispute','2026-01-01',now(),now(),'UNDECIDED');
    insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence)
      values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence)
      values('${customer}','${business}','verified',now(),'${uid}','Companies House match discussed on a live call.');`)
}, 180000)

afterAll(async () => { await db.close() })

describe("Step 23 quote surface fixes on the full migration chain", () => {
  it("keeps the Step 15 wrapper in public and the Step 13 body in the private core", async () => {
    const routines = await db.query<{ schema: string; name: string; config: string[] | null; definer: boolean }>(
      `select n.nspname as schema, p.proname as name, p.proconfig as config, p.prosecdef as definer
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where (n.nspname, p.proname) in (('public','admin_quote_command_v1'), ('admin_private','admin_quote_command_core_v1'))
       order by n.nspname`,
    )
    expect(routines.rows.map(row => `${row.schema}.${row.name}`)).toEqual([
      "admin_private.admin_quote_command_core_v1", "public.admin_quote_command_v1",
    ])
    // Both stay SECURITY DEFINER with an empty search_path, which is what lets
    // them be the only way in while resolving nothing through the caller.
    expect(routines.rows.every(row => row.definer)).toBe(true)
    expect(routines.rows.map(row => row.config)).toEqual([['search_path=""'], ['search_path=""']])

    // The wrapper's body names both downstream paths. This is a structural
    // check; the behavioural ones are the tests that follow.
    const wrapper = (await db.query<{ src: string }>(
      "select prosrc as src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_quote_command_v1'",
    )).rows[0].src
    expect(wrapper).toContain("admin_private.admin_quote_command_core_v1")
    expect(wrapper).toContain("admin_private.record_guard_linked_qualification_v1")
    expect(wrapper).not.toContain("quote_discount_snapshots")
  })

  it("leaves the private core unreachable from every role and the wrapper service-role only", async () => {
    const core = "admin_private.admin_quote_command_core_v1(text, uuid, text, jsonb, integer)"
    const entry = "public.admin_quote_command_v1(text, uuid, text, jsonb, integer)"
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(
        (await db.query<{ ok: boolean }>("select has_function_privilege($1,$2,'EXECUTE') as ok", [role, core])).rows[0].ok,
      ).toBe(false)
    }
    for (const role of ["public", "anon", "authenticated"]) {
      expect(
        (await db.query<{ ok: boolean }>("select has_function_privilege($1,$2,'EXECUTE') as ok", [role, entry])).rows[0].ok,
      ).toBe(false)
    }
    expect(
      (await db.query<{ ok: boolean }>("select has_function_privilege('service_role',$1,'EXECUTE') as ok", [entry])).rows[0].ok,
    ).toBe(true)
  })

  it("refuses a Guard qualification built from payload fields alone", async () => {
    // Every string the Step 13 branch checked, and no real coverage behind any
    // of them. The Step 15 path asks the database, so this is denied. If the
    // Step 23 migration had replaced the public wrapper, the Step 13 branch
    // would accept these fields and fail later inside the table trigger, so
    // the failure mode itself tells the two architectures apart.
    const spoofed = await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH",
      priceVersionId: await priceId("MANAGED_RELAUNCH"),
      qualificationResult: "QUALIFIED",
      locationId: location,
      coverageBasis: "PAID",
      coverageStatus: "ACTIVE",
      coverageType: "PAID_GUARD",
      paidVsIncluded: "PAID",
      issuePredatesPaidCoverage: "false",
      issueObservedAt: new Date().toISOString(),
    }, null])
    expect(spoofed).toEqual({ status: "denied" })
    expect((await db.query<{ n: number }>(
      "select count(*)::int as n from public.quote_discount_snapshots where qualification_result='QUALIFIED'",
    )).rows[0].n).toBe(0)
  })

  it("records a qualification when a real paid Guard coverage stands behind it", async () => {
    const { coverageId, activatedAt } = await qualifyingCoverage()
    const issueObservedAt = new Date(Date.parse(activatedAt) + 24 * 3600 * 1000).toISOString()
    const qualified = await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH",
      priceVersionId: await priceId("MANAGED_RELAUNCH"),
      qualificationResult: "QUALIFIED",
      locationId: location,
      coverageId,
      issueObservedAt,
    }, null])
    expect(qualified).toMatchObject({ status: "success", result: "QUALIFIED", futureCoverageId: coverageId })

    const snapshot = await db.query<{ discount_bps: number; policy_id: string; future_coverage_id: string }>(
      "select discount_bps, policy_id, future_coverage_id from public.quote_discount_snapshots where id=$1",
      [qualified!.id],
    )
    expect(snapshot.rows[0]).toMatchObject({
      discount_bps: 2000, policy_id: "PAID_GUARD_MANAGED_20", future_coverage_id: coverageId,
    })

    // The same request against a coverage at a different location is refused,
    // so the discount is pinned to the relationship rather than to the caller.
    const elsewhere = await db.query<{ id: string }>(
      "insert into public.locations(business_id,country,location_name) values($1,'UK','Side Street') returning id", [business],
    )
    expect(await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH",
      priceVersionId: await priceId("MANAGED_RELAUNCH"),
      qualificationResult: "QUALIFIED",
      locationId: elsewhere.rows[0].id,
      coverageId,
      issueObservedAt,
    }, null])).toEqual({ status: "denied" })
  })

  it("refuses to revoke a quote acceptance action that belongs to another quote", async () => {
    const target = await offeredQuoteWithAction()
    const attacker = await createDraft({ serviceCode: "GUIDED_REVIEW", caseId: reviewCase })
    expect((await setTax(attacker!.id!, attacker!.version!))?.status).toBe("success")
    expect((await offer(attacker!.id!, attacker!.version! + 1))?.status).toBe("success")

    const challenges = async () => (await db.query<{ n: number }>(
      "select count(*)::int as n from admin_private.customer_action_challenges where action_id=$1", [target.action.id],
    )).rows[0].n
    const before = await challenges()

    const crossed = await rpc("admin_quote_command_v1", [token, key(), "revoke_action", {
      quoteId: attacker!.id, actionId: target.action.id, reason: "Attempting to revoke another quote's action.",
    }, null])
    expect(crossed).toEqual({ status: "conflict" })

    expect((await db.query<{ status: string }>(
      "select status from public.customer_actions where id=$1", [target.action.id],
    )).rows[0].status).toBe("OPEN")
    expect(await challenges()).toBe(before)
    expect((await db.query<{ n: number }>(
      "select count(*)::int as n from public.customer_action_events where action_id=$1 and event='ACTION_REVOKED'",
      [target.action.id],
    )).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>(
      "select count(*)::int as n from public.admin_audit_events where target_id=$1 and reason='Quote acceptance action revoked'",
      [attacker!.id],
    )).rows[0].n).toBe(0)

    // D: the same action revoked through the quote it actually belongs to.
    const owned = await rpc("admin_quote_command_v1", [token, key(), "revoke_action", {
      quoteId: target.quote.id, actionId: target.action.id, reason: "The customer asked us to withdraw this quote link.",
    }, null])
    expect(owned).toMatchObject({ status: "success", actionStatus: "REVOKED" })
    expect((await db.query<{ n: number }>(
      "select count(*)::int as n from public.admin_audit_events where target_id=$1 and reason='Quote acceptance action revoked'",
      [target.quote.id],
    )).rows[0].n).toBe(1)
  })

  it("returns the quote list instead of raising, and filters by status", async () => {
    const quote = await createDraft({ serviceCode: "GUIDED_RELAUNCH" })
    expect((await setTax(quote!.id!, quote!.version!))?.status).toBe("success")
    expect((await offer(quote!.id!, quote!.version! + 1))?.status).toBe("success")

    const all = await rpc("admin_quote_list_v1", [token, null, null])
    const listed = all!.quotes as Array<{ id: string; status: string }>
    expect(listed.some(row => row.id === quote!.id)).toBe(true)

    const offered = await rpc("admin_quote_list_v1", [token, "OFFERED", null])
    expect((offered!.quotes as Array<{ id: string }>).map(row => row.id)).toContain(quote!.id)
    const drafts = await rpc("admin_quote_list_v1", [token, "DRAFT", null])
    expect((drafts!.quotes as Array<{ id: string }>).map(row => row.id)).not.toContain(quote!.id)
  })
})
