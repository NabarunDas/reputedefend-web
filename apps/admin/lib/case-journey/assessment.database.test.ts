import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const requestId = "88888888-8888-4888-8888-888888888888"
const documentId = "66666666-6666-4666-8666-666666666666"
const versionId = "77777777-7777-4777-8777-777777777777"
const threatId = "99999999-9999-4999-8999-999999999999"
const token = "a".repeat(64)

const draft = {
  recordVersion: 0,
  findings: "The profile was suspended and the ownership letter matches the bakery account.",
  evidenceConsidered: "One accepted ownership letter on a fulfilled request.",
  profileIssue: "The Google listing is suspended.",
  policyConcerns: "Ownership of the profile is the policy concern in view.",
  recommendedAction: "Recommend Guided recovery and leave the quote for a later step.",
  servicePathway: "GUIDED",
  rationale: "The accepted evidence is enough to recommend Guided rather than Managed.",
  risks: "Google may still refuse the recovery request.",
  outstandingInformation: "",
}

async function rpc(name: string, args: unknown[] = []) {
  // Heterogeneous database JSON results are intentionally inspected in this SQL harness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await db.query<{ value: any }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

beforeAll(async () => {
  const migrations = new URL("../../../../supabase/migrations/", import.meta.url)
  const historical = "20261019163645_admin_journey_05_assessment_dev_v1.sql"
  for (const name of readdirSync(migrations)) {
    if (!name.endsWith(".sql") || name === historical) continue
    if (readFileSync(new URL(name, migrations), "utf8").includes("admin_case_assessment_command_v1")) {
      throw new Error(`${name} must not carry the assessment function`)
    }
  }
  if (!readFileSync(new URL(historical, migrations), "utf8").includes("admin_case_assessment_command_v1")) {
    throw new Error("the recovered DEV assessment statement is missing its command")
  }
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const read = (name: string) => readFileSync(new URL(name, migrations), "utf8")
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace(
    "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;",
    "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  ))
  for (const name of ["20260916000000_relaunch_guard_data_foundation_v1.sql", "20260917080553_single_admin_auth_v1.sql", "20260917160740_admin_audit_foundation_v1.sql", "20260917183422_admin_client_workspace_v1.sql", readdirSync(migrations).find(n => n.endsWith("_admin_enquiry_triage_v1.sql"))!, readdirSync(migrations).find(n => n.endsWith("_admin_case_workflows_v1.sql"))!, "20260918143424_admin_evidence_foundation_v1.sql"]) {
    await db.exec(read(name))
  }
  await db.exec(readFileSync(new URL("../../../../docs/admin/proposed-admin-journey-05-assessment.sql", import.meta.url), "utf8"))
}, 30000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
 alter table public.case_document_events disable trigger case_document_events_immutable;
 truncate public.case_assessments, public.case_document_events, public.case_document_versions, public.case_documents, public.evidence_requests, public.case_tasks, public.case_work_events, public.case_submissions, public.case_submission_results, admin_private.case_command_receipts, public.enquiries, public.enquiry_events, public.admin_audit_events, public.admin_auth_events, public.admin_sessions, public.admin_identity, public.customers, public.businesses, public.locations, public.business_memberships, public.customer_contact_verifications, auth.users cascade;
 alter table public.case_document_events enable trigger case_document_events_immutable;
 alter table public.admin_audit_events enable trigger admin_audit_immutable;
 insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
 insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
 insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
 insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
 insert into public.businesses(id,display_name) values('${business}','Bakery');
 insert into public.locations(id,business_id,country,business_profile_url) values('${location}','${business}','United Kingdom','https://maps.example/suspended');
 insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,intake_snapshot,created_at)
 values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','The profile disappeared.',
 '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"The profile disappeared."}'::jsonb,'2026-01-01');`)
})

const detail = () => rpc("admin_case_detail_v1", [token, caseId, null])
const read = () => rpc("admin_case_assessment_read_v1", [token, caseId])
const command = (operation: string, data: Record<string, unknown>, version = 1, request = crypto.randomUUID()) =>
  rpc("admin_case_assessment_command_v1", [token, request, caseId, version, operation, data])

function withVersion(data: Record<string, unknown>, recordVersion: number) {
  return { ...data, recordVersion }
}

async function acceptEvidence() {
  await db.exec(`insert into public.evidence_requests(id,case_id,title,request_text,status,created_by)
    values('${requestId}','${caseId}','Ownership letter','Upload the ownership letter.','FULFILLED','${uid}');
    insert into public.case_documents(id,case_id,evidence_request_id,title,created_by)
    values('${documentId}','${caseId}','${requestId}','Ownership letter','${uid}');
    insert into public.case_document_versions(id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by)
    values('${versionId}','${documentId}',1,'letter.pdf','application/pdf',1024,'evidence','cases/${caseId}/documents/${documentId}/versions/${versionId}','UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED','${uid}');
    insert into public.case_documents(id,case_id,title,created_by)
    values('${threatId}','${caseId}','Rejected threat','${uid}');
    insert into public.case_document_versions(id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by)
    values('${threatId}','${threatId}',1,'threat.pdf','application/pdf',1024,'evidence','cases/${caseId}/documents/${threatId}/versions/${threatId}','UPLOADED','THREATS_FOUND','PENDING','REJECTED','${uid}');`)
}

async function versionOf() {
  return (await detail()).version as number
}

describe("proposed assessment SQL", () => {
  it("drafts, reviews and approves once, and a retry does not write a second history row", async () => {
    await acceptEvidence()
    const request = crypto.randomUUID()
    expect((await command("save_draft", draft, 1, request)).status).toBe("success")
    expect((await command("save_draft", draft, 1, request)).status).toBe("success")
    expect((await command("save_draft", { ...draft, findings: "A different finding that must not replace the first one." }, 1, request)).status).toBe("conflict")
    const saved = await read()
    expect(saved.versions).toHaveLength(1)
    expect(saved.versions[0].status).toBe("DRAFT")
    expect(saved.versions[0].current).toBe(false)
    const reviewed = await command("submit_review", { recordVersion: saved.versions[0].recordVersion }, await versionOf())
    expect(reviewed.status).toBe("success")
    const approved = await command("approve", { recordVersion: reviewed.recordVersion }, await versionOf())
    expect(approved.status).toBe("success")
    const stored = await read()
    expect(stored.versions[0]).toMatchObject({
      status: "APPROVED",
      current: true,
      stale: false,
      staleReason: null,
      servicePathway: "GUIDED",
      draftedBy: uid,
      reviewedBy: uid,
      approvedBy: uid,
    })
    expect(JSON.stringify(stored)).not.toContain("admin@profilerelaunch.com")
    const row = await detail()
    expect(row.stage).toBe("INITIAL_REVIEW")
    expect((await db.query(`select service_track from public.cases where id='${caseId}'`)).rows[0]).toMatchObject({ service_track: "UNDECIDED" })
    expect(await db.query("select to_regclass('public.quotes') as name")).toMatchObject({ rows: [{ name: null }] })
    const audit = await db.query<{ entity: string; action: string; reason: string; details: { operation: string; pathway: string } }>(
      "select entity, action, reason, details from public.admin_audit_events order by id",
    )
    expect(audit.rows.map(item => item.details.operation)).toEqual(["save_draft", "submit_review", "approve"])
    expect(audit.rows.every(item => item.action === "CASE_CHANGED" && item.entity === "case_assessment")).toBe(true)
    expect(audit.rows.every(item => !item.reason.includes("ownership letter") && !JSON.stringify(item.details).includes("ownership letter"))).toBe(true)
    expect((await db.query("select count(*)::int as n from public.case_work_events")).rows[0]).toMatchObject({ n: 0 })
  })

  it("refuses approval without ready evidence, then allows it for a suspended listing", async () => {
    const version = await versionOf()
    const saved = await command("save_draft", draft, version)
    expect(saved.status).toBe("success")
    const reviewed = await command("submit_review", { recordVersion: saved.recordVersion }, await versionOf())
    expect((await command("approve", { recordVersion: reviewed.recordVersion }, await versionOf())).status).toBe("prerequisite")
    expect((await read()).versions[0].status).toBe("REVIEWED")
    await acceptEvidence()
    expect((await command("approve", { recordVersion: reviewed.recordVersion }, await versionOf())).status).toBe("stale")
    const refreshed = await command("save_draft", withVersion(draft, reviewed.recordVersion), await versionOf())
    expect(refreshed.status).toBe("success")
    expect((await read()).versions[0].status).toBe("DRAFT")
    const reviewedAgain = await command("submit_review", { recordVersion: refreshed.recordVersion }, await versionOf())
    expect((await command("approve", { recordVersion: reviewedAgain.recordVersion }, await versionOf())).status).toBe("success")
    await db.exec(`update public.evidence_requests set status='OPEN' where id='${requestId}'`)
    const next = await command("save_draft", draft, await versionOf())
    const held = await command("submit_review", { recordVersion: next.recordVersion }, await versionOf())
    expect((await command("approve", { recordVersion: held.recordVersion }, await versionOf())).status).toBe("prerequisite")
    const source = (await db.query<{ def: string }>("select pg_get_functiondef('public.admin_case_assessment_command_v1(text,uuid,uuid,integer,text,jsonb)'::regprocedure) as def")).rows[0].def
    expect(source).not.toMatch(/service_track|business_profile_url|public\.quotes/)
  })

  it("makes an approval stale when the case issue changes and when the case is reopened later", async () => {
    await acceptEvidence()
    await db.exec(`insert into public.case_work_events(case_id,actor_id,event,note,visibility,details,created_at) values('${caseId}','${uid}','reopen','The case was opened again after closure.','INTERNAL','{}','2020-01-01')`)
    const saved = await command("save_draft", draft, await versionOf())
    const reviewed = await command("submit_review", { recordVersion: saved.recordVersion }, await versionOf())
    expect((await command("approve", { recordVersion: reviewed.recordVersion }, await versionOf())).status).toBe("success")
    expect((await read()).versions[0].current).toBe(true)
    await db.exec(`update public.cases set issue_description='The profile disappeared after a later edit.' where id='${caseId}'`)
    const changed = await read()
    expect(changed.versions[0]).toMatchObject({ status: "APPROVED", current: false, stale: true, staleReason: "facts" })
    await db.exec(`update public.cases set issue_description='The profile disappeared.' where id='${caseId}'`)
    expect((await read()).versions[0].current).toBe(true)
    await db.exec(`insert into public.case_work_events(case_id,actor_id,event,note,visibility,details,created_at) values('${caseId}','${uid}','reopen','The case was opened again after the approval.','INTERNAL','{}','2099-01-01')`)
    expect((await read()).versions[0]).toMatchObject({ current: false, stale: true, staleReason: "reopened" })
  })

  it("stales an approval when a material profile or evidence fact changes, and ignores unrelated edits", async () => {
    await db.exec(`update public.locations set business_profile_url='' where id='${location}'`)
    await acceptEvidence()
    const saved = await command("save_draft", draft, await versionOf())
    const reviewed = await command("submit_review", { recordVersion: saved.recordVersion }, await versionOf())
    expect((await command("approve", { recordVersion: reviewed.recordVersion }, await versionOf())).status).toBe("success")
    const current = { status: "APPROVED", current: true, stale: false, staleReason: null }
    const facts = { status: "APPROVED", current: false, stale: true, staleReason: "facts" }
    expect((await read()).versions[0]).toMatchObject(current)

    const material = [
      [`update public.businesses set display_name='Other Bakery' where id='${business}'`, `update public.businesses set display_name='Bakery' where id='${business}'`],
      [`update public.businesses set website_url='https://bakery.example' where id='${business}'`, `update public.businesses set website_url=null where id='${business}'`],
      [`update public.locations set location_name='High Street' where id='${location}'`, `update public.locations set location_name=null where id='${location}'`],
      [`update public.locations set country='Ireland' where id='${location}'`, `update public.locations set country='United Kingdom' where id='${location}'`],
      [`update public.locations set business_profile_url='https://maps.example/live' where id='${location}'`, `update public.locations set business_profile_url='' where id='${location}'`],
      [`update public.cases set review_url='https://maps.example/review/1' where id='${caseId}'`, `update public.cases set review_url=null where id='${caseId}'`],
      [`update public.evidence_requests set title='Ownership certificate' where id='${requestId}'`, `update public.evidence_requests set title='Ownership letter' where id='${requestId}'`],
      [`update public.evidence_requests set request_text='Upload the signed letter.' where id='${requestId}'`, `update public.evidence_requests set request_text='Upload the ownership letter.' where id='${requestId}'`],
      [`update public.case_documents set title='Signed ownership letter' where id='${documentId}'`, `update public.case_documents set title='Ownership letter' where id='${documentId}'`],
      [`update public.case_documents set title='Quarantined file' where id='${threatId}'`, `update public.case_documents set title='Rejected threat' where id='${threatId}'`],
      [`update public.case_document_versions set review_status='REJECTED' where id='${versionId}'`, `update public.case_document_versions set review_status='ACCEPTED' where id='${versionId}'`],
    ]
    for (const [change, restore] of material) {
      await db.exec(change)
      expect((await read()).versions[0]).toMatchObject(facts)
      await db.exec(restore)
      expect((await read()).versions[0]).toMatchObject(current)
    }

    await db.exec(`update public.customers set full_name='Sam', email='other@example.com', phone='+447700900123' where id='${customer}'`)
    await db.exec(`update public.businesses set display_name=' Bakery ', website_url='', updated_at='2020-01-01' where id='${business}'`)
    await db.exec(`update public.locations set business_profile_url=null, updated_at='2020-01-01' where id='${location}'`)
    await db.exec(`update public.cases set intake_snapshot='{"fullName":"Sam","email":"sam@example.com","phone":"+447700900123"}'::jsonb, priority='HIGH', next_action='Call the customer tomorrow.' where id='${caseId}'`)
    await db.exec(`update public.evidence_requests set due_at='2030-01-01', fulfilled_at='2026-02-01' where id='${requestId}'`)
    await db.exec(`update public.case_document_versions set original_filename='renamed.pdf', review_note='A staff note that is not a source fact.' where id='${versionId}'`)
    expect((await read()).versions[0]).toMatchObject(current)

    const basis = await db.query<{ src: string }>(
      "select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'admin_private' and p.proname = 'case_assessment_basis_v1'",
    )
    expect(basis.rows[0].src).toMatch(/business_profile_url/)
    expect(basis.rows[0].src).toMatch(/request_text/)
    expect(basis.rows[0].src).not.toMatch(/intake_snapshot|full_name|\bemail\b|\bphone\b|updated_at|original_filename|review_note|due_at|service_track/)
  })

  it("keeps the first approval immutable when a second version is approved", async () => {
    await acceptEvidence()
    const firstSave = await command("save_draft", draft, await versionOf())
    const firstReview = await command("submit_review", { recordVersion: firstSave.recordVersion }, await versionOf())
    const first = await command("approve", { recordVersion: firstReview.recordVersion }, await versionOf())
    expect(first.status).toBe("success")
    const secondSave = await command("save_draft", { ...draft, servicePathway: "MANAGED", recommendedAction: "Recommend Managed recovery instead of Guided." }, await versionOf())
    expect((await read()).versions.find((item: { versionNumber: number }) => item.versionNumber === 1).current).toBe(true)
    const secondReview = await command("submit_review", { recordVersion: secondSave.recordVersion }, await versionOf())
    expect((await command("approve", { recordVersion: secondReview.recordVersion }, await versionOf())).status).toBe("success")
    const stored = await read()
    const older = stored.versions.find((item: { versionNumber: number }) => item.versionNumber === 1)
    const newer = stored.versions.find((item: { versionNumber: number }) => item.versionNumber === 2)
    expect(older).toMatchObject({ status: "APPROVED", current: false, servicePathway: "GUIDED" })
    expect(newer).toMatchObject({ status: "APPROVED", current: true, servicePathway: "MANAGED" })
    await expect(db.exec(`update public.case_assessments set findings=findings||' changed after approval' where id='${first.id}'`)).rejects.toThrow(/immutable/)
    await expect(db.exec(`delete from public.case_assessments where id='${first.id}'`)).rejects.toThrow(/cannot be deleted/)
    expect((await db.query(`select status from public.case_assessments where id='${first.id}'`)).rows[0]).toMatchObject({ status: "APPROVED" })
  })

  it("rejects an unauthorised caller, a closed case, a stale record version, and direct table access", async () => {
    expect((await rpc("admin_case_assessment_command_v1", ["bad", crypto.randomUUID(), caseId, 1, "save_draft", draft])).status).toBe("unauthorized")
    expect(await rpc("admin_case_assessment_read_v1", ["bad", caseId])).toBeNull()
    await db.exec(`update public.cases set status='CLOSED' where id='${caseId}'`)
    expect((await command("save_draft", draft, await versionOf())).status).toBe("denied")
    await db.exec(`update public.cases set status='UNDER_REVIEW' where id='${caseId}'`)
    const saved = await command("save_draft", draft, await versionOf())
    expect((await command("save_draft", withVersion(draft, saved.recordVersion), 99)).status).toBe("conflict")
    expect((await command("save_draft", withVersion(draft, 9), await versionOf())).status).toBe("conflict")
    expect((await command("save_draft", { ...draft, servicePathway: "UNDECIDED" }, await versionOf())).status).toBe("conflict")
    const open = await command("save_draft", withVersion({ ...draft, servicePathway: "UNDECIDED" }, saved.recordVersion), await versionOf())
    const reviewed = await command("submit_review", { recordVersion: open.recordVersion }, await versionOf())
    expect((await command("approve", { recordVersion: reviewed.recordVersion }, await versionOf())).status).toBe("invalid")
    const privilege = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
      `select has_table_privilege('anon','public.case_assessments','SELECT') as anon,
              has_table_privilege('authenticated','public.case_assessments','SELECT') as authenticated,
              has_table_privilege('service_role','public.case_assessments','SELECT') as service`,
    )
    expect(privilege.rows[0]).toEqual({ anon: false, authenticated: false, service: false })
    const execute = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.admin_case_assessment_command_v1(text,uuid,uuid,integer,text,jsonb)', 'EXECUTE') as ok",
    )
    expect(execute.rows[0].ok).toBe(false)
  })
})
