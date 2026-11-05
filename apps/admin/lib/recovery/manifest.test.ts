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
    expect(new Set(manifestVersions()).size).toBe(manifestVersions().length)
    expect(manifestVersions()).toEqual(repositoryFilenames.map(migrationVersion))
  })

  it("records the observed DEV ledger head, with Production/AWS still at SEC-08", () => {
    expect(appliedMigrationHead.filename).toBe("20261105120000_telloya_voice_persistence_v1.sql")
    expect(appliedMigrationHead.appliedToDev).toBe(true)
    expect(appliedMigrationHead.containsDataChange).toBe(false)
    expect(appliedMigrationHead.safeToReplay).toBe(false)
    expect(migrationHead.filename).toBe("20261105144256_admin_commercial_confirm_preferences_v1.sql")
    expect(migrationHead.appliedToDev).toBe(false)
    expect(migrationHead.containsDataChange).toBe(false)
    expect(migrationHead.safeToReplay).toBe(false)
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
      "20261105130000_admin_commercial_begin_setup_v1.sql",
      "20261105144256_admin_commercial_confirm_preferences_v1.sql",
    ])
    expect(pendingMigrations().every(entry => !entry.appliedToDev && !entry.containsDataChange && !entry.safeToReplay)).toBe(true)
    expect(findMigration("20261028160000_guided_pack_publish_visibility_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261028160000_guided_pack_publish_visibility_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261028120000_guided_postpayment_handover_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261028120000_guided_postpayment_handover_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261027120000_billing_documents_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261025163000_managed_success_verification_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261026140000_checkout_presentation_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261026170000_checkout_refresh_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261026180000_dev_payment_event_worker_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261026190000_dev_payment_receipt_delivery_v1.sql")?.appliedToDev).toBe(true)
    const workerSql = readFileSync(new URL("20261026180000_dev_payment_event_worker_v1.sql", directory), "utf8")
    const receiptSql = readFileSync(new URL("20261026190000_dev_payment_receipt_delivery_v1.sql", directory), "utf8")
    expect(createHash("sha256").update(workerSql).digest("hex")).toBe("7cfdce15799b3d49cd356a5692d2364ff1deadf1aa039588fab9252f87c421d8")
    expect(createHash("sha256").update(receiptSql).digest("hex")).toBe("2304f0760ad42a64f82c7cee5f8081ef5789deda3f9e3e3373691f10f1949611")
    const billingSql = readFileSync(new URL("20261027120000_billing_documents_v1.sql", directory), "utf8")
    expect(createHash("sha256").update(billingSql).digest("hex")).toBe("bb3ff59154e28d73208529557f67cdce144a4cf1b017257198c8be4301ab52e0")
    const handoverSql = readFileSync(new URL("20261028120000_guided_postpayment_handover_v1.sql", directory), "utf8")
    expect(createHash("sha256").update(handoverSql).digest("hex")).toBe("01f1e7c1a91d5414177da91a8f109e5dd24062ad1d2a863a5b5395b58b01baa4")
    const publicationSql = readFileSync(new URL("20261028160000_guided_pack_publish_visibility_v1.sql", directory), "utf8")
    expect(publicationSql.length).toBe(30023)
    expect(createHash("sha256").update(publicationSql).digest("hex")).toBe("ce08c89bb8a5388bf75c1edb2c33979eca396ea5d92665cf0f799ef9d858ef83")
    const roleSql = readFileSync(new URL("20261028200000_admin_pack_draft_role_v1.sql", directory), "utf8")
    expect(roleSql.length).toBe(23704)
    expect(createHash("sha256").update(roleSql).digest("hex")).toBe("75052ce67d660f5836b59b8cb1f98cd76b39076ea68fa87ec5cdcaf522b56368")
    expect(roleSql).not.toContain("PR-26-GHNLB9")
    expect(findMigration("20261028200000_admin_pack_draft_role_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261028200000_admin_pack_draft_role_v1.sql")?.safeToReplay).toBe(false)
    const volatilitySql = readFileSync(new URL("20261028223000_admin_pack_mail_context_volatile_v1.sql", directory), "utf8")
    expect(volatilitySql.length).toBe(1698)
    expect(createHash("sha256").update(volatilitySql).digest("hex")).toBe("d78e22b62753beb07a1013370b885abbe0e51cd940dfdc4c223888b492789d2c")
    expect(volatilitySql).not.toContain("PR-26-GHNLB9")
    expect(findMigration("20261028223000_admin_pack_mail_context_volatile_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261028223000_admin_pack_mail_context_volatile_v1.sql")?.safeToReplay).toBe(false)
    const dispatchSql = readFileSync(new URL("20261029000000_dev_mail_dispatch_v1.sql", directory), "utf8")
    expect(dispatchSql.length).toBe(20338)
    expect(createHash("sha256").update(dispatchSql).digest("hex")).toBe("9a510a79f57da4641176c3d1bec52a9d6d10f3880763924dc7c47057ecb89a2a")
    expect(dispatchSql).not.toContain("PR-26-GHNLB9")
    expect(findMigration("20261029000000_dev_mail_dispatch_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261029000000_dev_mail_dispatch_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261029000000_dev_mail_dispatch_v1.sql")?.containsDataChange).toBe(false)
    const sharedSql = readFileSync(new URL("20261029010000_dev_mail_shared_dispatch_v1.sql", directory), "utf8")
    expect(sharedSql.length).toBe(35478)
    expect(createHash("sha256").update(sharedSql).digest("hex")).toBe("db1a0d28fb368c7f9c9d12970f83ed46065109a1c9147451e3e75cc835fa6e56")
    expect(sharedSql).not.toContain("PR-26-GHNLB9")
    expect(findMigration("20261029010000_dev_mail_shared_dispatch_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261029010000_dev_mail_shared_dispatch_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261029010000_dev_mail_shared_dispatch_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261023000158_email_confirmation_challenge_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261023000158_email_confirmation_challenge_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration("20261023091735_email_confirmation_delivery_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261023091735_email_confirmation_delivery_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration(appliedMigrationHead.filename)?.appliedToDev).toBe(true)
    expect(findMigration(appliedMigrationHead.filename)?.containsDataChange).toBe(false)
    expect(findMigration(appliedMigrationHead.filename)?.safeToReplay).toBe(false)
    // Telloya voice persistence is the DEV ledger head. It was applied once.
    // Do not replay 20261105120000. Do not apply 20261105120000 to Production.
    // The repository head is the unapplied Admin begin-setup migration 20261105130000.
    // Do not apply 20261105130000 to hosted DEV or Production.
    // Do not replay 20261104220000. Do not apply 20261104220000 to Production.
    // Do not replay 20261104190000. Do not apply 20261104190000 to Production.
    // Do not replay 20261103230000. Do not apply 20261103230000 to Production.
    expect(findMigration(migrationHead.filename)?.appliedToDev).toBe(false)
    expect(findMigration(migrationHead.filename)?.containsDataChange).toBe(false)
    expect(findMigration(migrationHead.filename)?.safeToReplay).toBe(false)
    expect(findMigration("20261103230000_customer_commercial_payment_verification_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const onboardingSql = readFileSync(new URL("20261101180000_admin_commercial_onboarding_v1.sql", directory), "utf8")
    expect(onboardingSql.length).toBe(45724)
    expect(createHash("sha256").update(onboardingSql).digest("hex")).toBe("8f242ef5bdf65d01833e7b06fb1b7110d1aaaf12e341fa90eb70ed820192e494")
    const invitedSql = readFileSync(new URL("20261101190000_customer_invited_mailbox_otp_v1.sql", directory), "utf8")
    expect(invitedSql.length).toBe(33172)
    expect(createHash("sha256").update(invitedSql).digest("hex")).toBe("807ab187aa5044a9d4cf0e9c64b1bf1ea0b669f57ffb763e73eb40ad273ead67")
    expect(findMigration("20261101190000_customer_invited_mailbox_otp_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const productsSql = readFileSync(new URL("20261101200000_customer_portal_products_v1.sql", directory), "utf8")
    expect(productsSql.length).toBe(20248)
    expect(createHash("sha256").update(productsSql).digest("hex")).toBe("2f55788a3b73e817c357c02716308fcdca974401dec948b0611e5baf27dd2148")
    expect(findMigration("20261101200000_customer_portal_products_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const invitationSql = readFileSync(new URL("20261102110000_customer_invitation_dispatch_v1.sql", directory), "utf8")
    expect(invitationSql.length).toBe(53986)
    expect(createHash("sha256").update(invitationSql).digest("hex")).toBe("2576c03b855fbe7238d7cf8bae5e9eb0649a5fdf72de26ff87b08d86967fa44f")
    expect(findMigration("20261102110000_customer_invitation_dispatch_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: true,
      safeToReplay: false,
    })
    const onboardingStatusSql = readFileSync(new URL("20261103120000_customer_portal_onboarding_status_v1.sql", directory), "utf8")
    expect(onboardingStatusSql.length).toBe(16642)
    expect(createHash("sha256").update(onboardingStatusSql).digest("hex")).toBe("52d52ca3a03354a457025344cbd865d7216c893e232c95bf7552d6b03fb3d4fd")
    expect(findMigration("20261103120000_customer_portal_onboarding_status_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const offerSql = readFileSync(new URL("20261103140000_customer_commercial_offer_acceptance_v1.sql", directory), "utf8")
    expect(offerSql.length).toBe(60883)
    expect(createHash("sha256").update(offerSql).digest("hex")).toBe("8f9fbda50319486185648de6ebdeae0b433cba53215e1ba5be48460e2a268a76")
    expect(findMigration("20261103140000_customer_commercial_offer_acceptance_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const validationSql = readFileSync(new URL("20261103200518_telloya_enquiry_phase_05a_02_validation.sql", directory), "utf8")
    expect(validationSql.length).toBe(10317)
    expect(createHash("md5").update(validationSql).digest("hex")).toBe("ce8975868e0727760bb283a99b2f5dc9")
    expect(createHash("sha256").update(validationSql).digest("hex")).toBe("d2b402acd545a05b251cffb61c0a0a4b8028cb220ead5525ff122cbf97cfb0ab")
    expect(findMigration("20261103200518_telloya_enquiry_phase_05a_02_validation.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const preparationSql = readFileSync(new URL("20261103213000_customer_commercial_payment_preparation_v1.sql", directory), "utf8")
    expect(preparationSql.length).toBe(44920)
    expect(createHash("md5").update(preparationSql).digest("hex")).toBe("8db49c31c5d8b41e93e3768017120137")
    expect(createHash("sha256").update(preparationSql).digest("hex")).toBe("8f4103468abc024f249d671fabea0e8587cb60093de3d7f5665f5c8f5bd90f8d")
    expect(findMigration("20261103213000_customer_commercial_payment_preparation_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const verificationSql = readFileSync(new URL("20261103230000_customer_commercial_payment_verification_v1.sql", directory), "utf8")
    expect(verificationSql.length).toBe(12838)
    expect(createHash("md5").update(verificationSql).digest("hex")).toBe("de03ef27a623a72ae3e4015a33782406")
    expect(createHash("sha256").update(verificationSql).digest("hex")).toBe("9a761103c01d8bb50c1656fe81a35ccab349f862304c6a8044a6a327dac57d9a")
    const settlementSql = readFileSync(new URL("20261104190000_customer_commercial_payment_settlement_v1.sql", directory), "utf8")
    expect(settlementSql.length).toBe(71495)
    expect(createHash("md5").update(settlementSql).digest("hex")).toBe("f09048135272dbc84b7ff1c794f18361")
    expect(createHash("sha256").update(settlementSql).digest("hex")).toBe("950af7786e449b1158b531d67f7a858ae9c59aad6a2496e227752bd3779961c1")
    expect(findMigration("20261104190000_customer_commercial_payment_settlement_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const setupHandoverSql = readFileSync(new URL("20261104220000_customer_commercial_setup_handover_v1.sql", directory), "utf8")
    expect(setupHandoverSql.length).toBe(25436)
    expect(createHash("md5").update(setupHandoverSql).digest("hex")).toBe("690e88917f0166f376d3e8189b60b427")
    expect(createHash("sha256").update(setupHandoverSql).digest("hex")).toBe("dbbc03ed138c1f2115d44e7c13923570bf1cbf6205e401bec85aef6df00552c3")
    expect(setupHandoverSql).toContain("Do not apply 20261104220000 to DEV")
    expect(setupHandoverSql).toContain("Do not apply 20261104220000 to Production")
    expect(setupHandoverSql).not.toMatch(/\bINSERT INTO\b|\bUPDATE\b|\bDELETE FROM\b/)
    expect(findMigration("20261104220000_customer_commercial_setup_handover_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const beginSetupSql = readFileSync(new URL("20261105130000_admin_commercial_begin_setup_v1.sql", directory), "utf8")
    expect(beginSetupSql).toContain("Do not apply 20261105130000 to DEV")
    expect(beginSetupSql).toContain("Do not apply 20261105130000 to Production")
    expect(beginSetupSql).toContain("03A-03-03-02-02")
    expect(beginSetupSql).not.toMatch(/\bretell\b|\bResend\b|stripe\.com/i)
    expect(beginSetupSql).toContain("REVOKE ALL ON FUNCTION public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)")
    expect(beginSetupSql).toContain("GRANT EXECUTE ON FUNCTION public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)")
    expect(beginSetupSql).not.toContain("TO anon")
    expect(beginSetupSql).not.toContain("TO authenticated")
    expect(findMigration("20261105130000_admin_commercial_begin_setup_v1.sql")).toMatchObject({
      appliedToDev: false,
      containsDataChange: false,
      safeToReplay: false,
    })
    const voiceSql = readFileSync(new URL("20261105120000_telloya_voice_persistence_v1.sql", directory), "utf8")
    expect(voiceSql.length).toBe(29033)
    expect(createHash("md5").update(voiceSql).digest("hex")).toBe("e786c89df769c12f71d8815011a5c1b5")
    expect(createHash("sha256").update(voiceSql).digest("hex")).toBe("e1b7a9a5053b7002a2f0cc77cff1a76b4552b4da8eb25685258f32e89537b4e3")
    expect(voiceSql).toContain("This file is not applied to hosted DEV or Production.")
    expect(findMigration("20261105120000_telloya_voice_persistence_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    expect(offerSql).toContain("REVOKE ALL ON FUNCTION public.customer_portal_commercial_offer_v1(text, text)")
    expect(offerSql).toContain("GRANT EXECUTE ON FUNCTION public.customer_portal_commercial_offer_v1(text, text) TO service_role;")
    expect(offerSql).not.toContain("GRANT EXECUTE ON FUNCTION public.customer_portal_commercial_offer_v1(text, text) TO anon")
    expect(offerSql).not.toContain("GRANT EXECUTE ON FUNCTION public.customer_portal_commercial_offer_command_v1(text, uuid, text, jsonb) TO authenticated")
    expect(onboardingStatusSql).toContain("REVOKE ALL ON FUNCTION public.customer_portal_onboarding_status_v1(text)")
    expect(onboardingStatusSql).toContain("GRANT EXECUTE ON FUNCTION public.customer_portal_onboarding_status_v1(text) TO service_role;")
    expect(onboardingStatusSql).not.toContain("GRANT EXECUTE ON FUNCTION public.customer_portal_onboarding_status_v1(text) TO anon")
    expect(onboardingStatusSql).not.toContain("GRANT EXECUTE ON FUNCTION public.customer_portal_onboarding_status_v1(text) TO authenticated")
    const paymentSql = readFileSync(new URL("20261030200000_guided_payment_request_after_acceptance_v1.sql", directory), "utf8")
    expect(createHash("sha256").update(paymentSql).digest("hex")).toBe("32195da0c20f665e87cfeaa9f5e2b9600341f2c02502c140c403cf9ec2d40ca5")
    expect(paymentSql).toContain("SECURITY DEFINER")
    expect(paymentSql).toContain("SET search_path = ''")
    expect(paymentSql).toContain("REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_request_v1(uuid, text)")
    expect(paymentSql).toContain("GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_request_v1(uuid, text)\n  TO service_role;")
    expect(paymentSql).not.toContain("p_communication")
    expect(paymentSql).not.toContain("customer_action_claim_guided_payment_email_v1")
    expect(paymentSql).not.toContain("dev_mail_dispatch_activation")
    expect(paymentSql).not.toContain("GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_request_v1(uuid, text)\n  TO anon")
    expect(paymentSql).not.toContain("PR-26-GHNLB9")
    expect(paymentSql).not.toContain("PR-26-MEVY5P")
    const packDispatchSql = readFileSync(new URL("20261031120000_guided_pack_ready_dispatch_v1.sql", directory), "utf8")
    expect(packDispatchSql).toContain("CREATE FUNCTION public.dev_mail_dispatch_claim_pack_v1(")
    expect(packDispatchSql).toContain("REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text)")
    expect(packDispatchSql).toContain("GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text)\n  TO service_role;")
    expect(packDispatchSql).toContain("CREATE FUNCTION public.dev_mail_dispatch_claim_pack_retry_v1(")
    expect(packDispatchSql).toContain("CREATE FUNCTION public.dev_mail_pack_retry_recovery_v1()")
    expect(packDispatchSql).toContain("IF n = 0 THEN")
    expect(packDispatchSql.indexOf("IF n = 0 THEN")).toBeLessThan(packDispatchSql.indexOf("net.http_get"))
    expect(packDispatchSql).not.toContain("dev_mail_dispatch_claim_recent_v1")
    expect(packDispatchSql).not.toContain("dev_mail_dispatch_claim_completion_v1")
    expect(packDispatchSql).not.toContain("dev_mail_dispatch_claim_notice_v1")
    expect(packDispatchSql).not.toContain("dev_mail_dispatch_claim_case_retry_v1")
    expect(packDispatchSql).not.toContain("dev_mail_dispatch_activation")
    expect(packDispatchSql).not.toContain("DEV_MAIL_DISPATCH_WORKER_ENABLED")
    expect(packDispatchSql).not.toContain("PR-26-MEVY5P")
    expect(packDispatchSql).not.toContain("7907f187-ee65-4353-9931-60ade0fefed6")
    expect(findMigration("20261031120000_guided_pack_ready_dispatch_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    expect(findMigration("20261031140000_guided_customer_outcome_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    const subjectSql = readFileSync(new URL("20261031150000_customer_case_reference_subjects_v1.sql", directory), "utf8")
    expect(Buffer.byteLength(subjectSql)).toBe(29230)
    expect(createHash("sha256").update(subjectSql).digest("hex")).toBe("a500bb693b914745ff746904552253bf67e8bd635f3b2798f482650d1eb6c2b1")
    expect(findMigration("20261031150000_customer_case_reference_subjects_v1.sql")).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    expect(findMigration("20261030120000_guided_pack_stage_sync_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261030130000_guided_assessment_pack_basis_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261030200000_guided_payment_request_after_acceptance_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261030200000_guided_payment_request_after_acceptance_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261030120000_guided_pack_stage_sync_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration("20261030130000_guided_assessment_pack_basis_v1.sql")?.safeToReplay).toBe(false)
    const basisSql = readFileSync(new URL("20261030130000_guided_assessment_pack_basis_v1.sql", directory), "utf8")
    expect(basisSql).not.toContain("PR-26-GHNLB9")
    expect(basisSql).not.toContain("advance_guided_pack_ready_v1")
    expect(basisSql).not.toContain("advance_guided_pack_on_publish_v1")
    expect(basisSql).not.toContain("case_prepared_packs_guided_ready")
    expect(basisSql).not.toContain("admin_case_assessment_command_v1")
    expect(findMigration("20261031160000_customer_portal_idle_timeout_v1.sql")?.containsDataChange).toBe(true)
    expect(findMigration("20261031160000_customer_portal_idle_timeout_v1.sql")?.safeToReplay).toBe(false)
    expect(findMigration(appliedMigrationHead.filename)?.containsDataChange).toBe(false)
    expect(findMigration("20261101200000_customer_portal_products_v1.sql")?.containsDataChange).toBe(false)
    expect(findMigration(appliedMigrationHead.filename)?.safeToReplay).toBe(false)
    expect(findMigration("20261024233701_admin_reconcile_accepted_service_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261025020000_guided_payment_request_email_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261025140000_guided_fulfilment_handover_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261025160000_guided_fulfilment_closure_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261024190832_quote_offer_email_snapshot_v1.sql")?.appliedToDev).toBe(true)
    expect(findMigration("20261031160000_customer_portal_idle_timeout_v1.sql")?.containsDataChange).toBe(true)
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
      "20261031160000",
      "20261102110000",
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
