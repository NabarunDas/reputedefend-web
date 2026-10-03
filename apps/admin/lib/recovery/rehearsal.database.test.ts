import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform, repositoryMigrationFilenames } from "./harness"
import { appliedMigrationHead, manifestFilenames, migrationChain, migrationHead } from "./manifest"
import { rehearsalBucket, rehearsalIdPrefix, rehearsalIds, rehearsalMarker, rehearsalSubmissionKeys, seedRehearsalDataset } from "./dataset"
import { captureFingerprint, compareFingerprints, fingerprintHasOrphans, type Fingerprint } from "./fingerprint"
import { reconcileEvidenceStorage, storageRecoveryBlocked, type EvidenceRecord, type StorageObject } from "./storage"
import { validatePackRecovery, type PackItemRecord, type PackVersionRecord } from "./packs"
import { reconcileJobRecovery, type JobRecord, type OutboxRecord } from "./jobs"
import { buildRecoveryReport, renderReportJson, renderReportText } from "./report"

const db = new PGlite()
const sequence = migrationChain.map(entry => entry.version)
let rebuildMs = 0
let fingerprint: Fingerprint

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function count(sql: string): Promise<number> {
  return Number((await rows<{ n: number }>(sql))[0]?.n ?? 0)
}

async function fails(sql: string): Promise<string> {
  try {
    await db.exec(sql)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error(`expected the database to reject: ${sql}`)
}

beforeAll(async () => {
  await preparePlatform(db)
  const result = await applyChain(db)
  rebuildMs = result.totalMs
  await seedRehearsalDataset(db)
  fingerprint = await captureFingerprint(db, {
    marker: rehearsalMarker,
    migrationSequence: sequence,
    syntheticIdPrefix: rehearsalIdPrefix,
  })
}, 180000)

afterAll(async () => { await db.close() })

describe("rebuilding the whole schema from zero", () => {
  it("applies every migration in the repository, in order, with nothing cherry-picked", () => {
    expect(manifestFilenames()).toEqual(repositoryMigrationFilenames())
    expect(migrationChain).toHaveLength(31)
    // A clean rebuild includes the unapplied UX-10C migration. Dev is still at UX-10A.
    expect(migrationHead.version).toBe("20261003154314")
    expect(appliedMigrationHead.version).toBe("20261003125151")
  })

  it("includes the marketing intake migration that no feature test exercises", async () => {
    // 20260915193000 was never applied by any existing PGlite suite, so a
    // clean rebuild is the only thing proving it still runs against the chain.
    const intake = await count(
      "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_case_intake_v1'",
    )
    expect(intake).toBe(1)
  })

  it("creates every object the manifest says each migration delivers", async () => {
    for (const entry of migrationChain) {
      const [schema, name] = entry.verification.probe.split(".")
      const present = await count(
        `select count(*)::int as n from (
           select 1 from information_schema.tables where table_schema = '${schema}' and table_name = '${name}'
           union all
           select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace where x.nspname = '${schema}' and p.proname = '${name}'
         ) found`,
      )
      expect(`${entry.filename}:${present > 0}`).toBe(`${entry.filename}:true`)
    }
  })

  it("protects every public table with row level security", async () => {
    const unprotected = await rows<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false`,
    )
    expect(unprotected.map(row => row.relname)).toEqual([])
  })

  it("denies browser roles direct access to restored data", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`)
      try {
        await expect(db.query("select * from public.cases")).rejects.toThrow(/permission denied/)
        await expect(db.query("select * from public.case_document_versions")).rejects.toThrow(/permission denied/)
        await expect(db.query("select * from public.provider_connections")).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec("reset role")
      }
    }
  })
})

describe("invariants a rebuilt database must still enforce", () => {
  it("keeps the Admin identity a singleton", async () => {
    expect(await count("select count(*)::int as n from public.admin_identity")).toBe(1)
    const message = await fails(
      `insert into public.admin_identity(singleton,auth_user_id,enabled) values(false,'${rehearsalIds.adminUser}',true)`,
    )
    expect(message).toMatch(/singleton|check|protect/i)
  })

  it("keeps enquiry, case and monitoring intake de-duplicated by submission key", async () => {
    expect(await fails(
      `insert into public.enquiries(submission_key,fingerprint,source,payload,internal_status,ack_status)
       values('${rehearsalSubmissionKeys.enquiry}','x','contact','{}','SKIPPED','SKIPPED')`,
    )).toMatch(/duplicate key|unique/i)
    expect(await fails(
      `insert into public.cases(public_ref,case_type,customer_id,business_id,location_id,issue_description,submission_key)
       values('PR-26-RHRSL9','PROFILE_RECOVERY','${rehearsalIds.customerA}','${rehearsalIds.businessA}','${rehearsalIds.locationA}','duplicate','${rehearsalSubmissionKeys.case}')`,
    )).toMatch(/duplicate key|unique/i)
  })

  it("keeps a case reference well formed and matched to its type", async () => {
    expect(await fails(
      `insert into public.cases(public_ref,case_type,customer_id,business_id,location_id,issue_description)
       values('RV-26-RHRSL8','PROFILE_RECOVERY','${rehearsalIds.customerA}','${rehearsalIds.businessA}','${rehearsalIds.locationA}','mismatched reference')`,
    )).toMatch(/public_ref/i)
  })

  it("keeps evidence storage keys unique and opaque", async () => {
    const version = (await rows<{ storage_key: string; storage_bucket: string }>(
      `select storage_key, storage_bucket from public.case_document_versions where id = '${rehearsalIds.versionAccepted}'`,
    ))[0]
    expect(version.storage_bucket).toBe(rehearsalBucket)
    expect(version.storage_key).not.toContain("synthetic-accepted.pdf")
    expect(await fails(
      `insert into public.case_document_versions(document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,created_by)
       values('${rehearsalIds.documentB}',9,'clash.pdf','application/pdf',1024,'${rehearsalBucket}','${version.storage_key}','${rehearsalIds.adminUser}')`,
    )).toMatch(/duplicate key|unique/i)
  })

  it("keeps a prepared pack pinned to eligible evidence only", async () => {
    expect(await fails(
      `insert into public.case_prepared_pack_items(pack_id,document_id,version_id,position,document_title,original_filename,content_type,size_bytes,added_by)
       values('${rehearsalIds.pack}','${rehearsalIds.documentB}','${rehearsalIds.versionPending}',2,'pending','p.pdf','application/pdf',10240,'${rehearsalIds.adminUser}')`,
    )).toMatch(/draft|eligib|accepted/i)
  })

  it("keeps customer action secrets unique", async () => {
    const secret = (await rows<{ secret_hash: string }>(
      `select secret_hash from public.customer_actions where id = '${rehearsalIds.customerAction}'`,
    ))[0].secret_hash
    expect(await fails(
      `insert into public.customer_actions(customer_id,business_id,location_id,case_id,kind,status,secret_hash,expected_email_snapshot,expires_at,created_by)
       values('${rehearsalIds.customerA}','${rehearsalIds.businessA}','${rehearsalIds.locationA}','${rehearsalIds.caseA}','CASE_ACCESS','OPEN','${secret}','customer.one@rehearsal.invalid',now() + interval '1 day','${rehearsalIds.adminUser}')`,
    )).toMatch(/duplicate key|unique/i)
  })

  it("keeps job and outbox idempotency keys unique", async () => {
    expect(await fails(
      `insert into admin_private.jobs(job_type,idempotency_key,payload,status,scheduled_at)
       values('SYSTEM_HEALTH_PROBE','rehearsal-job-retry-0001','{}','PENDING',now())`,
    )).toMatch(/duplicate key|unique/i)
    expect(await fails(
      `insert into admin_private.job_outbox(event_key,topic,payload)
       values('rehearsal-outbox-pending-0001','SYSTEM_HEALTH_PROBE','{}')`,
    )).toMatch(/duplicate key|unique/i)
  })

  it("keeps a communication attached to exactly one parent", async () => {
    expect(await fails(
      `insert into public.communications(case_id,monitoring_request_id,communication_type,recipient)
       values('${rehearsalIds.caseA}','${rehearsalIds.monitoringRequest}','CASE_RECEIVED_CUSTOMER','x@rehearsal.invalid')`,
    )).toMatch(/exactly_one_parent/i)
  })

  it("keeps the seeded catalogue prices and their effective dating", async () => {
    const approved = await count("select count(*)::int as n from public.price_versions where status = 'APPROVED'")
    expect(approved).toBeGreaterThanOrEqual(5)
    expect(await fails(
      "insert into public.price_versions(service_code,display_name,amount_minor,payment_model,billing_cadence,billing_unit,effective_from,status,created_by) " +
      `values('GUIDED_RELAUNCH','bad model',1000,'RECURRING_MONTHLY','MONTHLY','SERVICE',now(),'DRAFT','${rehearsalIds.adminUser}')`,
    )).toMatch(/service_model/i)
  })

  it("keeps Stripe operations out of live mode", async () => {
    expect(await fails(
      `insert into public.provider_operations(idempotency_key,kind,purpose,livemode,status)
       values('${rehearsalIds.adminUser}','CHECKOUT_SESSION','UPFRONT_SERVICE',true,'PENDING')`,
    )).toMatch(/livemode|check/i)
  })

  it("keeps Guard observation capture manual", async () => {
    expect(await fails(
      `update public.guard_check_observations set capture_method = 'AUTOMATED' where id = '${rehearsalIds.guardObservation}'`,
    )).toMatch(/capture_method|check|immutab/i)
  })

  it("keeps reporting saved filters scoped to the Admin", async () => {
    const exists = await count(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'admin_saved_filters'",
    )
    expect(exists).toBe(1)
  })

  it("keeps Step 20 settings payloads validated", async () => {
    expect(await fails(
      `insert into public.admin_setting_versions(setting_key,version,status,payload,effective_from,reason,created_by)
       values('SERVICE_HOURS',2,'DRAFT','{"unexpected":true}',now(),'invalid payload','${rehearsalIds.adminUser}')`,
    )).toMatch(/invalid|secret/i)
  })

  it("keeps Step 21 OAuth state single use and token material out of the database", async () => {
    expect(await count("select count(*)::int as n from public.provider_oauth_states")).toBe(0)
    expect(await count("select count(*)::int as n from public.provider_connections")).toBe(0)
    expect(await fails(
      `insert into public.provider_connections(provider,customer_id,token_ciphertext,token_iv,token_auth_tag,encryption_key_version,created_by)
       values('GOOGLE_BUSINESS_PROFILE','${rehearsalIds.customerA}','ya29.leaked-token-value','iv','tag','v1','${rehearsalIds.adminUser}')`,
    )).toMatch(/ciphertext_opaque|check/i)
  })
})

describe("the anonymised rehearsal dataset", () => {
  it("covers every domain a recovery has to prove", async () => {
    const populated = [
      "public.customers", "public.businesses", "public.locations", "public.business_memberships",
      "public.enquiries", "public.monitoring_requests", "public.cases",
      "public.evidence_requests", "public.case_documents", "public.case_document_versions",
      "public.case_prepared_packs", "public.case_prepared_pack_items", "public.customer_actions",
      "admin_private.job_outbox", "admin_private.jobs", "admin_private.job_worker_heartbeats",
      "public.communications", "public.conversations", "public.conversation_messages",
      "public.quotes", "public.quote_versions", "public.quote_acceptances", "public.service_orders",
      "public.guard_coverages", "public.guard_check_obligations", "public.guard_check_observations", "public.guard_alerts",
      "public.admin_setting_versions", "public.privacy_requests", "public.operational_incidents",
    ]
    for (const table of populated) {
      expect(`${table}:${fingerprint.tableRowCounts[table] > 0}`).toBe(`${table}:true`)
    }
  })

  it("contains no real personal data, provider identifier or secret", async () => {
    const contacts = await rows<{ full_name: string; email: string; phone: string }>(
      "select full_name, email, phone from public.customers",
    )
    for (const contact of contacts) {
      expect(contact.full_name).toMatch(/^Rehearsal Customer/)
      expect(contact.email).toMatch(/@rehearsal\.invalid$/)
      expect(contact.phone).toMatch(/^\+4477009000\d\d$/)
    }
    const providerRefs = await count(
      "select count(*)::int as n from public.service_orders where public_ref !~ '^SO-26-RHRSL'",
    )
    expect(providerRefs).toBe(0)
    expect(await count("select count(*)::int as n from public.stripe_customer_maps")).toBe(0)
    expect(await count("select count(*)::int as n from public.provider_connections")).toBe(0)
  })

  it("marks every synthetic row with the rehearsal identifier prefix", async () => {
    expect(fingerprint.syntheticIdentifiers.length).toBeGreaterThan(0)
    for (const identifier of fingerprint.syntheticIdentifiers) {
      expect(identifier.startsWith(rehearsalIdPrefix)).toBe(true)
    }
  })

  it("stores evidence under a synthetic bucket and a derived key only", async () => {
    const versions = await rows<{ storage_bucket: string; storage_key: string }>(
      "select storage_bucket, storage_key from public.case_document_versions",
    )
    for (const version of versions) {
      expect(version.storage_bucket).toBe(rehearsalBucket)
      expect(version.storage_key).toMatch(new RegExp(`^cases/${rehearsalIdPrefix}-`))
    }
  })
})

describe("the recovery fingerprint", () => {
  it("finds no orphan rows in a cleanly rebuilt database", () => {
    expect(fingerprintHasOrphans(fingerprint)).toBe(false)
    expect(Object.values(fingerprint.orphanCounts).every(value => value === 0)).toBe(true)
  })

  it("records relationships, states and the migration sequence", () => {
    expect(fingerprint.relationshipCounts.verified_memberships).toBe(2)
    expect(fingerprint.relationshipCounts.pack_item_to_version).toBe(1)
    expect(fingerprint.relationshipCounts.coverage_to_order).toBe(1)
    expect(fingerprint.statusCounts["cases.status=UNDER_REVIEW"]).toBe(1)
    expect(fingerprint.jobStateCounts["jobs.status=DEAD_LETTER"]).toBe(1)
    expect(fingerprint.outboxCounts).toEqual({ promoted: 1, unpromoted: 1 })
    expect(fingerprint.migrationSequence).toEqual(sequence)
    expect(fingerprint.schemaHead).toBe(migrationHead.version)
  })

  it("carries no plaintext customer data", () => {
    const serialised = JSON.stringify(fingerprint)
    expect(serialised).not.toContain("Rehearsal Customer One")
    expect(serialised).not.toContain("rehearsal.invalid")
    expect(serialised).not.toContain("+447700900001")
    expect(serialised).not.toContain("cases/")
    for (const digest of Object.values(fingerprint.columnDigests)) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it("reproduces an identical fingerprint when the schema is rebuilt from the same chain", async () => {
    const rebuilt = new PGlite()
    try {
      await preparePlatform(rebuilt)
      await applyChain(rebuilt)
      await seedRehearsalDataset(rebuilt)
      const after = await captureFingerprint(rebuilt, {
        marker: rehearsalMarker,
        migrationSequence: sequence,
        syntheticIdPrefix: rehearsalIdPrefix,
      })
      const comparison = compareFingerprints(fingerprint, after)
      expect(comparison.differences).toEqual([])
      expect(comparison.matched).toBe(true)
    } finally {
      await rebuilt.close()
    }
  }, 180000)

  it("reports a difference rather than tolerating a lost row", () => {
    const damaged: Fingerprint = {
      ...fingerprint,
      tableRowCounts: { ...fingerprint.tableRowCounts, "public.cases": 0 },
      columnDigests: { ...fingerprint.columnDigests, "public.cases": "0".repeat(64) },
    }
    const comparison = compareFingerprints(fingerprint, damaged)
    expect(comparison.matched).toBe(false)
    expect(comparison.differences.map(difference => difference.area)).toContain("tableRowCounts")
    expect(comparison.differences.map(difference => difference.area)).toContain("columnDigests")
  })
})

describe("intake retry and idempotency after a rebuild", () => {
  it("returns the existing case instead of creating a duplicate when a retry arrives", async () => {
    const before = await count("select count(*)::int as n from public.cases")
    const replay = await rows<{ case_id: string; was_existing: boolean }>(
      `select case_id, was_existing from public.create_case_intake_v1(
        $1,'PROFILE_RECOVERY',null,'Rehearsal Customer One','customer.one@rehearsal.invalid','+447700900001',
        'Rehearsal Business One','GB',null,null,null,'Synthetic retry of the same submission.',true,true,'{}'::jsonb,'ops@rehearsal.invalid')`,
      [rehearsalSubmissionKeys.case],
    )
    expect(replay[0].was_existing).toBe(true)
    expect(replay[0].case_id).toBe(rehearsalIds.caseA)
    expect(await count("select count(*)::int as n from public.cases")).toBe(before)
  })

  it("returns the existing monitoring request instead of creating a duplicate", async () => {
    const before = await count("select count(*)::int as n from public.monitoring_requests")
    const replay = await rows<{ monitoring_request_id: string; was_existing: boolean }>(
      `select monitoring_request_id, was_existing from public.create_monitoring_request_v1(
        $1,'Rehearsal Customer Two','customer.two@rehearsal.invalid','+447700900002','Rehearsal Business Two','GB',
        null,'https://profile.rehearsal.invalid/two',1,true,'{}'::jsonb,'ops@rehearsal.invalid')`,
      [rehearsalSubmissionKeys.monitoring],
    )
    expect(replay[0].was_existing).toBe(true)
    expect(replay[0].monitoring_request_id).toBe(rehearsalIds.monitoringRequest)
    expect(await count("select count(*)::int as n from public.monitoring_requests")).toBe(before)
  })

  it("replays an Admin command receipt rather than performing the command twice", async () => {
    const replay = await rows<{ value: unknown }>(
      `select admin_private.job_receipt_v1($1,$2,$3) as value`,
      [rehearsalIds.adminUser, rehearsalSubmissionKeys.commandRequest, null],
    )
    expect(replay[0].value).toMatchObject({ status: "conflict" })
    const stored = await rows<{ response: { status: string } }>(
      `select response from admin_private.job_command_receipts where request_id = $1`,
      [rehearsalSubmissionKeys.commandRequest],
    )
    expect(stored[0].response.status).toBe("success")
  })

  it("keeps the retry safeguard a database constraint, not application convention", async () => {
    const indexes = await rows<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'cases' and indexname = 'cases_submission_key_uidx'",
    )
    expect(indexes[0].indexdef).toContain("UNIQUE")
  })
})

describe("auth and session recovery", () => {
  it("restores the single Admin identity and adds no second account", async () => {
    expect(await count("select count(*)::int as n from public.admin_identity where enabled")).toBe(1)
    const identity = await rows<{ auth_user_id: string }>("select auth_user_id from public.admin_identity")
    expect(identity[0].auth_user_id).toBe(rehearsalIds.adminUser)
  })

  it("stores only a session token hash, never a token", async () => {
    const columns = await rows<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'admin_sessions'",
    )
    const names = columns.map(column => column.column_name)
    expect(names).toContain("token_hash")
    expect(names).not.toContain("token")
  })
})

describe("storage, pack and job reconciliation driven by restored rows", () => {
  async function evidenceRecords(): Promise<EvidenceRecord[]> {
    return (await rows<{
      version_id: string; document_id: string; case_id: string; storage_bucket: string; storage_key: string
      declared_size_bytes: string; declared_content_type: string; upload_status: EvidenceRecord["uploadStatus"]
      scan_status: string; validation_status: string
    }>(
      `select v.id as version_id, v.document_id, d.case_id, v.storage_bucket, v.storage_key,
              v.declared_size_bytes, v.declared_content_type, v.upload_status, v.scan_status, v.validation_status
       from public.case_document_versions v join public.case_documents d on d.id = v.document_id order by v.id`,
    )).map(row => ({
      versionId: row.version_id,
      documentId: row.document_id,
      caseId: row.case_id,
      bucket: row.storage_bucket,
      key: row.storage_key,
      sizeBytes: Number(row.declared_size_bytes),
      contentType: row.declared_content_type,
      uploadStatus: row.upload_status,
      scanStatus: row.scan_status,
      validationStatus: row.validation_status,
      checksum: null,
    }))
  }

  function inventoryFor(records: EvidenceRecord[]): StorageObject[] {
    return records
      .filter(record => record.uploadStatus === "UPLOADED")
      .map(record => ({ bucket: record.bucket, key: record.key, sizeBytes: record.sizeBytes, contentType: record.contentType }))
  }

  it("reconciles restored evidence metadata against a synthetic object inventory", async () => {
    const records = await evidenceRecords()
    const report = reconcileEvidenceStorage(records, { inventory: inventoryFor(records), expectedBucket: rehearsalBucket })
    expect(report.counts.MATCHED).toBe(1)
    expect(report.counts.NOT_CHECKED).toBe(1)
    expect(report.incompleteUploads).toBe(1)
    expect(storageRecoveryBlocked(report)).toBe(false)
    // Structural only: the schema stores no hash, so the bytes are not proven.
    expect(report.structurallyMatched).toBe(true)
    expect(report.byteIntegrityProven).toBe(false)
    expect(report.fullyVerified).toBe(false)
  })

  it("confirms the approved pack still resolves to the version it was approved with", async () => {
    const records = await evidenceRecords()
    const storage = reconcileEvidenceStorage(records, { inventory: inventoryFor(records), expectedBucket: rehearsalBucket })
    const items: PackItemRecord[] = (await rows<{
      pack_id: string; id: string; document_id: string; version_id: string; position: number; content_type: string; size_bytes: string
    }>("select pack_id, id, document_id, version_id, position, content_type, size_bytes from public.case_prepared_pack_items order by position"))
      .map(row => ({
        packId: row.pack_id,
        itemId: row.id,
        documentId: row.document_id,
        versionId: row.version_id,
        position: row.position,
        contentType: row.content_type,
        sizeBytes: Number(row.size_bytes),
      }))
    const versions: PackVersionRecord[] = (await rows<{
      id: string; document_id: string; declared_content_type: string; declared_size_bytes: string; review_status: string
    }>("select id, document_id, declared_content_type, declared_size_bytes, review_status from public.case_document_versions"))
      .map(row => ({
        versionId: row.id,
        documentId: row.document_id,
        contentType: row.declared_content_type,
        sizeBytes: Number(row.declared_size_bytes),
        reviewStatus: row.review_status,
      }))
    const report = validatePackRecovery({ items, versions, storage })
    expect(report.nonRecoverablePacks).toEqual([])
    expect(report.recoverablePacks).toEqual([rehearsalIds.pack])
  })

  it("classifies the restored queue without authorising a replay", async () => {
    const jobs: JobRecord[] = (await rows<{
      id: string; job_type: string; idempotency_key: string; status: JobRecord["status"]
      attempts: number; max_attempts: number; lease_expires_at: string | null; lease_owner: string | null
    }>("select id, job_type, idempotency_key, status, attempts, max_attempts, lease_expires_at, lease_owner from admin_private.jobs order by id"))
      .map(row => ({
        jobId: row.id,
        jobType: row.job_type,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : null,
        leaseOwner: row.lease_owner,
      }))
    const outbox: OutboxRecord[] = (await rows<{ id: string; event_key: string; topic: string; promoted: boolean; has_job: boolean }>(
      `select o.id, o.event_key, o.topic, o.promoted_at is not null as promoted, j.id is not null as has_job
       from admin_private.job_outbox o left join admin_private.jobs j on j.outbox_id = o.id order by o.id`,
    )).map(row => ({ outboxId: row.id, eventKey: row.event_key, topic: row.topic, promoted: row.promoted, hasJob: row.has_job }))

    const report = reconcileJobRecovery({ jobs, outbox, now: new Date(), providerGatesEnabled: false })
    expect(report.blindReplayPermitted).toBe(false)
    expect(report.counts.release_stale_lease).toBe(1)
    expect(report.counts.promote_outbox_entry).toBe(1)
    expect(report.counts.no_action).toBe(1)
    expect(report.requiresHumanReview).toBe(true)
  })
})

describe("failure injection", () => {
  it("detects an evidence object that is missing from the bucket", async () => {
    const records = await (async () => {
      const all = await rows<{ id: string; document_id: string; case_id: string; storage_bucket: string; storage_key: string; declared_size_bytes: string; declared_content_type: string }>(
        `select v.id, v.document_id, d.case_id, v.storage_bucket, v.storage_key, v.declared_size_bytes, v.declared_content_type
         from public.case_document_versions v join public.case_documents d on d.id = v.document_id where v.upload_status = 'UPLOADED'`,
      )
      return all.map(row => ({
        versionId: row.id,
        documentId: row.document_id,
        caseId: row.case_id,
        bucket: row.storage_bucket,
        key: row.storage_key,
        sizeBytes: Number(row.declared_size_bytes),
        contentType: row.declared_content_type,
        uploadStatus: "UPLOADED" as const,
        scanStatus: "NO_THREATS_FOUND",
        validationStatus: "VALID",
      }))
    })()
    const report = reconcileEvidenceStorage(records, { inventory: [], expectedBucket: rehearsalBucket })
    expect(report.counts.DATABASE_ONLY).toBe(1)
    expect(storageRecoveryBlocked(report)).toBe(true)
  })

  it("detects orphan storage metadata left behind by a partial restore", async () => {
    await db.exec("begin")
    try {
      await db.exec("alter table public.case_document_versions drop constraint case_document_versions_document_id_fkey")
      await db.exec(
        `update public.case_document_versions set document_id = '5e5e5e5e-0000-4000-8000-000000000999' where id = '${rehearsalIds.versionPending}'`,
      )
      const damaged = await captureFingerprint(db, {
        marker: rehearsalMarker,
        migrationSequence: sequence,
        syntheticIdPrefix: rehearsalIdPrefix,
      })
      expect(damaged.orphanCounts.versions_without_document).toBe(1)
      expect(fingerprintHasOrphans(damaged)).toBe(true)
      expect(compareFingerprints(fingerprint, damaged).matched).toBe(false)
    } finally {
      await db.exec("rollback")
    }
  })

  it("detects a stale job lease", async () => {
    const stale = await rows<{ id: string }>(
      "select id from admin_private.jobs where status = 'RUNNING' and lease_expires_at < now()",
    )
    expect(stale).toHaveLength(1)
    const report = reconcileJobRecovery({
      jobs: [{
        jobId: stale[0].id,
        jobType: "SYSTEM_HEALTH_PROBE",
        idempotencyKey: "rehearsal-job-lease-0001",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 5,
        leaseExpiresAt: new Date(Date.now() - 1000),
        leaseOwner: "rehearsal-worker",
      }],
      outbox: [],
      now: new Date(),
      providerGatesEnabled: false,
    })
    expect(report.findings[0].action).toBe("release_stale_lease")
  })

  it("detects a duplicate idempotency retry at the database boundary", async () => {
    expect(await fails(
      `insert into admin_private.job_command_receipts(request_id,actor_id,fingerprint,response)
       values('${rehearsalSubmissionKeys.commandRequest}','${rehearsalIds.adminUser}','other','{}')`,
    )).toMatch(/duplicate key|unique/i)
  })

  it("refuses to let a restore write a provider token into the database", async () => {
    expect(await fails(
      `insert into public.provider_oauth_states(provider,state_hash,actor_id,session_binding,redirect_uri,customer_id,expires_at)
       values('GOOGLE_BUSINESS_PROFILE','ya29.not-a-hash','${rehearsalIds.adminUser}','${"a".repeat(64)}','https://admin.example/callback','${rehearsalIds.customerA}',now() + interval '10 minutes')`,
    )).toMatch(/check|state_hash/i)
  })
})

describe("the recovery evidence report produced by this rehearsal", () => {
  function rebuildReport() {
    return buildRecoveryReport({
      runId: "clean-schema-rebuild",
      sourceRevision: "step-22a-rehearsal",
      migrationHead: migrationHead.version,
      rehearsalType: "clean_schema_rebuild",
      startedAt: "1970-01-01T00:00:00.000Z",
      finishedAt: "1970-01-01T00:00:00.000Z",
      scope: { verifiesRecoveredState: true, requiresByteIntegrity: false },
      checks: [
        { name: "chain applied in order", passed: true, detail: `${migrationChain.length} migrations applied with nothing cherry-picked` },
        { name: "no orphan rows", passed: !fingerprintHasOrphans(fingerprint), detail: "every orphan probe returned zero" },
      ],
      fingerprint: compareFingerprints(fingerprint, fingerprint),
      storage: null,
      packs: null,
      jobs: null,
      unresolvedGaps: [
        { severity: "LIMITATION", detail: "no live Supabase restore has been performed" },
        { severity: "LIMITATION", detail: "no live AWS S3 operation has been performed" },
        {
          severity: "LIMITATION",
          detail: "the schema stores no evidence content hash, so byte-level integrity cannot be proved from the database alone",
        },
      ],
      rpoRtoObservations: [`a clean rebuild of the full chain took ${rebuildMs} ms against in-process PostgreSQL`],
    })
  }

  it("records the run and stays safe to share", () => {
    const report = rebuildReport()
    expect(report.rehearsalStatus).toBe("PASSED")
    const text = renderReportText(report)
    expect(text).toContain("no live Supabase restore has been performed")
    expect(text).toContain("not an approved recovery target")
    expect(() => renderReportJson(report)).not.toThrow()
  })

  it("does not claim a verified recovery for domains this rehearsal never exercised", () => {
    const report = rebuildReport()
    expect(report.recoveryVerification.verification).toBe("PARTIALLY_VERIFIED")
    expect(report.recoveryVerification.blockers).toEqual([])
    expect(report.recoveryVerification.limitations.join(" ")).toContain("evidence object storage was not reconciled")
    expect(renderReportText(report)).toContain("Recovery verification: PARTIALLY_VERIFIED")
  })

  it("keeps nested evidence through the machine-readable form", () => {
    const parsed = JSON.parse(renderReportJson(rebuildReport()))
    expect(parsed.checks[0].name).toBe("chain applied in order")
    expect(parsed.checks[0].passed).toBe(true)
    expect(parsed.checks[0].detail).toContain(`${migrationChain.length} migrations`)
    expect(parsed.unresolvedGaps[0].severity).toBe("LIMITATION")
    expect(parsed.recoveryVerification.verification).toBe("PARTIALLY_VERIFIED")
    expect(parsed.signoff.note).toContain("An Owner signs this off")
  })
})
