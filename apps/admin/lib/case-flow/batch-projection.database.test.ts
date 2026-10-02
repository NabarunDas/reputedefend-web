/**
 * The UX-3 batch CaseFlow projection, against the complete migration chain.
 *
 * `admin_case_flow_facts_v1` is the one read the case queue makes, so what
 * matters is not that the SQL contains the right words but that it answers
 * the right facts for the right cases and nothing else. These tests therefore
 * execute the whole chain in PGlite through the recovery harness, build real
 * rows — quotes and orders through the actual commands, so no fixture invents
 * a state the application cannot reach — and call the function the way the
 * loader calls it.
 *
 * Two properties get the most attention. The first is isolation: every fact a
 * case receives must come from that case, which is what makes the commercial
 * and complaint completeness flags safe to assert. The second is the security
 * envelope — the session gate, the grants, the bounds, and the absence of
 * anything secret-bearing in the payload.
 *
 * Nothing here touches a remote database. The migration under test has not
 * been applied to profilerelaunch-dev.
 */

import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { createHash, randomBytes } from "node:crypto"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()

const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
/** The case every assertion is about. */
const subject = "55555555-5555-4555-8555-555555555555"
/** A second case carrying a copy of everything, to prove scoping. */
const other = "66666666-6666-4666-8666-666666666666"
/** A closed, reopened, Managed case with none of the above. */
const closed = "77777777-7777-4777-8777-777777777777"
const absent = "88888888-8888-4888-8888-888888888888"
const token = "a".repeat(64)

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number }

type Facts = {
  caseId: string
  reference: string
  caseType: string
  technicalStage: string
  caseStatus: string
  serviceTrack: string
  outcome: string | null
  outcomeSummary: string | null
  plannedNextAction: string | null
  reopened: boolean
  allowedTransitions: string[]
  tasks: Array<Record<string, unknown>>
  submissions: Array<Record<string, unknown>>
  authorization: Record<string, unknown>
  customerActions: Array<Record<string, unknown>>
  evidence: { requests: Array<Record<string, unknown>>; versions: Array<Record<string, unknown>> }
  packs: { packs: Array<Record<string, unknown>>; eligibleCount: number }
  commercial: { complete: boolean; quotes: Array<Record<string, unknown>> }
  payment: { complete: boolean; orders: Array<Record<string, unknown>> }
  communications: Array<Record<string, unknown>>
  complaints: { complete: boolean; open: Array<Record<string, unknown>> }
}

const key = () => crypto.randomUUID()
const hashOf = (value: string) => createHash("sha256").update(value).digest("hex")
const secretHash = () => hashOf(randomBytes(32).toString("hex"))

async function rpc(name: string, args: unknown[]): Promise<Json | null> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: Json | null }>(`select public.${name}(${placeholders}) as value`, args)).rows[0].value
}

async function project(ids: string[] | null, sessionToken = token): Promise<{ cases: Facts[] } | null> {
  const result = await db.query<{ value: { cases: Facts[] } | null }>(
    "select public.admin_case_flow_facts_v1($1, $2::uuid[]) as value",
    [sessionToken, ids],
  )
  return result.rows[0].value
}

async function factsFor(caseId: string): Promise<Facts> {
  const payload = await project([caseId])
  expect(payload?.cases).toHaveLength(1)
  return payload!.cases[0]
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** Everything one case can carry, so a second copy proves nothing leaks. */
async function populate(caseId: string, suffix: string) {
  await db.query(
    `insert into public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy)
     values($1,$2,'CUSTOMER','FOLLOW_UP','2026-06-10T09:00:00Z','Agreed on a call with the customer.','Europe/London','MANUAL_QUEUE')`,
    [caseId, `Chase the ${suffix} upload`],
  )
  await db.query(
    `insert into public.evidence_requests(case_id,title,request_text,status,due_at,created_by)
     values($1,$2,'Please send a recent utility bill for the premises.','OPEN','2026-06-12T09:00:00Z',$3)`,
    [caseId, `Proof of trading (${suffix})`, uid],
  )
  await db.query(
    `insert into public.complaints(customer_id,case_id,source,category,summary,status,due_at,created_by)
     values($1,$2,'EMAIL','SERVICE',$3,'OPEN','2026-06-20T09:00:00Z',$4)`,
    [customer, caseId, `The ${suffix} case has been slow to progress.`, uid],
  )
  await db.query(
    `insert into public.communications(case_id,customer_id,business_id,communication_type,template_key,template_version,
       lifecycle,delivery_status,recipient,subject,body_text,author_id)
     values($1,$2,$3,'EVIDENCE_REQUEST','EVIDENCE_REQUEST',1,'DRAFT','NONE','alex@example.com',$4,
       'We need one more document to continue.',$5)`,
    [caseId, customer, business, `Evidence for your ${suffix} case`, uid],
  )

  const document = (await db.query<{ id: string }>(
    "insert into public.case_documents(case_id,title,created_by) values($1,$2,$3) returning id",
    [caseId, `Utility bill (${suffix})`, uid],
  )).rows[0].id
  const storageKey = `cases/${caseId}/documents/${document}/versions/${crypto.randomUUID()}`
  const version = (await db.query<{ id: string }>(
    `insert into public.case_document_versions(
       document_id,version_number,original_filename,declared_content_type,declared_size_bytes,
       storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by
     ) values($1,1,$2,'application/pdf',1024,'evidence-bucket',$3,
       'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4) returning id`,
    [document, `bill-${suffix}.pdf`, storageKey, uid],
  )).rows[0].id

  const pack = (await db.query<{ id: string }>(
    "insert into public.case_prepared_packs(case_id,pack_number,status,created_by) values($1,1,'DRAFT',$2) returning id",
    [caseId, uid],
  )).rows[0].id
  await db.query(
    `insert into public.case_prepared_pack_items(
       pack_id,document_id,version_id,position,document_title,original_filename,content_type,size_bytes,added_by
     ) values($1,$2,$3,1,$4,$5,'application/pdf',1024,$6)`,
    [pack, document, version, `Utility bill (${suffix})`, `bill-${suffix}.pdf`, uid],
  )
}

async function priceId(serviceCode: string): Promise<string> {
  return (await db.query<{ id: string }>(
    "select id from public.price_versions where service_code=$1 and seed_key is not null", [serviceCode],
  )).rows[0].id
}

/** A quote taken as far as an issued acceptance action, through the commands. */
async function offeredQuote(caseId: string, serviceCode: string) {
  const quote = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    customerId: customer, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions, Manager access, and later payment collection are excluded.",
    validUntil: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    applyDiscount: false, priceVersionId: await priceId(serviceCode), serviceCode,
  }, null])
  expect(quote?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax",
    { quoteId: quote!.id, taxBehaviour: "NOT_APPLICABLE" }, quote!.version]))?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "offer",
    { quoteId: quote!.id }, quote!.version! + 1]))?.status).toBe("success")

  const raw = randomBytes(32).toString("hex")
  const action = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", {
    quoteId: quote!.id, expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(), secretHash: hashOf(raw),
  }, null])
  expect(action?.status).toBe("success")
  return { quoteId: String(quote!.id), actionId: String(action!.id), secret: hashOf(raw) }
}

/** Accepts the quote as the customer, which is what creates the order. */
async function acceptQuote(actionId: string, secret: string): Promise<string> {
  const pending = secretHash(), session = secretHash()
  expect(await rpc("customer_action_exchange_v1", [actionId, secret, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"]))
    .toMatchObject({ status: "ok" })
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted).toMatchObject({ orderState: "ACCEPTED_AWAITING_PAYMENT" })
  return String(accepted!.orderId)
}

let subjectOrder: string
let subjectQuote: string
let otherQuote: string

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
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track,work_stage,status,next_action,next_action_at)
      values('${subject}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'GUIDED','EVIDENCE_COLLECTION','UNDER_REVIEW','Chase the outstanding bill','2026-06-15T09:00:00Z');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track,work_stage)
      values('${other}','REVIEW_PROTECTION','${customer}','${business}','${location}','Review dispute','2026-01-02',now(),now(),'UNDECIDED','INITIAL_REVIEW');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track,work_stage,status,outcome,closure_summary)
      values('${closed}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended again','2026-01-03',now(),now(),'MANAGED','FINISHED','CLOSED','RESTORED','The profile was reinstated by Google.');
    insert into public.case_work_events(case_id,actor_id,event,note,visibility)
      values('${closed}','${uid}','reopen','The customer reported the same suspension again.','INTERNAL');
    insert into public.case_work_events(case_id,actor_id,event,note,visibility)
      values('${subject}','${uid}','note','Spoke to the customer about the outstanding bill.','INTERNAL');
    insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence)
      values('${customer}','${business}','verified',now(),'${uid}','Companies House match discussed on a live call.');
    insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence)
      values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.');
  `)

  await populate(subject, "subject")
  await populate(other, "other")

  const subjectDeal = await offeredQuote(subject, "GUIDED_RELAUNCH")
  subjectQuote = subjectDeal.quoteId
  subjectOrder = await acceptQuote(subjectDeal.actionId, subjectDeal.secret)
  otherQuote = (await offeredQuote(other, "GUIDED_REVIEW")).quoteId

  // The Managed, closed case carries both agreements and a permission moved
  // back to review, and no commerce, complaint, evidence or pack of its own.
  const agreementOf = async (kind: string, digest: string) => (await db.query<{ id: string }>(
    `insert into public.agreement_versions(case_id,customer_id,business_id,location_id,agreement_kind,version_number,
       title,body_text,scope_text,content_hash,created_by)
     values($1,$2,$3,$4,$5,1,'Agreement','The agreed scope of the managed service.','This location only.',$6,$7)
     returning id`,
    [closed, customer, business, location, kind, digest, uid],
  )).rows[0].id
  await agreementOf("SERVICE_AGREEMENT", "d".repeat(64))
  const permission = await agreementOf("CASE_MANAGEMENT_PERMISSION", "e".repeat(64))
  await db.query(
    `insert into public.authorization_records(agreement_version_id,case_id,customer_id,business_id,location_id,
       authorization_kind,status,accepted_by_auth_user_id,accepted_email_snapshot,accepted_at,source)
     values($1,$2,$3,$4,$5,'CASE_MANAGEMENT_PERMISSION','REVIEW_REQUIRED',$6,'alex@example.com',now(),'CUSTOMER_OTP')`,
    [permission, closed, customer, business, location, customerAuth],
  )
}, 240000)

afterAll(async () => { await db.close() })

// ---------------------------------------------------------------------------

describe("one call, many cases", () => {
  it("returns exactly one fact tree for one requested case", async () => {
    const payload = await project([subject])
    expect(payload?.cases.map(entry => entry.caseId)).toEqual([subject])
    expect(payload?.cases[0]).toMatchObject({
      technicalStage: "EVIDENCE_COLLECTION",
      caseStatus: "UNDER_REVIEW",
      caseType: "PROFILE_RECOVERY",
      plannedNextAction: "Chase the outstanding bill",
    })
  })

  it("returns one fact tree for each of several requested cases", async () => {
    const payload = await project([subject, other, closed])
    expect([...(payload?.cases ?? [])].map(entry => entry.caseId).sort())
      .toEqual([subject, other, closed].sort())
  })

  it("returns an empty result for an empty array", async () => {
    expect(await project([])).toEqual({ cases: [] })
  })

  it("collapses duplicate identifiers to one fact tree each", async () => {
    const payload = await project([subject, subject, other, subject])
    expect(payload?.cases).toHaveLength(2)
    expect([...(payload?.cases ?? [])].map(entry => entry.caseId).sort()).toEqual([subject, other].sort())
  })

  it("accepts the maximum batch of fifty", async () => {
    const padding = Array.from({ length: 47 }, (_, index) => `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`)
    const requested = [subject, other, closed, ...padding]
    expect(requested).toHaveLength(50)
    // The padding identifiers are well formed and match no case, so they are
    // absent rather than fabricated.
    expect((await project(requested))?.cases).toHaveLength(3)
  })

  it("rejects a batch of fifty-one", async () => {
    const oversized = Array.from({ length: 51 }, (_, index) => `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`)
    await expect(project(oversized)).rejects.toThrow(/Invalid case flow batch/)
  })

  it("rejects a null array and a null element", async () => {
    await expect(project(null)).rejects.toThrow(/Invalid case flow batch/)
    await expect(project([subject, null as unknown as string])).rejects.toThrow(/Invalid case flow batch/)
  })

  it("returns nothing for a case that does not exist", async () => {
    expect(await project([absent])).toEqual({ cases: [] })
  })
})

describe("every fact belongs to the case that asked for it", () => {
  it("never returns a case that was not requested", async () => {
    const payload = await project([subject])
    const returned = payload?.cases.map(entry => entry.caseId) ?? []
    expect(returned).not.toContain(other)
    expect(returned).not.toContain(closed)
  })

  it("scopes quotes to the requested case", async () => {
    const facts = await factsFor(subject)
    expect(facts.commercial.quotes.map(quote => quote.id)).toEqual([subjectQuote])
    expect(facts.commercial.quotes[0]).toMatchObject({ status: "ACCEPTED", taxBehaviour: "NOT_APPLICABLE" })
    expect((await factsFor(other)).commercial.quotes.map(quote => quote.id)).toEqual([otherQuote])
  })

  it("reports a case with no quote as complete and empty, not uncertain", async () => {
    // The UX-3 improvement: the UX-1 loader could only say "the hundred-row
    // global list might have hidden one". A case-scoped read knows.
    expect((await factsFor(closed)).commercial).toEqual({ complete: true, quotes: [] })
  })

  it("scopes orders and obligations to the requested case", async () => {
    const facts = await factsFor(subject)
    expect(facts.payment.complete).toBe(true)
    expect(facts.payment.orders).toHaveLength(1)
    expect(facts.payment.orders[0]).toMatchObject({
      orderId: subjectOrder,
      paymentModel: "UPFRONT",
      orderState: "ACCEPTED_AWAITING_PAYMENT",
      obligationKind: "UPFRONT",
      setupReady: false,
      receiptRecorded: false,
    })
    expect((await factsFor(other)).payment.orders).toEqual([])
    expect((await factsFor(closed)).payment.orders).toEqual([])
  })

  it("scopes complaints to the requested case", async () => {
    const facts = await factsFor(subject)
    expect(facts.complaints.complete).toBe(true)
    expect(facts.complaints.open).toHaveLength(1)
    const otherComplaints = (await factsFor(other)).complaints.open
    expect(otherComplaints).toHaveLength(1)
    expect(otherComplaints[0].id).not.toBe(facts.complaints.open[0].id)
  })

  it("reports a case with no complaint as complete and empty", async () => {
    expect((await factsFor(closed)).complaints).toEqual({ complete: true, open: [] })
  })

  it("scopes evidence requests and versions to the requested case", async () => {
    const facts = await factsFor(subject)
    expect(facts.evidence.requests).toHaveLength(1)
    expect(facts.evidence.versions).toHaveLength(1)
    expect(facts.evidence.versions[0]).toMatchObject({
      uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED",
    })
    expect((await factsFor(other)).evidence.versions[0].versionId).not.toBe(facts.evidence.versions[0].versionId)
    expect((await factsFor(closed)).evidence).toEqual({ requests: [], versions: [] })
  })

  it("scopes communications to the requested case", async () => {
    const facts = await factsFor(subject)
    expect(facts.communications).toHaveLength(1)
    expect(facts.communications[0]).toMatchObject({
      templateKey: "EVIDENCE_REQUEST", lifecycle: "DRAFT", deliveryStatus: "NONE", legacyStatus: null,
    })
    expect((await factsFor(closed)).communications).toEqual([])
  })

  it("scopes prepared packs and eligible evidence to the requested case", async () => {
    const facts = await factsFor(subject)
    expect(facts.packs.packs).toHaveLength(1)
    expect(facts.packs.packs[0]).toMatchObject({
      packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 1,
    })
    expect(facts.packs.eligibleCount).toBe(1)
    expect((await factsFor(closed)).packs).toEqual({ packs: [], eligibleCount: 0 })
  })

  it("scopes authorisation and consumes the readiness aggregate rather than recomputing it", async () => {
    const managed = await factsFor(closed)
    expect(managed.authorization).toMatchObject({
      membershipStatus: "verified",
      customerEmailVerified: true,
      businessAuthorityVerified: true,
      serviceAgreementAccepted: false,
      caseManagementPermissionActive: false,
      authorizationReady: false,
      reviewRequired: ["CASE_MANAGEMENT_PERMISSION"],
      agreementKinds: ["CASE_MANAGEMENT_PERMISSION", "SERVICE_AGREEMENT"],
      hasLocation: true,
    })
    const direct = await db.query<{ value: Record<string, unknown> }>(
      "select admin_private.case_authorization_readiness_v1($1) as value", [closed],
    )
    expect(managed.authorization.authorizationReady).toBe(direct.rows[0].value.authorizationReady)

    const guided = await factsFor(subject)
    expect(guided.authorization.reviewRequired).toEqual([])
    expect(guided.authorization.agreementKinds).toEqual([])
  })

  it("scopes tasks and the allowed transitions to the requested case", async () => {
    const facts = await factsFor(subject)
    expect(facts.tasks).toHaveLength(1)
    expect(facts.tasks[0]).toMatchObject({ owner: "CUSTOMER", kind: "FOLLOW_UP", status: "OPEN" })
    expect(facts.allowedTransitions).toEqual(["ASSESSMENT_READY"])
    expect((await factsFor(closed)).tasks).toEqual([])
    expect((await factsFor(closed)).allowedTransitions).toEqual([])
  })
})

describe("facts the projection makes exact", () => {
  it("reports reopened as an existence check over the whole event history", async () => {
    expect((await factsFor(closed)).reopened).toBe(true)
    expect((await factsFor(subject)).reopened).toBe(false)
    expect((await factsFor(other)).reopened).toBe(false)
  })

  it("carries a closed case's stage, status and outcome unchanged", async () => {
    expect(await factsFor(closed)).toMatchObject({
      technicalStage: "FINISHED",
      caseStatus: "CLOSED",
      outcome: "RESTORED",
      outcomeSummary: "The profile was reinstated by Google.",
    })
  })

  it("distinguishes Guided, Managed and undecided without narrowing them", async () => {
    expect((await factsFor(subject)).serviceTrack).toBe("GUIDED")
    expect((await factsFor(closed)).serviceTrack).toBe("MANAGED")
    expect((await factsFor(other)).serviceTrack).toBe("UNDECIDED")
  })
})

describe("the security envelope", () => {
  it("returns nothing at all to an unrecognised session token", async () => {
    expect(await project([subject], "b".repeat(64))).toBeNull()
    expect(await project([subject], "not-a-token")).toBeNull()
  })

  it("checks the session before the bounds, so no bound is an oracle", async () => {
    const oversized = Array.from({ length: 51 }, (_, index) => `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`)
    expect(await project(oversized, "b".repeat(64))).toBeNull()
  })

  it("is SECURITY DEFINER with a pinned search path", async () => {
    const routine = await db.query<{ definer: boolean; config: string[] | null }>(
      `select p.prosecdef as definer, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='admin_case_flow_facts_v1'`,
    )
    expect(routine.rows).toHaveLength(1)
    expect(routine.rows[0].definer).toBe(true)
    expect(routine.rows[0].config).toEqual(['search_path=""'])
  })

  it("is executable by service_role alone", async () => {
    const signature = "public.admin_case_flow_facts_v1(text, uuid[])"
    for (const role of ["public", "anon", "authenticated"]) {
      expect((await db.query<{ ok: boolean }>(
        "select has_function_privilege($1,$2,'EXECUTE') as ok", [role, signature],
      )).rows[0].ok).toBe(false)
    }
    expect((await db.query<{ ok: boolean }>(
      "select has_function_privilege('service_role',$1,'EXECUTE') as ok", [signature],
    )).rows[0].ok).toBe(true)
  })

  it("never returns an action secret, a storage key or an email address", async () => {
    const payload = JSON.stringify(await project([subject, other, closed]))
    expect(payload).not.toContain("secret")
    expect(payload).not.toContain("storage")
    expect(payload).not.toContain("/documents/")
    expect(payload).not.toContain("alex@example.com")

    const hashes = (await db.query<{ secret_hash: string }>("select secret_hash from public.customer_actions")).rows
    expect(hashes.length).toBeGreaterThan(0)
    for (const row of hashes) expect(payload).not.toContain(row.secret_hash)

    // The actions themselves are present, by kind, status and expiry only.
    const facts = await factsFor(subject)
    expect(facts.customerActions.length).toBeGreaterThan(0)
    for (const action of facts.customerActions) {
      expect(Object.keys(action).sort()).toEqual(["agreementKind", "expiresAt", "id", "kind", "status"])
    }
  })

  it("gates on the shared admin session function and builds no dynamic SQL", async () => {
    const source = (await db.query<{ src: string }>(
      `select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='admin_case_flow_facts_v1'`,
    )).rows[0].src
    expect(source).toContain("public.admin_session_v1(p_token)")
    expect(source).not.toMatch(/\bEXECUTE\b/i)
    expect(source).not.toMatch(/\bformat\(/i)
  })
})
