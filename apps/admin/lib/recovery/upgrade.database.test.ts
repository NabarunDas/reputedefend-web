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
    expect(chainAfter(checkpoint)).toHaveLength(112)
  })

  it("applies only the migrations the running database had not received, in order", async () => {
    const pending = chainAfter(checkpoint)
    expect(pending[0].version).toBe("20260929210000")
    // The repository head is the DEV-applied 20261107120000 telloya_inbound_admission_reservation_v1.
    // Do not replay 20261107120000. Do not apply 20261107120000 to Production.
    // The previous applied DEV head is 20261107110000 telloya_subscription_usage_ledger_v1.
    // Do not replay 20261107110000. Do not apply 20261107110000 to Production.
    // 20261106200000 remains applied. Do not replay 20261106200000. Do not apply 20261106200000 to Production.
    // 20261106140000 telloya_standard_location_cap_v1 is applied immediately before it.
    // 20261106120000 admin_commercial_verify_agent_test_call_v1 is applied immediately before it.
    // Do not replay either applied file. Do not apply either applied file to Production.
    // The previous DEV applied head is 20261106003939 admin_commercial_record_forwarding_instructions_v1.
    // 20261105200000, 20261105190000, 20261105180000, 20261105172055, 20261105144256 and 20261105130000 are applied earlier in the chain. None is safe to replay.
    // The previous DEV ledger head is the applied 20261105120000 telloya_voice_persistence_v1.
    // Do not replay 20261105120000. Do not apply 20261105120000 to Production.
    // The previous DEV ledger head is 20261104220000 customer_commercial_setup_handover_v1.
    // Do not replay 20261104220000. Do not apply 20261104220000 to Production.
    // The previous DEV ledger head is 20261104190000 customer_commercial_payment_settlement_v1.
    // Do not replay 20261104190000. Do not apply 20261104190000 to Production.
    // The previous DEV applied head is 20261103230000 customer_commercial_payment_verification_v1.
    // Do not replay 20261103230000. Do not apply 20261103230000 to Production.
    // The previous DEV applied head is 20261103213000 customer_commercial_payment_preparation_v1.
    // Do not replay 20261103213000. Do not apply 20261103213000 to Production.
    // The previous DEV applied head is 20261103200518 telloya_enquiry_phase_05a_02_validation.
    // It was applied once. Do not replay 20261103200518. Do not apply 20261103200518 to Production.
    // 20261103140000 customer_commercial_offer_acceptance_v1 is already applied on DEV. Do not replay it. Do not apply it to Production.
    // The preceding DEV migration is 20261103120000 customer_portal_onboarding_status_v1 (already applied, must not be replayed).
    // The preceding DEV migration is 20261102110000 customer_invitation_dispatch_v1 (already applied, must not be replayed).
    // 20261101200000 remains applied on DEV and must not be replayed.
    // 20261101190000 remains applied on DEV and must not be replayed.
    // The Admin onboarding migration before it is already applied on DEV and must not be replayed.
    // The commercial foundation file before that is already on DEV and must not be replayed.
    // The idle-timeout file is already applied on DEV and must not be replayed.
    // The case-reference, Guided customer outcome and pack-ready dispatch files
    // stay before the commercial foundation and must not be replayed on the live database. Payment
    // request 20261030200000 is applied on DEV and must not be replayed. This
    // disposable rebuild is not a live apply. Production remains at SEC-08.
    expect(pending.at(-1)?.filename).toBe("20261113120000_telloya_offer_mail_test_allowlist_v1.sql")
    expect(pending.at(-1)?.appliedToDev).toBe(true)
    expect(pending.at(-1)?.containsDataChange).toBe(false)
    expect(pending.at(-1)?.safeToReplay).toBe(false)
    expect(pending.at(-2)?.filename).toBe("20261112223000_telloya_approve_send_offer_v1.sql")
    expect(pending.at(-2)?.appliedToDev).toBe(true)
    expect(pending.at(-2)?.containsDataChange).toBe(true)
    expect(pending.at(-2)?.safeToReplay).toBe(false)
    expect(pending.at(-3)?.filename).toBe("20261112210000_telloya_offer_draft_v1.sql")
    expect(pending.at(-3)?.appliedToDev).toBe(true)
    expect(pending.at(-3)?.containsDataChange).toBe(false)
    expect(pending.at(-3)?.safeToReplay).toBe(false)
    expect(pending.at(-4)?.filename).toBe("20261112180000_telloya_sales_context_v1.sql")
    expect(pending.at(-4)?.appliedToDev).toBe(true)
    expect(pending.at(-4)?.containsDataChange).toBe(false)
    expect(pending.at(-4)?.safeToReplay).toBe(false)
    expect(pending.at(-5)?.filename).toBe("20261112120000_telloya_admin_journey_v1.sql")
    expect(pending.at(-5)?.appliedToDev).toBe(true)
    expect(pending.at(-5)?.containsDataChange).toBe(true)
    expect(pending.at(-5)?.safeToReplay).toBe(false)
    expect(pending.at(-6)?.filename).toBe("20261111130000_telloya_marketing_enquiry_retention_v1.sql")
    expect(pending.at(-6)?.appliedToDev).toBe(true)
    expect(pending.at(-6)?.containsDataChange).toBe(false)
    expect(pending.at(-6)?.safeToReplay).toBe(false)
    expect(pending.at(-7)?.filename).toBe("20261110170000_telloya_enquiry_receptionist_questions_v1.sql")
    expect(pending.at(-7)?.appliedToDev).toBe(true)
    expect(pending.at(-7)?.containsDataChange).toBe(false)
    expect(pending.at(-7)?.safeToReplay).toBe(false)
    expect(pending.at(-8)?.filename).toBe("20261107120000_telloya_inbound_admission_reservation_v1.sql")
    expect(pending.at(-8)?.appliedToDev).toBe(true)
    expect(pending.at(-8)?.containsDataChange).toBe(false)
    expect(pending.at(-8)?.safeToReplay).toBe(false)
    expect(pending.at(-9)?.filename).toBe("20261107110000_telloya_subscription_usage_ledger_v1.sql")
    expect(pending.at(-9)?.appliedToDev).toBe(true)
    expect(pending.at(-9)?.containsDataChange).toBe(false)
    expect(pending.at(-9)?.safeToReplay).toBe(false)
    expect(pending.at(-10)?.filename).toBe("20261106200000_admin_commercial_initiate_agent_test_call_v1.sql")
    expect(pending.at(-10)?.appliedToDev).toBe(true)
    expect(pending.at(-10)?.containsDataChange).toBe(false)
    expect(pending.at(-10)?.safeToReplay).toBe(false)
    expect(pending.at(-11)?.filename).toBe("20261106140000_telloya_standard_location_cap_v1.sql")
    expect(pending.at(-11)?.appliedToDev).toBe(true)
    expect(pending.at(-11)?.containsDataChange).toBe(false)
    expect(pending.at(-11)?.safeToReplay).toBe(false)
    expect(pending.at(-12)?.filename).toBe("20261106120000_admin_commercial_verify_agent_test_call_v1.sql")
    expect(pending.at(-12)?.appliedToDev).toBe(true)
    expect(pending.at(-12)?.containsDataChange).toBe(false)
    expect(pending.at(-12)?.safeToReplay).toBe(false)
    expect(pending.at(-13)?.filename).toBe("20261106003939_admin_commercial_record_forwarding_instructions_v1.sql")
    expect(pending.at(-13)?.appliedToDev).toBe(true)
    expect(pending.at(-13)?.containsDataChange).toBe(false)
    expect(pending.at(-13)?.safeToReplay).toBe(false)
    expect(pending.at(-14)?.filename).toBe("20261105200000_admin_commercial_record_number_allocation_v1.sql")
    expect(pending.at(-14)?.appliedToDev).toBe(true)
    expect(pending.at(-14)?.containsDataChange).toBe(false)
    expect(pending.at(-14)?.safeToReplay).toBe(false)
    expect(pending.at(-15)?.filename).toBe("20261105190000_telloya_guard_addon_v1.sql")
    expect(pending.at(-15)?.appliedToDev).toBe(true)
    expect(pending.at(-15)?.containsDataChange).toBe(false)
    expect(pending.at(-15)?.safeToReplay).toBe(false)
    expect(pending.at(-16)?.filename).toBe("20261105180000_telloya_tier_catalogue_v1.sql")
    expect(pending.at(-16)?.appliedToDev).toBe(true)
    expect(pending.at(-16)?.containsDataChange).toBe(false)
    expect(pending.at(-16)?.safeToReplay).toBe(false)
    expect(pending.at(-17)?.filename).toBe("20261105172055_admin_commercial_confirm_ai_configuration_v1.sql")
    expect(pending.at(-17)?.appliedToDev).toBe(true)
    expect(pending.at(-17)?.containsDataChange).toBe(false)
    expect(pending.at(-17)?.safeToReplay).toBe(false)
    expect(pending.at(-18)?.filename).toBe("20261105144256_admin_commercial_confirm_preferences_v1.sql")
    expect(pending.at(-18)?.appliedToDev).toBe(true)
    expect(pending.at(-18)?.containsDataChange).toBe(false)
    expect(pending.at(-18)?.safeToReplay).toBe(false)
    expect(pending.at(-19)?.filename).toBe("20261105130000_admin_commercial_begin_setup_v1.sql")
    expect(pending.at(-19)?.appliedToDev).toBe(true)
    expect(pending.at(-19)?.containsDataChange).toBe(false)
    expect(pending.at(-19)?.safeToReplay).toBe(false)
    expect(pending.at(-20)?.filename).toBe("20261105120000_telloya_voice_persistence_v1.sql")
    expect(pending.at(-20)?.appliedToDev).toBe(true)
    expect(pending.at(-20)?.containsDataChange).toBe(false)
    expect(pending.at(-20)?.safeToReplay).toBe(false)
    expect(pending.at(-21)?.filename).toBe("20261104220000_customer_commercial_setup_handover_v1.sql")
    expect(pending.at(-21)?.appliedToDev).toBe(true)
    expect(pending.at(-21)?.containsDataChange).toBe(false)
    expect(pending.at(-21)?.safeToReplay).toBe(false)
    expect(pending.at(-22)?.filename).toBe("20261104190000_customer_commercial_payment_settlement_v1.sql")
    expect(pending.at(-22)?.appliedToDev).toBe(true)
    expect(pending.at(-22)?.containsDataChange).toBe(false)
    expect(pending.at(-22)?.safeToReplay).toBe(false)
    expect(pending.at(-23)?.filename).toBe("20261103230000_customer_commercial_payment_verification_v1.sql")
    expect(pending.at(-23)?.appliedToDev).toBe(true)
    expect(pending.at(-23)?.containsDataChange).toBe(false)
    expect(pending.at(-23)?.safeToReplay).toBe(false)
    expect(pending.at(-24)?.filename).toBe("20261103213000_customer_commercial_payment_preparation_v1.sql")
    expect(pending.at(-24)?.appliedToDev).toBe(true)
    expect(pending.at(-24)?.containsDataChange).toBe(false)
    expect(pending.at(-24)?.safeToReplay).toBe(false)
    expect(pending.at(-25)?.filename).toBe("20261103200518_telloya_enquiry_phase_05a_02_validation.sql")
    expect(pending.at(-25)?.appliedToDev).toBe(true)
    expect(pending.at(-25)?.containsDataChange).toBe(false)
    expect(pending.at(-25)?.safeToReplay).toBe(false)
    expect(pending.at(-26)?.filename).toBe("20261103140000_customer_commercial_offer_acceptance_v1.sql")
    expect(pending.at(-26)?.appliedToDev).toBe(true)
    expect(pending.at(-26)?.containsDataChange).toBe(false)
    expect(pending.at(-26)?.safeToReplay).toBe(false)
    expect(pending.at(-27)?.filename).toBe("20261103120000_customer_portal_onboarding_status_v1.sql")
    expect(pending.at(-27)?.appliedToDev).toBe(true)
    expect(pending.at(-27)?.containsDataChange).toBe(false)
    expect(pending.at(-27)?.safeToReplay).toBe(false)
    expect(pending.at(-28)?.filename).toBe("20261102200000_telloya_enquiry_infrastructure_v1.sql")
    expect(pending.at(-28)?.appliedToDev).toBe(true)
    expect(pending.at(-28)?.containsDataChange).toBe(false)
    expect(pending.at(-28)?.safeToReplay).toBe(false)
    expect(pending.at(-29)?.filename).toBe("20261102110000_customer_invitation_dispatch_v1.sql")
    expect(pending.at(-29)?.appliedToDev).toBe(true)
    expect(pending.at(-29)?.containsDataChange).toBe(true)
    expect(pending.at(-29)?.safeToReplay).toBe(false)
    expect(pending.at(-30)?.filename).toBe("20261101200000_customer_portal_products_v1.sql")
    expect(pending.at(-30)?.appliedToDev).toBe(true)
    expect(pending.at(-30)?.containsDataChange).toBe(false)
    expect(pending.at(-30)?.safeToReplay).toBe(false)
    expect(pending.at(-31)?.filename).toBe("20261101190000_customer_invited_mailbox_otp_v1.sql")
    expect(pending.at(-31)?.appliedToDev).toBe(true)
    expect(pending.at(-31)?.containsDataChange).toBe(false)
    expect(pending.at(-31)?.safeToReplay).toBe(false)
    expect(pending.at(-32)?.filename).toBe("20261101180000_admin_commercial_onboarding_v1.sql")
    expect(pending.at(-32)?.appliedToDev).toBe(true)
    expect(pending.at(-32)?.containsDataChange).toBe(false)
    expect(pending.at(-32)?.safeToReplay).toBe(false)
    expect(pending.at(-33)?.filename).toBe("20261101170000_commercial_foundation_v1.sql")
    expect(pending.at(-33)?.appliedToDev).toBe(true)
    expect(pending.at(-33)?.containsDataChange).toBe(false)
    expect(pending.at(-33)?.safeToReplay).toBe(false)
    expect(pending.at(-34)?.filename).toBe("20261031160000_customer_portal_idle_timeout_v1.sql")
    expect(pending.at(-34)?.appliedToDev).toBe(true)
    expect(pending.at(-34)?.containsDataChange).toBe(true)
    expect(pending.at(-34)?.safeToReplay).toBe(false)
    expect(pending.at(-35)?.filename).toBe("20261031150000_customer_case_reference_subjects_v1.sql")
    expect(pending.at(-35)?.appliedToDev).toBe(true)
    expect(pending.at(-35)?.containsDataChange).toBe(false)
    expect(pending.at(-35)?.safeToReplay).toBe(false)
    expect(pending.at(-36)?.filename).toBe("20261031140000_guided_customer_outcome_v1.sql")
    expect(pending.at(-36)?.appliedToDev).toBe(true)
    expect(pending.at(-36)?.safeToReplay).toBe(false)
    expect(pending.at(-37)?.filename).toBe("20261031120000_guided_pack_ready_dispatch_v1.sql")
    expect(pending.at(-37)?.appliedToDev).toBe(true)
    expect(pending.at(-37)?.safeToReplay).toBe(false)
    expect(pending.at(-38)?.filename).toBe("20261030200000_guided_payment_request_after_acceptance_v1.sql")
    expect(pending.at(-38)?.appliedToDev).toBe(true)
    expect(pending.at(-38)?.safeToReplay).toBe(false)
    expect(pending.at(-39)?.filename).toBe("20261030130000_guided_assessment_pack_basis_v1.sql")
    expect(pending.at(-39)?.appliedToDev).toBe(true)
    expect(pending.at(-39)?.safeToReplay).toBe(false)
    expect(pending.at(-40)?.filename).toBe("20261030120000_guided_pack_stage_sync_v1.sql")
    expect(pending.at(-40)?.appliedToDev).toBe(true)
    expect(pending.at(-40)?.safeToReplay).toBe(false)
    expect(pending.at(-41)?.filename).toBe("20261029010000_dev_mail_shared_dispatch_v1.sql")
    expect(pending.at(-41)?.appliedToDev).toBe(true)
    expect(pending.at(-41)?.safeToReplay).toBe(false)
    expect(pending.at(-42)?.filename).toBe("20261029000000_dev_mail_dispatch_v1.sql")
    expect(pending.at(-42)?.appliedToDev).toBe(true)
    expect(pending.at(-42)?.safeToReplay).toBe(false)
    expect(pending.at(-43)?.filename).toBe("20261028223000_admin_pack_mail_context_volatile_v1.sql")
    expect(pending.at(-43)?.appliedToDev).toBe(true)
    expect(pending.at(-43)?.safeToReplay).toBe(false)
    expect(pending.at(-44)?.filename).toBe("20261028200000_admin_pack_draft_role_v1.sql")
    expect(pending.at(-44)?.appliedToDev).toBe(true)
    expect(pending.at(-44)?.safeToReplay).toBe(false)
    expect(pending.at(-45)?.filename).toBe("20261028160000_guided_pack_publish_visibility_v1.sql")
    expect(pending.at(-45)?.appliedToDev).toBe(true)
    expect(pending.at(-45)?.safeToReplay).toBe(false)
    expect(pending.at(-46)?.filename).toMatch(/guided_postpayment_handover_v1\.sql$/)
    expect(pending.at(-46)?.appliedToDev).toBe(true)
    expect(pending.at(-46)?.safeToReplay).toBe(false)
    expect(pending.at(-47)?.filename).toMatch(/billing_documents_v1\.sql$/)
    expect(pending.at(-47)?.appliedToDev).toBe(true)
    expect(pending.at(-47)?.safeToReplay).toBe(false)
    expect(pending.at(-48)?.filename).toMatch(/dev_payment_receipt_delivery_v1\.sql$/)
    expect(pending.at(-48)?.appliedToDev).toBe(true)
    expect(pending.at(-48)?.safeToReplay).toBe(false)
    expect(pending.at(-49)?.filename).toMatch(/dev_payment_event_worker_v1\.sql$/)
    expect(pending.at(-49)?.appliedToDev).toBe(true)
    expect(pending.at(-49)?.safeToReplay).toBe(false)
    expect(pending.at(-50)?.filename).toMatch(/checkout_refresh_v1\.sql$/)
    expect(pending.at(-50)?.appliedToDev).toBe(true)
    expect(pending.at(-50)?.safeToReplay).toBe(false)
    expect(pending.at(-51)?.filename).toMatch(/checkout_presentation_v1\.sql$/)
    expect(pending.at(-51)?.appliedToDev).toBe(true)
    expect(pending.at(-52)?.filename).toMatch(/managed_success_verification_v1\.sql$/)
    expect(pending.at(-52)?.appliedToDev).toBe(true)
    expect(pending.at(-53)?.filename).toMatch(/guided_fulfilment_closure_v1\.sql$/)
    expect(pending.at(-53)?.appliedToDev).toBe(true)
    expect(pending.at(-54)?.filename).toMatch(/guided_fulfilment_handover_v1\.sql$/)
    expect(pending.at(-54)?.appliedToDev).toBe(true)
    expect(pending.at(-55)?.filename).toMatch(/guided_payment_request_email_v1\.sql$/)
    expect(pending.at(-55)?.appliedToDev).toBe(true)
    expect(pending.at(-56)?.filename).toMatch(/admin_reconcile_accepted_service_v1\.sql$/)
    expect(pending.at(-56)?.appliedToDev).toBe(true)
    expect(pending.at(-56)?.version).toBe("20261024233701")
    expect(pending.at(-57)?.filename).toMatch(/quote_offer_email_snapshot_v1\.sql$/)
    expect(pending.at(-57)?.appliedToDev).toBe(true)
    expect(pending.at(-57)?.version).toBe("20261024190832")
    expect(pending.at(-58)?.filename).toMatch(/admin_recent_signin_30m_v1\.sql$/)
    expect(pending.at(-58)?.appliedToDev).toBe(true)
    expect(pending.at(-59)?.filename).toMatch(/dev_email_recent_login_30m_v1\.sql$/)
    expect(pending.at(-59)?.appliedToDev).toBe(true)
    expect(pending.at(-60)?.version).toBe("20261023221028")
    expect(pending.at(-60)?.appliedToDev).toBe(true)
    expect(pending.at(-61)?.filename).toMatch(/customer_multi_item_evidence_v1\.sql$/)
    expect(pending.at(-61)?.appliedToDev).toBe(true)
    expect(pending.at(-62)?.version).toBe("20261023103232")
    expect(pending.at(-62)?.appliedToDev).toBe(true)
    expect(pending.at(-63)?.version).toBe("20261023091735")
    expect(pending.at(-63)?.appliedToDev).toBe(true)
    expect(pending.at(-64)?.version).toBe("20261023000158")
    expect(pending.at(-64)?.appliedToDev).toBe(true)
    expect(pending.at(-65)?.version).toBe("20261022172455")
    expect(pending.at(-65)?.appliedToDev).toBe(true)
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
