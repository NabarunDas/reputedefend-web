/**
 * Parity between the eight reads UX-1 composed and the one UX-3 projects.
 *
 * The point of UX-3 is that nothing an operator sees should change. The only
 * way to show that is to run both readings against the same database and
 * compare, so this test keeps the UX-1 composition alive as a reference
 * implementation — copied from the loader as it stood at UX-2's merge — and
 * drives it from the same eight RPCs, which are all still in the chain. The
 * projected facts are then narrowed by the production code and both trees go
 * through the same unchanged resolver.
 *
 * Three differences are expected and are asserted as improvements rather than
 * tolerated as drift: `commercial.complete` and `complaints.complete` become
 * authoritative because the projection is case-scoped instead of filtered out
 * of a hundred-row page, and `reopened` becomes exact because it is an
 * existence check over the whole history rather than a scan of the most recent
 * events. Everything else must match exactly.
 *
 * Nothing here touches a remote database.
 */

import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { createHash, randomBytes } from "node:crypto"
import { applyChain, preparePlatform } from "../recovery/harness"
import { narrowCaseFlowFacts, requiredCase } from "./projection"
import { resolveCaseFlow } from "./resolve"
import type {
  CaseFlowCapabilityFact,
  CaseFlowCustomerActionFact,
  CaseFlowEvidenceVersionFact,
  CaseFlowFacts,
  CaseServiceTrack,
} from "./model"

const db = new PGlite()

const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const token = "a".repeat(64)

/** Guided, assessed, quote accepted, order raised, evidence in. */
const guided = "55555555-5555-4555-8555-555555555555"
/** Untouched: nothing has happened to it but its creation. */
const fresh = "66666666-6666-4666-8666-666666666666"
/** Managed, closed, then reopened, with an authorisation in review. */
const reopened = "77777777-7777-4777-8777-777777777777"
/** Waiting on the customer, with an open complaint and an overdue task. */
const waiting = "99999999-9999-4999-8999-999999999999"
/** Managed, success fee, payment set up, waiting on the outcome. */
const managed = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

const NOW = "2026-06-15T12:00:00.000Z"

/** Fixed, so parity is about the facts and not about the deployment. */
const capabilities: CaseFlowCapabilityFact = {
  liveMailEnabled: false,
  paymentsEnabled: true,
  googleSubmissionLive: false,
}

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number }

const key = () => crypto.randomUUID()
const hashOf = (value: string) => createHash("sha256").update(value).digest("hex")
const secretHash = () => hashOf(randomBytes(32).toString("hex"))

async function rpc<T>(name: string, args: unknown[]): Promise<T> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",")
  const result = await db.query<{ value: T }>(`select public.${name}(${placeholders}) as value`, args)
  return result.rows[0].value
}

// ---------------------------------------------------------------------------
// The UX-1 reading, kept as a reference implementation
// ---------------------------------------------------------------------------

/** The quote list is capped, so an empty case-filtered result proves nothing. */
const QUOTE_PAGE_SIZE = 100
const COMPLAINT_PAGE_SIZE = 100

const isUuidish = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function serviceTrack(value: string): CaseServiceTrack {
  return value === "GUIDED" || value === "MANAGED" ? value : "UNDECIDED"
}

function openComplaintsFor(payload: unknown, caseId: string): CaseFlowFacts["complaints"] {
  const rows = (payload as { rows?: unknown })?.rows
  if (!Array.isArray(rows)) return { complete: false, open: [] }
  const open: Array<{ id: string; dueAt: string | null }> = []
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue
    const entry = row as { id?: unknown; caseId?: unknown; dueAt?: unknown }
    if (entry.caseId !== caseId || typeof entry.id !== "string" || !isUuidish(entry.id)) continue
    open.push({ id: entry.id, dueAt: typeof entry.dueAt === "string" ? entry.dueAt : null })
  }
  return { complete: open.length > 0 || rows.length < COMPLAINT_PAGE_SIZE, open }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Verbatim UX-1: eight reads composed into one fact tree. */
async function legacyFacts(caseId: string): Promise<CaseFlowFacts> {
  const detail = await rpc<any>("admin_case_detail_v1", [token, caseId, null])
  const [authorization, evidence, packs, communications, quotes, money, complaints] = await Promise.all([
    rpc<any>("admin_case_authorization_v1", [token, caseId]),
    rpc<any>("admin_evidence_case_v1", [token, caseId]),
    rpc<any>("admin_prepared_pack_case_v1", [token, caseId]),
    rpc<any>("admin_communication_list_v1", [token, caseId]),
    rpc<any>("admin_quote_list_v1", [token, null, null]),
    rpc<any>("admin_payment_list_v1", [token]),
    rpc<any>("admin_complaint_list_v1", [token, "open"]),
  ])

  const agreementKindById = new Map<string, string>(
    authorization.agreements.map((entry: any) => [entry.id, entry.kind]),
  )
  const customerActions: CaseFlowCustomerActionFact[] = authorization.actions.map((action: any) => ({
    id: action.id,
    kind: action.kind,
    agreementKind: action.agreementVersionId ? agreementKindById.get(action.agreementVersionId) ?? null : null,
    status: action.status,
    expiresAt: action.expiresAt,
  }))

  const versions: CaseFlowEvidenceVersionFact[] = evidence.documents.flatMap((document: any) =>
    document.versions.map((version: any) => ({
      documentId: document.id,
      versionId: version.id,
      evidenceRequestId: document.evidenceRequestId,
      uploadStatus: version.uploadStatus,
      scanStatus: version.scanStatus,
      validationStatus: version.validationStatus,
      reviewStatus: version.reviewStatus,
    })),
  )

  const caseQuotes = quotes.quotes.filter((quote: any) => quote.caseId === caseId)
  const caseOrders = money.orders.filter((order: any) => order.caseId === caseId)

  return {
    caseId: detail.id,
    reference: detail.reference,
    caseType: detail.type,
    technicalStage: detail.stage,
    caseStatus: detail.status,
    serviceTrack: serviceTrack(detail.track),
    outcome: detail.outcome,
    outcomeSummary: detail.summary,
    customerId: detail.customerId || null,
    businessId: detail.businessId || null,
    locationId: detail.locationId || null,
    plannedNextAction: detail.nextAction,
    plannedNextActionDueAt: detail.due,
    allowedTransitions: detail.transitions,
    reopened: detail.events.some((event: any) => event.event === "reopen"),
    tasks: detail.tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      owner: task.owner === "CUSTOMER" ? "CUSTOMER" : "ADMIN",
      kind: task.kind,
      status: task.status,
      dueAt: task.due,
    })),
    submissions: detail.submissions.map((submission: any) => ({
      id: submission.id,
      actor: submission.actor,
      submittedAt: submission.submittedAt,
      result: submission.result,
    })),
    authorization: {
      membershipStatus: authorization.membershipStatus,
      customerEmailVerified: authorization.readiness.customerEmailVerified,
      businessAuthorityVerified: authorization.readiness.businessAuthorityVerified,
      serviceAgreementAccepted: authorization.readiness.serviceAgreementAccepted,
      caseManagementPermissionActive: authorization.readiness.caseManagementPermissionActive,
      managerAccessVerified: authorization.readiness.managerAccessVerified,
      authorizationReady: authorization.readiness.authorizationReady,
      reviewRequired: authorization.authorizations
        .filter((record: any) => record.status === "REVIEW_REQUIRED")
        .map((record: any) => record.kind),
      agreementKinds: [...new Set<string>(authorization.agreements.map((entry: any) => entry.kind))],
      hasLocation: !!authorization.locationId,
    },
    customerActions,
    evidence: {
      requests: evidence.requests.map((request: any) => ({
        id: request.id,
        status: request.status,
        dueAt: request.dueAt,
        createdAt: request.createdAt,
      })),
      versions,
    },
    packs: {
      packs: packs.packs.map((pack: any) => ({
        id: pack.id,
        packNumber: pack.packNumber,
        status: pack.status,
        published: !!pack.published,
        everPublished: !!pack.publishedAt,
        itemCount: pack.items.length,
      })),
      eligibleCount: packs.eligible.length,
    },
    commercial: {
      complete: caseQuotes.length > 0 || quotes.quotes.length < QUOTE_PAGE_SIZE,
      quotes: caseQuotes.map((quote: any) => ({
        id: quote.id,
        status: quote.status,
        taxBehaviour: quote.currentVersion.taxBehaviour,
        validUntil: quote.currentVersion.validUntil,
        actionStatus: quote.action?.status ?? null,
        actionExpiresAt: quote.action?.expiresAt ?? null,
        orderId: quote.orderId,
      })),
    },
    payment: {
      complete: true,
      orders: caseOrders.map((order: any) => ({
        orderId: order.orderId,
        paymentModel: order.paymentModel,
        orderState: order.orderState,
        obligationKind: order.obligationKind,
        obligationState: order.obligationState,
        setupReady: order.setupReady,
        consentRecorded: !!order.consentId,
        receiptRecorded: !!order.receiptId,
      })),
    },
    communications: communications.communications.map((row: any) => ({
      id: row.id,
      templateKey: row.templateKey,
      lifecycle: row.lifecycle,
      deliveryStatus: row.deliveryStatus,
      legacyStatus: row.legacyStatus,
      draftedAt: row.draftedAt,
    })),
    complaints: openComplaintsFor(complaints, caseId),
    capabilities,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The UX-3 reading: one projection call, narrowed by the production code. */
async function projectedFacts(caseIds: string[]): Promise<Map<string, CaseFlowFacts>> {
  const payload = (await db.query<{ value: unknown }>(
    "select public.admin_case_flow_facts_v1($1, $2::uuid[]) as value", [token, caseIds],
  )).rows[0].value
  return narrowCaseFlowFacts(payload, caseIds, capabilities)
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

async function priceId(serviceCode: string): Promise<string> {
  return (await db.query<{ id: string }>(
    "select id from public.price_versions where service_code=$1 and seed_key is not null", [serviceCode],
  )).rows[0].id
}

const inDays = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()

async function acceptedOrder(caseId: string, serviceCode: string): Promise<Json> {
  const quote = await rpc<Json>("admin_quote_command_v1", [token, key(), "create_draft", {
    customerId: customer, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions, Manager access and later collection are excluded.",
    validUntil: inDays(3),
    applyDiscount: false, priceVersionId: await priceId(serviceCode), serviceCode,
  }, null])
  await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax",
    { quoteId: quote.id, taxBehaviour: "NOT_APPLICABLE" }, quote.version])
  await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: quote.id }, quote.version! + 1])

  const raw = randomBytes(32).toString("hex")
  const action = await rpc<Json>("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", {
    quoteId: quote.id, expiresAt: inDays(2), secretHash: hashOf(raw),
  }, null])

  const pending = secretHash(), session = secretHash()
  await rpc("customer_action_exchange_v1", [action.id, hashOf(raw), pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])
  const accepted = await rpc<Json>("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted).toMatchObject({ status: "success" })
  return accepted
}

/**
 * The real Managed payment-setup path, as far as the business takes it before
 * an outcome: the customer accepts the quote, consents to a later charge and
 * completes a Stripe setup session, which saves a usable payment method. No
 * success-fee obligation is created here, and none should be: the obligation
 * only exists once a qualifying outcome has been approved by Admin, so
 * inventing one would be a fixture the application cannot reach.
 */
async function managedPaymentSetUp(orderId: string, suffix: string) {
  const secret = secretHash()
  const issued = await rpc<Json>("admin_payment_command_v1", [token, key(), "issue_managed_setup_action", {
    serviceOrderId: orderId, expiresAt: inDays(2), secretHash: secret,
  }, 1])
  expect(issued).toMatchObject({ status: "success" })

  const pending = secretHash(), session = secretHash()
  await rpc("customer_action_exchange_v1", [issued.id, secret, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])

  expect(await rpc<Json>("customer_payment_command_v1", [session, key(), "confirm_consent", { accepted: true }]))
    .toMatchObject({ status: "success" })
  const setup = await rpc<Json>("customer_payment_command_v1",
    [session, key(), "start_checkout", { idempotencyKey: key() }])
  expect(setup).toMatchObject({ status: "success", mode: "setup", amountMinor: 0 })

  await rpc("payment_ensure_customer_map_v1", [customer, `cus_${suffix}`])
  expect(await rpc<Json>("payment_apply_provider_event_v1",
    [`evt_${suffix}`, "setup_intent.succeeded", `seti_${suffix}`, {
      stripeCustomerId: `cus_${suffix}`, paymentMethodId: `pm_${suffix}`, usage: "off_session",
      brand: "visa", last4: "4242", expMonth: 12, expYear: 2031,
      serviceOrderId: orderId, customerId: customer, providerOperationId: setup.providerOperationId,
    }])).toMatchObject({ status: "success" })
}

const newCase = (id: string, track: string, stage: string, extra = "") => `
  insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,
    created_at,information_accurate_at,privacy_accepted_at,service_track,work_stage${extra ? "," + extra.split("=")[0] : ""})
  values('${id}','PROFILE_RECOVERY','${customer}','${business}','${location}','A suspended profile',
    '2026-01-01',now(),now(),'${track}','${stage}'${extra ? "," + extra.split("=").slice(1).join("=") : ""});`

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex Mercer','alex@example.com');
    insert into public.businesses(id,display_name) values('${business}','Mercer Bakery');
    insert into public.locations(id,business_id,country,location_name) values('${location}','${business}','UK','High Street');
    insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence)
      values('${customer}','${business}','verified',now(),'${uid}','Companies House match discussed on a live call.');
    insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence)
      values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.');
    ${newCase(guided, "GUIDED", "PREPARATION")}
    ${newCase(fresh, "UNDECIDED", "INITIAL_REVIEW")}
    ${newCase(waiting, "GUIDED", "EVIDENCE_COLLECTION")}
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,
      information_accurate_at,privacy_accepted_at,service_track,work_stage,status,outcome,closure_summary)
      values('${reopened}','PROFILE_RECOVERY','${customer}','${business}','${location}','Suspended again','2026-01-03',
        now(),now(),'MANAGED','FURTHER_REVIEW','UNDER_REVIEW','RESTORED','The profile was reinstated by Google.');
    insert into public.case_work_events(case_id,actor_id,event,note,visibility)
      values('${reopened}','${uid}','reopen','The customer reported the same suspension again.','INTERNAL');
    insert into public.evidence_requests(case_id,title,request_text,status,due_at,created_by)
      values('${waiting}','Proof of trading','Please send a recent utility bill for the premises.','OPEN',
        '2026-06-01T09:00:00Z','${uid}');
    insert into public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy)
      values('${waiting}','Chase the outstanding bill','CUSTOMER','FOLLOW_UP','2026-06-02T09:00:00Z',
        'Agreed on a call with the customer.','Europe/London','MANUAL_QUEUE');
    insert into public.complaints(customer_id,case_id,source,category,summary,status,due_at,created_by)
      values('${customer}','${waiting}','EMAIL','SERVICE','Progress has been slow.','OPEN','2026-06-20T09:00:00Z','${uid}');
    insert into public.communications(case_id,customer_id,business_id,communication_type,template_key,template_version,
      lifecycle,delivery_status,recipient,subject,body_text,author_id)
      values('${waiting}','${customer}','${business}','EVIDENCE_REQUEST','EVIDENCE_REQUEST',1,'DRAFT','NONE',
        'alex@example.com','Evidence for your case','We need one more document to continue.','${uid}');
  `)

  const document = (await db.query<{ id: string }>(
    "insert into public.case_documents(case_id,title,created_by) values($1,'Utility bill',$2) returning id",
    [guided, uid],
  )).rows[0].id
  const storageKey = `cases/${guided}/documents/${document}/versions/${crypto.randomUUID()}`
  const version = (await db.query<{ id: string }>(
    `insert into public.case_document_versions(document_id,version_number,original_filename,declared_content_type,
       declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by)
     values($1,1,'bill.pdf','application/pdf',1024,'evidence-bucket',$2,'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$3)
     returning id`,
    [document, storageKey, uid],
  )).rows[0].id
  const pack = (await db.query<{ id: string }>(
    "insert into public.case_prepared_packs(case_id,pack_number,status,created_by) values($1,1,'DRAFT',$2) returning id",
    [guided, uid],
  )).rows[0].id
  await db.query(
    `insert into public.case_prepared_pack_items(pack_id,document_id,version_id,position,document_title,
       original_filename,content_type,size_bytes,added_by)
     values($1,$2,$3,1,'Utility bill','bill.pdf','application/pdf',1024,$4)`,
    [pack, document, version, uid],
  )

  expect(await acceptedOrder(guided, "GUIDED_RELAUNCH")).toMatchObject({ orderState: "ACCEPTED_AWAITING_PAYMENT" })
}, 240000)

afterAll(async () => { await db.close() })

// ---------------------------------------------------------------------------

const cases: Array<[string, string]> = [
  ["a Guided case with an order, evidence and a pack", guided],
  ["a case nothing has happened to", fresh],
  ["a reopened Managed case", reopened],
  ["a case waiting on the customer, with a complaint", waiting],
]

describe("the same facts, read two ways", () => {
  it.each(cases)("projects %s exactly as the eight reads composed it", async (_name, caseId) => {
    const before = await legacyFacts(caseId)
    const after = requiredCase(await projectedFacts([caseId]), caseId)

    // The three deliberate improvements are compared separately below.
    const { commercial: oldCommercial, complaints: oldComplaints, reopened: _was, ...oldRest } = before
    const { commercial: newCommercial, complaints: newComplaints, reopened: _is, ...newRest } = after

    expect(newRest).toEqual(oldRest)
    expect(newCommercial.quotes).toEqual(oldCommercial.quotes)
    expect(newComplaints.open).toEqual(oldComplaints.open)
  })

  it.each(cases)("resolves %s to the same operator conclusions", async (_name, caseId) => {
    const before = resolveCaseFlow(await legacyFacts(caseId), NOW)
    const after = resolveCaseFlow(requiredCase(await projectedFacts([caseId]), caseId), NOW)

    expect(after.phase).toBe(before.phase)
    expect(after.phaseLabel).toBe(before.phaseLabel)
    expect(after.primaryAction).toEqual(before.primaryAction)
    expect(after.waitingOn).toBe(before.waitingOn)
    expect(after.blockers).toEqual(before.blockers)
    expect(after.attentionItems).toEqual(before.attentionItems)
    expect(after.prerequisites).toEqual(before.prerequisites)
    expect(after.progressSummary).toEqual(before.progressSummary)
    expect(after.caseComplete).toBe(before.caseComplete)
  })

  it("resolves a whole page of cases from one projection call to the same models", async () => {
    const ids = cases.map(([, caseId]) => caseId)
    const projected = await projectedFacts(ids)

    for (const caseId of ids) {
      expect(resolveCaseFlow(requiredCase(projected, caseId), NOW))
        .toEqual(resolveCaseFlow(await legacyFacts(caseId), NOW))
    }
  })
})

describe("the three facts UX-3 makes stronger", () => {
  it("knows a case has no complaint, rather than inferring it from a page that was not full", async () => {
    const projected = requiredCase(await projectedFacts([fresh]), fresh)
    expect(projected.complaints).toEqual({ complete: true, open: [] })
  })

  it("stays authoritative about a case that does have a quote and a complaint", async () => {
    expect(requiredCase(await projectedFacts([guided]), guided).commercial)
      .toMatchObject({ complete: true, quotes: [expect.objectContaining({ status: "ACCEPTED" })] })
    expect(requiredCase(await projectedFacts([waiting]), waiting).complaints)
      .toMatchObject({ complete: true, open: [expect.objectContaining({ id: expect.any(String) })] })
  })

  it("answers reopened from the whole history, not from the events the detail page happens to show", async () => {
    // Bury the reopen under more events than `admin_case_detail_v1` returns.
    for (let index = 0; index < 60; index += 1) {
      await db.query(
        "insert into public.case_work_events(case_id,actor_id,event,note,visibility) values($1,$2,'note',$3,'INTERNAL')",
        [reopened, uid, `Progress note number ${index + 1} on this case.`],
      )
    }
    expect((await legacyFacts(reopened)).reopened).toBe(false)
    expect(requiredCase(await projectedFacts([reopened]), reopened).reopened).toBe(true)

    // And the resolver now says so, which is the gap UX-1 recorded.
    expect(resolveCaseFlow(requiredCase(await projectedFacts([reopened]), reopened), NOW).reopened).toBe(true)
  })
})

/**
 * The fixture above is strongest around a Guided `UPFRONT` order, where an
 * obligation exists from the moment the quote is accepted. The Managed
 * `SUCCESS_FEE` path reaches the opposite shape — consent and a saved card but
 * no obligation and no receipt — and it is the shape most likely to expose a
 * difference between the payment joins the two readings make, so it gets its
 * own scenario.
 */
describe("a Managed success-fee order waiting on an outcome", () => {
  let orderId: string

  beforeAll(async () => {
    await db.exec(newCase(managed, "MANAGED", "PAYMENT_REQUIRED"))
    const accepted = await acceptedOrder(managed, "MANAGED_RELAUNCH")
    expect(accepted).toMatchObject({ orderState: "ACCEPTED_SUCCESS_FEE" })
    orderId = accepted.orderId as string
    await managedPaymentSetUp(orderId, "parityManaged")
  }, 240000)

  it("is in the pre-outcome state the business actually reaches", async () => {
    const counts = await db.query<{ obligations: number; receipts: number; approvals: number; usable: number }>(
      `select
         (select count(*) from public.payment_obligations where service_order_id=$1)::int as obligations,
         (select count(*) from public.payment_receipts where service_order_id=$1)::int as receipts,
         (select count(*) from public.success_fee_approvals where service_order_id=$1)::int as approvals,
         (select count(*) from public.saved_payment_methods where service_order_id=$1 and status='USABLE')::int as usable`,
      [orderId],
    )
    // No obligation and no receipt yet is correct, not a gap in the fixture:
    // the success fee is only owed once Admin approves a qualifying outcome.
    expect(counts.rows[0]).toEqual({ obligations: 0, receipts: 0, approvals: 0, usable: 1 })
  })

  it("composes the same payment facts from the payment list and from the projection", async () => {
    const before = await legacyFacts(managed)
    const after = requiredCase(await projectedFacts([managed]), managed)

    expect(after.payment).toEqual(before.payment)
    expect(after.payment.orders).toHaveLength(1)
    expect(after.payment.orders[0]).toEqual({
      orderId,
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentRecorded: true,
      receiptRecorded: false,
    })
  })

  it("projects the whole Managed case exactly as the eight reads composed it", async () => {
    const before = await legacyFacts(managed)
    const after = requiredCase(await projectedFacts([managed]), managed)

    const { commercial: oldCommercial, complaints: oldComplaints, reopened: _was, ...oldRest } = before
    const { commercial: newCommercial, complaints: newComplaints, reopened: _is, ...newRest } = after

    expect(newRest).toEqual(oldRest)
    expect(newCommercial.quotes).toEqual(oldCommercial.quotes)
    expect(newComplaints.open).toEqual(oldComplaints.open)
  })

  it("resolves to the same operator conclusions through the unchanged resolver", async () => {
    const before = resolveCaseFlow(await legacyFacts(managed), NOW)
    const after = resolveCaseFlow(requiredCase(await projectedFacts([managed]), managed), NOW)

    expect(after).toEqual(before)
  })
})

/**
 * Last, because it fills the global quote list and every reading above
 * depends on that list not being full.
 */
describe("once the global quote list is full", () => {
  /** Guided, at service selection, with no quote of its own. */
  const unquoted = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

  beforeAll(async () => {
    const price = await priceId("GUIDED_RELAUNCH")
    const filler = "88888888-8888-4888-8888-888888888888"
    await db.exec(newCase(filler, "UNDECIDED", "SERVICE_SELECTION"))
    await db.exec(newCase(unquoted, "GUIDED", "SERVICE_SELECTION"))
    const existing = (await rpc<{ quotes: unknown[] }>("admin_quote_list_v1", [token, null, null])).quotes.length
    for (let index = existing; index < 100; index += 1) {
      expect(await rpc<Json>("admin_quote_command_v1", [token, key(), "create_draft", {
        customerId: customer, businessId: business, caseId: filler, locationId: location,
        scope: "Prepare the agreed recovery pack for this location only.",
        exclusions: "Google decisions, Manager access and later collection are excluded.",
        validUntil: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
        applyDiscount: false, priceVersionId: price, serviceCode: "GUIDED_RELAUNCH",
      }, null])).toMatchObject({ status: "success" })
    }
    expect((await rpc<{ quotes: unknown[] }>("admin_quote_list_v1", [token, null, null])).quotes).toHaveLength(100)
  }, 240000)

  it("the old reading stops being sure a case has no quote, and the projection does not", async () => {
    const before = await legacyFacts(fresh)
    expect(before.commercial).toEqual({ complete: false, quotes: [] })

    const after = requiredCase(await projectedFacts([fresh]), fresh)
    expect(after.commercial).toEqual({ complete: true, quotes: [] })
  })

  it("stops asking the operator to confirm a commercial position that is already known", async () => {
    const asked = resolveCaseFlow(await legacyFacts(unquoted), NOW)
    const known = resolveCaseFlow(requiredCase(await projectedFacts([unquoted]), unquoted), NOW)

    // The old reading could not tell "no quote" from "quote off the end of the
    // page", so it asked the operator; the projection knows, so it says what
    // to do next instead.
    expect(asked.primaryAction?.id).toBe("CONFIRM_COMMERCIAL_STATE")
    expect(asked.blockers.map(blocker => blocker.code)).toContain("COMMERCIAL_STATE_UNKNOWN")

    expect(known.primaryAction?.id).toBe("CREATE_QUOTE")
    expect(known.blockers.map(blocker => blocker.code)).not.toContain("COMMERCIAL_STATE_UNKNOWN")
  })
})

describe("the resolver itself", () => {
  it("is still the pure UX-1 function, with no database of its own", async () => {
    const source = await import("node:fs/promises")
      .then(fs => fs.readFile(new URL("./resolve.ts", import.meta.url), "utf8"))
    expect(source).not.toContain("server-only")
    expect(source).not.toContain("admin_case_flow_facts_v1")
    expect(source).not.toMatch(/\bawait\b|\bbackend\(/)
  })
})
