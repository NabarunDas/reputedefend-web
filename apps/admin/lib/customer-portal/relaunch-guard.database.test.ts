import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, migrationSql, preparePlatform } from "../recovery/harness"

const migration = "20261004000625_customer_portal_relaunch_guard_v1.sql"
const db = new PGlite()

const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const sam = "77777777-7777-4777-8777-777777777777"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const samAuth = "88888888-8888-4888-8888-888888888888"
const alexBusiness = "33333333-3333-4333-8333-333333333333"
const samBusiness = "34343434-3434-4343-8343-343434343434"
const alexLocation = "44444444-4444-4444-8444-444444444444"
const samLocation = "45454545-4545-4454-8454-454545454545"
const adminToken = "a".repeat(64)

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const key = () => randomUUID()
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number; orderId?: string; subscriptionId?: string }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}
async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}
async function count(sql: string, params: unknown[] = []) {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  await rpc("customer_portal_begin_login_v1", [email, pending])
  await rpc("customer_portal_confirm_otp_sent_v1", [pending])
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(finished.status)
  return sessionHash
}

async function verify(id: string, email: string, business: string) {
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email',$2,$3,$4) on conflict (customer_id, channel) do update set verified_value = excluded.verified_value`,
    [id, email, admin, "Verified from a live call with the customer."],
  )
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1,$2,'verified',now(),$3,$4)
     on conflict (customer_id, business_id) do update
       set status = 'verified', verified_at = now(), verified_by = excluded.verified_by, evidence = excluded.evidence`,
    [id, business, admin, "Companies House match discussed on a live call."],
  )
}

async function priceId() {
  return (await rows<{ id: string }>("select id from public.price_versions where service_code = 'RELAUNCH_GUARD' and seed_key is not null"))[0].id
}

async function completeOtp(actionId: string, secretHash: string, authUser = alexAuth, email = "alex@example.com") {
  const pending = hash(token())
  const session = hash(token())
  expect(await rpc("customer_action_exchange_v1", [actionId, secretHash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, authUser, email])).toMatchObject({ status: "ok" })
  return session
}

async function acceptGuardOrder(customerId: string, business: string, location: string) {
  const draft = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_draft", {
    serviceCode: "RELAUNCH_GUARD", customerId, businessId: business, caseId: null, locationId: location,
    priceVersionId: await priceId(),
    scope: "Monitor this exact location after access and permission are confirmed.",
    exclusions: "Payment collection, Google decisions, and automatic activation are excluded.",
    validUntil: later(), applyDiscount: false,
  }, null])
  expect(draft.status).toBe("success")
  expect((await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "set_draft_tax", { quoteId: draft.id, taxBehaviour: "NOT_APPLICABLE" }, draft.version])).status).toBe("success")
  expect((await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId: draft.id, quoteVersionId: draft.quoteVersionId }, (draft.version || 1) + 1])).status).toBe("success")
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_quote_acceptance_action", { quoteId: draft.id, expiresAt: actionExpiry(), secretHash }, null])
  const session = await completeOtp(String(issued.id), secretHash, customerId === alex ? alexAuth : samAuth, customerId === alex ? "alex@example.com" : "sam@example.com")
  const accepted = await rpc<Json>("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted.status).toBe("success")
  return String(accepted.orderId)
}

async function createCoverage(customerId: string, business: string, location: string) {
  const requestId = randomUUID()
  await db.query(
    `insert into public.monitoring_requests(id, submission_key, customer_id, business_id, location_id, status, number_of_locations, source, intake_snapshot, terms_accepted_at)
     values ($1,$2,$3,$4,$5,'REQUESTED',1,'START_MONITORING','{}',now())`,
    [requestId, randomUUID(), customerId, business, location],
  )
  const orderId = await acceptGuardOrder(customerId, business, location)
  const mapping = (await rows<{ id: string }>("select id from public.guard_onboarding_locations where monitoring_request_id = $1 and location_id = $2", [requestId, location]))[0].id
  const created = await rpc<Json>("admin_guard_command_v1", [adminToken, key(), "create_direct_coverage", { mappingId: mapping, serviceOrderId: orderId }, null])
  expect(created.status).toBe("success")
  return String(created.id)
}

async function issuePermission(coverageId: string) {
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_guard_command_v1", [adminToken, key(), "issue_permission_action", {
    coverageId, expiresAt: actionExpiry(), secretHash,
  }, null])
  expect(issued.status).toBe("success")
  return { actionId: String(issued.id), secretHash }
}

async function guardSelector(coverageId: string) {
  return (await rows<{ value: string }>("select admin_private.customer_portal_guard_selector_v1($1) as value", [coverageId]))[0].value
}
async function actionSelector(actionId: string) {
  return (await rows<{ value: string }>("select admin_private.customer_portal_action_selector_v1($1) as value", [actionId]))[0].value
}

function leak(value: unknown) {
  const serialised = JSON.stringify(value)
  expect(serialised).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  expect(serialised).not.toMatch(/cus_|pi_|cs_|pm_|sub_|price_|si_|sk_|stripe|severity|operator notes/i)
  return serialised
}

let alexSession = ""
let samSession = ""
let alexCoverage = ""
let samCoverage = ""

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com');
    insert into public.businesses(id, display_name) values
      ('${alexBusiness}', 'Harbour Bakery'),
      ('${samBusiness}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${alexLocation}', '${alexBusiness}', 'UK', 'High Street'),
      ('${samLocation}', '${samBusiness}', 'UK', 'High Street');
  `)
  await verify(alex, "alex@example.com", alexBusiness)
  await verify(sam, "sam@example.com", samBusiness)
  alexSession = await portalSession("alex@example.com", alexAuth)
  samSession = await portalSession("sam@example.com", samAuth)
  alexCoverage = await createCoverage(alex, alexBusiness, alexLocation)
  samCoverage = await createCoverage(sam, samBusiness, samLocation)
}, 180000)

afterAll(async () => { await db.close() })

describe("customer portal relaunch guard", () => {
  it("shows only the signed-in customer's locations and no internal identifiers", async () => {
    const alexView = await rpc<{ locations: Array<Record<string, unknown>> }>("customer_portal_guard_v1", [alexSession])
    const samView = await rpc<{ locations: Array<Record<string, unknown>> }>("customer_portal_guard_v1", [samSession])
    expect(alexView.locations).toHaveLength(1)
    expect(samView.locations).toHaveLength(1)
    expect(alexView.locations[0].selector).toBe(await guardSelector(alexCoverage))
    expect(alexView.locations[0].selector).not.toBe(samView.locations[0].selector)
    expect(alexView.locations[0].businessName).toBe("Harbour Bakery")
    expect(alexView.locations[0].locationName).toBe("High Street")
    expect(alexView.locations[0].arrangement).toBe("Directly purchased Guard")
    expect(alexView.locations[0].monitoringActive).toBe(false)
    leak(alexView)
    leak(samView)
    expect(await rpc("customer_portal_guard_location_v1", [alexSession, samView.locations[0].selector])).toEqual({ found: false })
    expect(await rpc("customer_portal_guard_location_v1", [samSession, alexView.locations[0].selector])).toEqual({ found: false })
    expect(await rpc("customer_portal_guard_location_v1", [hash(token()), alexView.locations[0].selector])).toBeNull()
  })

  it("shows a customer-safe check and hides another customer's alert details", async () => {
    const schedule = randomUUID()
    const rota = randomUUID()
    const obligation = randomUUID()
    const attempt = randomUUID()
    const baseline = randomUUID()
    const observation = randomUUID()
    const alert = randomUUID()
    await db.query(
      `insert into public.guard_check_schedule_versions(
        id, morning_start, morning_end, evening_start, evening_end, effective_from, status, created_by, approved_at, approved_by
      ) values ($1,'08:00','12:00','16:00','20:00', current_date, 'APPROVED', $2, now(), $2)`,
      [schedule, admin],
    )
    await db.query(
      `insert into public.guard_rota_assignments(id, coverage_id, assignee_auth_user_id, created_by)
       values ($1,$2,$3,$3)`,
      [rota, alexCoverage, admin],
    )
    await db.query(
      `insert into public.guard_baselines(
        id, coverage_id, location_id, version_number, status, profile_url, profile_availability,
        displayed_business_name, review_count, rating, capture_method, captured_by, notes
      ) values ($1,$2,$3,1,'VERIFIED','https://maps.google.com/?cid=1','AVAILABLE','Harbour Bakery',4,4.2,'MANUAL_ADMIN',$4,'secret baseline note')`,
      [baseline, alexCoverage, alexLocation, admin],
    )
    await db.query(
      `insert into public.guard_check_obligations(
        id, coverage_id, customer_id, business_id, location_id, service_date, window_code, schedule_version_id,
        rota_assignment_id, coverage_basis, timezone, local_start, local_end, window_start_utc, window_end_utc, state, completed_at
      ) values (
        $1,$2,$3,$4,$5,current_date,'MORNING',$6,$7,'DIRECT_GUARD','Europe/London','08:00','12:00',
        admin_private.guard_local_window_utc_v1(current_date, '08:00'::time, 'Europe/London'),
        admin_private.guard_local_window_utc_v1(current_date, '12:00'::time, 'Europe/London'),
        'COMPLETED', now()
      )`,
      [obligation, alexCoverage, alex, alexBusiness, alexLocation, schedule, rota],
    )
    await db.query(
      `insert into public.guard_check_attempts(id, obligation_id, attempt_number, actor_id, finished_at, outcome)
       values ($1,$2,1,$3,now(),'COMPLETED')`,
      [attempt, obligation, admin],
    )
    await db.query(
      `insert into public.guard_check_observations(
        id, obligation_id, attempt_id, coverage_id, location_id, observed_at, capture_method, profile_availability, location_identified,
        displayed_business_name, review_count, rating, rating_available, profile_url, notes, classification, comparison_status,
        change_codes, baseline_id
      ) values (
        $1,$2,$3,$4,$5,'2026-10-03T10:00:00Z','MANUAL','AVAILABLE',true,'Harbour Bakery',5,4.0,true,'https://maps.google.com/?cid=1',
        'secret operator note','CHANGE_DETECTED','COMPARED',ARRAY['RATING_CHANGED'],$6
      )`,
      [observation, obligation, attempt, alexCoverage, alexLocation, baseline],
    )
    await db.query(
      `insert into public.guard_alerts(
        id, coverage_id, customer_id, business_id, location_id, first_observation_id, latest_observation_id,
        first_observed_at, latest_observed_at, issue_codes, linked_primary_case_id
      ) values ($1,$2,$3,$4,$5,$6,$6,'2026-10-03T10:00:00Z','2026-10-03T10:00:00Z',ARRAY['RATING_CHANGED'], null)`,
      [alert, alexCoverage, alex, alexBusiness, alexLocation, observation],
    )
    const view = await rpc<{ locations: Array<Record<string, unknown>> }>("customer_portal_guard_v1", [alexSession])
    expect(view.locations[0].monitoring).toBe("Change detected — being reviewed")
    expect(view.locations[0].profileAvailable).toBe(true)
    expect(view.locations[0].issueUnderReview).toBe(true)
    expect(typeof view.locations[0].lastCheckedAt).toBe("string")
    leak(view)
    const samView = await rpc<{ locations: Array<Record<string, unknown>> }>("customer_portal_guard_v1", [samSession])
    expect(samView.locations[0].issueUnderReview).toBe(false)
    expect(samView.locations[0].monitoring).toBeUndefined()
  })

  it("accepts and declines owned Guard permission and keeps the emailed path", async () => {
    const first = await issuePermission(alexCoverage)
    const selector = await guardSelector(alexCoverage)
    const action = await actionSelector(first.actionId)
    const session = await completeOtp(first.actionId, first.secretHash)
    const emailed = await rpc<Json>("customer_action_command_v1", [session, key(), "accept", { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }])
    expect(emailed.status).toBe("success")
    expect(await count("select count(*)::int as n from public.guard_permissions where coverage_id = $1 and status = 'ACTIVE'", [alexCoverage])).toBe(1)
    const replay = await rpc<Json>("customer_portal_guard_command_v1", [alexSession, key(), selector, action, "accept_permission", { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }])
    expect(replay.status).toBe("success")
    expect(JSON.stringify(replay)).not.toMatch(/permissionId|coverageId/)

    const secondCoverage = alexCoverage
    await db.query("update public.customer_actions set status = 'COMPLETED' where id = $1", [first.actionId])
    const declined = await issuePermission(secondCoverage)
    const declineSelector = await actionSelector(declined.actionId)
    const portalDecline = await rpc<Json>("customer_portal_guard_command_v1", [alexSession, key(), selector, declineSelector, "decline_permission", {}])
    expect(portalDecline).toMatchObject({ status: "success", actionStatus: "DECLINED" })
    const again = await rpc<Json>("customer_portal_guard_command_v1", [alexSession, key(), selector, declineSelector, "decline_permission", {}])
    expect(again.status).toBe("unavailable")
    expect(await rpc("customer_portal_guard_command_v1", [samSession, key(), selector, declineSelector, "accept_permission", { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }])).toEqual({ status: "not_found" })
    expect(await rpc("customer_portal_guard_command_v1", [alexSession, key(), await guardSelector(samCoverage), declineSelector, "decline_permission", {}])).toEqual({ status: "not_found" })
    expect(await rpc("customer_portal_guard_command_v1", [alexSession, key(), selector, `ca-${"ab".repeat(32)}`, "accept_permission", { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }])).toEqual({ status: "not_found" })
  })

  it("fails closed for a bad, expired or revoked portal session and a changed action email", async () => {
    const issued = await issuePermission(alexCoverage)
    const selector = await guardSelector(alexCoverage)
    const action = await actionSelector(issued.actionId)
    expect(await rpc("customer_portal_guard_v1", ["nope"])).toBeNull()
    await db.query(
      `update admin_private.customer_portal_login_rate
       set last_requested_at = now() - interval '2 minutes', window_started_at = now() - interval '31 minutes', send_count = 0
       where customer_id = $1`,
      [alex],
    )
    const expired = await portalSession("alex@example.com", alexAuth)
    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now() - interval '2 hours',
           created_at = now() - interval '2 hours',
           expires_at = now() - interval '1 minute'
       where token_hash = $1`,
      [expired],
    )
    expect(await rpc("customer_portal_guard_v1", [expired])).toBeNull()
    await db.query(
      `update admin_private.customer_portal_login_rate
       set last_requested_at = now() - interval '2 minutes', window_started_at = now() - interval '31 minutes', send_count = 0
       where customer_id = $1`,
      [alex],
    )
    const revoked = await portalSession("alex@example.com", alexAuth)
    expect((await rpc<{ status: string }>("customer_portal_sign_out_v1", [revoked])).status).toBe("ok")
    expect(await rpc("customer_portal_guard_command_v1", [revoked, key(), selector, action, "decline_permission", {}])).toBeNull()
    try {
      await db.query("update public.customers set email = 'moved@example.com' where id = $1", [alex])
      await verify(alex, "moved@example.com", alexBusiness)
      await db.query("update auth.users set email = 'moved@example.com' where id = $1", [alexAuth])
      expect(await rpc("customer_portal_guard_v1", [alexSession])).toBeNull()
      await db.query(
        `update admin_private.customer_portal_login_rate
         set last_requested_at = now() - interval '2 minutes', window_started_at = now() - interval '31 minutes', send_count = 0
         where customer_id = $1`,
        [alex],
      )
      const moved = await portalSession("moved@example.com", alexAuth)
      expect(await rpc("customer_portal_guard_command_v1", [moved, key(), selector, action, "decline_permission", {}])).toEqual({ status: "not_found" })
    } finally {
      await db.query("update public.customers set email = 'alex@example.com' where id = $1", [alex])
      await verify(alex, "alex@example.com", alexBusiness)
      await db.query("update auth.users set email = 'alex@example.com' where id = $1", [alexAuth])
    }
  })

  it("does not trust a client subscription id and does not mark billing current from checkout preparation", async () => {
    const sql = migrationSql(migration)
    expect(sql).not.toMatch(/create table/i)
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on/i)
    expect(sql).not.toMatch(/execute\s+['$]/i)
    expect(sql).not.toMatch(/\bformat\s*\(/i)
    const command = (await rows<{ def: string }>("select pg_get_functiondef('public.customer_guard_subscription_command_v1(text,uuid,text,jsonb)'::regprocedure) as def"))[0].def
    expect(command).toContain("customer_guard_subscription_apply_v1")
    expect(command).toContain("subscriptionId")
    expect(command).not.toContain("INSERT INTO public.provider_operations")
    const core = (await rows<{ def: string }>("select pg_get_functiondef('admin_private.customer_action_command_core_v1(text,uuid,text,jsonb)'::regprocedure) as def"))[0].def
    expect(core).toContain("decline_guard_permission_v1")
    expect(core).toContain("accept_guard_permission_v1")
    expect(core).toContain("customer_commercial_apply_v1")
    const selector = await guardSelector(alexCoverage)
    const forged = await rpc<Json>("customer_portal_guard_command_v1", [alexSession, key(), selector, `ca-${"cd".repeat(32)}`, "start_checkout", {
      idempotencyKey: key(), subscriptionId: randomUUID(),
    }])
    expect(forged.status).toBe("unavailable")
    expect(await count("select count(*)::int as n from public.guard_billing where coverage_id = $1 and billing_state = 'CURRENT'", [alexCoverage])).toBe(0)
  })

  it("keeps the new functions service-role only", async () => {
    const publicFns = [
      "public.customer_portal_guard_v1(text)",
      "public.customer_portal_guard_location_v1(text,text)",
      "public.customer_portal_guard_command_v1(text,uuid,text,text,text,jsonb)",
    ]
    const privateFns = [
      "admin_private.customer_portal_guard_selector_v1(uuid)",
      "admin_private.decline_guard_permission_v1(customer_actions,uuid,uuid)",
      "admin_private.customer_guard_subscription_apply_v1(customer_actions,uuid,uuid,text,text,jsonb,uuid)",
      "admin_private.customer_portal_guard_location_body_v1(uuid,uuid,text)",
    ]
    const can = async (role: string, signature: string) =>
      (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
    for (const role of ["public", "anon", "authenticated"]) {
      for (const signature of [...publicFns, ...privateFns]) expect(await can(role, signature), `${role} ${signature}`).toBe(false)
    }
    for (const signature of publicFns) expect(await can("service_role", signature)).toBe(true)
    for (const signature of privateFns) expect(await can("service_role", signature)).toBe(false)
  })
})
