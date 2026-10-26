import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { appliedMigrationHead, chainAfter, chainThrough, findMigration, manifestFilenames, manifestVersions, migrationChain, migrationHead, pendingMigrations } from "./manifest"
import { logicalName, migrationVersion } from "./history"

const directory = new URL("../../../../supabase/migrations/", import.meta.url)
const repositoryFilenames = readdirSync(directory).filter(name => name.endsWith(".sql")).sort()

describe("the migration chain manifest", () => {
  it("describes every migration in the repository exactly once", () => {
    expect(manifestFilenames()).toEqual(repositoryFilenames)
  })

  it("is ordered the way PostgreSQL received it", () => {
    expect(manifestVersions()).toEqual([...manifestVersions()].sort())
    expect(manifestVersions()).toEqual(repositoryFilenames.map(migrationVersion))
  })

  it("records the observed DEV ledger head, with Production/AWS still at SEC-08", () => {
    expect(appliedMigrationHead.filename).toBe("20261026170000_checkout_refresh_v1.sql")
    expect(appliedMigrationHead.appliedToDev).toBe(true)
    expect(migrationHead.filename).toMatch(/dev_payment_receipt_delivery_v1\.sql$/)
    expect(migrationHead.appliedToDev).toBe(false)
    expect(findMigration("20261013153000_public_request_rate_limit_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261015230000_dev_stripe_one_shot_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261019163645_admin_journey_05_assessment_dev_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261019183000_admin_journey_10b_record_outcome_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261019183000_admin_journey_10b_record_outcome_v1.sql")?.safeToReplay).toBe(false)
  })

  it("never marks any migration as safe to replay", () => {
    for (const entry of migrationChain) expect(entry.safeToReplay).toBe(false)
  })

  it("records COM-13, COM-14A and PAY-ENV-01 as DEV-applied without authorising Production", () => {
    expect(pendingMigrations().map(entry => entry.filename)).toEqual([
      "20261026180000_dev_payment_event_worker_v1.sql",
      "20261026190000_dev_payment_receipt_delivery_v1.sql",
    ])
    expect(findMigration("20261025163000_managed_success_verification_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261026140000_checkout_presentation_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261026170000_checkout_refresh_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261023000158_email_confirmation_challenge_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261023000158_email_confirmation_challenge_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261023091735_email_confirmation_delivery_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261023091735_email_confirmation_delivery_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration(migrationHead.filename)?.appliedToDev).toBe(false)
    expect(findMigration("20261024233701_admin_reconcile_accepted_service_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261025020000_guided_payment_request_email_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261025140000_guided_fulfilment_handover_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261025160000_guided_fulfilment_closure_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261024190832_quote_offer_email_snapshot_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration(migrationHead.filename)?.containsDataChange).toBe(false)
    expect(findMigration("20261024085235_admin_recent_signin_30m_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261023144943_customer_multi_item_evidence_v1.sql")?.appliedToDev).toBe(true)
    const grossSql = readFileSync(new URL("20261021214813_gross_customer_price_v1.sql", directory), "utf8")
    expect(Buffer.byteLength(grossSql)).toBe(13652)
    expect(createHash("sha256").update(grossSql).digest("hex")).toBe("6f3f3d6131ac3cfe15e4e71e19ef0b301477737c812ec33f350752d9b04dde29")
    expect(findMigration("20261021214813_gross_customer_price_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261021214813_gross_customer_price_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261021155147_communication_access_preliminary_evidence_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261021155147_communication_access_preliminary_evidence_v1.sql")?.safeToReplay).toBe(false)
    const evidenceSql = readFileSync(new URL("20261021155147_communication_access_preliminary_evidence_v1.sql", directory), "utf8")
    expect(evidenceSql.length).toBe(14558)
    expect(createHash("sha256").update(evidenceSql).digest("hex")).toBe("59b3a4aad059be2c488f51c0f9276f602993f70b0f8c36c9d387ed5f0573dbf9")
    expect(findMigration("20261021132018_dev_send_email_claim_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261021132018_dev_send_email_claim_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261020210000_admin_journey_e2e_04_customer_outcome_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261020210000_admin_journey_e2e_04_customer_outcome_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261020150000_admin_journey_e2e_03_success_fee_guard_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261020150000_admin_journey_e2e_03_success_fee_guard_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261020120000_admin_journey_e2e_02_managed_stage_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261020120000_admin_journey_e2e_02_managed_stage_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261019235000_admin_journey_12a_close_billing_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261019235000_admin_journey_12a_close_billing_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261019183000_admin_journey_10b_record_outcome_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261019183000_admin_journey_10b_record_outcome_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261015153000_payment_lane_isolation_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261015153000_payment_lane_isolation_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261015140000_commercial_eligibility_gate_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261015140000_commercial_eligibility_gate_v1.sql")?.containsDataChange).toBe(true)
    expect(findMigration("20261014234000_paid_service_acceptance_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261015013000_paid_service_acceptance_gate_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261015013000_paid_service_acceptance_gate_v1.sql")?.containsDataChange).toBe(false)
  })

  it("keeps every applied migration ahead of every pending one", () => {
    const lastApplied = migrationChain.findLastIndex(entry => entry.appliedToDev)
    expect(migrationChain.slice(0, lastApplied + 1).every(entry => entry.appliedToDev)).toBe(true)
    expect(migrationChain.slice(lastApplied + 1).every(entry => !entry.appliedToDev)).toBe(true)
  })

  it("gives every migration a logical step and a verification probe", () => {
    for (const entry of migrationChain) {
      expect(entry.step.length).toBeGreaterThan(0)
      expect(entry.verification.category.length).toBeGreaterThan(0)
      expect(entry.verification.probe).toMatch(/^(public|admin_private)\.[a-z0-9_]+$/)
    }
  })

  it("records which migrations change data as well as schema", () => {
    const withData = migrationChain.filter(entry => entry.containsDataChange).map(entry => entry.version)
    expect(withData).toEqual([
      "20260917080553",
      "20260917160740",
      "20260918083220",
      "20260929210000",
      "20260929221604",
      "20260929233953",
      "20260930164529",
      "20260930180050",
      "20260930222821",
      "20261014234000",
      "20261015140000",
      "20261017145801",
      "20261017210826",
      "20261022124813",
      "20261022172455",
    ])
  })

  it("names the foundation migrations that later work cannot be reordered around", () => {
    const foundation = migrationChain.filter(entry => entry.kind === "foundation").map(entry => logicalName(entry.filename))
    expect(foundation).toEqual([
      "core_data_foundation_v1",
      "relaunch_guard_data_foundation_v1",
      "single_admin_auth_v1",
      "admin_evidence_foundation_v1",
      "jobs_outbox_operational_health_v1",
    ])
  })

  it("splits the chain at a checkpoint so an upgrade can be rehearsed", () => {
    const through = chainThrough("20260929183214")
    const after = chainAfter("20260929183214")
    expect(through.at(-1)?.filename).toBe("20260929183214_jobs_outbox_operational_health_v1.sql")
    expect(after[0].filename).toBe("20260929210000_communications_outgoing_mail_v1.sql")
    expect(through.length + after.length).toBe(migrationChain.length)
  })

  it("refuses to split at a version it does not know", () => {
    expect(() => chainThrough("19990101000000")).toThrow(/unknown migration version/)
    expect(findMigration("19990101000000_invented.sql")).toBeNull()
  })
})
