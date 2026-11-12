import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  activationBlockers,
  adminAccessBlockers,
  byArea,
  item,
  readinessModel,
  type ReleaseArea,
  statusCounts,
} from "./readiness"
import { liveCapabilities } from "./gates"
import { approvedRecoveryObjectives, ownerDecisions, productionDatabaseStrategies, strategy } from "./decisions"
import { appliedMigrationHead, migrationHead, pendingMigrations } from "../recovery/manifest"

const doc = readFileSync(new URL("../../../../docs/admin/production-cutover-readiness.md", import.meta.url), "utf8")

/** Rows of one pipe table, identified by the section heading above it. */
function tableRows(heading: string): string[][] {
  const section = doc.split("\n## ").find(part => part.startsWith(`${heading}\n`))
  expect(section, `missing section: ${heading}`).toBeDefined()
  return (section ?? "")
    .split("\n")
    .filter(line => line.startsWith("| ") && !line.startsWith("| ---"))
    .slice(1)
    .map(line => line.split("|").map(cell => cell.trim()).slice(1, -1))
}

describe("readiness model", () => {
  it("covers every area Step 24A has to account for", () => {
    const areas: ReleaseArea[] = [
      "Admin application",
      "Vercel",
      "Supabase",
      "AWS evidence",
      "Email — Supabase Auth OTP",
      "Email — outgoing transactional",
      "Email — inbound",
      "Stripe",
      "Guard",
      "Google",
      "Privacy",
    ]
    const empty = areas.filter(area => byArea(area).length === 0)
    expect(empty).toEqual([])
    expect([...new Set(readinessModel.map(entry => entry.area))].sort()).toEqual([...areas].sort())
  })

  it("keeps the three email concerns separate", () => {
    // Conflating them is the specific mistake this split exists to prevent:
    // Admin sign-in depends on Supabase Auth delivery and on nothing else.
    const otp = byArea("Email — Supabase Auth OTP")
    expect(otp.length).toBeGreaterThan(0)
    expect(otp.some(entry => entry.requiredBeforeAdminProductionAccess)).toBe(true)
    expect(byArea("Email — outgoing transactional").some(entry => entry.requiredBeforeAdminProductionAccess)).toBe(false)
    expect(byArea("Email — inbound").some(entry => entry.requiredBeforeAdminProductionAccess)).toBe(false)
    expect(item("email.auth-otp")?.requirement).toContain("not the transactional mail path")
    expect(item("email.auth-otp")?.evidence).toContain("none of which take part in sign-in")
  })

  it("gives every item a unique id and a complete record", () => {
    const ids = readinessModel.map(entry => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    const incomplete = readinessModel
      .filter(
        entry =>
          entry.requirement.trim().length < 40
          || entry.evidence.trim().length < 40
          || entry.verification.trim().length < 30
          || entry.stopCondition.trim().length < 30,
      )
      .map(entry => entry.id)
    expect(incomplete).toEqual([])
  })

  it("names an action for anything that is not ready", () => {
    const silent = readinessModel
      .filter(entry => entry.status !== "READY" && entry.status !== "READY_DISABLED")
      .filter(entry => !entry.codeAction && !entry.externalAction)
      .map(entry => entry.id)
    expect(silent).toEqual([])
  })

  it("backs every ready item with something in this repository", () => {
    // A repository cannot observe a Vercel setting, a DNS record, a Supabase
    // project option or an AWS role. An item may only read ready when its
    // evidence points at a file, a function or a schema object that is here,
    // so no status rests on an assumption about an external account.
    const repositoryArtifact = /\.(?:ts|tsx|sql|mjs)\b|\(\)|supabase\/migrations|capture_method|admin_identity|admin_private/
    const unsupported = readinessModel
      .filter(entry => entry.status === "READY" || entry.status === "READY_DISABLED")
      .filter(entry => !repositoryArtifact.test(entry.evidence))
      .map(entry => entry.id)
    expect(unsupported).toEqual([])
  })

  it("marks anything that depends on an external account as not yet ready", () => {
    // The converse: every external account named in the package appears on an
    // item an operator still has to go and look at.
    const external = readinessModel.filter(entry => entry.status !== "READY" && entry.status !== "READY_DISABLED")
    expect(external.every(entry => entry.externalAction !== null)).toBe(true)
    const accounts = external.map(entry => entry.externalAction ?? "").join(" ")
    for (const account of ["Vercel", "Supabase", "AWS", "Resend", "Stripe", "Owner decision"]) {
      expect({ account, named: accounts.includes(account) }).toEqual({ account, named: true })
    }
  })

  it("names only capabilities that exist", () => {
    const known = liveCapabilities.map(entry => entry.id)
    const unknown = readinessModel.flatMap(entry => entry.requiredBeforeActivationOf.filter(id => !known.includes(id)))
    expect(unknown).toEqual([])
  })

  it("gates every live capability on at least one item", () => {
    const ungated = liveCapabilities
      .map(entry => entry.id)
      .filter(id => !readinessModel.some(row => row.requiredBeforeActivationOf.includes(id)))
    expect(ungated).toEqual([])
  })

  it("leaves nothing blocking Admin production access except external verification", () => {
    // Every remaining blocker must be something a person observes outside the
    // repository, not something the code still has to do.
    const blockers = adminAccessBlockers()
    expect(blockers.map(entry => entry.id).sort()).toEqual([
      "email.auth-otp",
      "vercel.admin-project-and-domain",
      "vercel.environment-contract",
    ])
    expect(blockers.every(entry => entry.externalAction !== null)).toBe(true)
  })

  it("withholds final sign-off on Step 22B while allowing Admin code readiness", () => {
    const rehearsal = item("supabase.recovery-rehearsal")
    expect(rehearsal?.status).toBe("DEFERRED")
    expect(rehearsal?.requiredBeforeAdminProductionAccess).toBe(false)
    expect(rehearsal?.stopCondition).toContain("Final production sign-off cannot")
  })

  it("blocks Stripe and Guard activation on their unresolved decisions", () => {
    expect(activationBlockers("stripe_payments").map(entry => entry.id)).toContain("stripe.commercial-decisions")
    expect(item("guard.operating-decisions")?.status).toBe("BLOCKED")
    // Manual Guard is not blocked by any of it.
    expect(item("guard.manual-operation-ready")?.status).toBe("READY")
    expect(item("guard.manual-operation-ready")?.evidence).toContain("MANUAL")
  })

  it("does not present Google API access as required for manual operation", () => {
    expect(item("google.manual-workflow-supported")?.status).toBe("READY")
    expect(item("google.manual-workflow-supported")?.requiredBeforeAdminProductionAccess).toBe(false)
    expect(item("google.api-inactive")?.externalAction).toContain("not a defect")
  })

  it("agrees with the recovery manifest about the applied and repository heads", () => {
    expect(pendingMigrations().map(entry => entry.filename)).toEqual([])
    expect(appliedMigrationHead.version).toBe("20261112223000")
    expect(appliedMigrationHead.containsDataChange).toBe(true)
    expect(appliedMigrationHead.safeToReplay).toBe(false)
    expect(migrationHead.filename).toBe("20261112223000_telloya_approve_send_offer_v1.sql")
    expect(migrationHead.version).toBe("20261112223000")
    expect(migrationHead.appliedToDev).toBe(true)
    expect(migrationHead.safeToReplay).toBe(false)
    expect(appliedMigrationHead.appliedToDev).toBe(true)
    const supabase = item("supabase.applied-head")
    expect(supabase?.status).toBe("READY")
    expect(supabase?.requirement).toContain(appliedMigrationHead.version)
    expect(supabase?.requirement).toContain("Observed DEV ledger head is 20261112223000")
    expect(supabase?.requirement).toContain("The verified DEV ledger contains 123 entries")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 122 entries and ended at 20261112210000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 121 entries and ended at 20261112180000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 120 entries and ended at 20261112120000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 119 entries and ended at 20261111130000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 117 entries and ended at 20261107120000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 116 entries and ended at 20261107110000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 115 entries and ended at 20261106200000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 114 entries and ended at 20261106140000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 112 entries and ended at 20261106003939")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 105 entries and ended at 20261105120000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 104 entries and ended at 20261104220000")
    expect(supabase?.requirement).toContain("The repository applied-file head is 20261112223000")
    expect(supabase?.requirement).toContain("25,436-character SQL")
    expect(supabase?.requirement).toContain("690e88917f0166f376d3e8189b60b427")
    expect(supabase?.requirement).toContain("dbbc03ed138c1f2115d44e7c13923570bf1cbf6205e401bec85aef6df00552c3")
    expect(supabase?.requirement).toContain("639b5c553348537db401e46c15fa7af7bb6d95a3")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 103 entries and ended at 20261104190000")
    expect(supabase?.requirement).toContain("71,495-character SQL")
    expect(supabase?.requirement).toContain("f09048135272dbc84b7ff1c794f18361")
    expect(supabase?.requirement).toContain("950af7786e449b1158b531d67f7a858ae9c59aad6a2496e227752bd3779961c1")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 102 entries and ended at 20261103230000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 101 entries")
    expect(supabase?.requirement).toContain("12,838-character SQL")
    expect(supabase?.requirement).toContain("de03ef27a623a72ae3e4015a33782406")
    expect(supabase?.requirement).toContain("9a761103c01d8bb50c1656fe81a35ccab349f862304c6a8044a6a327dac57d9a")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 100 entries and ended at 20261103200518")
    expect(supabase?.requirement).toContain("44,920-character")
    expect(supabase?.requirement).toContain("8db49c31c5d8b41e93e3768017120137")
    expect(supabase?.requirement).toContain("8f4103468abc024f249d671fabea0e8587cb60093de3d7f5665f5c8f5bd90f8d")
    expect(supabase?.requirement).not.toContain("The verified DEV ledger contains 100 entries")
    expect(supabase?.requirement).not.toContain("The repository applied-file head is 20261103200518")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 99 entries and ended at 20261103140000")
    expect(supabase?.requirement).toContain("ce8975868e0727760bb283a99b2f5dc9")
    expect(supabase?.requirement).toContain("10,317")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 98 entries and ended at 20261103120000")
    expect(supabase?.requirement).toContain("60,883")
    expect(supabase?.requirement).toContain("8f9fbda50319486185648de6ebdeae0b433cba53215e1ba5be48460e2a268a76")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 97 entries and ended at 20261102200000")
    expect(supabase?.requirement).toContain("The verified DEV ledger previously contained 95 entries and ended at 20261101200000")
    expect(supabase?.requirement).toContain("20,248 characters")
    expect(supabase?.requirement).toContain("2f55788a3b73e817c357c02716308fcdca974401dec948b0611e5baf27dd2148")
    expect(supabase?.requirement).toContain("public.customer_portal_products_v1(text) is service-role-only.")
    expect(supabase?.requirement).toContain("33,172 characters")
    expect(supabase?.requirement).toContain("807ab187aa5044a9d4cf0e9c64b1bf1ea0b669f57ffb763e73eb40ad273ead67")
    expect(supabase?.requirement).toContain("Existing contact verifications remain 4, all ADMIN_RECORDED.")
    expect(supabase?.requirement).toContain("New MAILBOX_OTP records are 0.")
    expect(supabase?.requirement).toContain("Invitations are 0. Commercial subscriptions are 0.")
    expect(supabase?.requirement).toContain("customer_portal_finish_invited_otp_v1 are service-role-only.")
    expect(supabase?.requirement).toContain("20261101180000 admin_commercial_onboarding_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261101180000")
    expect(supabase?.requirement).toContain("45,724 characters")
    expect(supabase?.requirement).toContain("8f242ef5bdf65d01833e7b06fb1b7110d1aaaf12e341fa90eb70ed820192e494")
    expect(supabase?.requirement).toContain("Both new onboarding history tables have RLS enabled.")
    expect(supabase?.requirement).toContain("The new Admin commands are service-role-only.")
    expect(supabase?.requirement).toContain("20261101170000 commercial_foundation_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261101170000")
    expect(supabase?.requirement).toContain("containsDataChange is false")
    expect(supabase?.requirement).toContain("51,901 characters")
    expect(supabase?.requirement).toContain("5e293cf4091c12096e7cba65e59e450e660d529d739ec8cdfc83a03bf2b2e7fb")
    expect(supabase?.requirement).toContain("All 15 commercial tables exist and have RLS enabled.")
    expect(supabase?.requirement).toContain("20261031160000 customer_portal_idle_timeout_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261031160000")
    expect(supabase?.requirement).toContain("That UPDATE is DML outside a function body, so containsDataChange is true.")
    expect(supabase?.requirement).toContain("bdb533e18a4a947f2726c9007a59f90288985d4eeae1ca9afc5c5d0d4329db8f")
    expect(supabase?.requirement).toContain("7,609 bytes")
    expect(supabase?.requirement).toContain("20261031150000 customer_case_reference_subjects_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261031150000")
    expect(supabase?.requirement).toContain("a500bb693b914745ff746904552253bf67e8bd635f3b2798f482650d1eb6c2b1")
    expect(supabase?.requirement).toContain("The case-reference file does not rewrite stored communications, quotations, receipts or catalogue rows.")
    expect(supabase?.requirement).toContain("20261031120000 guided_pack_ready_dispatch_v1 and 20261031140000 guided_customer_outcome_v1 are already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261031120000 or 20261031140000")
    expect(supabase?.requirement).toContain("The pack-ready file does not send mail or change stored case rows by itself.")
    expect(supabase?.requirement).toContain("The outcome file does not send mail, close a case, change a payment, or edit a stored outcome.")
    expect(supabase?.requirement).toContain("20261030120000 guided_pack_stage_sync_v1, 20261030130000 guided_assessment_pack_basis_v1 and 20261030200000 guided_payment_request_after_acceptance_v1 are already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261030200000")
    expect(supabase?.requirement).toContain("20261101200000 customer_portal_products_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261101200000")
    expect(supabase?.requirement).toContain("20261101190000 customer_invited_mailbox_otp_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261101190000")
    expect(supabase?.requirement).not.toContain("awaits a separate DEV application")
    expect(supabase?.requirement).toContain("Do not apply 20261101200000 to Production")
    expect(supabase?.requirement).toContain("20261102110000 customer_invitation_dispatch_v1 is already applied on DEV and must not be replayed.")
    expect(supabase?.requirement).toContain("Do not replay 20261102110000.")
    expect(supabase?.requirement).toContain("Do not apply 20261102110000 to Production.")
    expect(supabase?.requirement).toContain("20261105120000 telloya_voice_persistence_v1 is already applied on DEV and must not be replayed.")
    expect(supabase?.requirement).toContain("Do not replay 20261105120000.")
    expect(supabase?.requirement).toContain("Do not apply 20261105120000 to Production.")
    expect(supabase?.requirement).not.toContain("Do not apply 20261105120000 to DEV")
    expect(supabase?.requirement).toContain("pendingMigrations() is empty. The repository migration head is 20261112223000. 20261112223000 telloya_approve_send_offer_v1 was applied once to DEV and must not be replayed. Do not apply 20261112223000 to Production. The repository file is 45,006 characters. MD5 d8bdfefcb0bef55f8dcc8b62979e20bf. SHA-256 f5ba88fb55086cdbc409e53aa4d305864b729ebcf8a0905637c4f62c3fa8e6ea. containsDataChange is true. admin_private.telloya_approve_send_receipts has RLS enabled. public.telloya_offer_preview_v1, public.telloya_prepare_offer_from_draft_v1, public.telloya_offer_mail_v1 and public.telloya_offer_admin_v1 are service-role-only. TELLOYA_OFFER template v1 remains DRAFT at record_version 2 with the composer-contract body. Zero approved template versions, zero approval receipts, zero commercial subscriptions, zero Telloya offer emails and zero enabled mail-control rows were created by the apply. Do not edit or replay the applied SQL. 20261112210000 telloya_offer_draft_v1 was applied once to DEV and must not be replayed. Do not apply 20261112210000 to Production. The repository file is 17,672 characters. MD5 199dbfa368261693ed869a134a5fc664. SHA-256 e152df8d7204214965aec5c5fe64a2f37b8a63135005479bfcb219f737415f55. containsDataChange is false. public.telloya_offer_draft_v1 and public.telloya_offer_draft_command_v1 are service-role-only. Zero draft rows, zero draft audit events, zero commercial subscriptions, zero Telloya offer emails and zero enabled mail-control rows were created by the apply. Do not edit or replay the applied SQL. 20261112180000 telloya_sales_context_v1 was applied once to DEV and must not be replayed. Do not apply 20261112180000 to Production. The repository file is 18,615 characters. MD5 914c95e0534e4d26cd07cbab1ae8aa18. SHA-256 7fbd26ade4d1250ae4a8ea934e3e9bf7a0dc8171b971f62af1cfc118756acfcb. containsDataChange is false. public.telloya_sales_context_command_v1 is service-role-only. Zero commercial subscriptions, zero Telloya offer emails and zero enabled mail-control rows were created by the apply. Do not edit or replay the applied SQL. 20261112120000 telloya_admin_journey_v1 was applied once to DEV and must not be replayed. Do not apply 20261112120000 to Production. The repository file is 79,175 characters. containsDataChange is true because the file inserts one DRAFT TELLOYA_OFFER communication template catalogue row outside a function body. That catalogue row is not a customer, payment, subscription, invitation, communication or session record. The template stays DRAFT. The mail-control table has 0 rows. Zero demonstration rows, zero commercial subscriptions, zero amendments and zero Telloya offer emails were created. TELLOYA_ADMIN_JOURNEY_ENABLED remains off. Do not edit or replay the applied SQL. 20261111130000 telloya_marketing_enquiry_retention_v1 was applied once to DEV and must not be replayed. Do not apply 20261111130000 to Production. The hosted schema_migrations statement for 20261111130000 is 10,710 characters and the repository file is 10,712 characters. The two-byte difference is the dollar sign and closing quote at the end of the reason check, around character 1075. The installed telloya_marketing_enquiry_holds_reason_check is the correct expression. Do not edit or replay the applied SQL. 20261110170000 telloya_enquiry_receptionist_questions_v1 was applied once to DEV and must not be replayed. Do not apply 20261110170000 to Production. 20261107120000 telloya_inbound_admission_reservation_v1 was applied once to DEV and must not be replayed. Do not apply 20261107120000 to Production. The migration is registered once. The stored SQL matches the committed source. Two private tables have RLS enabled. Three public functions are service-role only. Three triggers were added. Admission records are zero. Retell live routing stays disabled. TELLOYA_INBOUND_ADMISSION_ENABLED and TELLOYA_USAGE_EVENTS_ENABLED stay off. 20261107110000 telloya_subscription_usage_ledger_v1 was applied once to DEV and must not be replayed. Do not apply 20261107110000 to Production. No usage events, reservations or legal holds were created. 20261106200000 admin_commercial_initiate_agent_test_call_v1 was applied once to DEV and must not be replayed. Do not apply 20261106200000 to Production. Zero test attempts were created. The controlled test-call flag remains off. 20261106120000 admin_commercial_verify_agent_test_call_v1 and 20261106140000 telloya_standard_location_cap_v1 are already applied on DEV and must not be replayed. Do not apply 20261106120000 or 20261106140000 to Production. 20261105130000 admin_commercial_begin_setup_v1, 20261105144256 admin_commercial_confirm_preferences_v1, 20261105172055 admin_commercial_confirm_ai_configuration_v1, 20261105180000 telloya_tier_catalogue_v1, 20261105190000 telloya_guard_addon_v1, 20261105200000 admin_commercial_record_number_allocation_v1 and 20261106003939 admin_commercial_record_forwarding_instructions_v1 are already applied on DEV and must not be replayed. Do not replay 20261105130000. Do not replay 20261105144256. Do not replay 20261105172055. Do not replay 20261105180000. Do not replay 20261105190000. Do not replay 20261105200000. Do not replay 20261106003939. Do not apply 20261105130000 to Production. Do not apply 20261105144256 to Production. Do not apply 20261105172055 to Production. Do not apply 20261105180000 to Production. Do not apply 20261105190000 to Production. Do not apply 20261105200000 to Production. Do not apply 20261106003939 to Production. 20261104220000 customer_commercial_setup_handover_v1 is already applied on DEV and must not be replayed. Do not replay 20261104220000. Do not apply 20261104220000 to Production. 20261104190000 customer_commercial_payment_settlement_v1 is already applied on DEV and must not be replayed. Do not replay 20261104190000. Do not apply 20261104190000 to Production. 20261103230000 customer_commercial_payment_verification_v1 is already applied on DEV and must not be replayed. Do not replay 20261103230000. Do not apply 20261103230000 to Production. 20261103213000 customer_commercial_payment_preparation_v1 is already applied on DEV and must not be replayed. Do not replay 20261103213000. Do not apply 20261103213000 to Production. 20261103200518 telloya_enquiry_phase_05a_02_validation is already applied on DEV and must not be replayed. Do not replay 20261103200518. Do not apply 20261103200518 to Production. The repository file is 10,317 characters. Its MD5 is ce8975868e0727760bb283a99b2f5dc9. Its SHA-256 is d2b402acd545a05b251cffb61c0a0a4b8028cb220ead5525ff122cbf97cfb0ab. CREATE OR REPLACE replaces admin_private.valid_enquiry_v1 only. The function signature, IMMUTABLE, search_path and grants are unchanged. containsDataChange is false. Live validator checks passed. Permissions are unchanged. No enquiry or email was created. Telloya feature flags remain false. 20261103140000 customer_commercial_offer_acceptance_v1 is already applied on DEV and must not be replayed. Do not replay 20261103140000. Do not apply 20261103140000 to Production. It does not approve a plan or an agreement, collect a payment, grant an entitlement, or activate a service. The repository file is 60,883 characters and its SHA-256 is 8f9fbda50319486185648de6ebdeae0b433cba53215e1ba5be48460e2a268a76.")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261101190000")
    expect(supabase?.stopCondition).toContain("Do not apply 20261101190000 to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261101180000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261101170000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261031160000")
    expect(supabase?.stopCondition).toContain("Production head differs from canonical 20261014170000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261031150000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261031120000 or 20261031140000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261030200000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261029010000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261029000000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261028223000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261025163000, 20261026140000 or 20261026170000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261026180000 or 20261026190000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261027120000. Do not replay DEV-applied 20261028120000 or apply it to Production. Do not replay DEV-applied 20261028160000 or apply it to Production. Do not replay DEV-applied 20261028200000 or apply it to Production.")
    expect(supabase?.requirement).not.toContain("20261028120000 remains unapplied")
    expect(supabase?.requirement).not.toContain("20261028160000 remains unapplied")
    expect(supabase?.requirement).not.toContain("20261028200000 remains unapplied")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261025020000, 20261025140000 or 20261025160000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261021155147")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261021214813 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261020210000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("do not apply those statements to Production")
    expect(supabase?.stopCondition).toContain("Stop the release if the AWS backup head drifts")
  })
})

describe("owner decisions and database strategies", () => {
  it("records a decision for each unresolved area", () => {
    expect(ownerDecisions.map(entry => entry.id).sort()).toEqual([
      "activation.order",
      "commercial.tax",
      "database.production-topology",
      "guard.capacity",
      "guard.check-windows",
      "retention.periods",
      "service.first-response",
    ])
    const incomplete = ownerDecisions
      .filter(entry => entry.question.trim().length < 30 || entry.currentBehaviour.trim().length < 30 || entry.blocks.trim().length < 10)
      .map(entry => entry.id)
    expect(incomplete).toEqual([])
  })

  it("records the approved launch recovery objectives separately from unresolved decisions", () => {
    expect(approvedRecoveryObjectives).toEqual({
      approvedAt: "2026-10-05",
      databaseRpoHours: 4,
      coreServiceRtoHours: 4,
      logicalBackupCadenceHours: 3,
      logicalBackupRetentionDays: 7,
    })
    expect(ownerDecisions.some(entry => entry.id === "recovery.objectives")).toBe(false)
  })

  it("marks an old suggested figure as prior art rather than as an answer", () => {
    const suggested = ownerDecisions.filter(entry => entry.priorSuggestion !== null)
    expect(suggested.length).toBeGreaterThan(0)
    expect(suggested.every(entry => /not an? (?:approved|commitment|decision)|must not be promoted|prior art/i.test(entry.priorSuggestion ?? ""))).toBe(true)
  })

  it("describes both production database strategies without choosing one", () => {
    expect(productionDatabaseStrategies.map(entry => entry.id)).toEqual(["A", "B"])
    for (const entry of productionDatabaseStrategies) {
      expect(entry.advantages.length).toBeGreaterThan(1)
      expect(entry.risks.length).toBeGreaterThan(1)
      expect(entry.prerequisites.length).toBeGreaterThan(0)
      expect(entry.prohibited.length).toBeGreaterThan(0)
    }
    expect(item("supabase.migration-ledger-discrepancy")?.status).toBe("READY")
    expect(item("supabase.migration-ledger-discrepancy")?.externalAction).toBeNull()
    expect(item("supabase.legacy-objects")?.status).toBe("READY")
  })

  it("forbids replaying or fabricating history under either strategy", () => {
    const prohibited = productionDatabaseStrategies.flatMap(entry => entry.prohibited).join(" ")
    expect(prohibited).toMatch(/do not replay/i)
    expect(strategy("B").prohibited.join(" ")).toMatch(/fabricat|history rows|migration-history/i)
    expect(strategy("B").prohibited.join(" ")).toMatch(/clean/i)
  })

  it("names the three foundation migrations the remote ledger is missing", () => {
    const text = strategy("B").prohibited.join(" ")
    for (const filename of [
      "20260915120000_core_data_foundation_v1.sql",
      "20260915193000_case_intake_transaction_v1.sql",
      "20260916000000_relaunch_guard_data_foundation_v1.sql",
    ]) {
      expect(text).toContain(filename)
    }
  })
})

describe("the cutover document matches the model", () => {
  it("records the Step 24A status in its heading", () => {
    expect(doc).toContain("STEP 24A COMPLETE / FINAL PRODUCTION SIGN-OFF PENDING EXTERNAL AND STEP 22B GATES")
  })

  it("lists every readiness item with the status the model holds", () => {
    const rows = tableRows("Readiness model")
    expect(rows.map(row => [row[0], row[1], row[2]])).toEqual(
      readinessModel.map(entry => [`\`${entry.id}\``, entry.area, entry.status]),
    )
    expect(rows.map(row => row[3])).toEqual(readinessModel.map(entry => entry.requirement))
  })

  it("lists every owner decision", () => {
    const rows = tableRows("Owner decisions")
    expect(rows.map(row => [row[0], row[1], row[2]])).toEqual(
      ownerDecisions.map(entry => [`\`${entry.id}\``, entry.area, entry.question]),
    )
  })

  it("reports the status counts the model actually holds", () => {
    const counts = statusCounts()
    expect(counts).toEqual({ READY: 15, READY_DISABLED: 8, ACTION_REQUIRED: 7, BLOCKED: 3, DEFERRED: 3 })
    expect(doc).toContain(
      "Fifteen items are `READY`, eight are `READY_DISABLED`, seven are\n`ACTION_REQUIRED`, three are `BLOCKED` and three are `DEFERRED`",
    )
    expect(item("email.dev-mail-schedule")?.status).toBe("BLOCKED")
    expect(item("email.dev-mail-schedule")?.requirement).toContain("not a GitHub Actions schedule")
    expect(item("email.dev-mail-schedule")?.evidence).toContain("not_needed")
  })
})
