import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, applyUpgrade, migrationSql, preparePlatform } from "../recovery/harness"

const appliedHead = "20261003194353"
const migration = "20261003204538_customer_portal_quotes_agreements_permissions_v1.sql"
const upgradedFiles = [
  migration,
  "20261003224746_customer_portal_payments_receipts_v1.sql",
  "20261004000625_customer_portal_relaunch_guard_v1.sql",
].join(",")
const db = new PGlite()

const alex = "c10f0000-0000-4000-8000-0000000000a2"
const sam = "c10f0000-0000-4000-8000-0000000000b2"
const alexAuth = "c10f0000-0000-4000-8000-0000000000d4"
const samAuth = "c10f0000-0000-4000-8000-0000000000e5"
const verifier = "c10f0000-0000-4000-8000-0000000000a7"
const business = "c10f0000-0000-4000-8000-000000000022"
const location = "c10f0000-0000-4000-8000-000000000023"

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const requestId = () => randomUUID()

type ServiceView = {
  found?: boolean
  case?: { reference: string; businessName: string; locationName: string | null; serviceTrack: string }
  quote?: {
    reference: string
    serviceName: string
    scope: string
    standardAmountMinor: number
    discountAmountMinor: number
    quotedAmountMinor: number
    taxAmountMinor: number
    totalAmountMinor: number
    currency: string
    taxBehaviour: string
    status: string
    canAccept: boolean
    orderReference: string | null
    paymentNext: string | null
  } | null
  serviceAgreement?: { title: string; body: string; status: string; versionNumber: number; canAccept: boolean } | null
  casePermission?: { title: string; status: string; canAccept: boolean; acceptedAt: string | null } | null
  actions?: Array<{ selector: string; kind: string; target: string | null }>
}

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

async function insertCase(reference: string, customer = alex, status = "UNDER_REVIEW", track = "GUIDED") {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, status, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track, work_stage, submitted_at, intake_snapshot
    ) values ($1,$2,'PROFILE_RECOVERY',$3,$4,$5,$6,'Synthetic issue kept inside the database.', now(), now(), $7, 'SERVICE_SELECTION', now(), '{}'::jsonb)`,
    [id, reference, status, customer, business, location, track],
  )
  return id
}

async function quote(options: {
  caseId: string
  quoteRef: string
  customer?: string
  serviceCode?: string
  paymentModel?: string
  tax?: string
  standard?: number
  discountBps?: number
  serviceName?: string
}) {
  const customer = options.customer ?? alex
  const serviceCode = options.serviceCode ?? "GUIDED_RELAUNCH"
  const standard = options.standard ?? 29900
  const discountBps = options.discountBps ?? 0
  const discount = Math.round(standard * discountBps / 10000)
  const subtotal = standard - discount
  const taxBehaviour = options.tax ?? "NOT_APPLICABLE"
  const taxRate = taxBehaviour === "EXCLUSIVE" ? 2000 : null
  const tax = taxBehaviour === "EXCLUSIVE" ? Math.round(subtotal * 2000 / 10000) : 0
  const total = taxBehaviour === "EXCLUSIVE" ? subtotal + tax : subtotal
  const policy = discountBps === 2000 ? "PAID_GUARD_MANAGED_20" : "NONE"
  const snapshot = randomUUID()
  const quoteId = randomUUID()
  const version = randomUUID()
  if (discountBps === 2000) {
    // A historical qualified snapshot is enough for the portal to render stored
    // amounts. The coverage trigger demands a live Guard relationship, which
    // this projection test is not exercising.
    await db.exec("alter table public.quote_discount_snapshots disable trigger quote_discount_snapshots_guard_coverage")
    await db.query(
      `insert into public.quote_discount_snapshots(
        id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, issue_predates_paid_coverage,
        service_code, policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
        discounted_subtotal_minor, recorded_by, source
      ) values ($1,$2,'PAID','ACTIVE','PAID_GUARD','PAID',false,$3,$4,$5,'QUALIFIED','QUALIFIED',$6,$7,$8,$9,'ADMIN_RECORDED')`,
      [snapshot, location, serviceCode, policy, discountBps, standard, discount, subtotal, verifier],
    )
    await db.exec("alter table public.quote_discount_snapshots enable trigger quote_discount_snapshots_guard_coverage")
  } else {
    await db.query(
      `insert into public.quote_discount_snapshots(
        id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
        policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
        discounted_subtotal_minor, recorded_by, source
      ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN',$3,$4,$5,'NOT_QUALIFIED','SYNTHETIC_PORTAL',$6,$7,$8,$9,'ADMIN_RECORDED')`,
      [snapshot, location, serviceCode, policy, discountBps, standard, discount, subtotal, verifier],
    )
  }
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
    [quoteId, options.quoteRef, customer, business, location, options.caseId, verifier],
  )
  const inserted = await db.query<{ id: string }>(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_rate_bps, tax_amount_minor, total_amount_minor,
      currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1, $2, 1, 'OFFERED', $3, $4, $5, $6, $7, p.id, $8, $9,
      'We prepare the profile relaunch for this location.', 'Directory listings outside this location are excluded.',
      'Success means the profile is submitted for reinstatement.',
      $10, $11, $12, $13, $14, $15, $16, $17, $18, 'GBP', $19, now() + interval '30 days',
      'You pay the quoted amount before work starts.', 'The service terms sent with this quote apply.', $20, now(), $20
    from public.price_versions p
    where p.service_code = $7 and p.status = 'APPROVED'
    order by p.effective_from
    limit 1
    returning id`,
    [version, quoteId, customer, business, location, options.caseId, serviceCode, options.serviceName ?? "Guided profile help", options.paymentModel ?? "UPFRONT", standard, policy, discountBps, discount, subtotal, taxBehaviour, taxRate, tax, total, snapshot, verifier],
  )
  if (!inserted.rows[0]) throw new Error(`no price for ${serviceCode}`)
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quoteId])
  return { quoteId, version }
}

async function agreement(caseId: string, kind: string, title: string, customer = alex, versionNumber = 1) {
  const id = randomUUID()
  await db.query(
    `insert into public.agreement_versions(
      id, case_id, customer_id, business_id, location_id, agreement_kind, version_number, title, body_text, scope_text, content_hash, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'This permission covers only the case described here.', $10, $11)`,
    [id, caseId, customer, business, location, kind, versionNumber, title, `${title} body that the customer must be able to read in full.`, hash(`${title}:${versionNumber}`), verifier],
  )
  return id
}

async function action(options: {
  caseId: string
  kind: string
  customer?: string
  email?: string
  quoteVersionId?: string
  agreementVersionId?: string
  authorizationId?: string
  expires?: string
}) {
  const id = randomUUID()
  const secret = hash(randomUUID())
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, kind, agreement_version_id, quote_version_id, authorization_id,
      secret_hash, expected_email_snapshot, expires_at, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, coalesce($12::timestamptz, now() + interval '2 days'), $13)`,
    [
      id, options.customer ?? alex, business, location, options.caseId, options.kind,
      options.agreementVersionId ?? null, options.quoteVersionId ?? null, options.authorizationId ?? null,
      secret, options.email ?? "alex@example.com", options.expires ?? null, verifier,
    ],
  )
  return { id, secret }
}

async function selector(actionId: string) {
  return (await rows<{ value: string }>("select admin_private.customer_portal_action_selector_v1($1) as value", [actionId]))[0].value
}

async function command(session: string, reference: string, actionId: string, operation: string, data: Record<string, boolean>, request = requestId()) {
  return rpc<{ status: string; orderRef?: string; authorizationStatus?: string }>("customer_portal_service_command_v1", [
    session, request, reference, await selector(actionId), operation, data,
  ])
}

let alexSession = ""
let samSession = ""

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db, { through: appliedHead })
  const upgraded = await applyUpgrade(db, appliedHead)
  if (upgraded.applied.map(item => item.entry.filename).join(",") !== upgradedFiles) {
    throw new Error(`expected ${upgradedFiles}, applied ${upgraded.head}`)
  }
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex@example.com', '${verifier}', 'Verified from a live call with the customer.'),
      ('${sam}', 'email', 'sam@example.com', '${verifier}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${business}', 'verified', now(), '${verifier}', 'Companies House match discussed on a live call.'),
      ('${sam}', '${business}', 'verified', now(), '${verifier}', 'Companies House match discussed on a live call.');
  `)
  alexSession = await portalSession("alex@example.com", alexAuth)
  samSession = await portalSession("sam@example.com", samAuth)
}, 180000)

afterAll(async () => { await db.close() })

describe("customer portal service migration", () => {
  it("adds functions only and does not weaken table grants", () => {
    const sql = migrationSql(migration)
    expect(sql).not.toMatch(/create table/i)
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on/i)
    expect(sql).not.toMatch(/execute\s+['$]/i)
    expect(sql).not.toMatch(/\bformat\s*\(/i)
    expect(sql).toContain("customer_commercial_apply_v1")
    expect(sql).toContain("customer_portal_case_service_v1")
    expect(sql).toContain("customer_action_command_core_v1")
  })
})

describe("service projection ownership", () => {
  it("shows only the owned case and hides internal identifiers", async () => {
    const caseId = await insertCase("PR-26-SVCAAA")
    const offered = await quote({
      caseId, quoteRef: "QT-26-SVCAAA", standard: 29900, discountBps: 0, serviceName: "Guided profile help",
    })
    const created = await action({ caseId, kind: "QUOTE_ACCEPTANCE", quoteVersionId: offered.version })
    const samCase = await insertCase("PR-26-SVCSAM", sam)
    const samQuote = await quote({ caseId: samCase, quoteRef: "QT-26-SVCSAM", customer: sam })
    await action({ caseId: samCase, kind: "QUOTE_ACCEPTANCE", customer: sam, email: "sam@example.com", quoteVersionId: samQuote.version })

    const own = await rpc<ServiceView>("customer_portal_case_service_v1", [alexSession, "PR-26-SVCAAA"])
    expect(own.found).toBe(true)
    expect(own.case).toMatchObject({ reference: "PR-26-SVCAAA", businessName: "Harbour Bakery", locationName: "High Street", serviceTrack: "GUIDED" })
    expect(own.quote).toMatchObject({
      reference: "QT-26-SVCAAA",
      serviceName: "Guided profile help",
      scope: "We prepare the profile relaunch for this location.",
      standardAmountMinor: 29900,
      discountAmountMinor: 0,
      quotedAmountMinor: 29900,
      totalAmountMinor: 29900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      status: "offered",
      canAccept: true,
    })
    expect(own.actions?.[0]).toMatchObject({ kind: "quote", target: null, selector: await selector(created.id) })
    const serialised = JSON.stringify(own)
    expect(serialised).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(serialised).not.toContain(created.secret)
    expect(serialised).not.toContain("alex@example.com")
    expect(await rpc("customer_portal_case_service_v1", [alexSession, "PR-26-SVCSAM"])).toEqual({ found: false })
    expect(await rpc("customer_portal_case_service_v1", [alexSession, "PR-26-ZZZZZ9"])).toEqual({ found: false })
    expect(await rpc("customer_portal_case_service_v1", [hash("missing"), "PR-26-SVCAAA"])).toBeNull()
  })

  it("returns the immutable discounted snapshot rather than today's catalogue", async () => {
    const caseId = await insertCase("PR-26-SVCDSC", alex, "UNDER_REVIEW", "MANAGED")
    const offered = await quote({
      caseId, quoteRef: "QT-26-SVCDSC", serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE",
      standard: 29900, discountBps: 2000, serviceName: "Managed profile help", tax: "EXCLUSIVE",
    })
    await action({ caseId, kind: "QUOTE_ACCEPTANCE", quoteVersionId: offered.version })
    const view = await rpc<ServiceView>("customer_portal_case_service_v1", [alexSession, "PR-26-SVCDSC"])
    expect(view.quote).toMatchObject({
      standardAmountMinor: 29900,
      discountAmountMinor: 5980,
      quotedAmountMinor: 23920,
      taxAmountMinor: 4784,
      totalAmountMinor: 28704,
      taxBehaviour: "EXCLUSIVE",
      canAccept: true,
    })
  })
})

describe("portal commercial commands", () => {
  it("accepts a quote once, replays the same request, and rejects a conflicting replay", async () => {
    const caseId = await insertCase("PR-26-SVCACC")
    const offered = await quote({ caseId, quoteRef: "QT-26-SVCACC" })
    const created = await action({ caseId, kind: "QUOTE_ACCEPTANCE", quoteVersionId: offered.version })
    const key = requestId()
    const first = await command(alexSession, "PR-26-SVCACC", created.id, "accept_quote", { accepted: true }, key)
    expect(first.status).toBe("success")
    expect(await count("select count(*)::int as n from public.quote_acceptances where quote_version_id = $1", [offered.version])).toBe(1)
    expect(await count("select count(*)::int as n from public.service_orders where quote_version_id = $1", [offered.version])).toBe(1)
    expect(await command(alexSession, "PR-26-SVCACC", created.id, "accept_quote", { accepted: true }, key)).toMatchObject({ status: "success" })
    expect(await count("select count(*)::int as n from public.service_orders where quote_version_id = $1", [offered.version])).toBe(1)
    expect(await command(alexSession, "PR-26-SVCACC", created.id, "decline_quote", { confirmed: true }, key)).toEqual({ status: "conflict" })
    const after = await rpc<ServiceView>("customer_portal_case_service_v1", [alexSession, "PR-26-SVCACC"])
    expect(after.quote?.status).toBe("accepted")
    expect(after.quote?.orderReference).toMatch(/^SO-/)
    expect(after.quote?.paymentNext).toBe("payment")
    expect(after.actions).toEqual([])
  })

  it("does not create a second order when the secure link and the portal both accept", async () => {
    const portalFirst = await insertCase("PR-26-SVCPRT")
    const portalQuote = await quote({ caseId: portalFirst, quoteRef: "QT-26-SVCPRT" })
    const portalAction = await action({ caseId: portalFirst, kind: "QUOTE_ACCEPTANCE", quoteVersionId: portalQuote.version })
    expect((await command(alexSession, "PR-26-SVCPRT", portalAction.id, "accept_quote", { accepted: true })).status).toBe("success")
    const linkHash = hash(token())
    await db.query(
      "insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at) values ($1,$2,$3, now() + interval '1 hour')",
      [linkHash, portalAction.id, alexAuth],
    )
    const linked = await rpc<{ status: string }>("customer_action_command_v1", [linkHash, requestId(), "accept", { accepted: true }])
    expect(linked.status).toBe("success")
    expect(await count("select count(*)::int as n from public.service_orders where case_id = $1", [portalFirst])).toBe(1)

    const linkFirst = await insertCase("PR-26-SVCLNK")
    const linkQuote = await quote({ caseId: linkFirst, quoteRef: "QT-26-SVCLNK" })
    const linkAction = await action({ caseId: linkFirst, kind: "QUOTE_ACCEPTANCE", quoteVersionId: linkQuote.version })
    const firstHash = hash(token())
    await db.query(
      "insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at) values ($1,$2,$3, now() + interval '1 hour')",
      [firstHash, linkAction.id, alexAuth],
    )
    const legacy = await rpc<{ kind: string; quote: { serviceName: string; totalAmountMinor: number } }>("customer_action_session_v1", [firstHash])
    expect(legacy.kind).toBe("QUOTE_ACCEPTANCE")
    expect(legacy.quote.serviceName).toBe("Guided profile help")
    expect(legacy.quote.totalAmountMinor).toBe(29900)
    expect((await rpc<{ status: string }>("customer_action_command_v1", [firstHash, requestId(), "accept", { accepted: true }])).status).toBe("success")
    expect((await command(alexSession, "PR-26-SVCLNK", linkAction.id, "accept_quote", { accepted: true })).status).toBe("unavailable")
    expect(await count("select count(*)::int as n from public.service_orders where case_id = $1", [linkFirst])).toBe(1)
    const session = await rpc<{ kind: string; quote: { serviceName: string } }>("customer_action_session_v1", [hash("absent")])
    expect(session).toBeNull()
  })

  it("rejects expired, revoked, superseded, unconfirmed-tax and closed-case quote changes", async () => {
    const expiredCase = await insertCase("PR-26-SVCEXP")
    const expiredQuote = await quote({ caseId: expiredCase, quoteRef: "QT-26-SVCEXP" })
    const expiredAction = await action({ caseId: expiredCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: expiredQuote.version, expires: "2020-01-02T00:00:00Z" })
    expect((await command(alexSession, "PR-26-SVCEXP", expiredAction.id, "accept_quote", { accepted: true })).status).toBe("unavailable")

    const revokedCase = await insertCase("PR-26-SVCRVK")
    const revokedQuote = await quote({ caseId: revokedCase, quoteRef: "QT-26-SVCRVK" })
    const revokedAction = await action({ caseId: revokedCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: revokedQuote.version })
    await db.query("update public.customer_actions set status = 'REVOKED', revoked_at = now() where id = $1", [revokedAction.id])
    expect((await command(alexSession, "PR-26-SVCRVK", revokedAction.id, "accept_quote", { accepted: true })).status).toBe("unavailable")

    const replacedCase = await insertCase("PR-26-SVCREP")
    const replacedQuote = await quote({ caseId: replacedCase, quoteRef: "QT-26-SVCREP" })
    const replacedAction = await action({ caseId: replacedCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: replacedQuote.version })
    await db.query("update public.quote_versions set status = 'SUPERSEDED' where id = $1", [replacedQuote.version])
    await db.query("update public.quotes set status = 'SUPERSEDED' where id = $1", [replacedQuote.quoteId])
    expect((await command(alexSession, "PR-26-SVCREP", replacedAction.id, "accept_quote", { accepted: true })).status).toBe("unavailable")

    const taxCase = await insertCase("PR-26-SVCTAX")
    const taxQuote = await quote({ caseId: taxCase, quoteRef: "QT-26-SVCTAX", tax: "UNCONFIRMED" })
    const taxAction = await action({ caseId: taxCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: taxQuote.version })
    expect((await command(alexSession, "PR-26-SVCTAX", taxAction.id, "accept_quote", { accepted: true })).status).toBe("denied")
    expect(await count("select count(*)::int as n from public.quote_acceptances where quote_version_id = $1", [taxQuote.version])).toBe(0)

    const declineCase = await insertCase("PR-26-SVCDEC")
    const declineQuote = await quote({ caseId: declineCase, quoteRef: "QT-26-SVCDEC" })
    const declineAction = await action({ caseId: declineCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: declineQuote.version })
    expect((await command(alexSession, "PR-26-SVCDEC", declineAction.id, "decline_quote", { confirmed: true })).status).toBe("success")
    expect((await rpc<ServiceView>("customer_portal_case_service_v1", [alexSession, "PR-26-SVCDEC"])).quote?.status).toBe("declined")
    expect(await count("select count(*)::int as n from public.quote_acceptances where quote_id = $1", [declineQuote.quoteId])).toBe(0)

    const closed = await insertCase("PR-26-SVCCLS")
    const closedQuote = await quote({ caseId: closed, quoteRef: "QT-26-SVCCLS" })
    const closedAction = await action({ caseId: closed, kind: "QUOTE_ACCEPTANCE", quoteVersionId: closedQuote.version })
    await db.query("update public.cases set status = 'CLOSED', work_stage = 'FINISHED', closed_at = now() where id = $1", [closed])
    expect((await command(alexSession, "PR-26-SVCCLS", closedAction.id, "accept_quote", { accepted: true })).status).toBe("unavailable")
    expect((await rpc<ServiceView>("customer_portal_case_service_v1", [alexSession, "PR-26-SVCCLS"])).quote?.reference).toBe("QT-26-SVCCLS")
  })

  it("accepts each agreement once and completes only an eligible revocation for that authorisation", async () => {
    const caseId = await insertCase("PR-26-SVCAGR", alex, "UNDER_REVIEW", "MANAGED")
    const serviceVersion = await agreement(caseId, "SERVICE_AGREEMENT", "ProfileRelaunch service agreement")
    const serviceAction = await action({ caseId, kind: "AGREEMENT_ACCEPTANCE", agreementVersionId: serviceVersion })
    expect((await command(alexSession, "PR-26-SVCAGR", serviceAction.id, "accept_agreement", { accepted: true })).status).toBe("success")
    expect(await count("select count(*)::int as n from public.authorization_records where case_id = $1 and authorization_kind = 'SERVICE_AGREEMENT' and status = 'ACTIVE'", [caseId])).toBe(1)
    const replacement = await agreement(caseId, "SERVICE_AGREEMENT", "Replacement service agreement", alex, 2)
    const second = await action({ caseId, kind: "AGREEMENT_ACCEPTANCE", agreementVersionId: replacement })
    expect((await command(alexSession, "PR-26-SVCAGR", second.id, "accept_agreement", { accepted: true })).status).toBe("conflict")
    expect(await count("select count(*)::int as n from public.authorization_records where case_id = $1 and authorization_kind = 'SERVICE_AGREEMENT' and status = 'ACTIVE'", [caseId])).toBe(1)

    const declineCase = await insertCase("PR-26-SVCADN")
    const declineVersion = await agreement(declineCase, "SERVICE_AGREEMENT", "Declined service agreement")
    const declineAction = await action({ caseId: declineCase, kind: "AGREEMENT_ACCEPTANCE", agreementVersionId: declineVersion })
    expect((await command(alexSession, "PR-26-SVCADN", declineAction.id, "decline_agreement", { confirmed: true })).status).toBe("success")
    expect((await rpc<ServiceView>("customer_portal_case_service_v1", [alexSession, "PR-26-SVCADN"])).serviceAgreement?.status).toBe("declined")

    const permissionCase = await insertCase("PR-26-SVCPRM", alex, "UNDER_REVIEW", "MANAGED")
    const permissionVersion = await agreement(permissionCase, "CASE_MANAGEMENT_PERMISSION", "Case management permission")
    const permissionAction = await action({ caseId: permissionCase, kind: "AGREEMENT_ACCEPTANCE", agreementVersionId: permissionVersion })
    expect((await command(alexSession, "PR-26-SVCPRM", permissionAction.id, "accept_agreement", { accepted: true })).status).toBe("success")
    const accepted = await rpc<ServiceView>("customer_portal_case_service_v1", [alexSession, "PR-26-SVCPRM"])
    expect(accepted.casePermission).toMatchObject({ status: "accepted", title: "Case management permission" })
    expect(accepted.casePermission?.acceptedAt).toBeTruthy()
    expect(accepted.actions).toEqual([])
    const authorizationId = (await rows<{ id: string }>("select id from public.authorization_records where case_id = $1 and status = 'ACTIVE'", [permissionCase]))[0].id
    const revocation = await action({ caseId: permissionCase, kind: "AUTHORIZATION_REVOCATION", authorizationId })
    expect((await command(samSession, "PR-26-SVCPRM", revocation.id, "revoke_authorization", { confirmed: true })).status).toBe("not_found")
    expect((await command(alexSession, "PR-26-SVCPRM", revocation.id, "revoke_authorization", { confirmed: true })).status).toBe("success")
    expect(await count("select count(*)::int as n from public.authorization_records where id = $1 and status = 'REVOKED'", [authorizationId])).toBe(1)
    const source = (await rows<{ source: string }>("select source from public.authorization_records where id = $1", [authorizationId]))[0].source
    expect(source).toBe("CUSTOMER_OTP")
    const eventSource = (await rows<{ source: string }>("select details->>'source' as source from public.authorization_events where authorization_id = $1 and event = 'AUTHORIZATION_REVOKED'", [authorizationId]))[0].source
    expect(eventSource).toBe("CUSTOMER_PORTAL")

    const staleCase = await insertCase("PR-26-SVCSTL", alex, "UNDER_REVIEW", "MANAGED")
    const staleVersion = await agreement(staleCase, "CASE_MANAGEMENT_PERMISSION", "Stale permission")
    const staleAccept = await action({ caseId: staleCase, kind: "AGREEMENT_ACCEPTANCE", agreementVersionId: staleVersion })
    expect((await command(alexSession, "PR-26-SVCSTL", staleAccept.id, "accept_agreement", { accepted: true })).status).toBe("success")
    const staleAuth = (await rows<{ id: string }>("select id from public.authorization_records where case_id = $1", [staleCase]))[0].id
    const staleRevoke = await action({ caseId: staleCase, kind: "AUTHORIZATION_REVOCATION", authorizationId: staleAuth })
    await db.query("update public.customer_actions set status = 'REVOKED', revoked_at = now() where id = $1", [staleRevoke.id])
    expect((await command(alexSession, "PR-26-SVCSTL", staleRevoke.id, "revoke_authorization", { confirmed: true })).status).toBe("unavailable")
    expect(await count("select count(*)::int as n from public.authorization_records where id = $1 and status = 'ACTIVE'", [staleAuth])).toBe(1)
  })

  it("keeps the new functions service-role only and the legacy command delegated", async () => {
    const publicFns = [
      "public.customer_portal_case_service_v1(text,text)",
      "public.customer_portal_service_command_v1(text,uuid,text,text,text,jsonb)",
    ]
    const privateFns = [
      "admin_private.customer_portal_action_selector_v1(uuid)",
      "admin_private.customer_commercial_apply_v1(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid,text)",
      "admin_private.customer_portal_quote_view_v1(uuid,uuid,text)",
      "admin_private.customer_portal_agreement_view_v1(uuid,uuid,text,text)",
      "admin_private.customer_portal_service_actions_v1(uuid,uuid,text)",
    ]
    const can = async (role: string, signature: string) =>
      (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
    for (const role of ["public", "anon", "authenticated"]) {
      for (const signature of [...publicFns, ...privateFns]) expect(await can(role, signature)).toBe(false)
    }
    for (const signature of publicFns) expect(await can("service_role", signature)).toBe(true)
    for (const signature of privateFns) expect(await can("service_role", signature)).toBe(false)
    expect((await rows<{ ok: boolean }>("select has_table_privilege('anon', 'public.quotes', 'SELECT') as ok"))[0].ok).toBe(false)
    const definition = (await rows<{ def: string }>("select pg_get_functiondef('admin_private.customer_action_command_core_v1(text,uuid,text,jsonb)'::regprocedure) as def"))[0].def
    expect(definition).toContain("customer_commercial_apply_v1")
    const wrapper = (await rows<{ def: string }>("select pg_get_functiondef('public.customer_action_command_v1(text,uuid,text,jsonb)'::regprocedure) as def"))[0].def
    expect(wrapper).toContain("customer_action_command_core_v1")
  })
})
