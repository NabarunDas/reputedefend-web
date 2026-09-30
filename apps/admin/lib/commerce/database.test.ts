import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"
import { catalogueSeed } from "../../../../lib/catalogue-seed"
import { GUARD_MANAGED_DISCOUNT_BPS, formatGbp, quoteAmounts } from "../../../../lib/money"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const otherCustomer = "77777777-7777-4777-8777-777777777777"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const otherAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const otherLocation = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const caseId = "55555555-5555-4555-8555-555555555555"
const reviewCase = "99999999-9999-4999-8999-999999999999"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value = secret()) => createHash("sha256").update(value).digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()
const past = () => new Date(Date.now() - 60 * 1000).toISOString()

type RpcResult = {
  status?: string
  id?: string
  version?: number
  quoteVersionId?: string
  publicRef?: string
  actionStatus?: string
  acceptanceId?: string
  orderId?: string
  orderRef?: string
  orderState?: string
  paymentCreated?: boolean
  invoiceCreated?: boolean
  monitoringActivated?: boolean
  expiresAt?: string
  result?: string
  reasonCode?: string
  prices?: Array<{ serviceCode: string; amountMinor: number; currency: string; paymentModel: string; taxBehaviour: string; status: string; seedKey: string | null }>
  quotes?: Array<{ id: string; status: string; currentVersion: { totalAmountMinor: number; taxBehaviour: string } }>
  orders?: Array<{ id: string; state: string; amountMinor: number }>
  quote?: { versionId: string; totalAmountMinor: number; taxBehaviour: string; serviceCode: string }
  kind?: string
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
  ]) await db.exec(read(name))
}, 45000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    alter table public.quote_events disable trigger quote_events_immutable;
    alter table public.price_version_events disable trigger price_version_events_immutable;
    alter table public.price_versions disable trigger price_versions_protect;
    alter table public.price_versions disable trigger price_versions_overlap;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.quote_command_receipts,admin_private.catalogue_command_receipts,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.customer_action_command_receipts,public.quote_events,public.quote_acceptances,public.service_orders,public.customer_action_events,public.customer_actions,public.quote_versions,public.quotes,public.quote_discount_snapshots,public.customer_contact_verifications,public.business_memberships,public.case_tasks,public.case_work_events,admin_private.case_command_receipts,public.monitoring_request_events,public.monitoring_requests,public.price_version_events cascade;
    delete from public.price_versions where seed_key is null;
    update public.price_versions set status='APPROVED', retired_at=null, retired_by=null, effective_to=null, record_version=1 where seed_key is not null;
    insert into public.price_version_events(price_version_id, actor_id, event, details)
      select id, created_by, 'PRICE_APPROVED', jsonb_build_object('seed', true, 'reset', true)
      from public.price_versions where seed_key is not null;
    alter table public.price_versions enable trigger price_versions_protect;
    alter table public.price_versions enable trigger price_versions_overlap;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    alter table public.quote_events enable trigger quote_events_immutable;
    alter table public.price_version_events enable trigger price_version_events_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into auth.users values('${otherAuth}','other@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com') on conflict (id) do update set email=excluded.email;
    insert into public.customers(id,full_name,email) values('${otherCustomer}','Other','other@example.com') on conflict (id) do update set email=excluded.email;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name) values('${location}','${business}','UK','High Street') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name) values('${otherLocation}','${business}','UK','Side Street') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'UNDECIDED') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${reviewCase}','REVIEW_PROTECTION','${customer}','${business}','${location}','Review dispute','2026-01-01',now(),now(),'UNDECIDED') on conflict (id) do nothing;
    alter table public.cases disable trigger cases_workflow_version;
    update public.cases set service_track='UNDECIDED', status='RECEIVED', work_stage='INITIAL_REVIEW', workflow_version=1, outcome=null, assigned=false, next_action='', next_action_at=null where id in ('${caseId}','${reviewCase}');
    alter table public.cases enable trigger cases_workflow_version;`)
})

async function verify(id = customer, biz = business, email = "alex@example.com") {
  await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4) on conflict (customer_id,channel) do update set verified_value=excluded.verified_value", [id, email, uid, "Verified from a live call with the customer."])
  await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,$4) on conflict (customer_id,business_id) do update set status='verified', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence", [id, biz, uid, "Companies House match discussed on a live call."])
}

async function priceId(code: string) {
  return (await db.query<{ id: string }>("select id from public.price_versions where service_code=$1 and seed_key is not null", [code])).rows[0].id
}

function draftPayload(overrides: Record<string, unknown> = {}) {
  return {
    serviceCode: "GUIDED_RELAUNCH",
    customerId: customer,
    businessId: business,
    caseId,
    locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions, Manager access, and later payment collection are excluded.",
    validUntil: later(),
    applyDiscount: false,
    ...overrides,
  }
}

async function createDraft(overrides: Record<string, unknown> = {}) {
  const serviceCode = String(overrides.serviceCode || "GUIDED_RELAUNCH")
  return rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    ...draftPayload({ priceVersionId: await priceId(serviceCode), ...overrides, serviceCode }),
  }, null])
}

async function setTax(quoteId: string, version: number, behaviour = "NOT_APPLICABLE") {
  return rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId, taxBehaviour: behaviour }, version])
}

async function offer(quoteId: string, version: number, quoteVersionId?: string) {
  return rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId, quoteVersionId }, version])
}

async function issue(quoteId: string, hash = secretHash(), expiresAt = actionExpiry()) {
  return { hash, result: await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId, expiresAt, secretHash: hash }, null]) }
}

async function currentPrice(code: string, at: string) {
  return (await db.query<{ id: string; amount_minor: number; effective_from: string; effective_to: string | null }>(
    "select id, amount_minor, effective_from::text, effective_to::text from admin_private.price_version_current_v1($1, $2::timestamptz)",
    [code, at],
  )).rows[0]
}

async function completeOtp(actionId: string | undefined, hash: string, email = "alex@example.com", auth = customerAuth) {
  const pending = secretHash(), session = secretHash()
  expect(await rpc("customer_action_exchange_v1", [actionId, hash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, auth, email])).toMatchObject({ status: "ok" })
  return session
}

async function caseVersion(id = caseId) {
  const row = (await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id=$1", [id])).rows[0]
  expect(Number.isInteger(row?.workflow_version)).toBe(true)
  return row.workflow_version
}

async function caseCmd(operation: string, data: Record<string, unknown>, id = caseId) {
  return rpc("admin_case_command_v1", [token, key(), id, await caseVersion(id), operation, {
    note: "Reviewed the caller’s request and confirmed the details.",
    ...data,
  }])
}

async function qualify(serviceCode: string, extras: Record<string, unknown> = {}) {
  return rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
    serviceCode,
    priceVersionId: await priceId(serviceCode),
    qualificationResult: "QUALIFIED",
    coverageBasis: "PAID",
    coverageStatus: "ACTIVE",
    coverageType: "PAID_GUARD",
    paidVsIncluded: "PAID",
    issuePredatesPaidCoverage: "false",
    locationId: location,
    ...extras,
  }, null])
}

describe("catalogue quotes and orders SQL", () => {
  it("seeds the five published prices as integer pence", async () => {
    const list = await rpc("admin_catalogue_list_v1", [token])
    const seeded = list?.prices?.filter(row => row.seedKey)
    expect(seeded?.map(row => [row.serviceCode, row.amountMinor, row.paymentModel, row.taxBehaviour, row.status]).sort()).toEqual(
      catalogueSeed.map(item => [item.serviceCode, item.amountMinor, item.paymentModel, item.taxBehaviour, "APPROVED"]).sort(),
    )
    expect(seeded?.every(row => Number.isInteger(row.amountMinor))).toBe(true)
    expect(seeded?.map(row => row.amountMinor).sort((a, b) => a - b)).toEqual([999, 5900, 9900, 14900, 29900])
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.price_versions where status='APPROVED' and service_code='GUIDED_RELAUNCH' and effective_to is null")).rows[0].n).toBe(1)
  })

  it("schedules a future approved price without retiring or overlapping the current version", async () => {
    const managedId = await priceId("MANAGED_RELAUNCH")
    await expect(db.query("update public.price_versions set amount_minor=1 where id=$1", [managedId])).rejects.toThrow(/immutable/i)
    const draft = await createDraft({ serviceCode: "MANAGED_RELAUNCH", caseId })
    expect(draft?.status).toBe("success")
    const created = await rpc("admin_catalogue_command_v1", [token, key(), "create_price_version", {
      serviceCode: "MANAGED_RELAUNCH", displayName: "Managed Relaunch", amountMinor: 31900, effectiveFrom: "2027-01-01T00:00:00Z", taxBehaviour: "UNCONFIRMED",
    }, null])
    expect(created?.status).toBe("success")
    expect((await rpc("admin_catalogue_command_v1", [token, key(), "approve_price_version", { priceVersionId: created?.id }, created?.version]))?.status).toBe("success")
    const predecessor = (await db.query<{ effective_to: string | null; amount_minor: number }>(
      "select effective_to::text, amount_minor from public.price_versions where id=$1", [managedId],
    )).rows[0]
    expect(predecessor.amount_minor).toBe(29900)
    expect(predecessor.effective_to).toMatch(/^2027-01-01/)
    const successor = (await db.query<{ effective_from: string; amount_minor: number; status: string }>(
      "select effective_from::text, amount_minor, status from public.price_versions where id=$1", [created?.id],
    )).rows[0]
    expect(successor).toMatchObject({ amount_minor: 31900, status: "APPROVED" })
    expect(successor.effective_from).toMatch(/^2027-01-01/)
    expect((await currentPrice("MANAGED_RELAUNCH", "2026-12-31T23:59:59Z")).amount_minor).toBe(29900)
    expect((await currentPrice("MANAGED_RELAUNCH", "2027-01-01T00:00:00Z")).amount_minor).toBe(31900)
    const overlaps = await db.query<{ n: number }>(`
      select count(*)::int as n
      from public.price_versions a
      join public.price_versions b on a.id < b.id and a.service_code = b.service_code
      where a.status = 'APPROVED' and b.status = 'APPROVED' and a.service_code = 'MANAGED_RELAUNCH'
        and tstzrange(a.effective_from, a.effective_to, '[)') && tstzrange(b.effective_from, b.effective_to, '[)')
    `)
    expect(overlaps.rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>(`
      select count(*)::int as n from public.price_versions
      where service_code='MANAGED_RELAUNCH' and status='APPROVED'
        and effective_from <= '2027-01-01T00:00:00Z' and (effective_to is null or effective_to > '2026-12-31T23:59:59Z')
    `)).rows[0].n).toBe(2)
    const quoted = await db.query<{ standard_amount_minor: number }>("select standard_amount_minor from public.quote_versions where id=$1", [draft?.quoteVersionId])
    expect(quoted.rows[0].standard_amount_minor).toBe(29900)
    const third = await rpc("admin_catalogue_command_v1", [token, key(), "create_price_version", {
      serviceCode: "MANAGED_RELAUNCH", displayName: "Managed Relaunch", amountMinor: 32900, effectiveFrom: "2026-12-01T00:00:00Z",
    }, null])
    expect((await rpc("admin_catalogue_command_v1", [token, key(), "approve_price_version", { priceVersionId: third?.id }, third?.version]))?.status).toBe("denied")
    await expect(db.query("update public.price_versions set effective_to='2026-06-01T00:00:00Z' where id=$1", [managedId])).rejects.toThrow(/retired|controlled|immutable/i)
  })

  it("requires fresh authentication for price approval", async () => {
    const created = await rpc("admin_catalogue_command_v1", [token, key(), "create_price_version", {
      serviceCode: "GUIDED_REVIEW", displayName: "Guided Review", amountMinor: 5900, effectiveFrom: "2027-06-01T00:00:00Z",
    }, null])
    await db.query("update public.admin_sessions set created_at=now()-interval '6 minutes'")
    expect((await rpc("admin_catalogue_command_v1", [token, key(), "approve_price_version", { priceVersionId: created?.id }, created?.version]))?.status).toBe("reauth_required")
  })

  it("creates immutable offered and accepted quote versions and amendments as new versions", async () => {
    const draft = await createDraft()
    expect(draft?.status).toBe("success")
    expect((await setTax(draft!.id!, draft!.version!))?.status).toBe("success")
    const offered = await offer(draft!.id!, draft!.version! + 1)
    expect(offered?.status).toBe("success")
    await expect(db.query("update public.quote_versions set total_amount_minor=1 where id=$1", [offered?.quoteVersionId])).rejects.toThrow(/immutable/i)
    const amended = await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: draft?.id, scope: "Replacement scope for the same recovery case only.", exclusions: "Payment, monitoring activation and Google outcomes remain excluded.",
    }, offered?.version])
    expect(amended?.status).toBe("success")
    expect(amended?.quoteVersionId).not.toBe(offered?.quoteVersionId)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.quote_versions where quote_id=$1", [draft?.id])).rows[0].n).toBe(2)
  })

  it("blocks superseded and expired quote acceptance and guessed quote IDs", async () => {
    await verify()
    const draft = await createDraft()
    await setTax(draft!.id!, draft!.version!)
    const offered = await offer(draft!.id!, draft!.version! + 1)
    const first = await issue(draft!.id!)
    expect(first.result?.status).toBe("success")
    const superseded = await rpc("admin_quote_command_v1", [token, key(), "supersede", { quoteId: draft?.id }, offered?.version])
    expect(superseded?.status).toBe("success")
    const pending = secretHash()
    expect(await rpc("customer_action_exchange_v1", [first.result?.id, first.hash, pending])).toEqual({ status: "unavailable" })
    const again = await createDraft()
    await setTax(again!.id!, again!.version!)
    await offer(again!.id!, again!.version! + 1)
    const issued = await issue(again!.id!)
    await db.exec("alter table public.quote_versions disable trigger quote_versions_protect")
    await db.query("update public.quote_versions set valid_until=now()-interval '1 minute' where id=$1", [again?.quoteVersionId])
    await db.exec("alter table public.quote_versions enable trigger quote_versions_protect")
    expect(await rpc("customer_action_exchange_v1", [issued.result?.id, issued.hash, secretHash()])).toEqual({ status: "unavailable" })
    expect(await rpc("admin_quote_detail_v1", ["bad", again?.id])).toBeNull()
    expect(await rpc("customer_action_session_v1", [secretHash()])).toBeNull()
  })

  it("pins quote acceptance to the exact version and denies the wrong customer", async () => {
    await verify()
    await verify(otherCustomer, business, "other@example.com")
    const draft = await createDraft()
    await setTax(draft!.id!, draft!.version!)
    await offer(draft!.id!, draft!.version! + 1)
    const issued = await issue(draft!.id!)
    const action = await db.query<{ quote_version_id: string; customer_id: string }>("select quote_version_id, customer_id from public.customer_actions where id=$1", [issued.result?.id])
    expect(action.rows[0].quote_version_id).toBe(draft?.quoteVersionId)
    expect(action.rows[0].customer_id).toBe(customer)
    const pending = secretHash()
    expect(await rpc("customer_action_exchange_v1", [issued.result?.id, issued.hash, pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ email: "alex@example.com" })
    const otherSession = secretHash()
    expect(await rpc("customer_action_finish_otp_v1", [pending, otherSession, otherAuth, "other@example.com"])).toEqual({ status: "unavailable" })
  })

  it("accepts a taxable Guided quote once and returns the same order on retry or race", async () => {
    await verify()
    const draft = await createDraft()
    await setTax(draft!.id!, draft!.version!)
    await offer(draft!.id!, draft!.version! + 1)
    const issued = await issue(draft!.id!)
    const session = await completeOtp(issued.result?.id, issued.hash)
    const request = key()
    const first = await rpc("customer_action_command_v1", [session, request, "accept", { accepted: true }])
    expect(first).toMatchObject({ status: "success", paymentCreated: false, invoiceCreated: false, monitoringActivated: false, orderState: "ACCEPTED_AWAITING_PAYMENT" })
    expect(await rpc("customer_action_command_v1", [session, request, "accept", { accepted: true }])).toMatchObject({ orderId: first?.orderId, orderRef: first?.orderRef })
    expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])).toMatchObject({ orderId: first?.orderId })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.quote_acceptances")).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.service_orders")).rows[0].n).toBe(1)
    await expect(db.query("update public.quote_acceptances set total_amount_minor=1")).rejects.toThrow(/immutable/i)
    await expect(db.query("update public.service_orders set amount_minor=1")).rejects.toThrow(/immutable/i)
    const unconfirmed = await createDraft({ serviceCode: "GUIDED_REVIEW", caseId: reviewCase })
    expect((await offer(unconfirmed!.id!, unconfirmed!.version!))?.status).toBe("denied")
    expect((await issue(unconfirmed!.id!)).result?.status).toBe("denied")
  })

  it("applies paid Guard Managed discounts exactly and fail-closes every ineligible path", async () => {
    expect(quoteAmounts(29900, GUARD_MANAGED_DISCOUNT_BPS, "NOT_APPLICABLE")).toMatchObject({ quotedSubtotalMinor: 23920, totalAmountMinor: 23920 })
    expect(formatGbp(23920)).toBe("£239.20")
    expect(formatGbp(11920)).toBe("£119.20")
    const qualifiedRelaunch = await qualify("MANAGED_RELAUNCH")
    expect(qualifiedRelaunch).toMatchObject({ status: "success", result: "QUALIFIED" })
    const managed = await createDraft({ serviceCode: "MANAGED_RELAUNCH", applyDiscount: true, qualificationId: qualifiedRelaunch?.id })
    expect(managed?.status).toBe("success")
    const relaunch = await db.query<{ quoted_subtotal_minor: number; discount_amount_minor: number }>("select quoted_subtotal_minor, discount_amount_minor from public.quote_versions where id=$1", [managed?.quoteVersionId])
    expect(relaunch.rows[0]).toEqual({ quoted_subtotal_minor: 23920, discount_amount_minor: 5980 })
    const qualifiedReview = await qualify("MANAGED_REVIEW")
    const review = await createDraft({ serviceCode: "MANAGED_REVIEW", caseId: reviewCase, applyDiscount: true, qualificationId: qualifiedReview?.id })
    const reviewRow = await db.query<{ quoted_subtotal_minor: number }>("select quoted_subtotal_minor from public.quote_versions where id=$1", [review?.quoteVersionId])
    expect(reviewRow.rows[0].quoted_subtotal_minor).toBe(11920)
    expect((await qualify("GUIDED_RELAUNCH"))?.status).toBe("denied")
    expect((await qualify("RELAUNCH_GUARD"))?.status).toBe("denied")
    expect((await qualify("MANAGED_RELAUNCH", { coverageBasis: "INCLUDED_ONLY" }))?.status).toBe("denied")
    expect((await qualify("MANAGED_RELAUNCH", { coverageStatus: "PAUSED" }))?.status).toBe("denied")
    expect((await qualify("MANAGED_RELAUNCH", { issuePredatesPaidCoverage: "true" }))?.status).toBe("denied")
    const included = await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "NOT_QUALIFIED",
      coverageBasis: "INCLUDED_ONLY", coverageStatus: "ACTIVE", coverageType: "INCLUDED_GUARD", paidVsIncluded: "INCLUDED_ONLY",
      reasonCode: "INCLUDED_ONLY", locationId: location,
    }, null])
    const noDiscount = await createDraft({ serviceCode: "MANAGED_RELAUNCH", qualificationId: included?.id })
    expect((await db.query<{ discount_amount_minor: number }>("select discount_amount_minor from public.quote_versions where id=$1", [noDiscount?.quoteVersionId])).rows[0].discount_amount_minor).toBe(0)
    const stacked = await createDraft({ serviceCode: "MANAGED_RELAUNCH", applyDiscount: true, qualificationId: qualifiedRelaunch?.id })
    expect(stacked?.status).toBe("success")
    expect((await db.query<{ discount_bps: number }>("select discount_bps from public.quote_versions where id=$1", [stacked?.quoteVersionId])).rows[0].discount_bps).toBe(2000)
  })

  it("does not rewrite an accepted quote after later Guard cancellation or price change", async () => {
    await verify()
    const qualified = await qualify("MANAGED_RELAUNCH")
    const draft = await createDraft({ serviceCode: "MANAGED_RELAUNCH", applyDiscount: true, qualificationId: qualified?.id })
    await setTax(draft!.id!, draft!.version!)
    await offer(draft!.id!, draft!.version! + 1)
    const issued = await issue(draft!.id!)
    const session = await completeOtp(issued.result?.id, issued.hash)
    const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
    expect(accepted?.status).toBe("success")
    await expect(db.query("update public.quote_discount_snapshots set qualification_result='NOT_QUALIFIED'")).rejects.toThrow(/immutable/i)
    const created = await rpc("admin_catalogue_command_v1", [token, key(), "create_price_version", {
      serviceCode: "MANAGED_RELAUNCH", displayName: "Managed Relaunch", amountMinor: 34900, effectiveFrom: "2028-01-01T00:00:00Z",
    }, null])
    expect((await rpc("admin_catalogue_command_v1", [token, key(), "approve_price_version", { priceVersionId: created?.id }, created?.version]))?.status).toBe("success")
    const frozen = await db.query<{ total_amount_minor: number; discount_amount_minor: number }>("select qv.total_amount_minor, qv.discount_amount_minor from public.quote_versions qv join public.service_orders o on o.quote_version_id=qv.id where o.id=$1", [accepted?.orderId])
    expect(frozen.rows[0]).toEqual({ total_amount_minor: 23920, discount_amount_minor: 5980 })
    expect((await db.query<{ amount_minor: number }>("select amount_minor from public.service_orders where id=$1", [accepted?.orderId])).rows[0].amount_minor).toBe(23920)
  })

  it("creates no payment, invoice or monitoring side effects and keeps workflow gates blocked", async () => {
    await verify()
    const draft = await createDraft()
    expect(draft?.status).toBe("success")
    expect(typeof draft?.version).toBe("number")
    expect(draft?.id).toBeTruthy()
    expect((await setTax(draft!.id!, draft!.version!))?.status).toBe("success")
    expect((await offer(draft!.id!, draft!.version! + 1))?.status).toBe("success")
    const issued = await issue(draft!.id!)
    const session = await completeOtp(issued.result?.id, issued.hash)
    const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
    expect(accepted).toMatchObject({ paymentCreated: false, invoiceCreated: false, monitoringActivated: false })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(0)
    expect((await caseCmd("plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null }))?.status).toBe("success")
    expect((await caseCmd("transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }))?.status).toBe("success")
    expect((await caseCmd("transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }))?.status).toBe("success")
    expect((await caseCmd("transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }))?.status).toBe("success")
    expect(await caseCmd("transition", { target: "PREPARATION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })).toEqual({ status: "prerequisite" })
    expect((await caseCmd("transition", { target: "READY_TO_SUBMIT", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }))?.status).toMatch(/denied|prerequisite/)
    const guard = await createDraft({ serviceCode: "RELAUNCH_GUARD", caseId: null, locationId: location })
    expect(guard?.status).toBe("success")
    expect(guard?.id).toBeTruthy()
    expect((await setTax(guard!.id!, guard!.version!))?.status).toBe("success")
    expect((await offer(guard!.id!, guard!.version! + 1))?.status).toBe("success")
    const guardIssue = await issue(guard!.id!)
    const guardSession = await completeOtp(guardIssue.result?.id, guardIssue.hash)
    const guardAccepted = await rpc("customer_action_command_v1", [guardSession, key(), "accept", { accepted: true }])
    expect(guardAccepted).toMatchObject({ monitoringActivated: false, orderState: "ACCEPTED_RECURRING" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.monitoring_requests where status='ACTIVE'")).rows[0].n).toBe(0)
    const managed = await createDraft({ serviceCode: "MANAGED_REVIEW", caseId: reviewCase })
    expect(managed?.status).toBe("success")
    expect((await setTax(managed!.id!, managed!.version!))?.status).toBe("success")
    expect((await offer(managed!.id!, managed!.version! + 1))?.status).toBe("success")
    const managedIssue = await issue(managed!.id!)
    const managedSession = await completeOtp(managedIssue.result?.id, managedIssue.hash)
    expect(await rpc("customer_action_command_v1", [managedSession, key(), "accept", { accepted: true }])).toMatchObject({
      orderState: "ACCEPTED_SUCCESS_FEE", paymentCreated: false, invoiceCreated: false,
    })
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,'public.quotes','SELECT') as ok", [role])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,'public.service_orders','SELECT') as ok", [role])).rows[0].ok).toBe(false)
    }
  })

  it("does not silently change a Guided case onto a Managed quote", async () => {
    await db.query("update public.cases set service_track='GUIDED' where id=$1", [caseId])
    expect((await createDraft({ serviceCode: "MANAGED_RELAUNCH" }))?.status).toBe("denied")
    expect((await createDraft({ serviceCode: "GUIDED_RELAUNCH" }))?.status).toBe("success")
    await db.query("update public.cases set service_track='MANAGED' where id=$1", [reviewCase])
    expect((await createDraft({ serviceCode: "GUIDED_REVIEW", caseId: reviewCase }))?.status).toBe("denied")
  })

  it("rejects mismatched discount snapshots when amending a quote version", async () => {
    const seedPrice = await priceId("MANAGED_RELAUNCH")
    const qualified = await qualify("MANAGED_RELAUNCH")
    const draft = await createDraft({ serviceCode: "MANAGED_RELAUNCH" })
    expect(draft?.status).toBe("success")
    expect((await setTax(draft!.id!, draft!.version!))?.status).toBe("success")
    const offered = await offer(draft!.id!, draft!.version! + 1)
    expect(offered?.status).toBe("success")
    const otherLoc = await qualify("MANAGED_RELAUNCH", { locationId: otherLocation })
    expect((await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: draft?.id, applyDiscount: true, qualificationId: otherLoc?.id,
    }, offered?.version]))?.status).toBe("denied")
    const otherService = await qualify("MANAGED_REVIEW")
    expect((await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: draft?.id, applyDiscount: true, qualificationId: otherService?.id,
    }, offered?.version]))?.status).toBe("denied")
    const future = await rpc("admin_catalogue_command_v1", [token, key(), "create_price_version", {
      serviceCode: "MANAGED_RELAUNCH", displayName: "Managed Relaunch", amountMinor: 31900, effectiveFrom: "2027-01-01T00:00:00Z",
    }, null])
    expect((await rpc("admin_catalogue_command_v1", [token, key(), "approve_price_version", { priceVersionId: future?.id }, future?.version]))?.status).toBe("success")
    expect((await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: draft?.id, applyDiscount: true, qualificationId: qualified?.id, priceVersionId: future?.id,
    }, offered?.version]))?.status).toBe("denied")
    const expiredSnap = await qualify("MANAGED_RELAUNCH", { validUntil: past() })
    expect((await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: draft?.id, applyDiscount: true, qualificationId: expiredSnap?.id,
    }, offered?.version]))?.status).toBe("denied")
    const included = await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: seedPrice, qualificationResult: "NOT_QUALIFIED",
      coverageBasis: "INCLUDED_ONLY", coverageStatus: "ACTIVE", coverageType: "INCLUDED_GUARD", paidVsIncluded: "INCLUDED_ONLY",
      reasonCode: "INCLUDED_ONLY", locationId: location,
    }, null])
    expect((await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: draft?.id, applyDiscount: true, qualificationId: included?.id,
    }, offered?.version]))?.status).toBe("denied")
    const amended = await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: draft?.id, applyDiscount: true, qualificationId: qualified?.id, priceVersionId: seedPrice,
      scope: "Amended managed recovery for this location only.", exclusions: "Payment, monitoring activation and Google outcomes remain excluded.",
    }, offered?.version])
    expect(amended?.status).toBe("success")
    expect((await db.query<{ discount_amount_minor: number; price_version_id: string }>(
      "select discount_amount_minor, price_version_id from public.quote_versions where id=$1", [amended?.quoteVersionId],
    )).rows[0]).toEqual({ discount_amount_minor: 5980, price_version_id: seedPrice })
  })

  it("revokes an expired OPEN quote action before issuing a replacement", async () => {
    await verify()
    const draft = await createDraft()
    await setTax(draft!.id!, draft!.version!)
    await offer(draft!.id!, draft!.version! + 1)
    const first = await issue(draft!.id!)
    expect(first.result?.status).toBe("success")
    const pending = secretHash()
    expect(await rpc("customer_action_exchange_v1", [first.result?.id, first.hash, pending])).toMatchObject({ status: "ok" })
    expect((await issue(draft!.id!)).result?.status).toBe("denied")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_actions where quote_version_id=$1 and status='OPEN'", [first.result?.quoteVersionId])).rows[0].n).toBe(1)
    await db.exec("alter table public.customer_actions disable trigger customer_actions_protect")
    await db.query("update public.customer_actions set expires_at=now()-interval '1 minute' where id=$1", [first.result?.id])
    await db.exec("alter table public.customer_actions enable trigger customer_actions_protect")
    const [left, right] = await Promise.all([issue(draft!.id!), issue(draft!.id!)])
    const created = [left, right].filter(item => item.result?.status === "success")
    expect(created).toHaveLength(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_actions where quote_version_id=$1 and status='OPEN'", [first.result?.quoteVersionId])).rows[0].n).toBe(1)
    const old = await db.query<{ status: string; revoked_at: string | null }>("select status, revoked_at from public.customer_actions where id=$1", [first.result?.id])
    expect(old.rows[0].status).toBe("REVOKED")
    expect(old.rows[0].revoked_at).toBeTruthy()
    const expiredEvent = await db.query<{ details: { source?: string } }>(
      "select details from public.customer_action_events where action_id=$1 and event='ACTION_REVOKED' order by created_at desc limit 1",
      [first.result?.id],
    )
    expect(expiredEvent.rows[0].details.source).toBe("ACTION_EXPIRED")
    expect(await rpc("customer_action_exchange_v1", [first.result?.id, first.hash, secretHash()])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_session_v1", [pending])).toBeNull()
    expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: expect.stringMatching(/unavailable|denied|invalid/) })
  })

  it("refuses unusable offers and actions until tax and validity are final", async () => {
    await verify()
    const unconfirmed = await createDraft()
    expect(unconfirmed?.status).toBe("success")
    expect((await offer(unconfirmed!.id!, unconfirmed!.version!))?.status).toBe("denied")
    const expiredDraft = await createDraft()
    await setTax(expiredDraft!.id!, expiredDraft!.version!)
    await db.query("update public.quote_versions set valid_until=now()-interval '1 minute' where id=$1", [expiredDraft?.quoteVersionId])
    expect((await offer(expiredDraft!.id!, expiredDraft!.version! + 1))?.status).toBe("denied")
    expect((await rpc("admin_quote_command_v1", [token, key(), "create_version", {
      quoteId: expiredDraft?.id, validUntil: past(),
    }, expiredDraft!.version! + 1]))?.status).toBe("invalid")
    const ready = await createDraft()
    expect((await setTax(ready!.id!, ready!.version!))?.status).toBe("success")
    expect((await offer(ready!.id!, ready!.version! + 1))?.status).toBe("success")
    expect((await issue(ready!.id!, secretHash(), new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString())).result?.status).toBe("invalid")
    await db.exec("alter table public.quote_versions disable trigger quote_versions_protect")
    await db.query("update public.quote_versions set valid_until=now()-interval '1 minute' where id=$1", [ready?.quoteVersionId])
    await db.exec("alter table public.quote_versions enable trigger quote_versions_protect")
    expect((await issue(ready!.id!)).result?.status).toBe("denied")
    const ok = await createDraft()
    await setTax(ok!.id!, ok!.version!)
    expect((await offer(ok!.id!, ok!.version! + 1))?.status).toBe("success")
    expect((await issue(ok!.id!)).result?.status).toBe("success")
  })
})
