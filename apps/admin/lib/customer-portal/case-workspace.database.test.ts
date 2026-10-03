import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, applyUpgrade, migrationSql, preparePlatform } from "../recovery/harness"

const appliedHead = "20261003154314"
const migration = "20261003183002_customer_portal_case_workspace_v1.sql"
const upgradedFiles = [
  migration,
  "20261003194353_customer_portal_documents_evidence_v1.sql",
  "20261003204538_customer_portal_quotes_agreements_permissions_v1.sql",
].join(",")
const db = new PGlite()

const alex = "c10d0000-0000-4000-8000-0000000000a1"
const sam = "c10d0000-0000-4000-8000-0000000000b2"
const alexAuth = "c10d0000-0000-4000-8000-0000000000d4"
const samAuth = "c10d0000-0000-4000-8000-0000000000e5"
const verifier = "c10d0000-0000-4000-8000-0000000000a7"
const business = "c10d0000-0000-4000-8000-000000000011"
const otherBusiness = "c10d0000-0000-4000-8000-000000000012"
const location = "c10d0000-0000-4000-8000-000000000021"
const otherLocation = "c10d0000-0000-4000-8000-000000000022"

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const secret = () => hash(randomUUID())

type TimelineEvent = { code: string; occurredAt: string }
type CaseDetail = {
  found: true
  case: {
    reference: string
    caseType: string
    serviceTrack: string
    businessName: string
    locationName: string | null
    status: string
    workStage: string
    submittedAt: string
    closedAt: string | null
    attentionItems: { code: string }[]
    outcomeCode: string | null
  }
  timeline: TimelineEvent[]
  timelineTruncated: boolean
}

let alexSession = ""
let samSession = ""

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
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
  outcome?: string | null
}) {
  const id = options.id ?? randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, status, customer_id, business_id, location_id, issue_subtype, issue_description,
      review_url, source, information_accurate_at, privacy_accepted_at, service_track, work_stage, submitted_at,
      closed_at, outcome, intake_snapshot, closure_summary, priority, priority_reason, next_action, assigned
    ) values (
      $1,$2,$3,$4,$5,$6,$7,'LEAK-SUBTYPE','LEAK-ISSUE-DESCRIPTION','https://example.test/LEAK-REVIEW-URL','LEAK-SOURCE',
      now(), now(), $8, $9, $10, $11, $12, '{"leak":"LEAK-INTAKE"}'::jsonb, 'LEAK-CLOSURE-SUMMARY', 'HIGH',
      'LEAK-PRIORITY-REASON', 'LEAK-NEXT-ACTION', true
    )`,
    [
      id,
      options.reference,
      options.caseType ?? "PROFILE_RECOVERY",
      options.status ?? "UNDER_REVIEW",
      options.customer ?? alex,
      options.businessId ?? business,
      options.locationId ?? location,
      options.serviceTrack ?? "MANAGED",
      options.workStage ?? "PREPARATION",
      options.submittedAt,
      options.closedAt ?? null,
      options.outcome ?? null,
    ],
  )
  return id
}

async function offeredQuote(options: { caseId: string; customer?: string; quoteRef: string }) {
  const snapshot = randomUUID()
  const quote = randomUUID()
  const version = randomUUID()
  const customer = options.customer ?? alex
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN','GUIDED_RELAUNCH','NONE',0,'NOT_QUALIFIED','SYNTHETIC_PORTAL',9900,0,9900,$3,'ADMIN_RECORDED')`,
    [snapshot, location, verifier],
  )
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
    [quote, options.quoteRef, customer, business, location, options.caseId, verifier],
  )
  await db.query(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor, currency,
      discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1,$2,1,'OFFERED',$3,$4,$5,$6,'GUIDED_RELAUNCH', p.id, 'GUIDED_RELAUNCH', 'UPFRONT',
      'Synthetic portal scope text for this test.', 'Synthetic portal exclusions text.', 'Synthetic portal success definition.',
      9900, 'NONE', 0, 0, 9900, 'UNCONFIRMED', 0, 9900, 'GBP', $7, now() + interval '30 days',
      'Synthetic portal payment timing statement.', 'Synthetic portal terms reference.', $8, now(), $8
    from public.price_versions p
    where p.service_code = 'GUIDED_RELAUNCH' and p.status = 'APPROVED'
    order by p.effective_from limit 1`,
    [version, quote, customer, business, location, options.caseId, snapshot, verifier],
  )
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quote])
  return { quote, version }
}

async function acceptQuote(options: {
  caseId: string
  customer?: string
  authUser?: string
  email?: string
  quote: string
  version: string
  orderRef: string
  acceptedAt: string
}) {
  const customer = options.customer ?? alex
  const actionId = randomUUID()
  const acceptance = randomUUID()
  const order = randomUUID()
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, quote_version_id, kind, status, secret_hash,
      expected_email_snapshot, expires_at, created_by, completed_at
    ) values ($1,$2,$3,$4,$5,$6,'QUOTE_ACCEPTANCE','COMPLETED',$7,$8, now() + interval '2 days', $9, $10)`,
    [actionId, customer, business, location, options.caseId, options.version, secret(), options.email ?? "alex@example.com", verifier, options.acceptedAt],
  )
  await db.query(
    `insert into public.quote_acceptances(
      id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
      accepted_at, total_amount_minor, currency, tax_behaviour, tax_amount_minor
    ) values ($1,$2,$3,$4,$5,$6,$7,9900,'GBP','NOT_APPLICABLE',0)`,
    [acceptance, options.quote, options.version, actionId, options.authUser ?? alexAuth, options.email ?? "alex@example.com", options.acceptedAt],
  )
  await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [options.version])
  await db.query("update public.quotes set status = 'ACCEPTED' where id = $1", [options.quote])
  await db.query(
    `insert into public.service_orders(
      id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
      service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'GUIDED_RELAUNCH',9900,'GBP','UPFRONT','NOT_APPLICABLE',0,'ACCEPTED_AWAITING_PAYMENT',$10)`,
    [order, options.orderRef, options.quote, options.version, acceptance, customer, business, location, options.caseId, options.acceptedAt],
  )
  return order
}

async function receipt(options: { caseId: string; orderId: string; customer?: string; paidAt: string; quoteId: string; versionId: string }) {
  const customer = options.customer ?? alex
  const obligation = randomUUID()
  const operation = randomUUID()
  const attempt = randomUUID()
  const id = randomUUID()
  await db.query(
    `insert into public.payment_obligations(
      id, service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state, amount_minor, currency, tax_behaviour, tax_amount_minor
    ) values ($1,$2,$3,$4,$5,$6,'UPFRONT','PAID',9900,'GBP','NOT_APPLICABLE',0)`,
    [obligation, options.orderId, options.quoteId, options.versionId, customer, options.caseId],
  )
  await db.query(
    `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
     values ($1,$2,'CREATE_PAYMENT_INTENT','UPFRONT',$3,$4,$5,'SUCCEEDED')`,
    [operation, randomUUID(), customer, options.orderId, obligation],
  )
  await db.query(
    `insert into public.payment_attempts(
      id, obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency, stripe_payment_intent_id, succeeded_at
    ) values ($1,$2,$3,$4,1,'CHECKOUT','SUCCEEDED',9900,'GBP','pi_LEAKPAYMENT',$5)`,
    [attempt, obligation, options.orderId, operation, options.paidAt],
  )
  await db.query(
    `insert into public.payment_receipts(
      id, obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour,
      tax_amount_minor, stripe_payment_intent_id, stripe_charge_id, provider_receipt_url, paid_at
    ) values ($1,$2,$3,$4,$5,9900,'GBP','NOT_APPLICABLE',0,'pi_LEAKPAYMENT','ch_LEAKCHARGE','https://example.test/LEAK-RECEIPT',$6)`,
    [id, obligation, options.orderId, customer, attempt, options.paidAt],
  )
  return id
}

async function evidenceVersion(options: {
  caseId: string
  requestCaseId?: string
  source?: "CUSTOMER" | "ADMIN"
  uploadStatus?: string
  uploadedAt?: string | null
  reviewStatus?: string
  reviewedAt?: string | null
  filename?: string
  customer?: string
}) {
  const requestId = randomUUID()
  const requestCase = options.requestCaseId ?? options.caseId
  await db.query(
    `insert into public.evidence_requests(id, case_id, title, request_text, status, created_by)
     values ($1,$2,'Proof of control','Upload the document that shows control of the profile.','OPEN',$3)`,
    [requestId, requestCase, verifier],
  )
  let actionId: string | null = null
  if ((options.source ?? "CUSTOMER") === "CUSTOMER") {
    actionId = randomUUID()
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, evidence_request_id, link_key_version, kind, secret_hash,
        expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,$6,1,'COMMUNICATION_ACCESS',$7,$8, now() + interval '2 days', $9)`,
      [actionId, options.customer ?? alex, business, location, requestCase, requestId, secret(), options.customer === sam ? "sam@example.com" : "alex@example.com", verifier],
    )
  }
  const documentId = randomUUID()
  const versionId = randomUUID()
  await db.query(
    `insert into public.case_documents(id, case_id, evidence_request_id, title, created_by)
     values ($1,$2,$3,'Customer upload',$4)`,
    [documentId, options.caseId, requestCase === options.caseId ? requestId : null, verifier],
  )
  await db.query(
    `insert into public.case_document_versions(
      id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
      storage_bucket, storage_key, upload_status, review_status, uploaded_at, reviewed_at, submission_source,
      customer_action_id, customer_evidence_request_id, created_by
    ) values ($1,$2,1,$3,'application/pdf',1024,'evidence-bucket',$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      versionId,
      documentId,
      options.filename ?? "leak-proof.pdf",
      `cases/${options.caseId}/documents/${documentId}/versions/${versionId}`,
      options.uploadStatus ?? "UPLOADED",
      options.reviewStatus ?? "UNREVIEWED",
      options.uploadedAt ?? null,
      options.reviewedAt ?? null,
      options.source ?? "CUSTOMER",
      actionId,
      (options.source ?? "CUSTOMER") === "CUSTOMER" ? requestId : null,
      verifier,
    ],
  )
  return { requestId, versionId }
}

async function agreement(caseId: string, kind: "SERVICE_AGREEMENT" | "CASE_MANAGEMENT_PERMISSION", acceptedAt: string, revokedAt?: string) {
  const version = randomUUID()
  const authorization = randomUUID()
  await db.query(
    `insert into public.agreement_versions(
      id, case_id, customer_id, business_id, location_id, agreement_kind, version_number, title, body_text, scope_text, content_hash, created_by
    ) values ($1,$2,$3,$4,$5,$6,1,'Service text','This agreement covers the ProfileRelaunch service.','This location only.',$7,$8)`,
    [version, caseId, alex, business, location, kind, hash(`${kind}-${caseId}`), verifier],
  )
  await db.query(
    `insert into public.authorization_records(
      id, agreement_version_id, case_id, customer_id, business_id, location_id, authorization_kind, status,
      accepted_by_auth_user_id, accepted_email_snapshot, accepted_at, source
    ) values ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,'alex@example.com',$9,'CUSTOMER_OTP')`,
    [authorization, version, caseId, alex, business, location, kind, alexAuth, acceptedAt],
  )
  if (revokedAt) {
    await db.query(
      `update public.authorization_records
       set status = 'REVOKED', revoked_at = $2, revoked_by = $3, revocation_reason = 'LEAK-REVOCATION-REASON-TEXT'
       where id = $1`,
      [authorization, revokedAt, verifier],
    )
  }
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
      ('${samAuth}', 'sam@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com');
    insert into public.businesses(id, display_name) values
      ('${business}', 'Harbour Bakery'),
      ('${otherBusiness}', 'Other Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${location}', '${business}', 'UK', 'High Street'),
      ('${otherLocation}', '${otherBusiness}', 'UK', 'Side Street');
  `)
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email',$2,$3,'Verified from a live call with the customer.'),
            ($4,'email',$5,$3,'Verified from a live call with the customer.')`,
    [alex, "alex@example.com", verifier, sam, "sam@example.com"],
  )
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1,$2,'verified', now(), $3, 'Companies House match discussed on a live call.'),
            ($4,$2,'verified', now(), $3, 'Companies House match discussed on a live call.')`,
    [alex, business, verifier, sam],
  )
  const pendingAlex = hash(token())
  if ((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["alex@example.com", pendingAlex])).status !== "ok") throw new Error("alex login")
  if ((await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pendingAlex])).status !== "ok") throw new Error("alex otp")
  alexSession = hash(token())
  if ((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pendingAlex, alexSession, alexAuth, "alex@example.com"])).status !== "ok") throw new Error("alex finish")
  const pendingSam = hash(token())
  if ((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["sam@example.com", pendingSam])).status !== "ok") throw new Error("sam login")
  if ((await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pendingSam])).status !== "ok") throw new Error("sam otp")
  samSession = hash(token())
  if ((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pendingSam, samSession, samAuth, "sam@example.com"])).status !== "ok") throw new Error("sam finish")
}, 180000)

afterAll(async () => { await db.close() })

describe("customer case workspace migration", () => {
  it("adds the two functions and no table or index", () => {
    const sql = migrationSql(migration)
    expect(sql).not.toMatch(/create table/i)
    expect(sql).not.toMatch(/create( unique)? index/i)
    expect(sql).toContain("customer_portal_case_timeline_v1")
    expect(sql).toContain("customer_portal_case_v1")
    expect(sql).toContain("customer_portal_case_attention_v1")
    expect(sql).not.toMatch(/case_events/)
  })
})

describe("case workspace ownership", () => {
  it("returns one owned case and the same not-found object for every other reference", async () => {
    await insertCase({ reference: "PR-26-ALEXD2", submittedAt: "2026-03-01T12:00:00Z", locationId: location })
    await insertCase({ reference: "PR-26-SAMBD2", customer: sam, submittedAt: "2026-03-02T12:00:00Z", locationId: location })
    const owned = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-ALEXD2"])
    expect(owned.found).toBe(true)
    expect(owned.case.reference).toBe("PR-26-ALEXD2")
    expect(owned.case.businessName).toBe("Harbour Bakery")
    expect(owned.case.locationName).toBe("High Street")
    const missing = await rpc("customer_portal_case_v1", [alexSession, "PR-26-ZZZZZ9"])
    const other = await rpc("customer_portal_case_v1", [alexSession, "PR-26-SAMBD2"])
    expect(missing).toEqual({ found: false })
    expect(other).toEqual({ found: false })
    expect(JSON.stringify(missing)).toBe(JSON.stringify(other))
    expect(Object.keys(missing as object)).toEqual(["found"])

    let mismatched = true
    try {
      await insertCase({
        reference: "PR-26-MXBZZ2",
        businessId: business,
        locationId: otherLocation,
        submittedAt: "2026-03-03T12:00:00Z",
      })
    } catch {
      mismatched = false
    }
    expect(mismatched).toBe(true)
    // Alex and Sam are both verified members of Harbour Bakery. Membership
    // does not authorise Sam's case. A location from another business does
    // not authorise MXBZZ2 either.
    expect(await rpc("customer_portal_case_v1", [alexSession, "PR-26-MXBZZ2"])).toEqual({ found: false })
    expect(await rpc("customer_portal_case_v1", [samSession, "PR-26-ALEXD2"])).toEqual({ found: false })
  })

  it("returns null for an invalid, expired, revoked, or identity-invalid session", async () => {
    expect(await rpc("customer_portal_case_v1", [hash(token()), "PR-26-ALEXD2"])).toBeNull()
    expect(await rpc("customer_portal_case_v1", ["not-a-token", "PR-26-ALEXD2"])).toBeNull()
    expect(await rpc("customer_portal_case_v1", [alexSession, "not-a-ref"])).toEqual({ found: false })

    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now() - interval '2 hours', created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await rpc("customer_portal_case_v1", [alexSession, "PR-26-ALEXD2"])).toBeNull()
    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now(), created_at = now(), expires_at = now() + interval '8 hours'
       where token_hash = $1`,
      [alexSession],
    )

    await db.query(
      "update admin_private.customer_portal_sessions set revoked_at = now(), revocation_reason = 'sign_out' where token_hash = $1",
      [samSession],
    )
    expect(await rpc("customer_portal_case_v1", [samSession, "PR-26-SAMBD2"])).toBeNull()
    await db.query(
      "update admin_private.customer_portal_sessions set revoked_at = null, revocation_reason = '' where token_hash = $1",
      [samSession],
    )

    await db.query("update auth.users set email = 'moved@example.com' where id = $1", [alexAuth])
    expect(await rpc("customer_portal_case_v1", [alexSession, "PR-26-ALEXD2"])).toBeNull()
    await db.query("update auth.users set email = 'alex@example.com' where id = $1", [alexAuth])
    expect(await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-ALEXD2"])).toMatchObject({ found: true })
  })
})

describe("safe outcome", () => {
  it("returns only a recognised outcome for the case type", async () => {
    await insertCase({ reference: "PR-26-RSTAA2", submittedAt: "2026-04-01T12:00:00Z", status: "CLOSED", workStage: "FINISHED", closedAt: "2026-04-02T12:00:00Z", outcome: "RESTORED" })
    await insertCase({ reference: "RV-26-RMVBB2", caseType: "REVIEW_PROTECTION", submittedAt: "2026-04-03T12:00:00Z", status: "CLOSED", workStage: "FINISHED", closedAt: "2026-04-04T12:00:00Z", outcome: "REMOVED" })
    await insertCase({ reference: "PR-26-UNKCC2", submittedAt: "2026-04-05T12:00:00Z", status: "CLOSED", workStage: "FINISHED", closedAt: "2026-04-06T12:00:00Z", outcome: "LEAK-FREE-OUTCOME" })
    await insertCase({ reference: "PR-26-WRGDD2", submittedAt: "2026-04-07T12:00:00Z", outcome: "REMOVED" })
    await insertCase({ reference: "RV-26-WRGEE2", caseType: "REVIEW_PROTECTION", submittedAt: "2026-04-08T12:00:00Z", outcome: "RESTORED" })
    expect((await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-RSTAA2"])).case.outcomeCode).toBe("RESTORED")
    expect((await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "RV-26-RMVBB2"])).case.outcomeCode).toBe("REMOVED")
    const unexpected = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-UNKCC2"])
    expect(unexpected.case.outcomeCode).toBeNull()
    expect((await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-WRGDD2"])).case.outcomeCode).toBeNull()
    expect((await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "RV-26-WRGEE2"])).case.outcomeCode).toBeNull()
    expect(JSON.stringify(unexpected)).not.toContain("LEAK-FREE-OUTCOME")
  })
})

describe("curated timeline", () => {
  it("includes every allowed source and excludes the others", async () => {
    const caseId = await insertCase({
      reference: "PR-26-TMEAA2",
      submittedAt: "2026-01-01T12:00:00Z",
      status: "UNDER_REVIEW",
      workStage: "PREPARATION",
    })
    await db.query(
      `insert into public.case_events(case_id, event_type, actor_type, event_data)
       values ($1, 'INTERNAL_NOTE', 'ADMIN', '{"leak":"LEAK-EVENT-DATA"}'::jsonb)`,
      [caseId],
    )
    await evidenceVersion({ caseId, uploadedAt: "2026-01-02T12:00:00Z", reviewStatus: "ACCEPTED", reviewedAt: "2026-01-03T12:00:00Z" })
    await evidenceVersion({ caseId, source: "ADMIN", filename: "leak-admin.pdf", uploadedAt: "2026-01-02T13:00:00Z", reviewStatus: "ACCEPTED", reviewedAt: "2026-01-03T13:00:00Z" })
    const otherCase = await insertCase({ reference: "PR-26-XTHR22", submittedAt: "2026-01-01T10:00:00Z" })
    await evidenceVersion({ caseId: otherCase, uploadedAt: "2026-08-08T08:08:08.000Z" })
    const wrongRequest = await insertCase({ reference: "PR-26-REQAA2", submittedAt: "2026-01-01T09:00:00Z" })
    await evidenceVersion({ caseId, requestCaseId: wrongRequest, uploadedAt: "2026-08-09T08:08:08.000Z" })

    const quote = await offeredQuote({ caseId, quoteRef: "QT-26-TMEAA2" })
    const order = await acceptQuote({ caseId, quote: quote.quote, version: quote.version, orderRef: "SO-26-TMEAA2", acceptedAt: "2026-01-04T12:00:00Z" })
    const second = await offeredQuote({ caseId, quoteRef: "QT-26-TMEAA3" })
    const secondOrder = await acceptQuote({ caseId, quote: second.quote, version: second.version, orderRef: "SO-26-TMEAA3", acceptedAt: "2026-01-04T13:00:00Z" })
    await receipt({ caseId, orderId: order, quoteId: quote.quote, versionId: quote.version, paidAt: "2026-01-09T12:00:00Z" })
    await receipt({ caseId, orderId: secondOrder, quoteId: second.quote, versionId: second.version, paidAt: "2026-01-09T13:00:00Z" })

    const samCase = await insertCase({ reference: "PR-26-SAMCC2", customer: sam, submittedAt: "2026-01-01T08:00:00Z" })
    const samQuote = await offeredQuote({ caseId: samCase, customer: sam, quoteRef: "QT-26-SAMCC2" })
    const samOrder = await acceptQuote({
      caseId: samCase, customer: sam, authUser: samAuth, email: "sam@example.com",
      quote: samQuote.quote, version: samQuote.version, orderRef: "SO-26-SAMCC2", acceptedAt: "2026-06-06T06:06:06.000Z",
    })
    await receipt({ caseId: samCase, orderId: samOrder, customer: sam, quoteId: samQuote.quote, versionId: samQuote.version, paidAt: "2026-07-07T07:07:07.000Z" })

    await agreement(caseId, "SERVICE_AGREEMENT", "2026-01-05T12:00:00Z", "2026-01-07T12:00:00Z")
    await agreement(caseId, "CASE_MANAGEMENT_PERMISSION", "2026-01-06T12:00:00Z", "2026-01-08T12:00:00Z")

    const submission = randomUUID()
    const withdrawn = randomUUID()
    await db.query(
      `insert into public.case_submissions(id, case_id, actor, track, submitted_at, google_reference, channel, evidence, recorded_by)
       values ($1,$2,'ADMIN','MANAGED','2026-01-10T12:00:00Z','LEAK-GOOGLE-REF','Web form','Synthetic submission evidence text.',$3),
              ($4,$2,'ADMIN','MANAGED','2026-01-10T14:00:00Z','LEAK-WITHDRAWN-REF','Web form','Synthetic withdrawn submission text.',$3)`,
      [submission, caseId, verifier, withdrawn],
    )
    await db.query(
      `insert into public.case_submission_results(submission_id, result, note, recorded_by, created_at)
       values ($1,'DECIDED','LEAK-DECIDED-NOTE-TEXT',$3,'2026-01-11T12:00:00Z'),
              ($2,'WITHDRAWN','LEAK-WITHDRAWN-NOTE-TEXT',$3,'2026-01-11T15:00:00Z')`,
      [submission, withdrawn, verifier],
    )
    await db.query(
      "update public.cases set status = 'CLOSED', work_stage = 'FINISHED', closed_at = '2026-01-12T12:00:00Z', outcome = 'RESTORED' where id = $1",
      [caseId],
    )

    const result = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-TMEAA2"])
    expect(result.timeline.map(event => event.code)).toEqual([
      "CASE_COMPLETED",
      "GOOGLE_DECISION_RECORDED",
      "SUBMITTED_TO_GOOGLE",
      "SUBMITTED_TO_GOOGLE",
      "PAYMENT_RECEIVED",
      "PAYMENT_RECEIVED",
      "CASE_PERMISSION_WITHDRAWN",
      "SERVICE_AGREEMENT_WITHDRAWN",
      "CASE_PERMISSION_CONFIRMED",
      "SERVICE_AGREEMENT_ACCEPTED",
      "QUOTE_ACCEPTED",
      "QUOTE_ACCEPTED",
      "EVIDENCE_ACCEPTED",
      "EVIDENCE_SUBMITTED",
      "CASE_RECEIVED",
    ])
    expect(result.timelineTruncated).toBe(false)
    const serialised = JSON.stringify(result)
    for (const leak of [
      "LEAK-EVENT-DATA", "LEAK-ISSUE-DESCRIPTION", "LEAK-SUBTYPE", "LEAK-REVIEW-URL", "LEAK-SOURCE",
      "LEAK-INTAKE", "LEAK-CLOSURE-SUMMARY", "LEAK-PRIORITY-REASON", "LEAK-NEXT-ACTION", "LEAK-FREE-OUTCOME",
      "LEAK-GOOGLE-REF", "LEAK-WITHDRAWN-REF", "LEAK-DECIDED-NOTE-TEXT", "LEAK-WITHDRAWN-NOTE-TEXT",
      "LEAK-REVOCATION-REASON-TEXT", "LEAK-RECEIPT", "pi_LEAKPAYMENT", "ch_LEAKCHARGE", "leak-proof.pdf",
      "leak-admin.pdf", "alex@example.com", "2026-08-08", "2026-08-09", "2026-06-06", "2026-07-07",
    ]) {
      expect(serialised).not.toContain(leak)
    }
    expect(result.timeline.some(event => event.occurredAt.startsWith("2026-01-11T15"))).toBe(false)
    const keys = collectKeys(result)
    for (const key of [
      "id", "caseId", "customerId", "businessId", "locationId", "issueSubtype", "issueDescription", "reviewUrl",
      "intakeSnapshot", "priority", "priorityReason", "nextAction", "nextActionAt", "firstResponseDueAt",
      "workflowVersion", "assigned", "closureSummary", "source", "submissionKey", "email", "authUserId",
      "eventData", "note", "actor", "actorId", "recordedBy", "googleReference", "storageKey", "providerId",
    ]) {
      expect(keys.has(key)).toBe(false)
    }
    expect(Object.keys(result).sort()).toEqual(["case", "found", "timeline", "timelineTruncated"])
    expect(Object.keys(result.case).sort()).toEqual([
      "attentionItems", "businessName", "caseType", "closedAt", "locationName", "outcomeCode", "reference",
      "serviceTrack", "status", "submittedAt", "workStage",
    ])
    expect(Object.keys(result.timeline[0]).sort()).toEqual(["code", "occurredAt"])
    expect(serialised).not.toContain(caseId)
  })

  it("returns the newest 20 events and marks a longer timeline as truncated", async () => {
    const shortId = await insertCase({ reference: "PR-26-TRNCB2", submittedAt: "2026-02-01T00:00:00Z" })
    for (let index = 0; index < 19; index += 1) {
      const id = randomUUID()
      await db.query(
        `insert into public.case_submissions(id, case_id, actor, track, submitted_at, google_reference, channel, evidence, recorded_by)
         values ($1,$2,'ADMIN','GUIDED',$3,$4,'Web form','Synthetic submission evidence text.',$5)`,
        [id, shortId, new Date(Date.UTC(2026, 2, 1, 0, index, 0)).toISOString(), `SHORT-${index}-REF`, verifier],
      )
    }
    const short = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-TRNCB2"])
    expect(short.timeline).toHaveLength(20)
    expect(short.timelineTruncated).toBe(false)
    expect(short.timeline.at(-1)?.code).toBe("CASE_RECEIVED")

    const longId = await insertCase({ reference: "PR-26-TRNCA2", submittedAt: "2026-02-01T00:00:00Z" })
    const stamps: string[] = []
    for (let index = 0; index < 21; index += 1) {
      const id = randomUUID()
      const stamp = new Date(Date.UTC(2026, 3, 1, 0, index, 0)).toISOString()
      stamps.push(stamp)
      await db.query(
        `insert into public.case_submissions(id, case_id, actor, track, submitted_at, google_reference, channel, evidence, recorded_by)
         values ($1,$2,'ADMIN','GUIDED',$3,$4,'Web form','Synthetic submission evidence text.',$5)`,
        [id, longId, stamp, `LEAK-GREF-${index}`, verifier],
      )
    }
    const first = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-TRNCA2"])
    const second = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-TRNCA2"])
    expect(first.timeline).toHaveLength(20)
    expect(first.timelineTruncated).toBe(true)
    expect(first).toEqual(second)
    expect(first.timeline.map(event => event.code).every(code => code === "SUBMITTED_TO_GOOGLE")).toBe(true)
    expect(first.timeline.map(event => Date.parse(event.occurredAt))).toEqual([...stamps].reverse().slice(0, 20).map(stamp => Date.parse(stamp)))
    expect(new Set(first.timeline.map(event => event.occurredAt)).size).toBe(20)
    expect(JSON.stringify(first)).not.toContain("LEAK-GREF")
    expect(JSON.stringify(first)).not.toContain(longId)
    expect(first.timeline.some(event => event.code === "CASE_RECEIVED")).toBe(false)
  })
})

describe("attention stays the same as the case list", () => {
  it("reuses the dashboard attention codes for the open case and none after closure", async () => {
    const caseId = await insertCase({
      reference: "PR-26-ATTNA2",
      submittedAt: "2026-05-01T12:00:00Z",
      status: "AWAITING_CUSTOMER",
      workStage: "EVIDENCE_COLLECTION",
    })
    const requestId = randomUUID()
    await db.query(
      `insert into public.evidence_requests(id, case_id, title, request_text, status, due_at, created_by)
       values ($1,$2,'Proof of control','Upload the document that shows control of the profile.','OPEN','2026-10-08T12:00:00Z',$3)`,
      [requestId, caseId, verifier],
    )
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, evidence_request_id, link_key_version, kind, secret_hash,
        expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,$6,1,'COMMUNICATION_ACCESS',$7,'alex@example.com', now() + interval '2 days', $8)`,
      [randomUUID(), alex, business, location, caseId, requestId, secret(), verifier],
    )
    const detail = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-ATTNA2"])
    const listed = await rpc<{ cases: { reference: string; attentionItems: { code: string }[] }[] }>("customer_portal_cases_v1", [alexSession, "all", null, null])
    const match = listed.cases.find(item => item.reference === "PR-26-ATTNA2")
    expect(detail.case.attentionItems).toEqual(match?.attentionItems)
    expect(detail.case.attentionItems.map(item => item.code)).toEqual(["EVIDENCE_REQUIRED"])

    await db.query("update public.cases set status = 'CLOSED', work_stage = 'FINISHED', closed_at = '2026-05-02T12:00:00Z' where id = $1", [caseId])
    const closed = await rpc<CaseDetail>("customer_portal_case_v1", [alexSession, "PR-26-ATTNA2"])
    expect(closed.case.attentionItems).toEqual([])
    expect(closed.case.status).toBe("CLOSED")
  })
})

describe("case workspace privileges", () => {
  const wrapper = "public.customer_portal_case_v1(text,text)"
  const helper = "admin_private.customer_portal_case_timeline_v1(uuid,uuid)"

  async function canExecute(role: string, signature: string) {
    return (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
  }

  it("lets service_role execute only the public wrapper", async () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(await canExecute(role, wrapper)).toBe(false)
      expect(await canExecute(role, helper)).toBe(false)
    }
    expect(await canExecute("service_role", wrapper)).toBe(true)
    expect(await canExecute("service_role", helper)).toBe(false)
    await db.exec("set role service_role")
    try {
      await expect(db.query("select admin_private.customer_portal_case_timeline_v1($1,$2)", [randomUUID(), alex])).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec("reset role")
    }
  })
})
