import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const token = "ab".repeat(32)
const reason = "Checked the enquiry with the caller on 1 November."

type CommandResult = {
  status: string
  requestId: string
  version: number
  existing: boolean
  step: string
  supported: boolean
  emailVerified: boolean
  contactVerified: boolean
  invitationSent: boolean
  invitationReady: boolean
  membership: string | null
  termsConfigured: boolean
  outstanding: string[]
  request: { version: number; businessId: string }
  customer: { id: string; emailVerified: boolean }
}

async function rpc(name: string, args: unknown[]): Promise<CommandResult> {
  const params = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: CommandResult }>(`select public.${name}(${params}) as value`, args)).rows[0].value
}

const command = (operation: string, payload: object, version = 0, key = crypto.randomUUID()) =>
  rpc("admin_commercial_command_v1", [token, key, operation, payload, version])

async function enquiry(service: string, email: string, subject = "Telloya receptionist", details = "Please set up Telloya for this shop.") {
  const payload = {
    fullName: "North Owner",
    email,
    phone: "07123456789",
    businessName: "North Plumbing",
    country: "United Kingdom",
    service,
    subject,
    details,
    websiteUrl: "",
    businessProfileUrl: "",
    reviewUrl: "",
    source: "phone",
  }
  const row = await db.query<{ id: string }>(
    `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
     values (gen_random_uuid(), md5($1::text), 'phone', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
    [JSON.stringify(payload)],
  )
  return row.rows[0].id
}

async function counts() {
  const tables = [
    "public.customer_contact_verifications",
    "admin_private.customer_portal_sessions",
    "admin_private.onboarding_invitations",
    "public.communications",
    "public.commercial_payment_evidence",
    "public.product_entitlements",
    "public.service_provisions",
    "public.bundle_guard_allocations",
  ]
  const result: Record<string, number> = {}
  for (const table of tables) {
    const row = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)
    result[table] = row.rows[0].n
  }
  const users = await db.query<{ n: number }>("select count(*)::int as n from auth.users")
  result["auth.users"] = users.rows[0].n
  return result
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("admin commercial onboarding", () => {
  it("refuses a session that is missing, idle, or no longer the administrator", async () => {
    const id = await enquiry("telloya", "session@example.com")
    const payload = { enquiryId: id, product: "TELLOYA", reason }
    expect(await rpc("admin_commercial_command_v1", ["c".repeat(64), crypto.randomUUID(), "classify", payload, 0])).toMatchObject({ status: "unauthorized" })
    await db.query("update public.admin_sessions set last_seen_at = now() - interval '31 minutes' where token_hash = $1", [token])
    expect(await command("classify", payload)).toMatchObject({ status: "unauthorized" })
    await db.query("update public.admin_sessions set last_seen_at = now(), revoked_at = now() where token_hash = $1", [token])
    expect(await command("classify", payload)).toMatchObject({ status: "unauthorized" })
    await db.query("update public.admin_sessions set revoked_at = null, expires_at = now() - interval '1 minute', last_seen_at = now() where token_hash = $1", [token])
    expect(await command("classify", payload)).toMatchObject({ status: "unauthorized" })
    await db.query("update public.admin_sessions set expires_at = now() + interval '12 hours', last_seen_at = now() where token_hash = $1", [token])
    expect(await rpc("admin_commercial_onboarding_v1", ["c".repeat(64), id])).toBeNull()
    await db.exec("set role anon")
    try {
      await expect(command("classify", payload)).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec("reset role")
    }
  })

  it("does not open Telloya onboarding for a Recovery enquiry or call case conversion", async () => {
    const id = await enquiry("profile-recovery", "recovery@example.com", "Suspended profile", "The Business Profile is suspended.")
    expect(await rpc("admin_commercial_onboarding_v1", [token, id])).toEqual({ supported: false })
    expect(await command("classify", { enquiryId: id, product: "TELLOYA", reason })).toMatchObject({ status: "denied" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.onboarding_requests")).rows[0].n).toBe(0)
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261101180000_admin_commercial_onboarding_v1.sql", import.meta.url), "utf8")
    expect(sql).not.toContain("admin_enquiry_convert_v1")
    expect(sql).not.toContain("admin_contact_verify_v1")
    expect(sql).not.toContain("customer_portal_sessions")
    expect(sql).not.toContain("communications")
    expect(sql).not.toContain("SEND_EMAIL")
  })

  it("reuses one request for a repeated classify and keeps a second product in conflict", async () => {
    const id = await enquiry("telloya", "repeat@example.com")
    const key = crypto.randomUUID()
    const payload = { enquiryId: id, product: "TELLOYA", reason }
    const first = await command("classify", payload, 0, key)
    expect(first.status).toBe("success")
    expect(await command("classify", payload, 0, key)).toEqual(first)
    expect(await command("classify", { ...payload, product: "COMPLETE" })).toMatchObject({ status: "conflict" })
    const secondKey = crypto.randomUUID()
    expect(await command("classify", payload, 0, secondKey)).toMatchObject({ status: "success", requestId: first.requestId, existing: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.onboarding_requests where enquiry_id = $1", [id])).rows[0].n).toBe(1)
    const view = await rpc("admin_commercial_onboarding_v1", [token, id])
    expect(view.step).toBe("customer")
    expect(view.request).toMatchObject({ product: "TELLOYA", state: "RECEIVED" })
  })

  it("reuses a verified customer, keeps a second business, and does not verify a new mailbox", async () => {
    const before = await counts()
    await db.exec(`insert into public.customers(full_name, email) values ('Verified Owner', 'verified@example.com')`)
    const customer = (await db.query<{ id: string }>("select id from public.customers where email = 'verified@example.com'")).rows[0].id
    await db.exec(`insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}', 'email', 'verified@example.com', '${admin}', '${reason}')`)
    const north = await enquiry("telloya", "verified@example.com", "Telloya for North", "Telloya at the north shop.")
    const opened = await command("classify", { enquiryId: north, product: "TELLOYA", reason })
    expect(await command("match_customer", { enquiryId: north, customerId: customer, reason }, Number(opened.version))).toMatchObject({ status: "success" })
    const forged = await enquiry("complete", "verified@example.com", "Complete for South", "Complete at the south shop.")
    const forgedOpen = await command("classify", { enquiryId: forged, product: "COMPLETE", reason })
    expect(await command("match_customer", {
      enquiryId: forged,
      customerId: "22222222-2222-4222-8222-222222222222",
      reason,
    }, Number(forgedOpen.version))).toMatchObject({ status: "denied" })
    const reused = await command("match_customer", { enquiryId: forged, customerId: customer, reason }, Number(forgedOpen.version))
    expect(reused.status).toBe("success")
    const northView = await rpc("admin_commercial_onboarding_v1", [token, north])
    expect(northView.emailVerified).toBe(true)
    expect(northView.contactVerified).toBe(true)
    const northBusiness = await command("match_business", {
      enquiryId: north, create: true, name: "North Plumbing", website: "", membership: "verified", reason,
    }, Number((await rpc("admin_commercial_onboarding_v1", [token, north])).request.version))
    expect(northBusiness.status).toBe("success")
    const southBusiness = await command("match_business", {
      enquiryId: forged, create: true, name: "South Plumbing", website: "", membership: "verified", reason,
    }, Number(reused.version))
    expect(southBusiness.status).toBe("success")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customers where lower(email) = 'verified@example.com'")).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.onboarding_requests where customer_id = $1 and state not in ('DECLINED','CLOSED')", [customer])).rows[0].n).toBe(2)
    const fresh = await enquiry("telloya", "new-person@example.com")
    const freshOpen = await command("classify", { enquiryId: fresh, product: "TELLOYA", reason })
    const created = await command("match_customer", { enquiryId: fresh, create: true, reason }, Number(freshOpen.version))
    expect(created.status).toBe("success")
    const freshView = await rpc("admin_commercial_onboarding_v1", [token, fresh])
    expect(freshView.emailVerified).toBe(false)
    expect(freshView.contactVerified).toBe(false)
    expect(freshView.customer.emailVerified).toBe(false)
    expect(freshView.outstanding.join(" ")).toMatch(/does not verify/)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_contact_verifications where customer_id = $1", [freshView.customer.id])).rows[0].n).toBe(0)
    const after = await counts()
    expect(after["admin_private.customer_portal_sessions"]).toBe(before["admin_private.customer_portal_sessions"])
    expect(after["admin_private.onboarding_invitations"]).toBe(0)
    expect(after["public.communications"]).toBe(before["public.communications"])
    expect(after["auth.users"]).toBe(before["auth.users"])
  })

  it("rejects a location from another business, a revoked membership, and a stale version", async () => {
    const id = await enquiry("telloya", "mismatch@example.com")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const matched = await command("match_customer", { enquiryId: id, create: true, reason }, Number(opened.version))
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Mismatch Plumbing", website: "", membership: "pending", reason,
    }, Number(matched.version))
    expect(business.status).toBe("success")
    const other = (await db.query<{ id: string }>(
      "insert into public.businesses(display_name) values ('Other Business') returning id",
    )).rows[0].id
    const foreign = (await db.query<{ id: string }>(
      "insert into public.locations(business_id, location_name, country) values ($1, 'Yard', 'United Kingdom') returning id",
      [other],
    )).rows[0].id
    expect(await command("select_locations", { enquiryId: id, locationIds: [foreign], reason }, Number(business.version))).toMatchObject({ status: "denied" })
    const located = await command("select_locations", {
      enquiryId: id, create: true, locationName: "High Street", country: "United Kingdom", locationIds: [], reason,
    }, Number(business.version))
    expect(located.status).toBe("success")
    expect(await command("mark_ready", { enquiryId: id, reason }, Number(located.version))).toMatchObject({ status: "success" })
    const view = await rpc("admin_commercial_onboarding_v1", [token, id])
    expect(view.invitationSent).toBe(false)
    expect(view.invitationReady).toBe(true)
    expect(view.membership).toBe("pending")
    expect(view.outstanding.join(" ")).toMatch(/Pending is not verified/)
    expect(view.termsConfigured).toBe(false)
    expect(await command("prepare_offer", { enquiryId: id, reason }, Number(view.request.version))).toMatchObject({ status: "denied" })
    const customerId = view.customer.id as string
    const businessId = view.request.businessId as string
    await db.query(
      "update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null, evidence = $1 where customer_id = $2 and business_id = $3",
      [reason, customerId, businessId],
    )
    const current = await rpc("admin_commercial_onboarding_v1", [token, id])
    expect(await command("mark_ready", { enquiryId: id, reason }, Number(current.request.version))).toMatchObject({ status: "denied" })
    expect(await command("review", { enquiryId: id, reason }, Number(current.request.version) + 9)).toMatchObject({ status: "conflict" })
  })

  it("requires a recent Admin sign-in before it records business authority", async () => {
    const id = await enquiry("telloya", "reauth@example.com")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const matched = await command("match_customer", { enquiryId: id, create: true, reason }, Number(opened.version))
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Reauth Plumbing", website: "", membership: "pending", reason,
    }, Number(matched.version))
    expect(business.status).toBe("success")
    await db.query("update public.admin_sessions set created_at = now() - interval '31 minutes', last_seen_at = now(), expires_at = now() + interval '12 hours' where token_hash = $1", [token])
    const aged = await rpc("admin_commercial_onboarding_v1", [token, id])
    const retry = await command("match_business", {
      enquiryId: id, businessId: aged.request.businessId, membership: "verified", reason,
    }, Number(aged.request.version))
    expect(retry).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ status: string }>("select status from public.business_memberships where business_id = $1", [aged.request.businessId])).rows[0].status).toBe("pending")
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
  })

  it("accepts phone proof as business authority and still leaves the email unverified", async () => {
    await db.exec(`insert into public.customers(full_name, email, phone) values ('Phone Owner', 'phone-only@example.com', '07111111111')`)
    const customer = (await db.query<{ id: string }>("select id from public.customers where email = 'phone-only@example.com'")).rows[0].id
    await db.exec(`insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}', 'phone', '07111111111', '${admin}', '${reason}')`)
    const id = await enquiry("telloya", "phone-only@example.com", "Telloya for the phone owner", "Telloya at the phone owner's shop.")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const matched = await command("match_customer", { enquiryId: id, customerId: customer, reason }, opened.version)
    const view = await rpc("admin_commercial_onboarding_v1", [token, id])
    expect(matched.status).toBe("success")
    expect(view.emailVerified).toBe(false)
    expect(view.contactVerified).toBe(true)
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Phone Plumbing", website: "", membership: "verified", reason,
    }, view.request.version)
    expect(business.status).toBe("success")
    const after = await rpc("admin_commercial_onboarding_v1", [token, id])
    expect(after.membership).toBe("verified")
    expect(after.emailVerified).toBe(false)
    expect(after.invitationSent).toBe(false)
  })

  it("declines without sending mail and can open a later request for the same enquiry", async () => {
    const id = await enquiry("complete", "decline@example.com", "Complete package", "Asking about the Complete package.")
    const opened = await command("classify", { enquiryId: id, product: "COMPLETE", reason })
    const declined = await command("decline", { enquiryId: id, reason }, Number(opened.version))
    expect(declined.status).toBe("success")
    const again = await command("classify", { enquiryId: id, product: "COMPLETE", reason })
    expect(again.status).toBe("success")
    expect(again.requestId).not.toBe(declined.requestId)
    expect((await db.query<{ state: string }>("select state from public.onboarding_requests where enquiry_id = $1 order by created_at", [id])).rows.map(row => row.state)).toEqual(["DECLINED", "RECEIVED"])
  })

  it("does not invent a price and does offer a real approved plan without activating it", async () => {
    const id = await enquiry("telloya", "priced@example.com")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    await db.exec(`insert into public.customers(full_name, email) values ('Priced Owner', 'priced@example.com')`)
    const customer = (await db.query<{ id: string }>("select id from public.customers where email = 'priced@example.com'")).rows[0].id
    await db.exec(`insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}', 'email', 'priced@example.com', '${admin}', '${reason}')`)
    const matched = await command("match_customer", { enquiryId: id, customerId: customer, reason }, Number(opened.version))
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Priced Plumbing", website: "https://priced.example", membership: "verified", reason,
    }, Number(matched.version))
    const located = await command("select_locations", {
      enquiryId: id, create: true, locationName: "Depot", country: "United Kingdom", locationIds: [], reason,
    }, Number(business.version))
    const missing = await command("prepare_offer", { enquiryId: id, reason }, Number(located.version))
    expect(missing).toMatchObject({ status: "terms_unconfigured" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions")).rows[0].n).toBe(0)
    const view = await rpc("admin_commercial_onboarding_v1", [token, id])
    expect(view.termsConfigured).toBe(false)
    expect(view.outstanding.join(" ")).toMatch(/Commercial terms not yet configured/)
    const plan = crypto.randomUUID()
    await db.query(
      `insert into public.plan_versions(id, product_code, version_number, status, effective_from, billing_cadence, currency, amount_minor, tax_behaviour, terms_ref)
       values ($1, 'TELLOYA', 1, 'DRAFT', now(), 'MONTH', 'GBP', 4900, 'NOT_APPLICABLE', 'terms-telloya-v1')`,
      [plan],
    )
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', 3, 'LOCATION')`,
      [plan],
    )
    await db.query(
      `update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`,
      [plan, admin],
    )
    const offered = await command("prepare_offer", { enquiryId: id, planVersionId: plan, reason }, Number(located.version))
    expect(offered.status).toBe("success")
    const subscription = await db.query<{ state: string; amount_minor: number; tax_behaviour: string; terms_ref: string; grant_kind: string }>(
      "select state, amount_minor, tax_behaviour, terms_ref, grant_kind from public.commercial_subscriptions",
    )
    expect(subscription.rows).toEqual([{
      state: "OFFERED",
      amount_minor: 4900,
      tax_behaviour: "NOT_APPLICABLE",
      terms_ref: "terms-telloya-v1",
      grant_kind: "BILLABLE",
    }])
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.commercial_payment_evidence")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.product_entitlements")).rows[0].n).toBe(0)
    expect((await db.query<{ stripe_subscription_id: string | null }>("select stripe_subscription_id from public.commercial_subscriptions")).rows[0].stripe_subscription_id).toBeNull()
    expect(await command("prepare_offer", { enquiryId: id, planVersionId: plan, reason }, Number(offered.version))).toMatchObject({ status: "success", existing: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions")).rows[0].n).toBe(1)
    const quiet = await counts()
    expect(quiet["public.communications"]).toBe(0)
    expect(quiet["admin_private.onboarding_invitations"]).toBe(0)
    expect(quiet["admin_private.customer_portal_sessions"]).toBe(0)
  })
})
