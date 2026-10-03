import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, applyUpgrade, migrationSql, preparePlatform } from "../recovery/harness"

const appliedHead = "20261003125151"
const migration = "20261003154314_customer_portal_dashboard_cases_v1.sql"
const upgradedFiles = [
  migration,
  "20261003183002_customer_portal_case_workspace_v1.sql",
  "20261003194353_customer_portal_documents_evidence_v1.sql",
  "20261003204538_customer_portal_quotes_agreements_permissions_v1.sql",
  "20261003224746_customer_portal_payments_receipts_v1.sql",
].join(",")
const db = new PGlite()

const alex = "c10c0000-0000-4000-8000-0000000000a1"
const sam = "c10c0000-0000-4000-8000-0000000000b2"
const piper = "c10c0000-0000-4000-8000-0000000000c3"
const alexAuth = "c10c0000-0000-4000-8000-0000000000d4"
const samAuth = "c10c0000-0000-4000-8000-0000000000e5"
const piperAuth = "c10c0000-0000-4000-8000-0000000000f6"
const verifier = "c10c0000-0000-4000-8000-0000000000a7"
const business = "c10c0000-0000-4000-8000-000000000011"
const otherBusiness = "c10c0000-0000-4000-8000-000000000012"
const location = "c10c0000-0000-4000-8000-000000000021"
const otherLocation = "c10c0000-0000-4000-8000-000000000022"

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const secret = () => hash(randomUUID())

type Attention = { code: string; dueAt?: string | null; expiresAt?: string }
type CaseRow = {
  reference: string
  caseType: string
  serviceTrack: string
  businessName: string
  locationName: string | null
  status: string
  workStage: string
  submittedAt: string
  closedAt: string | null
  attentionItems: Attention[]
}
type Dashboard = {
  summary: { activeCases: number; attentionCases: number; previousCases: number }
  attentionCases: CaseRow[]
  recentCases: CaseRow[]
}
type CasePage = { cases: CaseRow[]; nextCursor: { submittedAt: string; reference: string } | null }

let alexSession = ""
let samSession = ""
let piperSession = ""

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function verify(customer: string, email: string) {
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1, 'email', $2, $3, 'Verified from a live call with the customer.')`,
    [customer, email, verifier],
  )
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", [email, pending])
  if (started.status !== "ok") throw new Error(`login did not start: ${started.status}`)
  const confirmed = await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(`otp confirm failed: ${confirmed.status}`)
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(`otp finish failed: ${finished.status}`)
  return sessionHash
}

async function insertCase(options: {
  id?: string
  reference: string
  customer?: string
  businessId?: string
  locationId?: string
  caseType?: string
  status?: string
  workStage?: string
  serviceTrack?: string
  submittedAt: string
  closedAt?: string | null
  issue?: string
  reviewUrl?: string | null
}) {
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, status, customer_id, business_id, location_id, issue_description, review_url,
      information_accurate_at, privacy_accepted_at, service_track, work_stage, submitted_at, closed_at, intake_snapshot
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now(), $10, $11, $12, $13, '{"marker":"ux-10c"}'::jsonb
    )`,
    [
      options.id ?? randomUUID(),
      options.reference,
      options.caseType ?? "PROFILE_RECOVERY",
      options.status ?? "UNDER_REVIEW",
      options.customer ?? alex,
      options.businessId ?? business,
      options.locationId ?? location,
      options.issue ?? "Synthetic issue kept inside the database.",
      options.reviewUrl ?? null,
      options.serviceTrack ?? "GUIDED",
      options.workStage ?? "EVIDENCE_COLLECTION",
      options.submittedAt,
      options.closedAt ?? null,
    ],
  )
}

async function offeredQuote(options: {
  caseId: string
  customer?: string
  serviceCode: string
  paymentModel: string
  quoteRef: string
}) {
  const snapshot = randomUUID()
  const quote = randomUUID()
  const version = randomUUID()
  const customer = options.customer ?? alex
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1, $2, 'NONE', 'UNKNOWN', 'NONE', 'UNPROVEN', $3, 'NONE', 0, 'NOT_QUALIFIED', 'SYNTHETIC_PORTAL', 9900, 0, 9900, $4, 'ADMIN_RECORDED')`,
    [snapshot, location, options.serviceCode, verifier],
  )
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1, $2, $3, $4, $5, $6, 'OFFERED', $7)`,
    [quote, options.quoteRef, customer, business, location, options.caseId, verifier],
  )
  const inserted = await db.query<{ id: string }>(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor, currency,
      discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1, $2, 1, 'OFFERED', $3, $4, $5, $6, $7, p.id, $8, $9,
      'Synthetic portal scope text for this test.', 'Synthetic portal exclusions text.', 'Synthetic portal success definition.',
      9900, 'NONE', 0, 0, 9900, 'UNCONFIRMED', 0, 9900, 'GBP', $10, now() + interval '30 days',
      'Synthetic portal payment timing statement.', 'Synthetic portal terms reference.', $11, now(), $11
    from public.price_versions p
    where p.service_code = $7 and p.status = 'APPROVED'
    order by p.effective_from
    limit 1
    returning id`,
    [version, quote, customer, business, location, options.caseId, options.serviceCode, options.serviceCode, options.paymentModel, snapshot, verifier],
  )
  if (!inserted.rows[0]) throw new Error(`no approved price for ${options.serviceCode}`)
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quote])
  return { quote, version }
}

async function action(options: {
  customer?: string
  caseId: string | null
  kind: string
  email?: string
  expires?: string
  agreementVersionId?: string
  quoteVersionId?: string
  evidenceRequestId?: string
  linkKeyVersion?: number
  serviceOrderId?: string
  paymentObligationId?: string
  paymentInvoiceId?: string
  guardCoverageId?: string
  authorizationId?: string
  locationId?: string | null
}) {
  const id = randomUUID()
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, agreement_version_id, quote_version_id, evidence_request_id,
      link_key_version, service_order_id, payment_obligation_id, payment_invoice_id, guard_coverage_id, authorization_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, coalesce($18::timestamptz, now() + interval '2 days'), $19
    )`,
    [
      id,
      options.customer ?? alex,
      business,
      options.locationId === undefined ? location : options.locationId,
      options.caseId,
      options.agreementVersionId ?? null,
      options.quoteVersionId ?? null,
      options.evidenceRequestId ?? null,
      options.linkKeyVersion ?? null,
      options.serviceOrderId ?? null,
      options.paymentObligationId ?? null,
      options.paymentInvoiceId ?? null,
      options.guardCoverageId ?? null,
      options.authorizationId ?? null,
      options.kind,
      secret(),
      options.email ?? "alex@example.com",
      options.expires ?? null,
      verifier,
    ],
  )
  return id
}

async function acceptOrder(options: {
  caseId: string
  version: string
  quote: string
  serviceCode: string
  paymentModel: "UPFRONT" | "SUCCESS_FEE" | "RECURRING_MONTHLY"
  orderRef: string
}) {
  const actionId = randomUUID()
  const acceptance = randomUUID()
  const order = randomUUID()
  const state = options.paymentModel === "UPFRONT"
    ? "ACCEPTED_AWAITING_PAYMENT"
    : options.paymentModel === "SUCCESS_FEE"
      ? "ACCEPTED_SUCCESS_FEE"
      : "ACCEPTED_RECURRING"
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, quote_version_id, kind, status, secret_hash,
      expected_email_snapshot, expires_at, created_by, completed_at
    ) values ($1, $2, $3, $4, $5, $6, 'QUOTE_ACCEPTANCE', 'COMPLETED', $7, 'alex@example.com', now() + interval '2 days', $8, now())`,
    [actionId, alex, business, location, options.caseId, options.version, secret(), verifier],
  )
  await db.query(
    `insert into public.quote_acceptances(
      id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
      total_amount_minor, currency, tax_behaviour, tax_amount_minor
    ) values ($1, $2, $3, $4, $5, 'alex@example.com', 9900, 'GBP', 'NOT_APPLICABLE', 0)`,
    [acceptance, options.quote, options.version, actionId, alexAuth],
  )
  await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [options.version])
  await db.query("update public.quotes set status = 'ACCEPTED' where id = $1", [options.quote])
  await db.query(
    `insert into public.service_orders(
      id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
      service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 9900, 'GBP', $11, 'NOT_APPLICABLE', 0, $12, now())`,
    [order, options.orderRef, options.quote, options.version, acceptance, alex, business, location, options.caseId, options.serviceCode, options.paymentModel, state],
  )
  return order
}

function collectKeys(value: unknown, found = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found)
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      found.add(key)
      collectKeys(child, found)
    }
  }
  return found
}

async function attentionFor(session: string, reference: string) {
  let beforeTime: string | null = null
  let beforeRef: string | null = null
  for (let page = 0; page < 5; page += 1) {
    const result: CasePage | null = await rpc<CasePage | null>("customer_portal_cases_v1", [session, "all", beforeTime, beforeRef])
    if (!result) return null
    const found = result.cases.find(item => item.reference === reference)
    if (found) return found.attentionItems
    if (!result.nextCursor) return null
    beforeTime = result.nextCursor.submittedAt
    beforeRef = result.nextCursor.reference
  }
  return null
}

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
      ('${samAuth}', 'sam@example.com', now()),
      ('${piperAuth}', 'piper@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com'),
      ('${piper}', 'Piper', 'piper@example.com');
    insert into public.businesses(id, display_name) values
      ('${business}', 'Harbour Bakery'),
      ('${otherBusiness}', 'Other Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${location}', '${business}', 'UK', 'High Street'),
      ('${otherLocation}', '${otherBusiness}', 'UK', 'Side Street');
  `)
  await verify(alex, "alex@example.com")
  await verify(sam, "sam@example.com")
  await verify(piper, "piper@example.com")
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1, $2, 'verified', now(), $3, 'Companies House match discussed on a live call.'),
            ($4, $2, 'verified', now(), $3, 'Companies House match discussed on a live call.')`,
    [alex, business, verifier, sam],
  )
  alexSession = await portalSession("alex@example.com", alexAuth)
  samSession = await portalSession("sam@example.com", samAuth)
  piperSession = await portalSession("piper@example.com", piperAuth)
}, 180000)

afterAll(async () => { await db.close() })

describe("customer portal dashboard migration", () => {
  it("adds functions only, with no new table or index", () => {
    const sql = migrationSql(migration)
    expect(sql).not.toMatch(/create table/i)
    expect(sql).not.toMatch(/create( unique)? index/i)
    expect(sql).toContain("customer_portal_case_attention_v1")
    expect(sql).toContain("presentation-only")
  })
})

describe("case ownership", () => {
  it("shows a customer only the cases they directly own", async () => {
    await insertCase({
      reference: "PR-26-ALEXA2",
      customer: alex,
      submittedAt: "2026-03-01T12:00:00Z",
      issue: "SENTINEL_ISSUE_SHOULD_NOT_LEAK",
      reviewUrl: "https://example.test/review-sentinel-should-not-leak",
    })
    await insertCase({
      reference: "PR-26-SAMBA2",
      customer: sam,
      submittedAt: "2026-03-02T12:00:00Z",
      issue: "SENTINEL_OTHER_CUSTOMER_ISSUE",
    })
    const alexPage = await rpc<CasePage>("customer_portal_cases_v1", [alexSession, "all", null, null])
    const samPage = await rpc<CasePage>("customer_portal_cases_v1", [samSession, "all", null, null])
    expect(alexPage.cases.map(item => item.reference)).toContain("PR-26-ALEXA2")
    expect(alexPage.cases.map(item => item.reference)).not.toContain("PR-26-SAMBA2")
    expect(samPage.cases.map(item => item.reference)).toEqual(["PR-26-SAMBA2"])
    expect(samPage.cases[0].businessName).toBe("Harbour Bakery")
    expect(samPage.cases[0].locationName).toBe("High Street")
    expect(alexPage.cases.find(item => item.reference === "PR-26-ALEXA2")?.submittedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    )
  })

  it("omits a case whose location does not belong to the case business", async () => {
    let inserted = true
    try {
      await insertCase({
        reference: "PR-26-MXBZZ2",
        customer: alex,
        businessId: business,
        locationId: otherLocation,
        submittedAt: "2026-03-03T12:00:00Z",
      })
    } catch {
      inserted = false
    }
    const page = await rpc<CasePage>("customer_portal_cases_v1", [alexSession, "all", null, null])
    expect(page.cases.map(item => item.reference)).not.toContain("PR-26-MXBZZ2")
    expect(inserted).toBe(true)
  })

  it("returns null for an invalid, expired, revoked, or identity-invalid session", async () => {
    expect(await rpc("customer_portal_dashboard_v1", [hash(token())])).toBeNull()
    expect(await rpc("customer_portal_cases_v1", [hash(token()), "all", null, null])).toBeNull()
    expect(await rpc("customer_portal_dashboard_v1", ["not-a-token"])).toBeNull()

    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now() - interval '2 hours', created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await rpc("customer_portal_dashboard_v1", [alexSession])).toBeNull()
    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now(), created_at = now(), expires_at = now() + interval '8 hours'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await rpc<Dashboard>("customer_portal_dashboard_v1", [alexSession])).not.toBeNull()

    await db.query(
      "update admin_private.customer_portal_sessions set revoked_at = now(), revocation_reason = 'sign_out' where token_hash = $1",
      [samSession],
    )
    expect(await rpc("customer_portal_cases_v1", [samSession, "active", null, null])).toBeNull()
    await db.query(
      "update admin_private.customer_portal_sessions set revoked_at = null, revocation_reason = '' where token_hash = $1",
      [samSession],
    )

    await db.query("update auth.users set email = 'moved@example.com' where id = $1", [alexAuth])
    expect(await rpc("customer_portal_dashboard_v1", [alexSession])).toBeNull()
    expect(await rpc("customer_portal_cases_v1", [alexSession, "all", null, null])).toBeNull()
    await db.query("update auth.users set email = 'alex@example.com' where id = $1", [alexAuth])
    expect(await rpc<Dashboard>("customer_portal_dashboard_v1", [alexSession])).not.toBeNull()
  })
})

describe("projection safety", () => {
  it("returns only the customer-safe case fields", async () => {
    const dashboard = await rpc<Dashboard>("customer_portal_dashboard_v1", [alexSession])
    const cases = await rpc<CasePage>("customer_portal_cases_v1", [alexSession, "all", null, null])
    const forbidden = [
      "customerId", "businessId", "locationId", "caseId", "id", "issueDescription", "intakeSnapshot", "reviewUrl",
      "priority", "priorityReason", "nextAction", "nextActionAt", "closureSummary", "secretHash", "expectedEmailSnapshot",
      "email", "authUserId", "storageBucket", "storageKey",
    ]
    for (const payload of [dashboard, cases]) {
      const keys = collectKeys(payload)
      for (const key of forbidden) expect(keys.has(key)).toBe(false)
    }
    const owned = cases.cases.find(item => item.reference === "PR-26-ALEXA2")
    expect(Object.keys(owned ?? {}).sort()).toEqual([
      "attentionItems", "businessName", "caseType", "closedAt", "locationName", "reference", "serviceTrack", "status", "submittedAt", "workStage",
    ])
    const serialised = JSON.stringify({ dashboard, cases })
    expect(serialised).not.toContain("SENTINEL_ISSUE_SHOULD_NOT_LEAK")
    expect(serialised).not.toContain("review-sentinel-should-not-leak")
    expect(serialised).not.toContain("alex@example.com")
  })
})

describe("customer attention", () => {
  async function caseWith(reference: string, track = "GUIDED") {
    const id = randomUUID()
    await insertCase({ id, reference, submittedAt: "2026-04-01T12:00:00Z", serviceTrack: track, status: "AWAITING_CUSTOMER", workStage: "PAYMENT_REQUIRED" })
    return id
  }

  it("maps a live matching quote and ignores expiry, the wrong email, and another customer", async () => {
    const caseId = await caseWith("PR-26-QTEAAA")
    const offered = await offeredQuote({ caseId, serviceCode: "GUIDED_RELAUNCH", paymentModel: "UPFRONT", quoteRef: "QT-26-AAAAA2" })
    await action({ caseId, kind: "QUOTE_ACCEPTANCE", quoteVersionId: offered.version })
    expect(await attentionFor(alexSession, "PR-26-QTEAAA")).toEqual([
      expect.objectContaining({ code: "QUOTE_ACCEPTANCE" }),
    ])

    const expiredCase = await caseWith("PR-26-QTEBBB")
    const expiredQuote = await offeredQuote({ caseId: expiredCase, serviceCode: "GUIDED_RELAUNCH", paymentModel: "UPFRONT", quoteRef: "QT-26-AAAAA3" })
    await action({ caseId: expiredCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: expiredQuote.version, expires: "2020-01-01T00:00:00Z" })
    expect(await attentionFor(alexSession, "PR-26-QTEBBB")).toEqual([])

    const wrongCase = await caseWith("PR-26-QTECCC")
    const wrongQuote = await offeredQuote({ caseId: wrongCase, serviceCode: "GUIDED_RELAUNCH", paymentModel: "UPFRONT", quoteRef: "QT-26-AAAAA4" })
    const wrongAction = await action({ caseId: wrongCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: wrongQuote.version })
    await db.exec("alter table public.customer_actions disable trigger customer_actions_protect")
    await db.query("update public.customer_actions set expected_email_snapshot = 'old@example.com' where id = $1", [wrongAction])
    await db.exec("alter table public.customer_actions enable trigger customer_actions_protect")
    expect(await attentionFor(alexSession, "PR-26-QTECCC")).toEqual([])

    const samCase = (await rows<{ id: string }>("select id from public.cases where public_ref = 'PR-26-SAMBA2'"))[0].id
    const samQuote = await offeredQuote({ caseId: samCase, customer: sam, serviceCode: "GUIDED_RELAUNCH", paymentModel: "UPFRONT", quoteRef: "QT-26-AAAAA5" })
    await action({ customer: sam, caseId: samCase, kind: "QUOTE_ACCEPTANCE", quoteVersionId: samQuote.version, email: "sam@example.com" })
    expect(await attentionFor(alexSession, "PR-26-SAMBA2")).toBeNull()
    expect((await attentionFor(samSession, "PR-26-SAMBA2"))?.map(item => item.code)).toEqual(["QUOTE_ACCEPTANCE"])
  })

  it("maps agreement kinds and does not expose the agreement text", async () => {
    const caseId = await caseWith("PR-26-AGREEA", "MANAGED")
    const service = randomUUID()
    const permission = randomUUID()
    await db.query(
      `insert into public.agreement_versions(
        id, case_id, customer_id, business_id, location_id, agreement_kind, version_number, title, body_text, scope_text, content_hash, created_by
      ) values
        ($1, $3, $4, $5, $6, 'SERVICE_AGREEMENT', 1, 'Service agreement', 'This agreement covers the ProfileRelaunch service.', 'This location only.', $7, $8),
        ($2, $3, $4, $5, $6, 'CASE_MANAGEMENT_PERMISSION', 1, 'Permission', 'This permission lets ProfileRelaunch manage the case.', 'This location only.', $9, $8)`,
      [service, permission, caseId, alex, business, location, hash("service"), verifier, hash("permission")],
    )
    await action({ caseId, kind: "AGREEMENT_ACCEPTANCE", agreementVersionId: service })
    await action({ caseId, kind: "AGREEMENT_ACCEPTANCE", agreementVersionId: permission })
    const items = await attentionFor(alexSession, "PR-26-AGREEA")
    expect(items?.map(item => item.code)).toEqual(["SERVICE_AGREEMENT", "CASE_PERMISSION"])
    expect(JSON.stringify(items)).not.toMatch(/Service agreement|This agreement covers|Permission/)
  })

  it("maps the four payment kinds", async () => {
    async function paidCase(reference: string, serviceCode: string, paymentModel: "UPFRONT" | "SUCCESS_FEE", quoteRef: string, orderRef: string) {
      const caseId = await caseWith(reference, paymentModel === "UPFRONT" ? "GUIDED" : "MANAGED")
      const offered = await offeredQuote({ caseId, serviceCode, paymentModel, quoteRef })
      const order = await acceptOrder({ caseId, version: offered.version, quote: offered.quote, serviceCode, paymentModel, orderRef })
      return { caseId, order }
    }
    const guided = await paidCase("PR-26-PAYAAA", "GUIDED_RELAUNCH", "UPFRONT", "QT-26-BBBBA2", "SO-26-BBBBA2")
    const upfront = randomUUID()
    await db.query(
      `insert into public.payment_obligations(
        id, service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state, amount_minor, currency, tax_behaviour, tax_amount_minor
      )
      select $1, $2, q.quote_id, q.quote_version_id, $3, $4, 'UPFRONT', 'DUE', 9900, 'GBP', 'NOT_APPLICABLE', 0
      from public.service_orders q where q.id = $2`,
      [upfront, guided.order, alex, guided.caseId],
    )
    await action({ caseId: guided.caseId, kind: "GUIDED_PAYMENT", serviceOrderId: guided.order, paymentObligationId: upfront })
    await action({ caseId: guided.caseId, kind: "PAYMENT_RECOVERY", serviceOrderId: guided.order, paymentObligationId: upfront })
    const invoice = randomUUID()
    const operation = randomUUID()
    await db.query(
      `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
       values ($1, $2, 'CREATE_INVOICE', 'INVOICE', $3, $4, $5, 'SUCCEEDED')`,
      [operation, randomUUID(), alex, guided.order, upfront],
    )
    await db.query(
      `insert into public.payment_invoices(
        id, obligation_id, service_order_id, customer_id, provider_operation_id, amount_minor, currency, tax_behaviour, tax_amount_minor, status
      ) values ($1, $2, $3, $4, $5, 9900, 'GBP', 'NOT_APPLICABLE', 0, 'ISSUED')`,
      [invoice, upfront, guided.order, alex, operation],
    )
    await action({ caseId: guided.caseId, kind: "INVOICE_PAYMENT", serviceOrderId: guided.order, paymentObligationId: upfront, paymentInvoiceId: invoice })
    const managed = await paidCase("PR-26-PAYBBB", "MANAGED_RELAUNCH", "SUCCESS_FEE", "QT-26-BBBBB3", "SO-26-BBBBB3")
    await action({ caseId: managed.caseId, kind: "MANAGED_PAYMENT_SETUP", serviceOrderId: managed.order })
    expect((await attentionFor(alexSession, "PR-26-PAYAAA"))?.map(item => item.code)).toEqual([
      "GUIDED_PAYMENT", "PAYMENT_RECOVERY", "INVOICE_PAYMENT",
    ])
    expect((await attentionFor(alexSession, "PR-26-PAYBBB"))?.map(item => item.code)).toEqual(["MANAGED_PAYMENT_SETUP"])
  })

  it("does not treat access, revocation, or Guard actions as case attention", async () => {
    const accessCase = await caseWith("PR-26-ACCESS")
    await action({ caseId: accessCase, kind: "CASE_ACCESS" })
    expect(await attentionFor(alexSession, "PR-26-ACCESS")).toEqual([])

    const revocationCase = await caseWith("PR-26-REVKEA", "MANAGED")
    const agreement = randomUUID()
    const authorization = randomUUID()
    await db.query(
      `insert into public.agreement_versions(
        id, case_id, customer_id, business_id, location_id, agreement_kind, version_number, title, body_text, scope_text, content_hash, created_by
      ) values ($1, $2, $3, $4, $5, 'SERVICE_AGREEMENT', 1, 'Service agreement', 'This agreement covers the ProfileRelaunch service.', 'This location only.', $6, $7)`,
      [agreement, revocationCase, alex, business, location, hash("revoke-agreement"), verifier],
    )
    await db.query(
      `insert into public.authorization_records(
        id, agreement_version_id, case_id, customer_id, business_id, location_id, authorization_kind, status,
        accepted_by_auth_user_id, accepted_email_snapshot, accepted_at, source
      ) values ($1, $2, $3, $4, $5, $6, 'SERVICE_AGREEMENT', 'ACTIVE', $7, 'alex@example.com', now(), 'CUSTOMER_OTP')`,
      [authorization, agreement, revocationCase, alex, business, location, alexAuth],
    )
    await action({ caseId: revocationCase, kind: "AUTHORIZATION_REVOCATION", authorizationId: authorization })
    expect(await attentionFor(alexSession, "PR-26-REVKEA")).toEqual([])

    const guardCase = await caseWith("PR-26-GUARDA")
    const offered = await offeredQuote({ caseId: guardCase, serviceCode: "RELAUNCH_GUARD", paymentModel: "RECURRING_MONTHLY", quoteRef: "QT-26-CCCCC2" })
    const order = await acceptOrder({
      caseId: guardCase, version: offered.version, quote: offered.quote, serviceCode: "RELAUNCH_GUARD",
      paymentModel: "RECURRING_MONTHLY", orderRef: "SO-26-CCCCC2",
    })
    const coverage = randomUUID()
    await db.query(
      `insert into public.guard_coverages(id, customer_id, business_id, location_id, service_order_id, coverage_basis, coverage_origin, state)
       values ($1, $2, $3, $4, $5, 'DIRECT_GUARD', 'DIRECT_GUARD', 'REQUESTED')`,
      [coverage, alex, business, location, order],
    )
    await action({ caseId: null, kind: "GUARD_PERMISSION", guardCoverageId: coverage })
    expect(await attentionFor(alexSession, "PR-26-GUARDA")).toEqual([])
    const dashboard = await rpc<Dashboard>("customer_portal_dashboard_v1", [alexSession])
    expect(JSON.stringify(dashboard)).not.toMatch(/GUARD_/)
  })
})

describe("evidence attention", () => {
  async function request(caseId: string, due = true) {
    const id = randomUUID()
    await db.query(
      `insert into public.evidence_requests(id, case_id, title, request_text, status, due_at, created_by)
       values ($1, $2, 'Proof of control', 'Upload the document that shows control of the profile.', 'OPEN', $3, $4)`,
      [id, caseId, due ? "2026-10-08T12:00:00Z" : null, verifier],
    )
    return id
  }

  it("requires a current communication link for that exact request and drops it after upload", async () => {
    const bare = randomUUID()
    await insertCase({ id: bare, reference: "PR-26-EVAAA2", submittedAt: "2026-05-01T12:00:00Z", status: "AWAITING_CUSTOMER", workStage: "EVIDENCE_COLLECTION" })
    await request(bare)
    expect(await attentionFor(alexSession, "PR-26-EVAAA2")).toEqual([])

    const ready = randomUUID()
    await insertCase({ id: ready, reference: "PR-26-EVBBB2", submittedAt: "2026-05-02T12:00:00Z", status: "AWAITING_CUSTOMER", workStage: "EVIDENCE_COLLECTION" })
    const readyRequest = await request(ready)
    await action({ caseId: ready, kind: "COMMUNICATION_ACCESS", evidenceRequestId: readyRequest, linkKeyVersion: 1 })
    const readyItems = await attentionFor(alexSession, "PR-26-EVBBB2")
    expect(readyItems).toEqual([expect.objectContaining({ code: "EVIDENCE_REQUIRED" })])
    expect(readyItems?.[0].dueAt).toBeTruthy()
    expect(readyItems?.[0]).not.toHaveProperty("expiresAt")

    const expired = randomUUID()
    await insertCase({ id: expired, reference: "PR-26-EVCCC2", submittedAt: "2026-05-03T12:00:00Z" })
    const expiredRequest = await request(expired)
    await action({ caseId: expired, kind: "COMMUNICATION_ACCESS", evidenceRequestId: expiredRequest, linkKeyVersion: 1, expires: "2020-01-01T00:00:00Z" })
    expect(await attentionFor(alexSession, "PR-26-EVCCC2")).toEqual([])

    const other = randomUUID()
    await insertCase({ id: other, reference: "PR-26-EVDDD2", submittedAt: "2026-05-04T12:00:00Z" })
    const first = await request(other)
    const second = await request(other, false)
    await action({ caseId: other, kind: "COMMUNICATION_ACCESS", evidenceRequestId: second, linkKeyVersion: 1 })
    const otherItems = await attentionFor(alexSession, "PR-26-EVDDD2")
    expect(otherItems).toHaveLength(1)
    expect(otherItems?.[0].code).toBe("EVIDENCE_REQUIRED")
    expect(otherItems?.[0].dueAt ?? null).toBeNull()
    expect(first).not.toBe(second)

    const uploaded = randomUUID()
    await insertCase({ id: uploaded, reference: "PR-26-EVEEE2", submittedAt: "2026-05-05T12:00:00Z" })
    const uploadedRequest = await request(uploaded)
    const uploadedAction = await action({ caseId: uploaded, kind: "COMMUNICATION_ACCESS", evidenceRequestId: uploadedRequest, linkKeyVersion: 1 })
    expect((await attentionFor(alexSession, "PR-26-EVEEE2"))?.map(item => item.code)).toEqual(["EVIDENCE_REQUIRED"])
    const documentId = randomUUID()
    const versionId = randomUUID()
    await db.query(
      `insert into public.case_documents(id, case_id, evidence_request_id, title, created_by)
       values ($1, $2, $3, 'Customer upload', $4)`,
      [documentId, uploaded, uploadedRequest, verifier],
    )
    await db.query(
      `insert into public.case_document_versions(
        id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
        storage_bucket, storage_key, upload_status, submission_source, customer_action_id, customer_evidence_request_id, created_by
      ) values (
        $1, $2, 1, 'proof.pdf', 'application/pdf', 1024, 'evidence-bucket', $3, 'UPLOADED', 'CUSTOMER', $4, $5, $6
      )`,
      [versionId, documentId, `cases/${uploaded}/documents/${documentId}/versions/${versionId}`, uploadedAction, uploadedRequest, verifier],
    )
    expect(await attentionFor(alexSession, "PR-26-EVEEE2")).toEqual([])
  })

  it("returns no attention for a closed or cancelled case even when an open action remains", async () => {
    const closed = randomUUID()
    await insertCase({ id: closed, reference: "PR-26-CLSD22", submittedAt: "2026-02-01T12:00:00Z", status: "UNDER_REVIEW" })
    const offered = await offeredQuote({ caseId: closed, serviceCode: "GUIDED_RELAUNCH", paymentModel: "UPFRONT", quoteRef: "QT-26-DDDDD2" })
    await action({ caseId: closed, kind: "QUOTE_ACCEPTANCE", quoteVersionId: offered.version })
    await db.query("update public.cases set status = 'CLOSED', work_stage = 'FINISHED', closed_at = '2026-02-02T12:00:00Z' where id = $1", [closed])
    const closedRow = (await rpc<CasePage>("customer_portal_cases_v1", [alexSession, "previous", null, null])).cases.find(item => item.reference === "PR-26-CLSD22")
    expect(closedRow?.attentionItems).toEqual([])
    expect(closedRow?.status).toBe("CLOSED")

    const cancelled = randomUUID()
    await insertCase({ id: cancelled, reference: "PR-26-CANCL2", submittedAt: "2026-02-03T12:00:00Z", status: "CANCELLED", workStage: "FINISHED", closedAt: "2026-02-04T12:00:00Z" })
    const cancelledRow = (await rpc<CasePage>("customer_portal_cases_v1", [alexSession, "previous", null, null])).cases.find(item => item.reference === "PR-26-CANCL2")
    expect(cancelledRow?.attentionItems).toEqual([])
    expect(cancelledRow?.status).toBe("CANCELLED")
  })
})

describe("cases pagination", () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

  function reference(index: number) {
    let value = index
    let body = ""
    for (let digit = 0; digit < 6; digit += 1) {
      body = alphabet[value % alphabet.length] + body
      value = Math.floor(value / alphabet.length)
    }
    return `PR-26-${body}`
  }

  it("pages 20 rows with a public reference cursor and keeps the filters apart", async () => {
    const expected: { reference: string; submittedAt: string; status: string }[] = []
    for (let index = 0; index < 22; index += 1) {
      const submittedAt = new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString()
      const ref = reference(index + 1)
      await insertCase({
        reference: ref,
        customer: piper,
        submittedAt,
        status: "RECEIVED",
        workStage: "INITIAL_REVIEW",
        serviceTrack: "UNDECIDED",
      })
      expected.push({ reference: ref, submittedAt, status: "RECEIVED" })
    }
    await insertCase({
      reference: "PR-26-ZZZZZ2",
      customer: piper,
      submittedAt: "2026-06-01T00:00:00.000Z",
      status: "UNDER_REVIEW",
      workStage: "SUBMITTED",
    })
    await insertCase({
      reference: "PR-26-ZZZZZ9",
      customer: piper,
      submittedAt: "2026-06-01T00:00:00.000Z",
      status: "UNDER_REVIEW",
      workStage: "WAITING_GOOGLE",
    })
    await insertCase({
      reference: "PR-26-PREVA2",
      customer: piper,
      submittedAt: "2025-12-01T12:00:00Z",
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt: "2025-12-02T12:00:00Z",
    })
    await insertCase({
      reference: "RV-26-PREVB2",
      customer: piper,
      caseType: "REVIEW_PROTECTION",
      submittedAt: "2025-11-01T12:00:00Z",
      status: "CANCELLED",
      workStage: "FINISHED",
      closedAt: "2025-11-02T12:00:00Z",
    })

    const ranked = [
      ...expected,
      { reference: "PR-26-ZZZZZ9", submittedAt: "2026-06-01T00:00:00.000Z", status: "UNDER_REVIEW" },
      { reference: "PR-26-ZZZZZ2", submittedAt: "2026-06-01T00:00:00.000Z", status: "UNDER_REVIEW" },
    ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt) || right.reference.localeCompare(left.reference))

    const first = await rpc<CasePage>("customer_portal_cases_v1", [piperSession, "active", null, null])
    expect(first.cases).toHaveLength(20)
    expect(first.cases.map(item => item.reference)).toEqual(ranked.slice(0, 20).map(item => item.reference))
    expect(first.nextCursor).toEqual({ submittedAt: first.cases[19].submittedAt, reference: first.cases[19].reference })
    const tieIndex = first.cases.findIndex(item => item.reference === "PR-26-ZZZZZ9")
    expect(first.cases[tieIndex + 1].reference).toBe("PR-26-ZZZZZ2")

    const second = await rpc<CasePage>("customer_portal_cases_v1", [piperSession, "active", first.nextCursor?.submittedAt, first.nextCursor?.reference])
    expect(second.nextCursor).toBeNull()
    expect(second.cases.map(item => item.reference)).toEqual(ranked.slice(20).map(item => item.reference))
    const seen = new Set([...first.cases, ...second.cases].map(item => item.reference))
    expect(seen.size).toBe(ranked.length)
    expect(seen.has("PR-26-PREVA2")).toBe(false)

    const previous = await rpc<CasePage>("customer_portal_cases_v1", [piperSession, "previous", null, null])
    expect(previous.cases.map(item => item.reference)).toEqual(["PR-26-PREVA2", "RV-26-PREVB2"])
    expect(previous.nextCursor).toBeNull()
    const allFirst = await rpc<CasePage>("customer_portal_cases_v1", [piperSession, "all", null, null])
    const allSecond = await rpc<CasePage>("customer_portal_cases_v1", [piperSession, "all", allFirst.nextCursor?.submittedAt, allFirst.nextCursor?.reference])
    const allRefs = [...allFirst.cases, ...allSecond.cases].map(item => item.reference)
    expect(allRefs).toEqual([...ranked.map(item => item.reference), "PR-26-PREVA2", "RV-26-PREVB2"])

    const dashboard = await rpc<Dashboard>("customer_portal_dashboard_v1", [piperSession])
    expect(dashboard.summary).toEqual({ activeCases: ranked.length, attentionCases: 0, previousCases: 2 })
    expect(dashboard.recentCases.map(item => item.status)).toEqual(["UNDER_REVIEW", "UNDER_REVIEW", "RECEIVED"])
    expect(dashboard.attentionCases).toEqual([])

    await expect(rpc("customer_portal_cases_v1", [piperSession, "secret", null, null])).rejects.toThrow(/invalid customer portal cases view/)
    await expect(rpc("customer_portal_cases_v1", [piperSession, "active", "2026-01-01T00:00:00Z", null])).rejects.toThrow(/invalid customer portal cases cursor/)
    await expect(rpc("customer_portal_cases_v1", [piperSession, "active", null, "PR-26-AAAAAA"])).rejects.toThrow(/invalid customer portal cases cursor/)
    await expect(rpc("customer_portal_cases_v1", [piperSession, "active", "2026-01-01T00:00:00Z", "not-a-ref"])).rejects.toThrow(/invalid customer portal cases cursor/)
  })
})

describe("portal read privileges", () => {
  const wrappers = [
    "public.customer_portal_dashboard_v1(text)",
    "public.customer_portal_cases_v1(text,text,timestamptz,text)",
  ]
  const helper = "admin_private.customer_portal_case_attention_v1(uuid,text,uuid,timestamptz)"

  async function canExecute(role: string, signature: string) {
    return (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
  }

  it("lets service_role execute only the public wrappers", async () => {
    for (const signature of wrappers) {
      expect(await canExecute("public", signature)).toBe(false)
      expect(await canExecute("anon", signature)).toBe(false)
      expect(await canExecute("authenticated", signature)).toBe(false)
      expect(await canExecute("service_role", signature)).toBe(true)
    }
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(await canExecute(role, helper)).toBe(false)
    }
    await db.exec("set role service_role")
    try {
      await expect(db.query("select admin_private.customer_portal_case_attention_v1($1,$2,$3,now())", [alex, "alex@example.com", randomUUID()])).rejects.toThrow(/permission denied/)
      expect(await rpc("customer_portal_dashboard_v1", [hash("missing-session-token-value!!")])).toBeNull()
    } finally {
      await db.exec("reset role")
    }
  })
})
