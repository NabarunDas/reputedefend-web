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
  productHint?: string | null
  emailVerified: boolean
  contactVerified: boolean
  invitationSent: boolean
  invitationReady: boolean
  membership: string | null
  termsConfigured: boolean
  outstanding: string[]
  request: { version: number; businessId: string }
  reason?: string
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
    const before = {
      businesses: (await db.query<{ n: number }>("select count(*)::int as n from public.businesses")).rows[0].n,
      memberships: (await db.query<{ n: number }>("select count(*)::int as n from public.business_memberships")).rows[0].n,
      audits: (await db.query<{ n: number }>("select count(*)::int as n from public.admin_audit_events")).rows[0].n,
      receipts: (await db.query<{ n: number }>("select count(*)::int as n from admin_private.record_command_receipts")).rows[0].n,
    }
    await db.query("update public.admin_sessions set created_at = now() - interval '31 minutes', last_seen_at = now(), expires_at = now() + interval '12 hours' where token_hash = $1", [token])
    const aged = await command("match_business", {
      enquiryId: id, create: true, name: "Reauth Plumbing", website: "", membership: "pending", reason,
    }, Number(matched.version))
    expect(aged).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.businesses where display_name = 'Reauth Plumbing'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.businesses")).rows[0].n).toBe(before.businesses)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.business_memberships")).rows[0].n).toBe(before.memberships)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_audit_events")).rows[0].n).toBe(before.audits)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.record_command_receipts")).rows[0].n).toBe(before.receipts)
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
    const created = await command("match_business", {
      enquiryId: id, create: true, name: "Reauth Plumbing", website: "", membership: "pending", reason,
    }, Number(matched.version))
    expect(created.status).toBe("success")
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
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', 1, 'LOCATION')`,
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
    expect((await db.query<{ component_code: string; quantity: number; quantity_limit_snapshot: number }>(
      "select component_code, quantity, quantity_limit_snapshot from public.commercial_subscription_items order by component_code",
    )).rows).toEqual([{ component_code: "TELLOYA", quantity: 1, quantity_limit_snapshot: 1 }])
    const quiet = await counts()
    expect(quiet["public.communications"]).toBe(0)
    expect(quiet["admin_private.onboarding_invitations"]).toBe(0)
    expect(quiet["admin_private.customer_portal_sessions"]).toBe(0)
  })

  it("advances the version for review and location selection, and rejects a stale second choice", async () => {
    const id = await enquiry("telloya", "concurrent@example.com")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const reviewed = await command("review", { enquiryId: id, reason }, opened.version)
    expect(reviewed.version).toBe(opened.version + 1)
    const reviewedAgain = await command("review", { enquiryId: id, reason }, reviewed.version)
    expect(reviewedAgain.version).toBe(reviewed.version + 1)
    const matched = await command("match_customer", { enquiryId: id, create: true, reason }, reviewedAgain.version)
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Concurrent Plumbing", website: "", membership: "pending", reason,
    }, matched.version)
    const businessId = (await rpc("admin_commercial_onboarding_v1", [token, id])).request.businessId
    const north = (await db.query<{ id: string }>(
      "insert into public.locations(business_id, location_name, country) values ($1, 'North yard', 'United Kingdom') returning id",
      [businessId],
    )).rows[0].id
    const south = (await db.query<{ id: string }>(
      "insert into public.locations(business_id, location_name, country) values ($1, 'South yard', 'United Kingdom') returning id",
      [businessId],
    )).rows[0].id
    const winnerKey = crypto.randomUUID()
    const winner = await command("select_locations", { enquiryId: id, locationIds: [north], reason }, business.version, winnerKey)
    const loser = await command("select_locations", { enquiryId: id, locationIds: [south], reason }, business.version)
    expect(winner.status).toBe("success")
    expect(winner.version).toBe(business.version + 1)
    expect(loser).toMatchObject({ status: "conflict", reason: "version" })
    expect(await command("select_locations", { enquiryId: id, locationIds: [north], reason }, business.version, winnerKey)).toEqual(winner)
    expect((await db.query<{ location_id: string }>(
      "select location_id from admin_private.onboarding_request_locations where onboarding_request_id = $1",
      [winner.requestId],
    )).rows).toEqual([{ location_id: north }])
    const ready = await command("mark_ready", { enquiryId: id, reason }, winner.version)
    expect(ready.version).toBe(winner.version + 1)
    expect(await command("mark_ready", { enquiryId: id, reason }, winner.version)).toMatchObject({ status: "conflict", reason: "version" })
  })

  it("preserves verified authority and refuses a revoked or silent upgrade", async () => {
    await db.exec(`insert into public.customers(full_name, email) values ('Authority Owner', 'authority@example.com')`)
    const customer = (await db.query<{ id: string }>("select id from public.customers where email = 'authority@example.com'")).rows[0].id
    await db.exec(`insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}', 'email', 'authority@example.com', '${admin}', '${reason}')`)
    const revokedBusiness = (await db.query<{ id: string }>(
      "insert into public.businesses(display_name) values ('Revoked Plumbing') returning id",
    )).rows[0].id
    await db.query(
      "insert into public.business_memberships(customer_id, business_id, status, evidence) values ($1, $2, 'revoked', $3)",
      [customer, revokedBusiness, reason],
    )
    const id = await enquiry("telloya", "authority@example.com")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const matched = await command("match_customer", { enquiryId: id, customerId: customer, reason }, opened.version)
    const refused = await command("match_business", {
      enquiryId: id, businessId: revokedBusiness, membership: "pending", reason,
    }, matched.version)
    expect(refused).toMatchObject({ status: "denied", reason: "revoked" })
    expect((await db.query<{ status: string }>("select status from public.business_memberships where business_id = $1", [revokedBusiness])).rows[0].status).toBe("revoked")
    expect((await rpc("admin_commercial_onboarding_v1", [token, id])).request.businessId).toBeNull()
    const verified = await command("match_business", {
      enquiryId: id, create: true, name: "Authority Plumbing", website: "", membership: "verified", reason,
    }, matched.version)
    expect(verified.status).toBe("success")
    const verifiedId = (await rpc("admin_commercial_onboarding_v1", [token, id])).request.businessId
    const beforeVersion = (await db.query<{ record_version: number }>(
      "select record_version from public.business_memberships where business_id = $1",
      [verifiedId],
    )).rows[0].record_version
    const kept = await command("match_business", {
      enquiryId: id, businessId: verifiedId, membership: "pending", reason,
    }, verified.version)
    expect(kept.status).toBe("success")
    expect((await db.query<{ status: string; record_version: number }>(
      "select status, record_version from public.business_memberships where business_id = $1",
      [verifiedId],
    )).rows[0]).toEqual({ status: "verified", record_version: beforeVersion })
    const pendingId = await enquiry("telloya", "pending-authority@example.com")
    const pendingOpen = await command("classify", { enquiryId: pendingId, product: "TELLOYA", reason })
    const pendingCustomer = await command("match_customer", { enquiryId: pendingId, create: true, reason }, pendingOpen.version)
    const pendingBusiness = await command("match_business", {
      enquiryId: pendingId, create: true, name: "Pending Plumbing", website: "", membership: "pending", reason,
    }, pendingCustomer.version)
    const pendingView = await rpc("admin_commercial_onboarding_v1", [token, pendingId])
    const upgrade = await command("match_business", {
      enquiryId: pendingId, businessId: pendingView.request.businessId, membership: "verified", reason,
    }, pendingBusiness.version)
    expect(upgrade.status).toBe("success")
    expect((await db.query<{ status: string }>(
      "select status from public.business_memberships where business_id = $1",
      [pendingView.request.businessId],
    )).rows[0].status).toBe("pending")
    const unproved = await enquiry("telloya", "unproved-authority@example.com")
    const unprovedOpen = await command("classify", { enquiryId: unproved, product: "TELLOYA", reason })
    const unprovedCustomer = await command("match_customer", { enquiryId: unproved, create: true, reason }, unprovedOpen.version)
    const beforeBusinesses = (await db.query<{ n: number }>("select count(*)::int as n from public.businesses")).rows[0].n
    const blocked = await command("match_business", {
      enquiryId: unproved, create: true, name: "Unproved Plumbing", website: "", membership: "verified", reason,
    }, unprovedCustomer.version)
    expect(blocked).toMatchObject({ status: "denied", reason: "membership" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.businesses where display_name = 'Unproved Plumbing'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.businesses")).rows[0].n).toBe(beforeBusinesses)
  })

  it("does not keep a location or a customer when a later check fails", async () => {
    const id = await enquiry("telloya", "stray-location@example.com")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const matched = await command("match_customer", { enquiryId: id, create: true, reason }, opened.version)
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Stray Plumbing", website: "", membership: "pending", reason,
    }, matched.version)
    const other = (await db.query<{ id: string }>("insert into public.businesses(display_name) values ('Foreign Plumbing') returning id")).rows[0].id
    const foreign = (await db.query<{ id: string }>(
      "insert into public.locations(business_id, location_name, country) values ($1, 'Foreign yard', 'United Kingdom') returning id",
      [other],
    )).rows[0].id
    const beforeAudits = (await db.query<{ n: number }>("select count(*)::int as n from public.admin_audit_events")).rows[0].n
    const beforeReceipts = (await db.query<{ n: number }>("select count(*)::int as n from admin_private.record_command_receipts")).rows[0].n
    const stray = await command("select_locations", {
      enquiryId: id, create: true, locationName: "Stray Yard", country: "United Kingdom", locationIds: [foreign], reason,
    }, business.version)
    expect(stray).toMatchObject({ status: "denied" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.locations where location_name = 'Stray Yard'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_audit_events")).rows[0].n).toBe(beforeAudits)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.record_command_receipts")).rows[0].n).toBe(beforeReceipts)
    const blank = (await db.query<{ id: string }>(
      `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
       values (gen_random_uuid(), md5('blank-name'), 'phone', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
      [JSON.stringify({
        fullName: "",
        email: "blank-name@example.com",
        phone: "",
        businessName: "Blank",
        country: "United Kingdom",
        service: "telloya",
        subject: "Telloya",
        details: "Telloya for a shop with no usable name.",
        source: "phone",
      })],
    )).rows[0].id
    const blankOpen = await command("classify", { enquiryId: blank, product: "TELLOYA", reason })
    const blankCustomer = await command("match_customer", { enquiryId: blank, create: true, reason }, blankOpen.version)
    expect(blankCustomer).toMatchObject({ status: "invalid" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customers where lower(email) = 'blank-name@example.com'")).rows[0].n).toBe(0)
  })

  it("withdraws a prepared offer on decline and keeps later onboarding for that business open", async () => {
    await db.exec(`insert into public.customers(full_name, email) values ('Offer Owner', 'offer-freeze@example.com')`)
    const customer = (await db.query<{ id: string }>("select id from public.customers where email = 'offer-freeze@example.com'")).rows[0].id
    await db.exec(`insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}', 'email', 'offer-freeze@example.com', '${admin}', '${reason}')`)
    const id = await enquiry("telloya", "offer-freeze@example.com")
    const opened = await command("classify", { enquiryId: id, product: "TELLOYA", reason })
    const matched = await command("match_customer", { enquiryId: id, customerId: customer, reason }, opened.version)
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Frozen Plumbing", website: "", membership: "verified", reason,
    }, matched.version)
    const located = await command("select_locations", {
      enquiryId: id, create: true, locationName: "Frozen yard", country: "United Kingdom", locationIds: [], reason,
    }, business.version)
    const plan = (await db.query<{ id: string }>(
      "select id from public.plan_versions where product_code = 'TELLOYA' and status = 'APPROVED' and terms_ref = 'terms-telloya-v1'",
    )).rows[0].id
    const offered = await command("prepare_offer", { enquiryId: id, planVersionId: plan, reason }, located.version)
    expect(offered.status).toBe("success")
    const subscriptionId = (await db.query<{ commercial_subscription_id: string }>(
      "select commercial_subscription_id from public.onboarding_requests where id = $1",
      [offered.requestId],
    )).rows[0].commercial_subscription_id
    const beforeItems = await db.query(
      "select component_code, quantity from public.commercial_subscription_items where subscription_id = $1 order by component_code",
      [subscriptionId],
    )
    const moved = await command("select_locations", {
      enquiryId: id, create: true, locationName: "Later yard", country: "United Kingdom", locationIds: [], reason,
    }, offered.version)
    expect(moved).toMatchObject({ status: "denied", reason: "frozen" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.locations where location_name = 'Later yard'")).rows[0].n).toBe(0)
    expect(await db.query(
      "select component_code, quantity from public.commercial_subscription_items where subscription_id = $1 order by component_code",
      [subscriptionId],
    )).toMatchObject({ rows: beforeItems.rows })
    expect((await db.query<{ location_name: string }>(
      `select locations.location_name from admin_private.onboarding_request_locations selected
       join public.locations locations on locations.id = selected.location_id
       where selected.onboarding_request_id = $1`,
      [offered.requestId],
    )).rows).toEqual([{ location_name: "Frozen yard" }])
    const declined = await command("decline", { enquiryId: id, reason }, offered.version)
    expect(declined.status).toBe("success")
    expect((await db.query<{ state: string; canceled_at: string | null }>(
      "select state, canceled_at from public.commercial_subscriptions where id = $1",
      [subscriptionId],
    )).rows[0]).toMatchObject({ state: "CANCELED" })
    expect((await db.query<{ canceled_at: string | null }>(
      "select canceled_at from public.commercial_subscriptions where id = $1",
      [subscriptionId],
    )).rows[0].canceled_at).not.toBeNull()
    const later = await enquiry("telloya", "offer-freeze@example.com", "Telloya again", "Telloya for the same shop later.")
    const laterOpen = await command("classify", { enquiryId: later, product: "TELLOYA", reason })
    const laterCustomer = await command("match_customer", { enquiryId: later, customerId: customer, reason }, laterOpen.version)
    const laterBusiness = await command("match_business", {
      enquiryId: later, businessId: (await rpc("admin_commercial_onboarding_v1", [token, id])).request.businessId, membership: "pending", reason,
    }, laterCustomer.version)
    expect(laterBusiness.status).toBe("success")
  })

  it("offers Complete with each component quantity and refuses an incomplete or mismatched plan", async () => {
    await db.exec(`insert into public.customers(full_name, email) values ('Bundle Owner', 'bundle@example.com')`)
    const customer = (await db.query<{ id: string }>("select id from public.customers where email = 'bundle@example.com'")).rows[0].id
    await db.exec(`insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}', 'email', 'bundle@example.com', '${admin}', '${reason}')`)
    const id = await enquiry("complete", "bundle@example.com", "Complete package", "Complete for three shops.")
    const opened = await command("classify", { enquiryId: id, product: "COMPLETE", reason })
    const matched = await command("match_customer", { enquiryId: id, customerId: customer, reason }, opened.version)
    const business = await command("match_business", {
      enquiryId: id, create: true, name: "Bundle Plumbing", website: "", membership: "verified", reason,
    }, matched.version)
    const one = await command("select_locations", {
      enquiryId: id, create: true, locationName: "Bundle one", country: "United Kingdom", locationIds: [], reason,
    }, business.version)
    const bare = crypto.randomUUID()
    await db.query(
      `insert into public.plan_versions(id, product_code, version_number, status, effective_from, billing_cadence, currency, amount_minor, tax_behaviour, terms_ref)
       values ($1, 'COMPLETE', 1, 'DRAFT', now(), 'MONTH', 'GBP', 9900, 'NOT_APPLICABLE', 'terms-complete-empty')`,
      [bare],
    )
    const before = (await db.query<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions")).rows[0].n
    expect(await command("prepare_offer", { enquiryId: id, planVersionId: bare, reason }, one.version)).toMatchObject({ status: "terms_unconfigured" })
    await expect(db.query(
      `update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`,
      [bare, admin],
    )).rejects.toThrow(/Telloya and Guard/)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions")).rows[0].n).toBe(before)
    const plan = crypto.randomUUID()
    await db.query(
      `insert into public.plan_versions(id, product_code, version_number, status, effective_from, billing_cadence, currency, amount_minor, tax_behaviour, terms_ref)
       values ($1, 'COMPLETE', 2, 'DRAFT', now(), 'MONTH', 'GBP', 9900, 'NOT_APPLICABLE', 'terms-complete-v1')`,
      [plan],
    )
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
       values ($1, 'TELLOYA', 3, 'LOCATION'), ($1, 'GUARD', 1, 'LOCATION')`,
      [plan],
    )
    await db.query(
      `update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`,
      [plan, admin],
    )
    const mismatched = await command("prepare_offer", { enquiryId: id, planVersionId: plan, reason }, one.version)
    expect(mismatched).toMatchObject({ status: "terms_unconfigured", reason: "quantities" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions")).rows[0].n).toBe(before)
    const view = await rpc("admin_commercial_onboarding_v1", [token, id])
    expect(view.outstanding.join(" ")).toMatch(/do not match the approved Telloya quantity/)
    const first = (await db.query<{ id: string }>("select id from public.locations where location_name = 'Bundle one'")).rows[0].id
    const second = (await db.query<{ id: string }>(
      "insert into public.locations(business_id, location_name, country) values ($1, 'Bundle two', 'United Kingdom') returning id",
      [view.request.businessId],
    )).rows[0].id
    const third = (await db.query<{ id: string }>(
      "insert into public.locations(business_id, location_name, country) values ($1, 'Bundle three', 'United Kingdom') returning id",
      [view.request.businessId],
    )).rows[0].id
    const located = await command("select_locations", {
      enquiryId: id, locationIds: [first, second, third], reason,
    }, one.version)
    const offered = await command("prepare_offer", { enquiryId: id, planVersionId: plan, reason }, located.version)
    expect(offered.status).toBe("success")
    const subscriptionId = (await db.query<{ commercial_subscription_id: string }>(
      "select commercial_subscription_id from public.onboarding_requests where id = $1",
      [offered.requestId],
    )).rows[0].commercial_subscription_id
    expect((await db.query<{ component_code: string; quantity: number; quantity_limit_snapshot: number }>(
      "select component_code, quantity, quantity_limit_snapshot from public.commercial_subscription_items where subscription_id = $1 order by component_code",
      [subscriptionId],
    )).rows).toEqual([
      { component_code: "GUARD", quantity: 1, quantity_limit_snapshot: 1 },
      { component_code: "TELLOYA", quantity: 3, quantity_limit_snapshot: 3 },
    ])
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.product_entitlements where commercial_subscription_id = $1", [subscriptionId])).rows[0].n).toBe(0)
  })

  it("recognises the marketing product identifiers and still leaves Recovery alone", async () => {
    const telloya = (await db.query<{ id: string }>(
      `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
       values (gen_random_uuid(), md5('market-telloya'), 'phone', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
      [JSON.stringify({
        fullName: "Market Owner",
        email: "market-telloya@example.com",
        phone: "07123456789",
        businessName: "Market Shop",
        country: "United Kingdom",
        product: "telloya",
        subject: "New shop enquiry",
        details: "Please call me back about the shop phone.",
        source: "web",
      })],
    )).rows[0].id
    const telloyaView = await rpc("admin_commercial_onboarding_v1", [token, telloya])
    expect(telloyaView.supported).toBe(true)
    expect(telloyaView.productHint).toBe("TELLOYA")
    const complete = (await db.query<{ id: string }>(
      `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
       values (gen_random_uuid(), md5('market-complete'), 'phone', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
      [JSON.stringify({
        fullName: "Market Owner",
        email: "market-complete@example.com",
        businessName: "Market Shop",
        country: "United Kingdom",
        product_interest: "COMPLETE",
        subject: "New shop enquiry",
        details: "Please call me back about the shop phone.",
        source: "web",
      })],
    )).rows[0].id
    expect((await rpc("admin_commercial_onboarding_v1", [token, complete])).productHint).toBe("COMPLETE")
    const recovery = await enquiry("profile-recovery", "market-recovery@example.com", "Suspended profile", "Please complete the recovery form.")
    expect(await rpc("admin_commercial_onboarding_v1", [token, recovery])).toEqual({ supported: false })
    expect(await command("classify", { enquiryId: recovery, product: "COMPLETE", reason })).toMatchObject({ status: "denied" })
  })
})
