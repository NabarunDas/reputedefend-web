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
    expect(chainAfter(checkpoint)).toHaveLength(11)
  })

  it("applies only the migrations the running database had not received, in order", async () => {
    const pending = chainAfter(checkpoint)
    expect(pending[0].version).toBe("20260929210000")
    expect(pending.at(-1)?.version).toBe("20261001175315")
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
