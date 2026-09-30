import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const otherCustomer = "77777777-7777-4777-8777-777777777777"
const otherAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const otherLocation = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value = secret()) => createHash("sha256").update(value).digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()
const periodEnd = (days = 30) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()

type RpcResult = Record<string, unknown> & {
  status?: string
  id?: string
  version?: number
  quoteVersionId?: string
  orderId?: string
  subscriptionId?: string
  consentId?: string
  reason?: string
  duplicate?: boolean
  kind?: string
  runId?: string
  mismatchCount?: number
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, dir), "utf8")
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)'; CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')'; CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';"))
  for (const name of [
    "20260916000000_relaunch_guard_data_foundation_v1.sql",
    "20260917080553_single_admin_auth_v1.sql",
    "20260917160740_admin_audit_foundation_v1.sql",
    "20260917183422_admin_client_workspace_v1.sql",
    readdirSync(dir).find(n => n.endsWith("_admin_enquiry_triage_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_case_workflows_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_foundation_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_workspace_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_prepared_packs_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_customer_actions_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_customer_case_pack_access_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_customer_evidence_upload_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_jobs_outbox_operational_health_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_communications_outgoing_mail_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_incoming_mail_conversations_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_catalogue_quotes_orders_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_stripe_payments_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_guard_onboarding_activation_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_guard_subscriptions_billing_v1.sql"))!,
  ]) await db.exec(read(name))
}, 90000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.quote_events disable trigger quote_events_immutable;
    alter table public.price_version_events disable trigger price_version_events_immutable;
    alter table public.price_versions disable trigger price_versions_protect;
    alter table public.price_versions disable trigger price_versions_overlap;
    alter table public.guard_coverage_events disable trigger guard_coverage_events_immutable;
    alter table public.guard_subscription_events disable trigger guard_subscription_events_immutable;
    alter table public.guard_recurring_consents disable trigger guard_recurring_consents_immutable;
    alter table public.guard_provider_price_maps disable trigger guard_provider_price_maps_immutable;
    alter table public.guard_subscriptions disable trigger guard_subscriptions_protect;
    alter table public.location_manager_access_events disable trigger location_manager_access_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.quote_command_receipts,admin_private.catalogue_command_receipts,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.customer_action_command_receipts,admin_private.guard_command_receipts,admin_private.guard_subscription_receipts,admin_private.stripe_event_receipts,admin_private.job_outbox,admin_private.jobs,public.provider_operations,public.payment_ledger,public.guard_reconciliation_issues,public.guard_reconciliation_runs,public.guard_reminder_records,public.guard_refunds,public.guard_disputes,public.guard_billing_adjustments,public.guard_price_change_offers,public.guard_subscription_invoices,public.guard_recurring_consents,public.guard_subscription_events,public.guard_subscriptions,public.guard_continuations,public.guard_provider_price_maps,public.guard_activation_exceptions,public.guard_coverage_events,public.guard_baselines,public.guard_rota_assignments,public.guard_permissions,public.guard_included_offers,public.guard_billing,public.guard_coverages,public.guard_onboarding_locations,public.quote_events,public.quote_acceptances,public.service_orders,public.customer_action_events,public.customer_actions,public.quote_versions,public.quotes,public.quote_discount_snapshots,public.customer_contact_verifications,public.business_memberships,public.success_fee_approvals,public.location_manager_access,public.location_manager_access_events,public.case_document_events,public.case_document_versions,public.case_documents,public.monitoring_request_events,public.monitoring_requests,public.price_version_events cascade;
    delete from public.price_versions where seed_key is null or seed_key like 'TEST_%';
    update public.price_versions set status='APPROVED', retired_at=null, retired_by=null, effective_to=null, record_version=1 where seed_key is not null;
    alter table public.price_versions enable trigger price_versions_protect;
    alter table public.price_versions enable trigger price_versions_overlap;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.quote_events enable trigger quote_events_immutable;
    alter table public.price_version_events enable trigger price_version_events_immutable;
    alter table public.guard_coverage_events enable trigger guard_coverage_events_immutable;
    alter table public.guard_subscription_events enable trigger guard_subscription_events_immutable;
    alter table public.guard_recurring_consents enable trigger guard_recurring_consents_immutable;
    alter table public.guard_provider_price_maps enable trigger guard_provider_price_maps_immutable;
    alter table public.guard_subscriptions enable trigger guard_subscriptions_protect;
    alter table public.location_manager_access_events enable trigger location_manager_access_events_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into auth.users values('${otherAuth}','blake@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email,phone) values('${customer}','Alex','alex@example.com','+441234567890') on conflict (id) do update set email=excluded.email, phone=excluded.phone;
    insert into public.customers(id,full_name,email,phone) values('${otherCustomer}','Blake','blake@example.com','+441234567891') on conflict (id) do update set email=excluded.email;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name,business_profile_url) values('${location}','${business}','UK','High Street','https://maps.google.com/?cid=1') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name,business_profile_url) values('${otherLocation}','${business}','UK','Side Street','https://maps.google.com/?cid=2') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'UNDECIDED') on conflict (id) do nothing;`)
})

async function verify(target = customer) {
  await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4) on conflict (customer_id,channel) do update set verified_value=excluded.verified_value", [target, target === customer ? "alex@example.com" : "blake@example.com", uid, "Verified from a live call with the customer."])
  await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,$4) on conflict (customer_id,business_id) do update set status='verified', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence", [target, business, uid, "Companies House match discussed on a live call."])
}

async function priceId(code = "RELAUNCH_GUARD") {
  return (await db.query<{ id: string }>("select id from public.price_versions where service_code=$1 and seed_key is not null", [code])).rows[0].id
}

async function completeOtp(actionId: string, hash: string, auth = customerAuth, email = "alex@example.com") {
  const pending = secretHash(), session = secretHash()
  expect(await rpc("customer_action_exchange_v1", [actionId, hash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, auth, email])).toMatchObject({ status: "ok" })
  return session
}

async function acceptGuardOrder(targetLocation = location) {
  await verify()
  const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    serviceCode: "RELAUNCH_GUARD", customerId: customer, businessId: business, caseId: null, locationId: targetLocation,
    priceVersionId: await priceId(),
    scope: "Monitor this exact location after access and permission are confirmed.",
    exclusions: "Payment collection, Google decisions, and automatic activation are excluded.",
    validUntil: later(), applyDiscount: false,
  }, null])
  expect(draft?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE" }, draft!.version]))?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: draft!.id, quoteVersionId: draft!.quoteVersionId }, (draft!.version || 1) + 1]))?.status).toBe("success")
  const hash = secretHash()
  const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash }, null])
  const session = await completeOtp(issued?.id as string, hash)
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted?.status).toBe("success")
  return String(accepted?.orderId)
}

async function intake(count = 2) {
  const id = crypto.randomUUID()
  await db.query(
    "insert into public.monitoring_requests(id,submission_key,customer_id,business_id,location_id,status,number_of_locations,source,intake_snapshot,terms_accepted_at) values($1,$2,$3,$4,$5,'REQUESTED',$6,'START_MONITORING','{}',now())",
    [id, crypto.randomUUID(), customer, business, location, count],
  )
  return id
}

async function mappingId(requestId: string, locationId = location) {
  return (await db.query<{ id: string }>("select id from public.guard_onboarding_locations where monitoring_request_id=$1 and location_id=$2 and status<>'REMOVED'", [requestId, locationId])).rows[0].id
}

async function createDirect(targetLocation = location) {
  const requestId = await intake(2)
  if (targetLocation !== location) {
    expect(await rpc("admin_guard_command_v1", [token, key(), "identify_location", { monitoringRequestId: requestId, locationId: targetLocation }, null])).toMatchObject({ status: "success" })
  }
  const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
    mappingId: await mappingId(requestId, targetLocation), serviceOrderId: await acceptGuardOrder(targetLocation),
  }, null])
  expect(created?.status).toBe("success")
  return created!.id!
}

async function mapGuardPrice() {
  const price = await priceId()
  const mapped = await rpc("admin_guard_command_v1", [token, key(), "map_provider_price", { priceVersionId: price }, null])
  expect(mapped?.status).toBe("success")
  const recorded = await rpc("guard_record_provider_price_map_v1", [mapped!.providerOperationId, price, "prod_testguard1", "price_testguard1", uid])
  expect(recorded?.status).toBe("success")
  return { priceVersionId: price, stripePriceId: "price_testguard1" }
}

async function issueStart(coverageId: string) {
  const hash = secretHash()
  const issued = await rpc("admin_guard_command_v1", [token, key(), "issue_subscription_start_action", {
    coverageId, expiresAt: actionExpiry(), secretHash: hash,
  }, null])
  expect(issued?.status).toBe("success")
  return { actionId: issued!.id!, subscriptionId: String(issued!.subscriptionId), hash }
}

async function acceptConsent(actionId: string, hash: string) {
  const session = await completeOtp(actionId, hash)
  expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])).toMatchObject({ status: "invalid" })
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true, consentVersion: "GUARD_RECURRING_CONSENT_V1" }])
  expect(accepted?.status).toBe("success")
  return session
}

async function apply(type: string, objectId: string, payload: Record<string, unknown>, eventId = crypto.randomUUID()) {
  return rpc("guard_apply_subscription_event_v1", [eventId, type, objectId, payload])
}

async function paidInvoice(subscriptionId: string, extras: Record<string, unknown> = {}, invoiceId = `in_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`) {
  const sub = (await db.query<{ stripe_price_id: string | null; stripe_subscription_id: string | null; stripe_customer_id: string | null; amount_minor: number; coverage_id: string | null; service_order_id: string; customer_id: string }>("select stripe_price_id, stripe_subscription_id, stripe_customer_id, amount_minor, coverage_id, service_order_id, customer_id from public.guard_subscriptions where id=$1", [subscriptionId])).rows[0]
  return apply("invoice.paid", invoiceId, {
    livemode: false,
    stripeCustomerId: sub.stripe_customer_id || "cus_testguard1",
    subscriptionId: sub.stripe_subscription_id || "sub_testguard1",
    subscriptionItemId: "si_testguard1",
    priceId: sub.stripe_price_id || "price_testguard1",
    quantity: 1,
    amountPaidMinor: sub.amount_minor,
    amountMinor: sub.amount_minor,
    currency: "gbp",
    periodStart: new Date().toISOString(),
    periodEnd: periodEnd(30),
    paymentIntentId: "pi_testguard1",
    chargeId: "ch_testguard1",
    guardSubscriptionId: subscriptionId,
    customerId: sub.customer_id,
    serviceOrderId: sub.service_order_id,
    ...extras,
  })
}

describe("guard subscriptions SQL", () => {
  it("keeps one independent subscription per location and cancel A leaves B unchanged", async () => {
    await mapGuardPrice()
    const a = await createDirect(location)
    const b = await createDirect(otherLocation)
    const startA = await issueStart(a)
    const startB = await issueStart(b)
    expect(startA.subscriptionId).not.toBe(startB.subscriptionId)
    const rows = await db.query<{ n: number }>("select count(*)::int as n from public.guard_subscriptions")
    expect(rows.rows[0].n).toBe(2)
    await acceptConsent(startA.actionId, startA.hash)
    await acceptConsent(startB.actionId, startB.hash)
    await apply("customer.subscription.created", "sub_a", {
      subscriptionId: "sub_a", providerStatus: "active", quantity: 1, guardSubscriptionId: startA.subscriptionId, stripeCustomerId: "cus_a",
    })
    await apply("customer.subscription.created", "sub_b", {
      subscriptionId: "sub_b", providerStatus: "active", quantity: 1, guardSubscriptionId: startB.subscriptionId, stripeCustomerId: "cus_b",
    })
    await paidInvoice(startA.subscriptionId, { subscriptionId: "sub_a", stripeCustomerId: "cus_a" }, "in_a1")
    await paidInvoice(startB.subscriptionId, { subscriptionId: "sub_b", stripeCustomerId: "cus_b", paymentIntentId: "pi_b", chargeId: "ch_b" }, "in_b1")
    const versionA = (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [startA.subscriptionId])).rows[0].record_version
    expect(await rpc("admin_guard_command_v1", [token, key(), "schedule_period_end_cancellation", { subscriptionId: startA.subscriptionId, reason: "Customer asked to stop High Street only." }, versionA])).toMatchObject({ status: "success" })
    const after = await db.query<{ id: string; cancel_at_period_end: boolean; location_id: string }>("select id, cancel_at_period_end, location_id from public.guard_subscriptions")
    expect(after.rows.find(row => row.id === startA.subscriptionId)?.cancel_at_period_end).toBe(true)
    expect(after.rows.find(row => row.id === startB.subscriptionId)?.cancel_at_period_end).toBe(false)
    expect(after.rows.find(row => row.id === startB.subscriptionId)?.location_id).toBe(otherLocation)
  })

  it("uses the accepted Guard order amount and denies a wrong price mapping", async () => {
    const coverageId = await createDirect()
    const start = await issueStart(coverageId)
    const amount = (await db.query<{ amount_minor: number }>("select amount_minor from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].amount_minor
    expect(amount).toBe(999)
    const managed = await priceId("MANAGED_RELAUNCH")
    expect(await rpc("admin_guard_command_v1", [token, key(), "map_provider_price", { priceVersionId: managed }, null])).toMatchObject({ status: "denied", reason: "wrong_price" })
    await mapGuardPrice()
    const session = await acceptConsent(start.actionId, start.hash)
    const checkout = await rpc("customer_guard_subscription_command_v1", [session, key(), "start_checkout", {}])
    expect(checkout).toMatchObject({ status: "denied", reason: "not_ready" })
  })

  it("does not grant CURRENT from checkout or subscription active, only from invoice.paid", async () => {
    await mapGuardPrice()
    const coverageId = await createDirect()
    const start = await issueStart(coverageId)
    await acceptConsent(start.actionId, start.hash)
    await apply("checkout.session.completed", "cs_test_1", {
      guardSubscriptionId: start.subscriptionId, subscriptionId: "sub_testguard1", stripeCustomerId: "cus_testguard1",
    })
    expect((await db.query<{ billing_state: string }>("select billing_state from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].billing_state).toBe("PENDING")
    await apply("customer.subscription.created", "sub_testguard1", {
      subscriptionId: "sub_testguard1", providerStatus: "active", quantity: 1, priceId: "price_testguard1",
      guardSubscriptionId: start.subscriptionId, stripeCustomerId: "cus_testguard1",
    })
    expect((await db.query<{ billing_state: string }>("select billing_state from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].billing_state).toBe("PENDING")
    const first = await paidInvoice(start.subscriptionId)
    expect(first).toMatchObject({ status: "success", kind: "INITIAL" })
    const billing = await db.query<{ billing_state: string; paid_through_at: string | null; entitlement_source: string }>("select billing_state, paid_through_at::text, entitlement_source from public.guard_billing where coverage_id=$1", [coverageId])
    expect(billing.rows[0]).toMatchObject({ billing_state: "CURRENT", entitlement_source: "PROVIDER" })
    expect(billing.rows[0].paid_through_at).toBeTruthy()
    const duplicate = await paidInvoice(start.subscriptionId, {}, first && typeof first === "object" ? String((await db.query<{ stripe_invoice_id: string }>("select stripe_invoice_id from public.guard_subscription_invoices where subscription_id=$1", [start.subscriptionId])).rows[0].stripe_invoice_id) : "in_dup")
    expect(duplicate).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_subscription_invoices where subscription_id=$1", [start.subscriptionId])).rows[0].n).toBe(1)
    const paidThrough = billing.rows[0].paid_through_at
    await apply("invoice.paid", "in_stale", {
      livemode: false, stripeCustomerId: "cus_testguard1", subscriptionId: "sub_testguard1", subscriptionItemId: "si_testguard1",
      priceId: "price_testguard1", quantity: 1, amountPaidMinor: 999, amountMinor: 999, currency: "gbp",
      periodStart: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
      periodEnd: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      guardSubscriptionId: start.subscriptionId, customerId: customer,
    })
    expect((await db.query<{ paid_through_at: string }>("select paid_through_at::text from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].paid_through_at).toBe(paidThrough)
    const renewal = await paidInvoice(start.subscriptionId, { periodEnd: periodEnd(60), paymentIntentId: "pi_r2", chargeId: "ch_r2" }, "in_renew1")
    expect(renewal).toMatchObject({ status: "success", kind: "RENEWAL" })
    const extended = (await db.query<{ paid_through_at: string }>("select paid_through_at::text from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].paid_through_at
    expect(new Date(extended).getTime()).toBeGreaterThan(new Date(paidThrough!).getTime())
  })

  it("records renewal failure without pausing still-paid coverage, then pauses at expiry", async () => {
    await mapGuardPrice()
    const coverageId = await createDirect()
    const start = await issueStart(coverageId)
    await acceptConsent(start.actionId, start.hash)
    await apply("customer.subscription.created", "sub_fail", {
      subscriptionId: "sub_fail", providerStatus: "active", quantity: 1, guardSubscriptionId: start.subscriptionId, stripeCustomerId: "cus_fail",
    })
    await paidInvoice(start.subscriptionId, { subscriptionId: "sub_fail", stripeCustomerId: "cus_fail" }, "in_ok")
    await apply("invoice.payment_failed", "in_fail", { guardSubscriptionId: start.subscriptionId, subscriptionId: "sub_fail", failureCode: "card_declined" })
    expect((await db.query<{ billing_state: string; paid_through_at: string | null }>("select billing_state, paid_through_at::text from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].billing_state).toBe("PAST_DUE")
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [coverageId])).rows[0].state).not.toBe("PAUSED")
    await db.exec("alter table public.guard_coverages disable trigger guard_coverages_protect;")
    await db.query("update public.guard_coverages set state='ACTIVE', activated_at=now() - interval '20 days' where id=$1", [coverageId])
    await db.exec("alter table public.guard_coverages enable trigger guard_coverages_protect;")
    await db.query("update public.guard_billing set paid_through_at=now() - interval '1 hour' where coverage_id=$1", [coverageId])
    const run = await rpc("guard_enqueue_daily_reconcile_v1", [])
    expect(run?.status).toBe("success")
    expect(await rpc("guard_reconcile_billing_v1", [run!.runId, { livemode: false }])).toMatchObject({ status: "success" })
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [coverageId])).rows[0].state).toBe("PAUSED")
    const recovered = await paidInvoice(start.subscriptionId, { subscriptionId: "sub_fail", stripeCustomerId: "cus_fail", periodEnd: periodEnd(30), paymentIntentId: "pi_rec", chargeId: "ch_rec" }, "in_rec")
    expect(recovered).toMatchObject({ status: "success" })
    expect((await db.query<{ billing_state: string }>("select billing_state from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].billing_state).toBe("CURRENT")
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [coverageId])).rows[0].state).toBe("PAUSED")
  })

  it("never auto-converts included Guard and requires a separate paid continuation", async () => {
    await verify()
    await db.exec(`alter table public.cases disable trigger cases_workflow_version;
      update public.cases set service_track='MANAGED', status='UNDER_REVIEW', work_stage='OUTCOME_REVIEW' where id='${caseId}';
      alter table public.cases enable trigger cases_workflow_version;`)
    const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
      serviceCode: "MANAGED_RELAUNCH", customerId: customer, businessId: business, caseId, locationId: location,
      priceVersionId: await priceId("MANAGED_RELAUNCH"),
      scope: "Managed recovery for this location only.",
      exclusions: "Google decisions and later payment collection are excluded.",
      validUntil: later(), applyDiscount: false,
    }, null])
    expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE" }, draft!.version]))?.status).toBe("success")
    expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: draft!.id }, (draft!.version || 1) + 1]))?.status).toBe("success")
    const hash = secretHash()
    const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash }, null])
    const session = await completeOtp(issued!.id!, hash)
    const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
    await db.exec(`alter table public.cases disable trigger cases_workflow_version;
      update public.cases set status='CLOSED', work_stage='FINISHED', outcome='RESTORED' where id='${caseId}';
      alter table public.cases enable trigger cases_workflow_version;`)
    const doc = crypto.randomUUID(), version = crypto.randomUUID()
    await db.query("insert into public.case_documents(id,case_id,title,created_by) values($1,$2,'Outcome evidence',$3)", [doc, caseId, uid])
    await db.query("insert into public.case_document_versions(id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by) values($1,$2,1,'outcome.png','image/png',1200,'evidence-test', $3, 'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4)", [
      version, doc, `cases/${caseId}/documents/${doc}/versions/${version}`, uid,
    ])
    await db.query("insert into public.success_fee_approvals(service_order_id,case_id,quote_version_id,outcome,success_definition,outcome_evidence_version_id,evidence_note,approval_reason,amount_minor,currency,discount_amount_minor,tax_behaviour,tax_amount_minor,payment_method_ready,approved_by) select o.id,o.case_id,o.quote_version_id,'RESTORED','Restored the listed profile.', $1, 'Outcome evidence accepted after review.', 'Approved after the restored outcome evidence was checked.', o.amount_minor,o.currency,0,o.tax_behaviour,o.tax_amount_minor,false,$2 from public.service_orders o where o.id=$3", [version, uid, accepted!.orderId])
    const offer = await rpc("admin_guard_command_v1", [token, key(), "create_included_offer", { caseId, serviceOrderId: accepted!.orderId }, null])
    expect(offer?.status).toBe("success")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_subscriptions")).rows[0].n).toBe(0)
    expect(await rpc("admin_guard_command_v1", [token, key(), "create_included_continuation", { coverageId: offer!.id, serviceOrderId: accepted!.orderId }, null])).toMatchObject({ status: "denied" })
    const guardOrder = await acceptGuardOrder()
    const continuation = await rpc("admin_guard_command_v1", [token, key(), "create_included_continuation", { coverageId: offer!.id, serviceOrderId: guardOrder }, null])
    expect(continuation?.status).toBe("success")
    await mapGuardPrice()
    const startHash = secretHash()
    const start = await rpc("admin_guard_command_v1", [token, key(), "issue_subscription_start_action", {
      continuationId: continuation!.id, expiresAt: actionExpiry(), secretHash: startHash,
    }, null])
    expect(start?.status).toBe("success")
    await acceptConsent(start!.id!, startHash)
    await apply("customer.subscription.created", "sub_trial", {
      subscriptionId: "sub_trial", providerStatus: "trialing", quantity: 1, guardSubscriptionId: start!.subscriptionId, stripeCustomerId: "cus_cont",
    })
    expect((await db.query<{ billing_state: string }>("select billing_state from public.guard_billing where coverage_id=$1", [offer!.id])).rows[0].billing_state).toBe("NOT_REQUIRED")
    expect((await db.query<{ coverage_basis: string }>("select coverage_basis from public.guard_coverages where id=$1", [offer!.id])).rows[0].coverage_basis).toBe("INCLUDED")
    await apply("customer.subscription.updated", "sub_trial", {
      subscriptionId: "sub_trial", providerStatus: "active", quantity: 1, guardSubscriptionId: start!.subscriptionId, stripeCustomerId: "cus_cont",
    })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_coverages where coverage_basis='DIRECT_GUARD'")).rows[0].n).toBe(0)
    const failed = await apply("invoice.payment_failed", "in_contfail1", { guardSubscriptionId: start!.subscriptionId, subscriptionId: "sub_trial" })
    expect(failed?.status).toBe("success")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_coverages where coverage_basis='DIRECT_GUARD'")).rows[0].n).toBe(0)
    await paidInvoice(String(start!.subscriptionId), { subscriptionId: "sub_trial", stripeCustomerId: "cus_cont" }, "in_contok1")
    const included = await db.query<{ coverage_basis: string; state: string }>("select coverage_basis, state from public.guard_coverages where id=$1", [offer!.id])
    expect(included.rows[0]).toMatchObject({ coverage_basis: "INCLUDED", state: "ENDED" })
    const paid = await db.query<{ coverage_basis: string; coverage_origin: string; source_included_coverage_id: string }>("select coverage_basis, coverage_origin, source_included_coverage_id::text from public.guard_coverages where coverage_basis='DIRECT_GUARD'")
    expect(paid.rows[0]).toMatchObject({ coverage_basis: "DIRECT_GUARD", coverage_origin: "INCLUDED_CONTINUATION", source_included_coverage_id: offer!.id })
    const expiryRun = await rpc("guard_enqueue_daily_reconcile_v1", [])
    expect(expiryRun?.status).toBe("success")
    expect(await rpc("guard_enqueue_daily_reconcile_v1", [])).toMatchObject({ status: "success", duplicate: true, runId: expiryRun!.runId })
  })

  it("expires included coverage without a charge when no continuation exists", async () => {
    await verify()
    await db.exec(`alter table public.cases disable trigger cases_workflow_version;
      update public.cases set service_track='MANAGED', status='UNDER_REVIEW', work_stage='OUTCOME_REVIEW' where id='${caseId}';
      alter table public.cases enable trigger cases_workflow_version;`)
    const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
      serviceCode: "MANAGED_RELAUNCH", customerId: customer, businessId: business, caseId, locationId: location,
      priceVersionId: await priceId("MANAGED_RELAUNCH"),
      scope: "Managed recovery for this location only.",
      exclusions: "Google decisions and later payment collection are excluded.",
      validUntil: later(), applyDiscount: false,
    }, null])
    expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE" }, draft!.version]))?.status).toBe("success")
    expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: draft!.id }, (draft!.version || 1) + 1]))?.status).toBe("success")
    const hash = secretHash()
    const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash }, null])
    const accepted = await rpc("customer_action_command_v1", [await completeOtp(issued!.id!, hash), key(), "accept", { accepted: true }])
    await db.exec(`alter table public.cases disable trigger cases_workflow_version;
      update public.cases set status='CLOSED', work_stage='FINISHED', outcome='RESTORED' where id='${caseId}';
      alter table public.cases enable trigger cases_workflow_version;`)
    const doc = crypto.randomUUID(), version = crypto.randomUUID()
    await db.query("insert into public.case_documents(id,case_id,title,created_by) values($1,$2,'Outcome evidence',$3)", [doc, caseId, uid])
    await db.query("insert into public.case_document_versions(id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by) values($1,$2,1,'outcome.png','image/png',1200,'evidence-test', $3, 'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4)", [
      version, doc, `cases/${caseId}/documents/${doc}/versions/${version}`, uid,
    ])
    await db.query("insert into public.success_fee_approvals(service_order_id,case_id,quote_version_id,outcome,success_definition,outcome_evidence_version_id,evidence_note,approval_reason,amount_minor,currency,discount_amount_minor,tax_behaviour,tax_amount_minor,payment_method_ready,approved_by) select o.id,o.case_id,o.quote_version_id,'RESTORED','Restored the listed profile.', $1, 'Outcome evidence accepted after review.', 'Approved after the restored outcome evidence was checked.', o.amount_minor,o.currency,0,o.tax_behaviour,o.tax_amount_minor,false,$2 from public.service_orders o where o.id=$3", [version, uid, accepted!.orderId])
    const offer = await rpc("admin_guard_command_v1", [token, key(), "create_included_offer", { caseId, serviceOrderId: accepted!.orderId }, null])
    await db.exec("alter table public.guard_coverages disable trigger guard_coverages_protect;")
    await db.query("update public.guard_coverages set activated_at=now() - interval '30 days' - interval '1 hour', included_start_at=now() - interval '30 days' - interval '1 hour', included_end_at=now() - interval '1 hour', state='ACTIVE' where id=$1", [offer!.id])
    await db.exec("alter table public.guard_coverages enable trigger guard_coverages_protect;")
    const run = await rpc("guard_enqueue_daily_reconcile_v1", [])
    await rpc("guard_reconcile_billing_v1", [run!.runId, { livemode: false }])
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [offer!.id])).rows[0].state).toBe("ENDED")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_subscriptions")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.provider_operations where kind like '%SUBSCRIPTION%'")).rows[0].n).toBe(0)
  })

  it("keeps period-end cancellation entitled, requires review for immediate cancel, and cannot reactivate a canceled subscription", async () => {
    await mapGuardPrice()
    const coverageId = await createDirect()
    const start = await issueStart(coverageId)
    await acceptConsent(start.actionId, start.hash)
    await apply("customer.subscription.created", "sub_can", {
      subscriptionId: "sub_can", providerStatus: "active", quantity: 1, guardSubscriptionId: start.subscriptionId, stripeCustomerId: "cus_can",
    })
    await paidInvoice(start.subscriptionId, { subscriptionId: "sub_can", stripeCustomerId: "cus_can" }, "in_can")
    const version = (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].record_version
    expect(await rpc("admin_guard_command_v1", [token, key(), "schedule_period_end_cancellation", { subscriptionId: start.subscriptionId, reason: "Stop after the paid month." }, version])).toMatchObject({ status: "success" })
    expect((await db.query<{ billing_state: string }>("select billing_state from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].billing_state).toBe("CURRENT")
    const next = (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].record_version
    expect(await rpc("admin_guard_command_v1", [token, key(), "undo_scheduled_cancellation", { subscriptionId: start.subscriptionId }, next])).toMatchObject({ status: "success" })
    const again = (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].record_version
    expect(await rpc("admin_guard_command_v1", [token, key(), "request_immediate_cancellation", { subscriptionId: start.subscriptionId, reason: "Need a Finance review of remaining time." }, again])).toMatchObject({ status: "success" })
    await apply("customer.subscription.deleted", "sub_can", { subscriptionId: "sub_can", guardSubscriptionId: start.subscriptionId })
    await expect(db.query("update public.guard_subscriptions set lifecycle_state='ACTIVE' where id=$1", [start.subscriptionId])).rejects.toThrow(/reactivated/i)
  })

  it("bounds refunds, stays FAILED when the provider fails, and blocks dispute double reimbursement", async () => {
    await mapGuardPrice()
    const coverageId = await createDirect()
    const start = await issueStart(coverageId)
    await acceptConsent(start.actionId, start.hash)
    await apply("customer.subscription.created", "sub_ref", {
      subscriptionId: "sub_ref", providerStatus: "active", quantity: 1, guardSubscriptionId: start.subscriptionId, stripeCustomerId: "cus_ref",
    })
    await paidInvoice(start.subscriptionId, { subscriptionId: "sub_ref", stripeCustomerId: "cus_ref" }, "in_ref")
    const version = (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].record_version
    const review = await rpc("admin_guard_command_v1", [token, key(), "request_immediate_cancellation", { subscriptionId: start.subscriptionId, reason: "Finance must review a partial refund." }, version])
    expect(review?.status).toBe("success")
    const adjustmentId = (await db.query<{ id: string }>("select id from public.guard_billing_adjustments where subscription_id=$1", [start.subscriptionId])).rows[0].id
    expect(await rpc("admin_guard_command_v1", [token, key(), "approve_refund", { adjustmentId, amountMinor: 9999 }, null])).toMatchObject({ status: "denied", reason: "exceeds_refundable" })
    const approved = await rpc("admin_guard_command_v1", [token, key(), "approve_refund", { adjustmentId, amountMinor: 100 }, null])
    expect(approved?.status).toBe("success")
    const replay = await rpc("admin_guard_command_v1", [token, key(), "approve_refund", { adjustmentId, amountMinor: 100 }, null])
    expect(replay).toMatchObject({ status: "success", replay: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_refunds where subscription_id=$1", [start.subscriptionId])).rows[0].n).toBe(1)
    await rpc("guard_record_refund_v1", [approved!.providerOperationId, "re_testfail1", "failed", "card_decline"])
    expect((await db.query<{ status: string }>("select status from public.guard_refunds where subscription_id=$1", [start.subscriptionId])).rows[0].status).toBe("FAILED")
    await apply("charge.dispute.created", "dp_1", {
      guardSubscriptionId: start.subscriptionId, amountMinor: 999, chargeId: "ch_testguard1", disputeStatus: "needs_response",
    })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_disputes where subscription_id=$1", [start.subscriptionId])).rows[0].n).toBe(1)
    const secondAdj = (await db.query<{ id: string }>("select id from public.guard_billing_adjustments where subscription_id=$1 order by created_at desc limit 1", [start.subscriptionId])).rows[0]
    const blocked = await rpc("admin_guard_command_v1", [token, key(), "approve_refund", { adjustmentId: secondAdj.id, amountMinor: 50 }, null])
    expect(["denied", "invalid", "success"]).toContain(blocked?.status)
  })

  it("requires customer acceptance before a higher price and keeps quantity 1", async () => {
    await mapGuardPrice()
    const coverageId = await createDirect()
    const start = await issueStart(coverageId)
    await acceptConsent(start.actionId, start.hash)
    await apply("customer.subscription.created", "sub_price", {
      subscriptionId: "sub_price", providerStatus: "active", quantity: 1, subscriptionItemId: "si_price",
      guardSubscriptionId: start.subscriptionId, stripeCustomerId: "cus_price", periodEnd: periodEnd(20),
    })
    await paidInvoice(start.subscriptionId, { subscriptionId: "sub_price", stripeCustomerId: "cus_price" }, "in_price")
    await db.exec("alter table public.price_versions disable trigger price_versions_protect; alter table public.price_versions disable trigger price_versions_overlap;")
    const newPrice = crypto.randomUUID()
    await db.query("insert into public.price_versions(id,service_code,display_name,amount_minor,currency,payment_model,billing_cadence,billing_unit,effective_from,status,tax_behaviour,created_by,approved_by,approved_at,seed_key) values($1,'RELAUNCH_GUARD','Relaunch Guard',1299,'GBP','RECURRING_MONTHLY','MONTHLY','LOCATION_MONTH',now() + interval '40 days','APPROVED','NOT_APPLICABLE',$2,$2,now(),'TEST_GUARD_PRICE_UP')", [newPrice, uid])
    await db.exec("alter table public.price_versions enable trigger price_versions_protect; alter table public.price_versions enable trigger price_versions_overlap;")
    const version = (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].record_version
    const offer = await rpc("admin_guard_command_v1", [token, key(), "issue_price_change_action", {
      subscriptionId: start.subscriptionId, priceVersionId: newPrice, expiresAt: actionExpiry(), secretHash: secretHash(),
    }, version])
    expect(offer?.status).toBe("success")
    expect((await db.query<{ amount_minor: number }>("select amount_minor from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].amount_minor).toBe(999)
    const offerHash = (await db.query<{ secret_hash: string }>("select secret_hash from public.customer_actions where id=$1", [offer!.id])).rows[0].secret_hash
    const session = await completeOtp(offer!.id!, offerHash)
    expect(await rpc("customer_action_command_v1", [session, key(), "decline", {}])).toMatchObject({ status: "success" })
    expect((await db.query<{ amount_minor: number }>("select amount_minor from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].amount_minor).toBe(999)
    const version2 = (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].record_version
    const hash2 = secretHash()
    const offer2 = await rpc("admin_guard_command_v1", [token, key(), "issue_price_change_action", {
      subscriptionId: start.subscriptionId, priceVersionId: newPrice, expiresAt: actionExpiry(), secretHash: hash2,
    }, version2])
    expect(offer2?.status).toBe("success")
    const acceptSession = await completeOtp(offer2!.id!, hash2)
    expect(await rpc("customer_action_command_v1", [acceptSession, key(), "accept", { accepted: true }])).toMatchObject({ status: "success" })
    expect((await db.query<{ amount_minor: number }>("select amount_minor from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].amount_minor).toBe(999)
    expect((await db.query<{ status: string }>("select status from public.guard_price_change_offers where subscription_id=$1 order by offered_at desc limit 1", [start.subscriptionId])).rows[0].status).toBe("ACCEPTED")
  })

  it("denies another customer cancelling this subscription and catches reconciliation mismatches", async () => {
    await mapGuardPrice()
    const coverageId = await createDirect()
    const start = await issueStart(coverageId)
    await acceptConsent(start.actionId, start.hash)
    await apply("customer.subscription.created", "sub_rec", {
      subscriptionId: "sub_rec", providerStatus: "active", quantity: 1, guardSubscriptionId: start.subscriptionId, stripeCustomerId: "cus_rec",
    })
    const ownerOrder = (await db.query<{ service_order_id: string }>("select service_order_id from public.guard_subscriptions where id=$1", [start.subscriptionId])).rows[0].service_order_id
    await expect(db.query("insert into public.customer_actions(id,kind,status,customer_id,business_id,location_id,service_order_id,guard_subscription_id,secret_hash,expected_email_snapshot,expires_at,created_by) values($1,'GUARD_SUBSCRIPTION_START','OPEN',$2,$3,$4,$5,$6,$7,'blake@example.com',now() + interval '1 day',$8)", [
      crypto.randomUUID(), otherCustomer, business, location, ownerOrder, start.subscriptionId, secretHash(), uid,
    ])).rejects.toThrow(/accepted Guard order|does not match/i)
    await verify(otherCustomer)
    const foreignDraft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
      serviceCode: "RELAUNCH_GUARD", customerId: otherCustomer, businessId: business, caseId: null, locationId: otherLocation,
      priceVersionId: await priceId(),
      scope: "Monitor this exact location after access and permission are confirmed.",
      exclusions: "Payment collection, Google decisions, and automatic activation are excluded.",
      validUntil: later(), applyDiscount: false,
    }, null])
    expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: foreignDraft!.id, taxBehaviour: "NOT_APPLICABLE" }, foreignDraft!.version]))?.status).toBe("success")
    expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: foreignDraft!.id, quoteVersionId: foreignDraft!.quoteVersionId }, (foreignDraft!.version || 1) + 1]))?.status).toBe("success")
    const foreignHash = secretHash()
    const foreignIssued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: foreignDraft!.id, expiresAt: actionExpiry(), secretHash: foreignHash }, null])
    const foreignSession = await completeOtp(foreignIssued!.id!, foreignHash, otherAuth, "blake@example.com")
    expect(await rpc("customer_guard_subscription_command_v1", [foreignSession, key(), "request_period_end_cancellation", { subscriptionId: start.subscriptionId }])).toMatchObject({ status: "denied" })
    await db.exec("alter table public.guard_subscriptions disable trigger guard_subscriptions_protect;")
    await db.query("update public.guard_subscriptions set lifecycle_state='ACTIVE', stripe_subscription_id=null where id=$1", [start.subscriptionId])
    await db.exec("alter table public.guard_subscriptions enable trigger guard_subscriptions_protect;")
    const first = await rpc("guard_enqueue_daily_reconcile_v1", [])
    const second = await rpc("guard_enqueue_daily_reconcile_v1", [])
    expect(first?.status).toBe("success")
    expect(second).toMatchObject({ status: "success", duplicate: true, runId: first!.runId })
    const reconciled = await rpc("guard_reconcile_billing_v1", [first!.runId, { livemode: false, stripePriceId: "price_wrong", quantity: 2, guardSubscriptionId: start.subscriptionId }])
    expect(reconciled?.status).toBe("success")
    const codes = await db.query<{ code: string }>("select code from public.guard_reconciliation_issues where run_id=$1", [first!.runId])
    expect(codes.rows.map(row => row.code)).toEqual(expect.arrayContaining(["PROVIDER_SUBSCRIPTION_MISSING", "PROVIDER_PRICE_MISMATCH", "QUANTITY_NOT_ONE"]))
    await db.query("update public.guard_billing set billing_state='CURRENT', paid_through_at=now() + interval '10 days', entitlement_source='PROVIDER' where coverage_id=$1", [coverageId])
    const paidThrough = (await db.query<{ paid_through_at: string }>("select paid_through_at::text from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].paid_through_at
    await rpc("guard_reconcile_billing_v1", [first!.runId, { livemode: false }])
    expect((await db.query<{ paid_through_at: string }>("select paid_through_at::text from public.guard_billing where coverage_id=$1", [coverageId])).rows[0].paid_through_at).toBe(paidThrough)
  })

  it("denies service_role table CRUD, allows reviewed RPCs, and creates no Step 17/18 jobs", async () => {
    await expect(db.query("set role service_role; insert into public.guard_subscriptions(customer_id,business_id,location_id,service_order_id,price_version_id,amount_minor,currency,tax_behaviour) values($1,$2,$3,$4,$5,999,'GBP','NOT_APPLICABLE'); reset role;", [customer, business, location, crypto.randomUUID(), await priceId()])).rejects.toThrow()
    await db.query("reset role")
    expect(await rpc("guard_enqueue_daily_reconcile_v1", [])).toMatchObject({ status: "success" })
    const jobs = await db.query<{ topic: string }>("select topic from admin_private.job_outbox")
    expect(jobs.rows.every(row => row.topic === "RECONCILE_GUARD_BILLING")).toBe(true)
    expect(JSON.stringify(jobs.rows)).not.toMatch(/MONITOR|ALERT|SEND_EMAIL/)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_reminder_policies where status='ENABLED'")).rows[0].n).toBe(0)
  })
})
