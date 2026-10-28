import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, applyUpgrade, preparePlatform } from "./harness"
import { chainAfter, chainThrough } from "./manifest"
import { rehearsalIdPrefix, rehearsalIds, rehearsalMarker, rehearsalSeedFragments, rehearsalSubmissionKeys } from "./dataset"
import { captureFingerprint, compareFingerprints, fingerprintHasOrphans, type Fingerprint } from "./fingerprint"

/**
 * Represents a database that is already running and has to receive the
 * migrations it has not yet seen. The checkpoint is Step 10, which is the last
 * point where every domain the rehearsal dataset needs already exists.
 */
const checkpoint = "20260929183214"

const db = new PGlite()
let before: Fingerprint
let after: Fingerprint
let upgradeMs = 0

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function count(sql: string): Promise<number> {
  return Number((await rows<{ n: number }>(sql))[0]?.n ?? 0)
}

function snapshot(db: PGlite) {
  return captureFingerprint(db, {
    marker: rehearsalMarker,
    migrationSequence: [],
    syntheticIdPrefix: rehearsalIdPrefix,
  })
}

/** Only the domains that exist at the checkpoint can be seeded there. */
const checkpointDomains = ["admin identity", "core records", "intake", "evidence and packs", "customer actions", "jobs and outbox"]

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db, { through: checkpoint })
  for (const fragment of rehearsalSeedFragments.filter(item => checkpointDomains.includes(item.domain))) {
    await db.exec(fragment.sql)
  }
  before = await snapshot(db)
  const result = await applyUpgrade(db, checkpoint)
  upgradeMs = result.totalMs
  after = await snapshot(db)
}, 180000)

afterAll(async () => { await db.close() })

describe("upgrading a database that is already running", () => {
  it("starts from a real earlier checkpoint rather than an empty schema", () => {
    expect(chainThrough(checkpoint)).toHaveLength(15)
    expect(chainAfter(checkpoint)).toHaveLength(69)
  })

  it("applies only the migrations the running database had not received, in order", async () => {
    const pending = chainAfter(checkpoint)
    expect(pending[0].version).toBe("20260929210000")
    // The repository tail is the applied draft-role command. It must not be
    // replayed. This disposable rebuild is not a live apply. Production
    // remains at SEC-08.
    expect(pending.at(-1)?.filename).toBe("20261028200000_admin_pack_draft_role_v1.sql")
    expect(pending.at(-1)?.appliedToDev).toBe(true)
    expect(pending.at(-2)?.filename).toBe("20261028160000_guided_pack_publish_visibility_v1.sql")
    expect(pending.at(-2)?.appliedToDev).toBe(true)
    expect(pending.at(-3)?.filename).toMatch(/guided_postpayment_handover_v1\.sql$/)
    expect(pending.at(-3)?.appliedToDev).toBe(true)
    expect(pending.at(-4)?.filename).toMatch(/billing_documents_v1\.sql$/)
    expect(pending.at(-4)?.appliedToDev).toBe(true)
    expect(pending.at(-5)?.filename).toMatch(/dev_payment_receipt_delivery_v1\.sql$/)
    expect(pending.at(-5)?.appliedToDev).toBe(true)
    expect(pending.at(-6)?.filename).toMatch(/dev_payment_event_worker_v1\.sql$/)
    expect(pending.at(-6)?.appliedToDev).toBe(true)
    expect(pending.at(-7)?.filename).toMatch(/checkout_refresh_v1\.sql$/)
    expect(pending.at(-7)?.appliedToDev).toBe(true)
    expect(pending.at(-8)?.filename).toMatch(/checkout_presentation_v1\.sql$/)
    expect(pending.at(-8)?.appliedToDev).toBe(true)
    expect(pending.at(-9)?.filename).toMatch(/managed_success_verification_v1\.sql$/)
    expect(pending.at(-9)?.appliedToDev).toBe(true)
    expect(pending.at(-10)?.filename).toMatch(/guided_fulfilment_closure_v1\.sql$/)
    expect(pending.at(-10)?.appliedToDev).toBe(true)
    expect(pending.at(-11)?.filename).toMatch(/guided_fulfilment_handover_v1\.sql$/)
    expect(pending.at(-11)?.appliedToDev).toBe(true)
    expect(pending.at(-12)?.filename).toMatch(/guided_payment_request_email_v1\.sql$/)
    expect(pending.at(-12)?.appliedToDev).toBe(true)
    expect(pending.at(-13)?.filename).toMatch(/admin_reconcile_accepted_service_v1\.sql$/)
    expect(pending.at(-13)?.appliedToDev).toBe(true)
    expect(pending.at(-13)?.version).toBe("20261024233701")
    expect(pending.at(-14)?.filename).toMatch(/quote_offer_email_snapshot_v1\.sql$/)
    expect(pending.at(-14)?.appliedToDev).toBe(true)
    expect(pending.at(-14)?.version).toBe("20261024190832")
    expect(pending.at(-15)?.filename).toMatch(/admin_recent_signin_30m_v1\.sql$/)
    expect(pending.at(-15)?.appliedToDev).toBe(true)
    expect(pending.at(-16)?.filename).toMatch(/dev_email_recent_login_30m_v1\.sql$/)
    expect(pending.at(-16)?.appliedToDev).toBe(true)
    expect(pending.at(-17)?.version).toBe("20261023221028")
    expect(pending.at(-17)?.appliedToDev).toBe(true)
    expect(pending.at(-18)?.filename).toMatch(/customer_multi_item_evidence_v1\.sql$/)
    expect(pending.at(-18)?.appliedToDev).toBe(true)
    expect(pending.at(-19)?.version).toBe("20261023103232")
    expect(pending.at(-19)?.appliedToDev).toBe(true)
    expect(pending.at(-20)?.version).toBe("20261023091735")
    expect(pending.at(-20)?.appliedToDev).toBe(true)
    expect(pending.at(-21)?.version).toBe("20261023000158")
    expect(pending.at(-21)?.appliedToDev).toBe(true)
    expect(pending.at(-22)?.version).toBe("20261022172455")
    expect(pending.at(-22)?.appliedToDev).toBe(true)
    expect(pending.some(entry => entry.version === "20261021214813" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261021155147" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261021132018" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261020210000" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261020150000" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261020120000" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261019235000" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261019183000" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261019163645" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261015230000" && entry.appliedToDev)).toBe(true)
    expect(pending.some(entry => entry.version === "20261015153000")).toBe(true)
    expect(pending.some(entry => entry.version === "20261015013000")).toBe(true)
    expect(pending.some(entry => entry.version === "20261014234000")).toBe(true)
    expect(pending.some(entry => entry.version === "20261014170000")).toBe(true)
    expect(pending.some(entry => entry.version === "20261004223358")).toBe(true)
    expect(pending.some(entry => entry.version === "20261004000625")).toBe(true)
    expect(pending.some(entry => entry.version === "20261003194353")).toBe(true)
    expect(pending.some(entry => entry.version === "20261003183002")).toBe(true)
    expect(pending.some(entry => entry.version === "20261003154314")).toBe(true)
    expect(pending.some(entry => entry.version === "20261003125151")).toBe(true)
    expect(upgradeMs).toBeGreaterThan(0)
    expect(await count(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'provider_oauth_states'",
    )).toBe(1)
  })

  it("leaves every pre-existing customer, business and location reference intact", async () => {
    expect(after.tableRowCounts["public.customers"]).toBe(before.tableRowCounts["public.customers"])
    expect(after.tableRowCounts["public.businesses"]).toBe(before.tableRowCounts["public.businesses"])
    expect(after.tableRowCounts["public.locations"]).toBe(before.tableRowCounts["public.locations"])
    expect(after.relationshipCounts.verified_memberships).toBe(before.relationshipCounts.verified_memberships)
    expect(after.relationshipCounts.case_to_location).toBe(before.relationshipCounts.case_to_location)
  })

  it("leaves the case and its work unchanged", async () => {
    expect(after.columnDigests["public.cases"]).toBe(before.columnDigests["public.cases"])
    const caseRow = await rows<{ id: string; status: string; work_stage: string }>(
      `select id, status, work_stage from public.cases where id = '${rehearsalIds.caseA}'`,
    )
    expect(caseRow[0].status).toBe("UNDER_REVIEW")
    expect(caseRow[0].work_stage).toBe("EVIDENCE_COLLECTION")
  })

  it("leaves evidence metadata and its storage binding byte-identical", async () => {
    expect(after.columnDigests["public.case_document_versions"]).toBe(before.columnDigests["public.case_document_versions"])
    expect(after.columnDigests["public.case_prepared_pack_items"]).toBe(before.columnDigests["public.case_prepared_pack_items"])
  })

  it("leaves the approved pack pinned to the version it was approved with", async () => {
    const item = await rows<{ version_id: string; pack_id: string }>(
      "select version_id, pack_id from public.case_prepared_pack_items",
    )
    expect(item[0].version_id).toBe(rehearsalIds.versionAccepted)
    expect(item[0].pack_id).toBe(rehearsalIds.pack)
    expect(after.relationshipCounts.pack_item_to_version).toBe(before.relationshipCounts.pack_item_to_version)
  })

  it("leaves job and outbox operational records in the same state", async () => {
    expect(after.jobStateCounts).toEqual(before.jobStateCounts)
    expect(after.outboxCounts).toEqual(before.outboxCounts)
    expect(after.columnDigests["admin_private.jobs"]).toBe(before.columnDigests["admin_private.jobs"])
    expect(after.columnDigests["admin_private.job_outbox"]).toBe(before.columnDigests["admin_private.job_outbox"])
  })

  it("leaves communication records intact", async () => {
    expect(after.tableRowCounts["public.communications"]).toBe(before.tableRowCounts["public.communications"])
  })

  it("introduces no orphan rows", () => {
    expect(fingerprintHasOrphans(after)).toBe(false)
  })

  it("adds the new tables the upgrade delivers and nothing is lost from the old ones", () => {
    for (const [table, value] of Object.entries(before.tableRowCounts)) {
      expect(`${table}:${after.tableRowCounts[table]}`).toBe(`${table}:${value}`)
    }
    const added = Object.keys(after.tableRowCounts).filter(table => !(table in before.tableRowCounts))
    expect(added).toContain("public.provider_oauth_states")
    expect(added).toContain("public.guard_coverages")
    expect(added).toContain("public.quotes")
  })

  it("records which probes the earlier checkpoint could not run", () => {
    expect(before.skippedProbes).toContain("relationship:coverage_to_order")
    expect(after.skippedProbes).toEqual([])
    expect(compareFingerprints(before, after).matched).toBe(false)
  })
})

describe("idempotency and retry records across the upgrade", () => {
  it("keeps an Admin command receipt replayable after the upgrade", async () => {
    const stored = await rows<{ response: { status: string } }>(
      `select response from admin_private.job_command_receipts where request_id = $1`,
      [rehearsalSubmissionKeys.commandRequest],
    )
    expect(stored[0].response.status).toBe("success")
    const replay = await rows<{ value: { status: string } }>(
      `select admin_private.job_receipt_v1($1,$2,$3) as value`,
      [rehearsalIds.adminUser, rehearsalSubmissionKeys.commandRequest, null],
    )
    expect(replay[0].value.status).toBe("conflict")
  })

  it("still treats an intake retry as the same submission after the upgrade", async () => {
    const before = await count("select count(*)::int as n from public.cases")
    const replay = await rows<{ case_id: string; was_existing: boolean }>(
      `select case_id, was_existing from public.create_case_intake_v1(
        $1,'PROFILE_RECOVERY',null,'Rehearsal Customer One','customer.one@rehearsal.invalid','+447700900001',
        'Rehearsal Business One','GB',null,null,null,'Synthetic retry after the upgrade.',true,true,'{}'::jsonb,'ops@rehearsal.invalid')`,
      [rehearsalSubmissionKeys.case],
    )
    expect(replay[0].was_existing).toBe(true)
    expect(replay[0].case_id).toBe(rehearsalIds.caseA)
    expect(await count("select count(*)::int as n from public.cases")).toBe(before)
  })

  it("keeps the unique job idempotency key enforced after the upgrade", async () => {
    await expect(db.exec(
      `insert into admin_private.jobs(job_type,idempotency_key,payload,status,scheduled_at)
       values('SYSTEM_HEALTH_PROBE','rehearsal-job-retry-0001','{}','PENDING',now())`,
    )).rejects.toThrow(/duplicate key|unique/i)
  })
})

/**
 * The additive and backfill safety standard, demonstrated against a scratch
 * table rather than a project table. Nothing in this block touches the
 * ProfileRelaunch schema: the point is to prove the sequence works, not to
 * change anything that is already applied.
 */
describe("the additive and backfill safety standard", () => {
  const table = "rehearsal_backfill.widgets"

  beforeAll(async () => {
    await db.exec(`create schema rehearsal_backfill;
      create table ${table} (id integer primary key, legacy_code text);
      insert into ${table}(id, legacy_code) values (1,'alpha'),(2,'beta'),(3,null),(4,'  '),(5,'delta');`)
  })

  async function codes(): Promise<(string | null)[]> {
    return (await rows<{ code: string | null }>(`select code from ${table} order by id`)).map(row => row.code)
  }

  it("step one: add the column as nullable and unenforced so no row is rewritten", async () => {
    await db.exec(`alter table ${table} add column code text`)
    expect(await codes()).toEqual([null, null, null, null, null])
  })

  it("step two: a bounded backfill only fills rows that still need it", async () => {
    const backfill = `update ${table} set code = upper(btrim(legacy_code))
      where code is null and legacy_code is not null and btrim(legacy_code) <> ''`
    await db.exec(backfill)
    expect(await codes()).toEqual(["ALPHA", "BETA", null, null, "DELTA"])
  })

  it("step three: rerunning the backfill changes nothing, so an interrupted run is safe to repeat", async () => {
    const backfill = `update ${table} set code = upper(btrim(legacy_code))
      where code is null and legacy_code is not null and btrim(legacy_code) <> ''`
    await db.exec(`update ${table} set code = 'MANUALLY CORRECTED' where id = 1`)
    await db.exec(backfill)
    await db.exec(backfill)
    expect(await codes()).toEqual(["MANUALLY CORRECTED", "BETA", null, null, "DELTA"])
    expect(await count(`select count(*)::int as n from ${table}`)).toBe(5)
  })

  it("step four: adding the constraint NOT VALID accepts the historical rows without a full-table lock", async () => {
    await db.exec(`alter table ${table} add constraint widgets_code_present check (code is not null) not valid`)
    const constraint = await rows<{ convalidated: boolean }>(
      "select convalidated from pg_constraint where conname = 'widgets_code_present'",
    )
    expect(constraint[0].convalidated).toBe(false)
  })

  it("step five: the constraint rejects new invalid rows even before it is validated", async () => {
    await expect(db.exec(`insert into ${table}(id, legacy_code, code) values (6,'zeta',null)`))
      .rejects.toThrow(/widgets_code_present/)
  })

  it("step six: validation detects the invalid historical rows instead of enforcing silently", async () => {
    await expect(db.exec(`alter table ${table} validate constraint widgets_code_present`))
      .rejects.toThrow(/widgets_code_present/)
    const stillInvalid = await count(`select count(*)::int as n from ${table} where code is null`)
    expect(stillInvalid).toBe(2)
  })

  it("step seven: validation succeeds once the historical data is corrected", async () => {
    await db.exec(`update ${table} set code = 'UNKNOWN' where code is null`)
    await db.exec(`alter table ${table} validate constraint widgets_code_present`)
    const constraint = await rows<{ convalidated: boolean }>(
      "select convalidated from pg_constraint where conname = 'widgets_code_present'",
    )
    expect(constraint[0].convalidated).toBe(true)
  })

  it("survives an interruption between the additive stage and the backfill", async () => {
    // A deployment that stops after the column is added leaves a schema that
    // is correct but incomplete. The half-done state must be detectable and
    // the remaining work must be safe to resume.
    await db.exec(`create table rehearsal_backfill.gadgets (id integer primary key, legacy_code text);
      insert into rehearsal_backfill.gadgets(id, legacy_code) values (1,'one'),(2,'two');
      alter table rehearsal_backfill.gadgets add column code text`)

    const incomplete = await count("select count(*)::int as n from rehearsal_backfill.gadgets where code is null")
    expect(incomplete).toBe(2)

    const resume = `update rehearsal_backfill.gadgets set code = upper(legacy_code) where code is null and legacy_code is not null`
    await db.exec(resume)
    await db.exec(resume)
    expect(await count("select count(*)::int as n from rehearsal_backfill.gadgets where code is null")).toBe(0)
    expect(await count("select count(*)::int as n from rehearsal_backfill.gadgets")).toBe(2)
  })
})
