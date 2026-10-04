import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, applyUpgrade, migrationSql, preparePlatform } from "../recovery/harness"

const appliedHead = "20261003183002"
const migration = "20261003194353_customer_portal_documents_evidence_v1.sql"
const upgradedFiles = [
  migration,
  "20261003204538_customer_portal_quotes_agreements_permissions_v1.sql",
  "20261003224746_customer_portal_payments_receipts_v1.sql",
  "20261004000625_customer_portal_relaunch_guard_v1.sql",
  "20261004080853_customer_portal_messages_account_v1.sql",
].join(",")
const db = new PGlite()

const alex = "c10e0000-0000-4000-8000-0000000000a1"
const sam = "c10e0000-0000-4000-8000-0000000000b2"
const alexAuth = "c10e0000-0000-4000-8000-0000000000d4"
const samAuth = "c10e0000-0000-4000-8000-0000000000e5"
const verifier = "c10e0000-0000-4000-8000-0000000000a7"
const business = "c10e0000-0000-4000-8000-000000000011"
const otherBusiness = "c10e0000-0000-4000-8000-000000000012"
const location = "c10e0000-0000-4000-8000-000000000021"
const otherLocation = "c10e0000-0000-4000-8000-000000000022"

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const secret = () => hash(randomUUID())
const bucket = "evidence-bucket"

let alexSession = ""
let samSession = ""

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function insertCase(options: {
  reference: string
  customer?: string
  status?: string
  workStage?: string
  submittedAt?: string
  closedAt?: string | null
  outcome?: string | null
}) {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, status, customer_id, business_id, location_id, issue_subtype, issue_description,
      review_url, source, information_accurate_at, privacy_accepted_at, service_track, work_stage, submitted_at,
      closed_at, outcome, intake_snapshot, closure_summary, priority, priority_reason, next_action, assigned
    ) values (
      $1,$2,'PROFILE_RECOVERY',$3,$4,$5,$6,'LEAK-SUBTYPE','LEAK-ISSUE-DESCRIPTION','https://example.test/LEAK-REVIEW-URL','LEAK-SOURCE',
      now(), now(), 'GUIDED', $7, $8, $9, $10, '{"leak":"LEAK-INTAKE"}'::jsonb, 'LEAK-CLOSURE-SUMMARY', 'HIGH',
      'LEAK-PRIORITY-REASON', 'LEAK-NEXT-ACTION', true
    )`,
    [
      id, options.reference, options.status ?? "AWAITING_CUSTOMER", options.customer ?? alex, business, location,
      options.workStage ?? "EVIDENCE_COLLECTION", options.submittedAt ?? "2026-05-01T12:00:00Z",
      options.closedAt ?? null, options.outcome ?? null,
    ],
  )
  return id
}

async function request(caseId: string, title: string, createdAt: string, due: string | null = "2026-10-08T12:00:00Z") {
  const id = randomUUID()
  await db.query(
    `insert into public.evidence_requests(id, case_id, title, request_text, status, due_at, created_by, created_at)
     values ($1,$2,$3,'Upload the document that shows control of the profile.','OPEN',$4,$5,$6)`,
    [id, caseId, title, due, verifier, createdAt],
  )
  return id
}

function objectKey(caseId: string, documentId: string, versionId: string) {
  return `cases/${caseId}/documents/${documentId}/versions/${versionId}`
}

async function customerVersion(options: {
  caseId: string
  requestId: string
  filename: string
  upload?: string
  scan?: string
  validation?: string
  review?: string
  visible?: boolean
  uploadedAt?: string | null
  note?: string | null
}) {
  const documentId = randomUUID()
  const versionId = randomUUID()
  await db.query(
    `insert into public.case_documents(id, case_id, evidence_request_id, title, created_by)
     values ($1,$2,$3,'Customer file',$4)`,
    [documentId, options.caseId, options.requestId, alexAuth],
  )
  await db.query(
    `insert into public.case_document_versions(
      id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
      storage_bucket, storage_key, upload_status, scan_status, validation_status, review_status, review_note,
      customer_visible, created_by, uploaded_at, submission_source, customer_action_id, customer_evidence_request_id, portal_submission
    ) values (
      $1,$2,1,$3,'application/pdf',2048,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'CUSTOMER',null,$14,true
    )`,
    [
      versionId, documentId, options.filename, bucket, objectKey(options.caseId, documentId, versionId),
      options.upload ?? "UPLOADED", options.scan ?? "PENDING", options.validation ?? "PENDING", options.review ?? "UNREVIEWED",
      options.note ?? null, options.visible ?? false, alexAuth, options.uploadedAt === undefined ? "2026-05-02T12:00:00Z" : options.uploadedAt,
      options.requestId,
    ],
  )
  return { documentId, versionId }
}

async function publish(caseId: string, filename: string, options: { eligible?: boolean } = {}) {
  const requestId = await request(caseId, "Published source", "2026-04-01T12:00:00Z", null)
  const documentId = randomUUID()
  const versionId = randomUUID()
  const eligible = options.eligible !== false
  await db.query(
    `insert into public.case_documents(id, case_id, evidence_request_id, title, created_by)
     values ($1,$2,$3,'Prepared letter',$4)`,
    [documentId, caseId, requestId, verifier],
  )
  await db.query(
    `insert into public.case_document_versions(
      id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
      storage_bucket, storage_key, upload_status, scan_status, scan_checked_at, validation_status, validated_at,
      review_status, review_note, reviewed_by, reviewed_at, customer_visible, created_by, uploaded_at
    ) values (
      $1,$2,1,$3,'application/pdf',4096,'leak-evidence-bucket',$4,'UPLOADED',$5,now(),$6,now(),
      $7,'LEAK-REVIEW-NOTE',$8,now(),$9,$8,now()
    )`,
    [
      versionId, documentId, filename, objectKey(caseId, documentId, versionId),
      eligible ? "NO_THREATS_FOUND" : "PENDING",
      eligible ? "VALID" : "PENDING",
      eligible ? "ACCEPTED" : "UNREVIEWED",
      verifier,
      eligible,
    ],
  )
  if (!eligible) return { packId: null, versionId, requestId }
  const packId = randomUUID()
  await db.query(
    `insert into public.case_prepared_packs(id, case_id, pack_number, status, created_by)
     values ($1,$2,1,'DRAFT',$3)`,
    [packId, caseId, verifier],
  )
  await db.query(
    `insert into public.case_prepared_pack_items(
      pack_id, document_id, version_id, position, document_title, original_filename, content_type, size_bytes, added_by
    ) values ($1,$2,$3,1,'Prepared letter',$4,'application/pdf',4096,$5)`,
    [packId, documentId, versionId, filename, verifier],
  )
  await db.query(
    `update public.case_prepared_packs
     set status = 'APPROVED', approval_note = 'Approved for the customer portal test.',
         approved_by = $2, approved_at = now(), published_at = now(), published_by = $2,
         publication_note = 'Published for the customer portal test.'
     where id = $1`,
    [packId, verifier],
  )
  return { packId, versionId, requestId }
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

describe("customer documents migration", () => {
  it("adds portal evidence functions without a second evidence table", () => {
    const sql = migrationSql(migration)
    expect(sql).toContain("customer_portal_documents_v1")
    expect(sql).toContain("customer_portal_evidence_begin_v1")
    expect(sql).toContain("customer_published_pack_documents_v1")
    expect(sql).toContain("portal_submission")
    expect(sql).not.toMatch(/create table/i)
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on/i)
    expect(sql).not.toMatch(/execute\s+['$]/i)
    expect(sql).not.toMatch(/\bformat\s*\(/i)
    expect(sql).not.toMatch(/case_events/)
  })
})

describe("portal document ownership", () => {
  it("shows only the signed-in customer's evidence and hides internal fields", async () => {
    const caseId = await insertCase({ reference: "PR-26-EVDCA2" })
    const openId = await request(caseId, "Proof of control", "2026-05-01T12:00:00Z")
    const receivedId = await request(caseId, "Received file", "2026-05-01T12:01:00Z")
    await customerVersion({ caseId, requestId: receivedId, filename: "received.pdf", uploadedAt: "2026-05-02T12:00:00Z" })
    const checkedId = await request(caseId, "Checked file", "2026-05-01T12:02:00Z")
    await customerVersion({
      caseId, requestId: checkedId, filename: "checked.pdf", scan: "NO_THREATS_FOUND", validation: "PENDING",
    })
    const reviewId = await request(caseId, "Review file", "2026-05-01T12:03:00Z")
    await customerVersion({
      caseId, requestId: reviewId, filename: "review.pdf", scan: "NO_THREATS_FOUND", validation: "VALID",
    })
    const acceptedId = await request(caseId, "Accepted file", "2026-05-01T12:04:00Z")
    await customerVersion({
      caseId, requestId: acceptedId, filename: "accepted.pdf", scan: "NO_THREATS_FOUND", validation: "VALID",
      review: "ACCEPTED", visible: true,
    })
    const rejectedId = await request(caseId, "Rejected file", "2026-05-01T12:05:00Z")
    await customerVersion({
      caseId, requestId: rejectedId, filename: "rejected.pdf", scan: "NO_THREATS_FOUND", validation: "VALID",
      review: "REJECTED", note: "LEAK-REVIEW-NOTE",
    })
    const pendingId = await request(caseId, "Pending file", "2026-05-01T12:06:00Z")
    await customerVersion({
      caseId, requestId: pendingId, filename: "pending.pdf", upload: "PENDING_UPLOAD", uploadedAt: null,
    })
    const adminDocument = randomUUID()
    const adminVersion = randomUUID()
    await db.query(
      `insert into public.case_documents(id, case_id, title, created_by) values ($1,$2,'Secret admin document',$3)`,
      [adminDocument, caseId, verifier],
    )
    await db.query(
      `insert into public.case_document_versions(
        id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
        storage_bucket, storage_key, upload_status, scan_status, validation_status, review_status, review_note,
        customer_visible, created_by, uploaded_at
      ) values ($1,$2,1,'secret-admin-only.pdf','application/pdf',100,'leak-evidence-bucket',$3,'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED','LEAK-REVIEW-NOTE',false,$4,now())`,
      [adminVersion, adminDocument, objectKey(caseId, adminDocument, adminVersion), verifier],
    )
    await publish(caseId, "published-letter.pdf")

    const overview = await rpc<Record<string, unknown>>("customer_portal_documents_v1", [alexSession])
    const encoded = JSON.stringify(overview)
    expect(encoded).toContain("Proof of control")
    expect(encoded).toContain("received.pdf")
    expect(encoded).toContain("RECEIVED")
    expect(encoded).toContain("BEING_CHECKED")
    expect(encoded).toContain("UNDER_REVIEW")
    expect(encoded).toContain("ACCEPTED")
    expect(encoded).toContain("NEEDS_ANOTHER")
    expect(encoded).toContain("UPLOAD_IN_PROGRESS")
    expect(encoded).toContain("published-letter.pdf")
    expect(encoded).toContain("PR-26-EVDCA2")
    expect(encoded).not.toContain("secret-admin-only.pdf")
    expect(encoded).not.toContain("LEAK-")
    expect(encoded).not.toContain("leak-evidence-bucket")
    expect(encoded).not.toContain(caseId)
    expect(encoded).not.toContain(openId)
    expect(encoded).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(encoded).not.toMatch(/PENDING_UPLOAD|NO_THREATS_FOUND|storageKey|storage_bucket|review_note|created_by/)

    const detail = await rpc<{ found: boolean; requests: Array<{ selector: string; canUpload: boolean; state: string }> }>(
      "customer_portal_case_documents_v1",
      [alexSession, "PR-26-EVDCA2"],
    )
    expect(detail.found).toBe(true)
    expect(detail.requests.find(item => item.state === "NOT_SUBMITTED")?.canUpload).toBe(true)
    expect(detail.requests.find(item => item.state === "ACCEPTED")?.canUpload).toBe(false)
    expect(detail.requests.find(item => item.state === "NEEDS_ANOTHER")?.canUpload).toBe(false)
    expect(JSON.stringify(detail)).not.toContain(caseId)

    const other = await rpc("customer_portal_case_documents_v1", [samSession, "PR-26-EVDCA2"])
    const missing = await rpc("customer_portal_case_documents_v1", [alexSession, "PR-26-ZZZZZ9"])
    expect(other).toEqual({ found: false })
    expect(missing).toEqual({ found: false })
    expect(await rpc("customer_portal_documents_v1", ["not-a-session"])).toBeNull()
    expect(await rpc("customer_portal_case_documents_v1", [null, "PR-26-EVDCA2"])).toBeNull()
  })

  it("does not treat a shared business as ownership and rejects a dead session", async () => {
    await insertCase({ reference: "PR-26-EVDSB2", customer: sam })
    expect(await rpc("customer_portal_case_documents_v1", [alexSession, "PR-26-EVDSB2"])).toEqual({ found: false })
    const samOverview = JSON.stringify(await rpc("customer_portal_documents_v1", [samSession]))
    expect(samOverview).not.toContain("PR-26-EVDCA2")

    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now() - interval '2 hours', created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await rpc("customer_portal_documents_v1", [alexSession])).toBeNull()
    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now(), created_at = now(), expires_at = now() + interval '8 hours'
       where token_hash = $1`,
      [alexSession],
    )
    await db.query(
      "update admin_private.customer_portal_sessions set revoked_at = now(), revocation_reason = 'sign_out' where token_hash = $1",
      [alexSession],
    )
    expect(await rpc("customer_portal_case_documents_v1", [alexSession, "PR-26-EVDCA2"])).toBeNull()
    await db.query(
      "update admin_private.customer_portal_sessions set revoked_at = null, revocation_reason = '' where token_hash = $1",
      [alexSession],
    )
    await db.query("update auth.users set email = 'moved@example.com' where id = $1", [alexAuth])
    expect(await rpc("customer_portal_documents_v1", [alexSession])).toBeNull()
    await db.query("update auth.users set email = 'alex@example.com' where id = $1", [alexAuth])
  })
})

describe("portal evidence upload", () => {
  it("reuses the customer evidence lifecycle and refuses every other case", async () => {
    const caseId = await insertCase({ reference: "PR-26-EVDCC2" })
    const otherCase = await insertCase({ reference: "PR-26-EVDDD2" })
    await request(caseId, "Portal proof", "2026-06-01T12:00:00Z")
    const otherRequest = await request(otherCase, "Other proof", "2026-06-01T12:00:00Z")
    const actionsBefore = Number((await rows<{ n: number }>("select count(*)::int as n from public.customer_actions"))[0].n)
    const requestId = randomUUID()
    const begun = await rpc<{ status: string; storageKey: string }>("customer_portal_evidence_begin_v1", [
      alexSession, requestId, "PR-26-EVDCC2", "er-1", "portal-proof.pdf", "application/pdf", 1200, bucket,
    ])
    expect(begun.status).toBe("success")
    expect(begun.storageKey).toMatch(/^cases\//)
    const replay = await rpc<{ status: string; storageKey: string }>("customer_portal_evidence_begin_v1", [
      alexSession, requestId, "PR-26-EVDCC2", "er-1", "portal-proof.pdf", "application/pdf", 1200, bucket,
    ])
    expect(replay).toEqual(begun)
    const conflict = await rpc<{ status: string }>("customer_portal_evidence_begin_v1", [
      alexSession, requestId, "PR-26-EVDCC2", "er-1", "other.pdf", "application/pdf", 1200, bucket,
    ])
    expect(conflict).toEqual({ status: "conflict" })
    const replaced = await rpc<{ status: string; storageKey: string }>("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), "PR-26-EVDCC2", "er-1", "replacement.pdf", "application/pdf", 1400, bucket,
    ])
    expect(replaced.status).toBe("success")
    expect(replaced.storageKey).not.toBe(begun.storageKey)
    const active = await rows<{ n: number; source: string; portal: boolean; action: string | null; request: string }>(
      `select count(*)::int as n
       from public.case_document_versions
       where customer_evidence_request_id = $1 and submission_source = 'CUSTOMER' and upload_status in ('PENDING_UPLOAD','UPLOADED')`,
      [(await rows<{ id: string }>("select id from public.evidence_requests where case_id = $1", [caseId]))[0].id],
    )
    expect(active[0].n).toBe(1)
    const provenance = await rows<{ source: string; portal: boolean; action: string | null; review: string; visible: boolean }>(
      `select submission_source as source, portal_submission as portal, customer_action_id as action, review_status as review, customer_visible as visible
       from public.case_document_versions where storage_key = $1`,
      [replaced.storageKey],
    )
    expect(provenance[0]).toEqual({ source: "CUSTOMER", portal: true, action: null, review: "UNREVIEWED", visible: false })
    expect(Number((await rows<{ n: number }>("select count(*)::int as n from public.customer_actions"))[0].n)).toBe(actionsBefore)

    const tooBig = await rpc<{ status: string }>("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), "PR-26-EVDCC2", "er-1", "huge.pdf", "application/pdf", 10485761, bucket,
    ])
    const wrongType = await rpc<{ status: string }>("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), "PR-26-EVDCC2", "er-1", "notes.exe", "application/octet-stream", 20, bucket,
    ])
    expect(tooBig).toEqual({ status: "invalid" })
    expect(wrongType).toEqual({ status: "invalid" })

    expect(await rpc("customer_portal_evidence_begin_v1", [
      samSession, randomUUID(), "PR-26-EVDCC2", "er-1", "portal-proof.pdf", "application/pdf", 1200, bucket,
    ])).toEqual({ status: "unavailable" })
    expect((await rpc<{ status: string }>("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), "PR-26-EVDDD2", "er-1", "portal-proof.pdf", "application/pdf", 1200, bucket,
    ])).status).toBe("success")
    const firstRequest = (await rows<{ id: string }>("select id from public.evidence_requests where case_id = $1", [caseId]))[0].id
    const attached = await rows<{ request: string; filename: string }>(
      `select customer_evidence_request_id as request, original_filename as filename
       from public.case_document_versions
       where submission_source = 'CUSTOMER' and upload_status in ('PENDING_UPLOAD','UPLOADED')`,
    )
    expect(attached.filter(row => row.filename === "replacement.pdf").map(row => row.request)).toEqual([firstRequest])
    expect(attached.filter(row => row.filename === "portal-proof.pdf").map(row => row.request)).toEqual([otherRequest])

    const finalizeKey = randomUUID()
    const finalized = await rpc<{ status: string }>("customer_portal_evidence_finalize_v1", [
      alexSession, finalizeKey, "PR-26-EVDCC2", "er-1",
    ])
    expect(finalized).toEqual({ status: "success" })
    const again = await rpc<{ status: string }>("customer_portal_evidence_finalize_v1", [
      alexSession, finalizeKey, "PR-26-EVDCC2", "er-1",
    ])
    expect(again).toEqual({ status: "success" })
    const fresh = await rpc<{ status: string }>("customer_portal_evidence_finalize_v1", [
      alexSession, randomUUID(), "PR-26-EVDCC2", "er-1",
    ])
    expect(fresh).toEqual({ status: "success" })
    const stored = await rows<{ upload: string; review: string; visible: boolean; scan: string }>(
      `select upload_status as upload, review_status as review, customer_visible as visible, scan_status as scan
       from public.case_document_versions where storage_key = $1`,
      [replaced.storageKey],
    )
    expect(stored[0]).toEqual({ upload: "UPLOADED", review: "UNREVIEWED", visible: false, scan: "PENDING" })
    const blocked = await rpc<{ status: string }>("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), "PR-26-EVDCC2", "er-1", "third.pdf", "application/pdf", 1500, bucket,
    ])
    expect(blocked).toEqual({ status: "conflict" })

    await db.query("update public.cases set status = 'CLOSED', work_stage = 'FINISHED', closed_at = now(), outcome = 'RESTORED' where id = $1", [otherCase])
    expect(await rpc("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), "PR-26-EVDDD2", "er-1", "late.pdf", "application/pdf", 1200, bucket,
    ])).toEqual({ status: "unavailable" })
    const cancelled = await insertCase({ reference: "PR-26-EVDEE2" })
    await request(cancelled, "Cancelled proof", "2026-06-02T12:00:00Z")
    await db.query("update public.cases set status = 'CANCELLED', work_stage = 'FINISHED', closed_at = now() where id = $1", [cancelled])
    expect(await rpc("customer_portal_evidence_begin_v1", [
      alexSession, randomUUID(), "PR-26-EVDEE2", "er-1", "late.pdf", "application/pdf", 1200, bucket,
    ])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_portal_evidence_begin_v1", [null, randomUUID(), "PR-26-EVDCC2", "er-1", "portal-proof.pdf", "application/pdf", 1200, bucket])).toBeNull()
  })
})

describe("published documents", () => {
  it("returns only the current eligible pack and rechecks a download", async () => {
    const caseId = await insertCase({ reference: "PR-26-EVDFF2" })
    const published = await publish(caseId, "customer-letter.pdf")
    const unsafeCase = await insertCase({ reference: "PR-26-EVDGG2" })
    await publish(unsafeCase, "unsafe-letter.pdf", { eligible: false })
    const hidden = JSON.stringify(await rpc("customer_portal_documents_v1", [alexSession]))
    expect(hidden).toContain("customer-letter.pdf")
    expect(hidden).not.toContain("unsafe-letter.pdf")
    expect(hidden).not.toContain("LEAK-REVIEW-NOTE")
    expect(hidden).not.toContain(published.versionId)

    const resolved = await rpc<{ found: boolean; available: boolean; storageKey?: string }>("customer_portal_document_resolve_v1", [
      alexSession, "PR-26-EVDFF2", "pd-1",
    ])
    expect(resolved.found).toBe(true)
    expect(resolved.available).toBe(true)
    expect(resolved.storageKey).toContain(published.versionId)
    const access = await rpc<{ status: string }>("customer_portal_document_access_v1", [
      alexSession, randomUUID(), "PR-26-EVDFF2", "pd-1",
    ])
    expect(access).toEqual({ status: "success" })
    const replayId = randomUUID()
    expect(await rpc("customer_portal_document_access_v1", [alexSession, replayId, "PR-26-EVDFF2", "pd-1"])).toEqual({ status: "success" })
    expect(await rpc("customer_portal_document_access_v1", [alexSession, replayId, "PR-26-EVDFF2", "pd-2"])).toEqual({ status: "conflict" })

    await db.query(
      `update public.case_prepared_packs
       set unpublished_at = now(), unpublished_by = $2, unpublished_reason = 'Withdrawn from the customer.'
       where id = $1`,
      [published.packId, verifier],
    )
    const after = JSON.stringify(await rpc("customer_portal_documents_v1", [alexSession]))
    expect(after).not.toContain("customer-letter.pdf")
    expect(await rpc("customer_portal_document_resolve_v1", [alexSession, "PR-26-EVDFF2", "pd-1"])).toEqual({ found: true, available: false })
    expect(await rpc("customer_portal_document_resolve_v1", [samSession, "PR-26-EVDFF2", "pd-1"])).toEqual({ found: false })
    expect(await rpc("customer_portal_document_resolve_v1", ["dead", "PR-26-EVDFF2", "pd-1"])).toBeNull()
  })
})

describe("portal document privileges", () => {
  const publicFns = [
    "public.customer_portal_documents_v1(text)",
    "public.customer_portal_case_documents_v1(text,text)",
    "public.customer_portal_evidence_begin_v1(text,uuid,text,text,text,text,bigint,text)",
    "public.customer_portal_evidence_target_v1(text,text,text)",
    "public.customer_portal_evidence_finalize_v1(text,uuid,text,text)",
    "public.customer_portal_document_resolve_v1(text,text,text)",
    "public.customer_portal_document_access_v1(text,uuid,text,text)",
  ]
  const privateFns = [
    "admin_private.customer_portal_actor_v1(text)",
    "admin_private.customer_evidence_state_v1(text,text,text,text)",
    "admin_private.customer_portal_owned_case_v1(uuid,text)",
    "admin_private.customer_portal_evidence_selector_v1(uuid,text)",
    "admin_private.customer_published_pack_documents_v1(uuid)",
    "admin_private.customer_portal_case_evidence_v1(uuid)",
  ]

  async function canExecute(role: string, signature: string) {
    return (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
  }

  it("lets service_role execute only the public portal functions", async () => {
    for (const role of ["public", "anon", "authenticated"]) {
      for (const signature of [...publicFns, ...privateFns]) expect(await canExecute(role, signature)).toBe(false)
    }
    for (const signature of publicFns) expect(await canExecute("service_role", signature)).toBe(true)
    for (const signature of privateFns) expect(await canExecute("service_role", signature)).toBe(false)
    expect(await rows<{ ok: boolean }>(
      "select has_table_privilege('anon', 'public.case_document_versions', 'SELECT') as ok",
    )).toEqual([{ ok: false }])
    await db.exec("set role service_role")
    try {
      await expect(db.query("select admin_private.customer_portal_case_evidence_v1($1)", [randomUUID()])).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec("reset role")
    }
  })
})
