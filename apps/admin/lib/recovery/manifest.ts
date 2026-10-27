/**
 * Repository migration chain, in the order a rebuild applies it.
 *
 * `appliedToDev` records files whose statements are already in the DEV ledger.
 * DEV-HISTORY-01 records the seven versions after `20261015230000` as already
 * applied, so the observed DEV ledger head is `20261019163645`. That is not
 * an instruction to replay those statements, and it does not authorise
 * Production. Production and AWS ApprovedMigrationHead stay at
 * `20261014170000`. Step 10B `20261019183000` and Step 12A `20261019235000` are applied
 * to DEV only. Both remain unapplied to Production. ADMIN-JOURNEY-E2E-02
 * `20261020120000` was applied to DEV only on 20 October 2026 and is not
 * applied to Production. Do not replay it. ADMIN-JOURNEY-E2E-03
 * `20261020150000` was independently applied to DEV on 20 October 2026;
 * it is not applied to Production. Do not replay. ADMIN-JOURNEY-E2E-04
 * `20261020210000` was independently applied to DEV on 20 October 2026.
 * Generated ledger version `20261020122920` was aligned to canonical
 * `20261020210000`. It is not applied to Production. Do not replay.
 * `20261021132018` dev_send_email_claim_v1 was applied to DEV only. The
 * Supabase runner recorded that version, and the repository filename was
 * aligned to it. The SQL was not replayed and it is not applied to
 * Production. `20261021155147` communication_access_preliminary_evidence_v1
 * was applied to DEV once. The repository filename was aligned to that
 * ledger version. The SQL was not replayed and it is not applied to
 * Production. `20261021214813` gross_customer_price_v1 was applied to DEV.
 * The repository filename was aligned to that ledger version. The SQL was
 * not replayed and it is not applied to Production. See
 * `docs/admin/dev-history-01.md`, `docs/admin/admin-journey-12a.md`,
 * `docs/admin/admin-journey-e2e-02.md`,
 * `docs/admin/admin-journey-e2e-03.md` and
 * `docs/admin/admin-journey-e2e-04.md`.
 *
 * This manifest never contains migration SQL. It records the facts a recovery
 * operator needs when a database has to be rebuilt or compared against remote
 * migration history, and it is the input to the history validator and to every
 * rehearsal in this module.
 */

/**
 * `foundation` migrations establish schema that later work depends on and
 * cannot be reordered. `additive` migrations extend an already-running
 * database and must remain forward-only.
 */
export type MigrationKind = "foundation" | "additive"

export type MigrationEntry = {
  /** Supabase migration version: the timestamp prefix of the filename. */
  version: string
  filename: string
  /** Logical delivery step, matching docs/admin/progress.md. */
  step: string
  kind: MigrationKind
  /** True once the migration exists in remote history on profilerelaunch-dev. */
  appliedToDev: boolean
  /** True when the migration performs DML outside a function body. */
  containsDataChange: boolean
  /**
   * Always false for an applied migration. Replaying a foundation migration
   * recreates tables; replaying an additive one re-runs its seed DML.
   */
  safeToReplay: false
  /** What a rehearsal should check to prove this migration landed. */
  verification: { category: string; probe: string }
}

export const migrationChain: readonly MigrationEntry[] = [
  {
    version: "20260915120000",
    filename: "20260915120000_core_data_foundation_v1.sql",
    step: "Marketing core data foundation",
    kind: "foundation",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "core records", probe: "public.customers" },
  },
  {
    version: "20260915193000",
    filename: "20260915193000_case_intake_transaction_v1.sql",
    step: "Marketing transactional case intake",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "intake idempotency", probe: "public.create_case_intake_v1" },
  },
  {
    version: "20260916000000",
    filename: "20260916000000_relaunch_guard_data_foundation_v1.sql",
    step: "Relaunch Guard intake foundation",
    kind: "foundation",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "monitoring intake", probe: "public.monitoring_requests" },
  },
  {
    version: "20260917080553",
    filename: "20260917080553_single_admin_auth_v1.sql",
    step: "Step 3 single admin account and email OTP",
    kind: "foundation",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "admin identity singleton", probe: "public.admin_identity" },
  },
  {
    version: "20260917160740",
    filename: "20260917160740_admin_audit_foundation_v1.sql",
    step: "Step 4 authorisation and audit foundation",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "audit trail", probe: "public.admin_audit_events" },
  },
  {
    version: "20260917183422",
    filename: "20260917183422_admin_client_workspace_v1.sql",
    step: "Step 5 shared records and client workspace",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "verified relationships", probe: "public.business_memberships" },
  },
  {
    version: "20260917185905",
    filename: "20260917185905_admin_enquiry_triage_v1.sql",
    step: "Step 6 persistent enquiries and triage",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "enquiry intake", probe: "public.enquiries" },
  },
  {
    version: "20260918083220",
    filename: "20260918083220_admin_case_workflows_v1.sql",
    step: "Step 7 workflow engine, tasks and cases",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "case workflow", probe: "public.case_tasks" },
  },
  {
    version: "20260918143424",
    filename: "20260918143424_admin_evidence_foundation_v1.sql",
    step: "Step 8 evidence storage foundation",
    kind: "foundation",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "evidence storage metadata", probe: "public.case_document_versions" },
  },
  {
    version: "20260918153627",
    filename: "20260918153627_admin_evidence_workspace_v1.sql",
    step: "Step 8 evidence review workspace",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "evidence review", probe: "public.admin_evidence_review_v1" },
  },
  {
    version: "20260918163150",
    filename: "20260918163150_admin_prepared_packs_v1.sql",
    step: "Step 8 prepared packs",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "prepared packs", probe: "public.case_prepared_pack_items" },
  },
  {
    version: "20260928094817",
    filename: "20260928094817_admin_customer_actions_v1.sql",
    step: "Step 9A agreements and customer actions",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer actions", probe: "public.customer_actions" },
  },
  {
    version: "20260928175738",
    filename: "20260928175738_customer_case_pack_access_v1.sql",
    step: "Step 9B1 customer pack access",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "pack publication", probe: "admin_private.customer_pack_access_receipts" },
  },
  {
    version: "20260929150057",
    filename: "20260929150057_customer_evidence_upload_v1.sql",
    step: "Step 9B2 customer evidence upload",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "upload idempotency", probe: "admin_private.customer_evidence_upload_receipts" },
  },
  {
    version: "20260929183214",
    filename: "20260929183214_jobs_outbox_operational_health_v1.sql",
    step: "Step 10 jobs, outbox and operational health",
    kind: "foundation",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "transactional outbox", probe: "admin_private.job_outbox" },
  },
  {
    version: "20260929210000",
    filename: "20260929210000_communications_outgoing_mail_v1.sql",
    step: "Step 11 outgoing communications",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "outgoing mail", probe: "admin_private.communication_templates" },
  },
  {
    version: "20260929221604",
    filename: "20260929221604_incoming_mail_conversations_v1.sql",
    step: "Step 12 incoming mail and conversations",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "inbound dedupe", probe: "admin_private.inbound_email_receipts" },
  },
  {
    version: "20260929233953",
    filename: "20260929233953_catalogue_quotes_orders_v1.sql",
    step: "Step 13 catalogue, quotes and orders",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "effective-dated catalogue", probe: "public.price_versions" },
  },
  {
    version: "20260930132106",
    filename: "20260930132106_stripe_payments_v1.sql",
    step: "Step 14 upfront and success-fee payments",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "provider idempotency", probe: "public.provider_operations" },
  },
  {
    version: "20260930164529",
    filename: "20260930164529_guard_onboarding_activation_v1.sql",
    step: "Step 15 Guard onboarding and activation",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "Guard coverage", probe: "public.guard_coverages" },
  },
  {
    version: "20260930180050",
    filename: "20260930180050_guard_subscriptions_billing_v1.sql",
    step: "Step 16 subscriptions, cancellation and refunds",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "Guard billing", probe: "public.guard_subscriptions" },
  },
  {
    version: "20260930203750",
    filename: "20260930203750_guard_manual_checks_v1.sql",
    step: "Step 17 manual checks, rota and baselines",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "manual capture only", probe: "public.guard_check_observations" },
  },
  {
    version: "20260930222821",
    filename: "20260930222821_guard_alerts_escalation_v1.sql",
    step: "Step 18 alerts and linked cases",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "Guard alerts", probe: "public.guard_alerts" },
  },
  {
    version: "20261001092213",
    filename: "20261001092213_admin_dashboard_search_reports_v1.sql",
    step: "Step 19 dashboard, search and reports",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "saved filters", probe: "public.admin_saved_filters" },
  },
  {
    version: "20261001141218",
    filename: "20261001141218_admin_settings_privacy_operations_v1.sql",
    step: "Step 20 settings, staff and privacy operations",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "versioned settings", probe: "public.admin_setting_versions" },
  },
  {
    version: "20261001175315",
    filename: "20261001175315_google_integration_readiness_v1.sql",
    step: "Step 21 Google integration readiness",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "OAuth state single use", probe: "public.provider_oauth_states" },
  },
  {
    version: "20261001220255",
    filename: "20261001220255_quote_surface_fixes_v1.sql",
    step: "Step 23 quote surface fixes",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "quote action scope and quote list", probe: "public.admin_quote_list_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-02. The remote ledger assigned
    // 20261002194215, not the version the local CLI generated, so the file was
    // renamed to match the applied one and its contents left untouched.
    version: "20261002194215",
    filename: "20261002194215_admin_case_flow_batch_v1.sql",
    step: "UX-3 batch CaseFlow fact projection",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "batch case flow projection", probe: "public.admin_case_flow_facts_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-03. Supabase MCP initially
    // assigned a generated ledger version; the history row was repaired
    // immediately to the repository version below so remote and source stay aligned.
    version: "20261003120000",
    filename: "20261003120000_case_communications_workspace_v1.sql",
    step: "UX-8 case communications workspace",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "case communications read", probe: "public.admin_case_communications_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-03. Supabase MCP initially
    // registered 20261003134234; the history row was repaired immediately to
    // 20261003125151 so the remote ledger matches the repository filename.
    version: "20261003125151",
    filename: "20261003125151_customer_portal_auth_foundation_v1.sql",
    step: "UX-10A customer portal authentication",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal session", probe: "public.customer_portal_session_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-03. Supabase MCP initially
    // registered 20261003180252; the history row was repaired immediately to
    // 20261003154314 so the remote ledger matches the repository filename.
    version: "20261003154314",
    filename: "20261003154314_customer_portal_dashboard_cases_v1.sql",
    step: "UX-10C customer dashboard and cases",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal dashboard", probe: "public.customer_portal_dashboard_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-03. Supabase MCP initially
    // registered 20261003191113; the history row was repaired immediately to
    // 20261003183002 so the remote ledger matches the repository filename.
    version: "20261003183002",
    filename: "20261003183002_customer_portal_case_workspace_v1.sql",
    step: "UX-10D customer case workspace",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal case", probe: "public.customer_portal_case_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-03. Supabase MCP initially
    // registered 20261003202103; the history row was repaired immediately to
    // 20261003194353 so the remote ledger matches the repository filename.
    version: "20261003194353",
    filename: "20261003194353_customer_portal_documents_evidence_v1.sql",
    step: "UX-10E customer documents and evidence",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal documents", probe: "public.customer_portal_documents_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-03. Supabase MCP initially
    // registered 20261003220517; the history row was repaired immediately to
    // 20261003204538 so the remote ledger matches the repository filename.
    version: "20261003204538",
    filename: "20261003204538_customer_portal_quotes_agreements_permissions_v1.sql",
    step: "UX-10F customer quotes, agreements and permissions",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal service", probe: "public.customer_portal_case_service_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-03. Supabase MCP initially
    // registered 20261003234725; the history row was aligned to 20261003224746
    // so the remote ledger matches the repository filename. The schema was not
    // replayed during that alignment.
    version: "20261003224746",
    filename: "20261003224746_customer_portal_payments_receipts_v1.sql",
    step: "UX-10G customer payments and receipts",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal payments", probe: "public.customer_portal_payments_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-04. Supabase MCP initially
    // registered 20261004074806; the history row was aligned to 20261004000625
    // so the remote ledger matches the repository filename. The schema was not
    // replayed during that alignment.
    version: "20261004000625",
    filename: "20261004000625_customer_portal_relaunch_guard_v1.sql",
    step: "UX-10H customer relaunch guard",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal guard", probe: "public.customer_portal_guard_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-04. Supabase MCP initially
    // registered 20261004090629; the history row was aligned to 20261004080853
    // so the remote ledger matches the repository filename. The schema was not
    // replayed during that alignment.
    version: "20261004080853",
    filename: "20261004080853_customer_portal_messages_account_v1.sql",
    step: "UX-10I customer messages and account",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer portal messages", probe: "public.customer_portal_messages_v1" },
  },
  {
    // Applied to profilerelaunch-dev on 2026-10-04. Supabase MCP assigned this
    // exact version, so source and the remote ledger use the same identifier.
    // The migration changes only future default privileges; existing objects
    // and data are unchanged.
    version: "20261004223358",
    filename: "20261004223358_data_api_default_privileges_hardening_v1.sql",
    step: "Production hardening — Data API default privileges",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "future Data API grants", probe: "public.cases" },
  },
  {
    // Applied and verified on profilerelaunch-dev on 2026-10-10.
    // Also applied to Production on 2026-10-13, with verified OTP function grants.
    version: "20261010200000",
    filename: "20261010200000_customer_action_otp_limits_v1.sql",
    step: "SEC-02 customer-action OTP limits",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer action OTP limits", probe: "public.customer_action_begin_otp_v1" },
  },
  {
    // Applied and live-verified on profilerelaunch-dev on 2026-10-13.
    // Also applied to Production on 2026-10-13. Operator-reported AWS
    // SEC-03 scheduled backup 20261014T153911Z passed archive and manifest checks.
    version: "20261013153000",
    filename: "20261013153000_public_request_rate_limit_v1.sql",
    step: "SEC-03 shared public request rate limit",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "public request rate limit", probe: "public.consume_public_rate_limit_v1" },
  },
  {
    // Applied to profilerelaunch-dev (rmzozuiamjcclvtgutgd) on 2026-10-14 as
    // canonical 20261014170000_evidence_content_sha256_v1. No data rows were
    // mutated. Production (cxwwekdzkkjjbiyofrov) applied the canonical
    // migration on 2026-10-14 with 0 evidence rows. AWS ApprovedMigrationHead
    // now matches 20261014170000; scheduled backup 20261014T213909Z passed.
    version: "20261014170000",
    filename: "20261014170000_evidence_content_sha256_v1.sql",
    step: "SEC-08 evidence content SHA-256",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "evidence content SHA-256", probe: "public.evidence_content_sha256_v1" },
  },
  {
    // Applied to DEV only on 2026-10-15. Supabase initially assigned version
    // 20261015085350; verified SQL objects and reconciled the migration-ledger
    // metadata to the canonical repository version, without replaying the SQL.
    // NOT applied to Production. AWS ApprovedMigrationHead stays at 20261014170000.
    version: "20261014234000",
    filename: "20261014234000_paid_service_acceptance_v1.sql",
    step: "COM-13A paid-service acceptance",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "paid service acceptance", probe: "public.accept_paid_service_terms_v1" },
  },
  {
    // Applied to DEV only on 2026-10-15. Supabase initially assigned version
    // 20261015085508; verified RPCs and reconciled the migration-ledger
    // metadata to the canonical repository version, without replaying the SQL.
    // NOT applied to Production. AWS ApprovedMigrationHead stays at 20261014170000.
    // The catalogue remains SOLICITOR_REVIEW/inoperative; approval RPC not called.
    version: "20261015013000",
    filename: "20261015013000_paid_service_acceptance_gate_v1.sql",
    step: "COM-13B paid-service acceptance gate",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "paid service acceptance gate", probe: "public.admin_confirm_paid_service_agreement_v1" },
  },
  {
    // Applied to DEV only on 2026-10-15 from COM-14A source merged at
    // 8824549c013eb8c5c147befddaa49eb6a914f7c4. Supabase initially
    // assigned version 20261015113540; after schema/RLS/negative checks
    // its single migration-history row was aligned to canonical 20261015140000
    // without replaying SQL. NOT applied to Production; AWS ApprovedMigrationHead
    // remains 20261014170000. Only seller's NOT_VAT_REGISTERED fact was seeded.
    // Zero country decisions or business establishments were approved.
    version: "20261015140000",
    filename: "20261015140000_commercial_eligibility_gate_v1.sql",
    step: "COM-14A commercial eligibility gate",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "commercial eligibility gate", probe: "public.admin_record_eligibility_decision_v1" },
  },
  {
    // Applied to DEV only on 2026-10-15 from PAY-ENV-01 merged source
    // c7629dcd15ddce64afa846a77614f7fbf755dc93. Supabase initially assigned
    // 20261015135047; after verifying SQL/RLS/grants and rolled-back lane tests,
    // reconciled only migration ledger metadata to canonical 20261015153000.
    // NOT applied to Production; AWS ApprovedMigrationHead stays 20261014170000.
    // No persistent payment lane row; all payment activation gates remain off.
    version: "20261015153000",
    filename: "20261015153000_payment_lane_isolation_v1.sql",
    step: "PAY-ENV-01 payment lane isolation",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "payment lane isolation", probe: "admin_private.payment_expected_livemode_v1" },
  },
  {
    // Applied DEV-only on 2026-10-16 after reviewed PR #203, with its Supabase
    // generated ledger 20261015231210 aligned to canonical 20261015230000.
    // NOT applied to Production; AWS ApprovedMigrationHead remains SEC-08.
    version: "20261015230000",
    filename: "20261015230000_dev_stripe_one_shot_v1.sql",
    step: "PAY-ENV-04 DEV Stripe one-shot",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "DEV Stripe one-shot", probe: "public.admin_dev_stripe_one_shot_claim_v1" },
  },
  {
    // Already applied to DEV on 2026-10-16 as 20261016175917. Statement is the
    // pre-annotation source 84c1c49. Not replayed. Not applied to Production.
    version: "20261016175917",
    filename: "20261016175917_admin_journey_02_dev_intake_review_screening_v1.sql",
    step: "ADMIN-JOURNEY-02 DEV intake review",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "journey intake review", probe: "public.admin_case_journey_decision_v1" },
  },
  {
    // Already applied to DEV on 2026-10-17 as 20261017111446. The statement is
    // the 10491-character evidence-draft file, not the shorter 03A proposal.
    // Not replayed. Not applied to Production. It does not send email.
    version: "20261017111446",
    filename: "20261017111446_admin_journey_03b_evidence_draft_wording_dev_v1.sql",
    step: "ADMIN-JOURNEY-03B DEV evidence draft wording",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "evidence draft wording", probe: "public.admin_communication_revise_evidence_draft_v1" },
  },
  {
    // Already applied to DEV on 2026-10-17 as 20261017113702. Statement is the
    // pre-annotation source fe94576. Not replayed. Not applied to Production.
    // It does not rewrite stored customer, business or location rows.
    version: "20261017113702",
    filename: "20261017113702_get_help_legacy_country_match_dev_v1.sql",
    step: "Get Help DEV legacy country match",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "legacy country match", probe: "public._intake_country_key" },
  },
  {
    // Already applied to DEV on 2026-10-17 as 20261017145801. Inserts version 2
    // templates as DRAFT only. Not replayed. Not applied to Production.
    version: "20261017145801",
    filename: "20261017145801_admin_journey_03c_customer_templates_v2_draft_dev.sql",
    step: "ADMIN-JOURNEY-03C DEV draft templates",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "draft communication templates", probe: "admin_private.communication_templates" },
  },
  {
    // Already applied to DEV on 2026-10-17 as 20261017210826. Inserts evidence
    // request version 3 as DRAFT and does not approve it or send mail.
    // Not replayed. Not applied to Production.
    version: "20261017210826",
    filename: "20261017210826_comms_brand_evidence_request_v3_dev.sql",
    step: "COMMS-BRAND DEV evidence request v3",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "branded evidence draft", probe: "admin_private.brand_evidence_request_snapshot_v1" },
  },
  {
    // Already applied to DEV on 2026-10-17 as 20261017215625. Not replayed.
    // Not applied to Production.
    version: "20261017215625",
    filename: "20261017215625_admin_template_full_body_preview_dev_v1.sql",
    step: "DEV template full-body preview",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "template preview", probe: "admin_private.template_public_json_v1" },
  },
  {
    // Already applied to DEV on 2026-10-19 as 20261019163645. Statement is the
    // Step 5 source at 97e6411, before the later comment annotation.
    // Not replayed. Not applied to Production.
    version: "20261019163645",
    filename: "20261019163645_admin_journey_05_assessment_dev_v1.sql",
    step: "ADMIN-JOURNEY-05 DEV assessment",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "case assessment", probe: "public.admin_case_assessment_command_v1" },
  },
  {
    // Reviewed Step 10B statement. Applied to DEV only on 2026-10-19,
    // canonical ledger version 20261019183000. Not applied to Production.
    version: "20261019183000",
    filename: "20261019183000_admin_journey_10b_record_outcome_v1.sql",
    step: "ADMIN-JOURNEY-10B record outcome",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "pre-closure outcome", probe: "public.admin_case_command_v1" },
  },
  {
    // Reviewed Step 12A statement. Applied to DEV only on 2026-10-20,
    // canonical ledger version 20261019235000. Not applied to Production.
    version: "20261019235000",
    filename: "20261019235000_admin_journey_12a_close_billing_v1.sql",
    step: "ADMIN-JOURNEY-12A close billing prerequisite",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "close billing prerequisite", probe: "public.admin_case_command_v1" },
  },
  {
    // Reviewed ADMIN-JOURNEY-E2E-02 statement. Applied to DEV only on 2026-10-20;
    // stored SQL was an exact match and ledger version aligned to canonical.
    // Not applied to Production. Do not replay.
    version: "20261020120000",
    filename: "20261020120000_admin_journey_e2e_02_managed_stage_v1.sql",
    step: "ADMIN-JOURNEY-E2E-02 Managed stage readiness",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "managed stage readiness", probe: "admin_private.case_stage_ready_v1" },
  },
  {
    // Reviewed ADMIN-JOURNEY-E2E-03 statement. Applied to DEV only on 2026-10-20;
    // stored SQL matched exact source and the canonical ledger version was aligned.
    // Not applied to Production. Do not replay.
    version: "20261020150000",
    filename: "20261020150000_admin_journey_e2e_03_success_fee_guard_v1.sql",
    step: "ADMIN-JOURNEY-E2E-03 success-fee outcome guard",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "success-fee outcome guard", probe: "admin_private.admin_payment_command_core_v1" },
  },
  {
    // Reviewed ADMIN-JOURNEY-E2E-04 statement. Applied to DEV only on 2026-10-20.
    // Stored SQL matched the source file. Generated ledger version 20261020122920
    // was aligned to canonical 20261020210000. Not applied to Production. Do not replay.
    version: "20261020210000",
    filename: "20261020210000_admin_journey_e2e_04_customer_outcome_v1.sql",
    step: "ADMIN-JOURNEY-E2E-04 customer terminal outcome",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer terminal outcome", probe: "public.customer_portal_case_v1" },
  },
  {
    // DEV-MAIL-01 Phase B. Applied to DEV only. The Supabase runner recorded
    // version 20261021132018. The repository filename was aligned to that
    // ledger version. The SQL was not replayed. Not applied to Production.
    // A later apply to Production creates the function and does not enable
    // mail, the scheduled worker, or the develop route. Do not replay it.
    version: "20261021132018",
    filename: "20261021132018_dev_send_email_claim_v1.sql",
    step: "DEV-MAIL-01 Phase B DEV send email claim",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "DEV send email claim", probe: "public.admin_dev_send_email_claim_v1" },
  },
  {
    // Preliminary evidence upload. A verified email may open one
    // COMMUNICATION_ACCESS request without a verified business membership.
    // Revoked relationships stay blocked. Published packs stay hidden.
    // Applied to DEV once as ledger version 20261021155147. The repository
    // filename was aligned to that version. The SQL was not replayed.
    // Not applied to Production. Do not replay it.
    version: "20261021155147",
    filename: "20261021155147_communication_access_preliminary_evidence_v1.sql",
    step: "Preliminary COMMUNICATION_ACCESS evidence upload",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "preliminary evidence upload", probe: "admin_private.customer_action_eligible_v1" },
  },
  {
    // COM-GROSS-01. New and repriced quote versions for the five published
    // services keep the customer total equal to the quoted subtotal.
    // Exclusive tax is rejected. Existing rows are not rewritten.
    // Applied to DEV as ledger version 20261021214813. The repository
    // filename was aligned to that version. The SQL was not replayed.
    // Not applied to Production. Do not replay it.
    version: "20261021214813",
    filename: "20261021214813_gross_customer_price_v1.sql",
    step: "COM-GROSS-01 gross customer price",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "gross customer price", probe: "admin_private.enforce_gross_customer_price_v1" },
  },
  {
    // CUSTOMER-QUOTE-04. Inserts the five owner-approved service agreements
    // as unapproved catalogue rows and adds the owner-approval function.
    // A new offer binds a service agreement only after that function runs.
    // The omnibus row and issued quotations are not rewritten.
    // DEV-applied 22 October 2026 at ledger version 20261022124813.
    // Production is not changed; never replay this version.
    version: "20261022124813",
    filename: "20261022124813_service_specific_agreements_v1.sql",
    step: "CUSTOMER-QUOTE-04 service-specific agreements",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "service-specific agreement approval", probe: "public.admin_record_owner_paid_service_agreement_approval_v1" },
  },
  {
    // COMM-QUOTE-01. Queues a quotation email on the existing communications
    // row and SEND_EMAIL outbox. The acceptance bearer is not stored.
    // DEV-applied on 22 October 2026 at the canonical ledger version.
    // Production is not changed; never replay this version.
    version: "20261022172455",
    filename: "20261022172455_quote_offer_email_v1.sql",
    step: "COMM-QUOTE-01 quotation email",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
    verification: { category: "quotation email", probe: "public.admin_queue_quote_offer_email_v1" },
  },
  {
    // AUTO-EMAIL-VERIFY. A hashed single-use challenge for the case-receipt
    // confirmation button. DEV-applied at ledger 20261023000158; Production unchanged.
    version: "20261023000158",
    filename: "20261023000158_email_confirmation_challenge_v1.sql",
    step: "AUTO-EMAIL-VERIFY case receipt email confirmation",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "email confirmation", probe: "public.confirm_email_challenge_v1" },
  },
  {
    // AUTO-EMAIL-VERIFY delivery provenance. Applied and verified in DEV.
    // Canonical source aligned to the existing DEV ledger version without SQL replay.
    // Production unchanged; never replay the DEV-applied migration.
    version: "20261023091735",
    filename: "20261023091735_email_confirmation_delivery_v1.sql",
    step: "AUTO-EMAIL-VERIFY confirmation delivery provenance",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "email confirmation delivery", probe: "public.record_email_confirmation_delivery_v1" },
  },
  {
    // ENV-PARITY. Quotation recipient comes from the verified customer record
    // in both DEV and Production, never a hardcoded test mailbox.
    // DEV-applied once at exact ledger version 20261023103232; source aligned.
    // Does not itself send any email or activate a provider. Production untouched.
    version: "20261023103232",
    filename: "20261023103232_quote_email_recipient_parity_v1.sql",
    step: "ENV-PARITY quotation recipient",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "quotation recipient parity", probe: "public.admin_queue_quote_offer_email_v1" },
  },
  {
    // CUSTOMER-EVIDENCE-MULTI: one secure email link, independently uploaded
    // items and unchanged scanning/review. DEV applied exactly once; repository
    // filename and SQL match the 20261023144943 ledger statement.
    // Production untouched; this migration must never be replayed in DEV.
    version: "20261023144943",
    filename: "20261023144943_customer_multi_item_evidence_v1.sql",
    step: "CUSTOMER-EVIDENCE-MULTI secure upload slots",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "customer multi-document evidence", probe: "public.customer_evidence_begin_v2" },
  },
  {
    // ADMIN-JOURNEY-06. Read-only Step 6 readiness applied to DEV at 20261023221028.
    // Source filename aligned; SQL was not replayed.
    version: "20261023221028",
    filename: "20261023221028_admin_case_quote_readiness_v1.sql",
    step: "ADMIN-JOURNEY-06 quote readiness",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "quote readiness", probe: "public.admin_case_quote_readiness_v1" },
  },
  {
    // ADMIN-JOURNEY-06. DEV email claim recent sign-in is 30 minutes.
    // Applied to DEV at 20261023221042; never replay. Other recent-login windows unchanged.
    version: "20261023221042",
    filename: "20261023221042_dev_email_recent_login_30m_v1.sql",
    step: "ADMIN-JOURNEY-06 DEV email recent sign-in",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "DEV email recent sign-in", probe: "public.admin_dev_send_email_claim_v1" },
  },
  {
    // ADMIN-SEC-REAUTH-30. One 30-minute recent-sign-in window for every
    // remaining Admin step-up. Applied once to DEV at 20261024085235. Not applied to Production.
    version: "20261024085235",
    filename: "20261024085235_admin_recent_signin_30m_v1.sql",
    step: "ADMIN-SEC-REAUTH-30 recent sign-in",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "Admin recent sign-in", probe: "admin_private.settings_reauth_ok_v1" },
  },
  {
    // QUOTE-EMAIL-VALIDATION-01. Accepts the approved concise Guided Relaunch
    // quotation email. Applied once to DEV with recorded version 20261024190832.
    // SQL was not replayed and Production remains unchanged.
    version: "20261024190832",
    filename: "20261024190832_quote_offer_email_snapshot_v1.sql",
    step: "QUOTE-EMAIL-VALIDATION-01 quotation email snapshot",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "quotation email snapshot", probe: "admin_private.quote_offer_snapshot_reason_v1" },
  },
  {
    // ADMIN-JOURNEY-07. Records an accepted service order on the case.
    // Applied once to DEV at ledger version 20261024233701. Never replay SQL; Production unchanged.
    // It does not edit a quotation, issue a payment link, or mark an obligation paid.
    version: "20261024233701",
    filename: "20261024233701_admin_reconcile_accepted_service_v1.sql",
    step: "ADMIN-JOURNEY-07 accepted service reconciliation",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "accepted service reconciliation", probe: "public.admin_reconcile_accepted_service_v1" },
  },
  {
    // Guided payment request. Already in the DEV ledger at 20261025020000.
    // Do not replay it. Production is unchanged. It does not send mail, open
    // Stripe, or mark an obligation paid.
    version: "20261025020000",
    filename: "20261025020000_guided_payment_request_email_v1.sql",
    step: "Guided payment-request email",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "guided payment request", probe: "public.admin_queue_guided_payment_request_v1" },
  },
  {
    // GUIDED-FULFILMENT handover. Already in the DEV ledger at 20261025140000.
    // Do not replay it. Production is unchanged. It does not send mail, charge
    // a card, or edit an existing case.
    version: "20261025140000",
    filename: "20261025140000_guided_fulfilment_handover_v1.sql",
    step: "GUIDED-FULFILMENT handover",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "Guided fulfilment handover", probe: "public.customer_portal_guided_handover_v1" },
  },
  {
    // GUIDED-FULFILMENT closure. Already in the DEV ledger at 20261025160000.
    // This is the observed DEV head. Do not replay it. Production is unchanged.
    version: "20261025160000",
    filename: "20261025160000_guided_fulfilment_closure_v1.sql",
    step: "GUIDED-FULFILMENT closure",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "Guided fulfilment closure", probe: "public.admin_guided_fulfilment_close_v1" },
  },
  {
    // MANAGED-JOURNEY-E2E. Already in the DEV ledger at 20261025163000.
    // Do not replay it. It was not applied to Production.
    version: "20261025163000",
    filename: "20261025163000_managed_success_verification_v1.sql",
    step: "MANAGED-JOURNEY-E2E success verification",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "Managed success verification", probe: "admin_private.success_verification_ready_v1" },
  },
  {
    // PAYMENT-CHECKOUT-BRANDING-DEV-01. Already in the DEV ledger at 20261026140000.
    // Do not replay it. It was not applied to Production.
    version: "20261026140000",
    filename: "20261026140000_checkout_presentation_v1.sql",
    step: "PAYMENT-CHECKOUT-BRANDING-DEV-01 checkout presentation",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "Checkout presentation", probe: "public.payment_checkout_presentation_v1" },
  },
  {
    // CUSTOMER-CHECKOUT-REFRESH-DEV-02. Already in the DEV ledger at 20261026170000.
    // This is the observed DEV head. Do not replay it. Production is unchanged.
    version: "20261026170000",
    filename: "20261026170000_checkout_refresh_v1.sql",
    step: "CUSTOMER-CHECKOUT-REFRESH-DEV-02 checkout refresh",
    kind: "additive",
    appliedToDev: true,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "Checkout refresh", probe: "public.customer_portal_checkout_refresh_v1" },
  },
  {
    // PAYMENTS-E2E-POSTCHECKOUT-01. Lets a closed DEV Preview worker claim
    // test-mode settlement events. Source only. Do not apply to DEV or
    // Production from this change. It does not send mail, charge a card, or
    // edit an existing case.
    version: "20261026180000",
    filename: "20261026180000_dev_payment_event_worker_v1.sql",
    step: "PAYMENTS-E2E-POSTCHECKOUT-01 payment event worker",
    kind: "additive",
    appliedToDev: false,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "DEV payment event worker", probe: "public.dev_payment_event_claim_v1" },
  },
  {
    // PAYMENTS-E2E-POSTCHECKOUT-01. Customer receipt reference and one DEV
    // payment-confirmation claim. Source only. Do not apply to DEV or
    // Production from this change. It does not charge a card or edit a Stripe event.
    version: "20261026190000",
    filename: "20261026190000_dev_payment_receipt_delivery_v1.sql",
    step: "PAYMENTS-E2E-POSTCHECKOUT-01 receipt delivery",
    kind: "additive",
    appliedToDev: false,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "DEV payment receipt delivery", probe: "public.dev_payment_confirmation_claim_v1" },
  },
  {
    // PROFILERELAUNCH-UNIFIED-BILLING-DOCUMENTS-01. Customer billing documents.
    // Source only. Do not apply to DEV or Production from this change.
    // It does not charge a card, send mail, or update payment_receipts.
    version: "20261027120000",
    filename: "20261027120000_billing_documents_v1.sql",
    step: "PROFILERELAUNCH-UNIFIED-BILLING-DOCUMENTS-01 billing documents",
    kind: "additive",
    appliedToDev: false,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "Billing documents", probe: "public.customer_portal_invoice_document_v1" },
  },
]

/**
 * The newest migration in the repository. A project rebuilt from source
 * receives the whole chain, so a clean-schema rehearsal records this as its
 * schema head.
 */
export const migrationHead = migrationChain[migrationChain.length - 1]

/**
 * Newest DEV-applied migration is the verified DEV ledger head
 * `20261026170000`. Guided `20261025020000`, `20261025140000` and
 * `20261025160000`, managed success verification `20261025163000`, checkout
 * presentation `20261026140000` and checkout refresh `20261026170000` are
 * already in the DEV ledger and must not be replayed. The DEV payment event
 * worker `20261026180000`, receipt delivery `20261026190000` and billing
 * documents `20261027120000` are unapplied. Do not apply them from this change.
 * Production remains on its own historical migration head.
 */
export const appliedMigrationHead = [...migrationChain].reverse().find(entry => entry.appliedToDev)!

/** Migrations that exist in source review but have not reached the dev project. */
export function pendingMigrations(): MigrationEntry[] {
  return migrationChain.filter(entry => !entry.appliedToDev)
}

export function manifestFilenames(): string[] {
  return migrationChain.map(entry => entry.filename)
}

export function manifestVersions(): string[] {
  return migrationChain.map(entry => entry.version)
}

export function findMigration(filename: string): MigrationEntry | null {
  return migrationChain.find(entry => entry.filename === filename) ?? null
}

/**
 * The chain up to and including `version`, used to represent a running
 * database at an earlier checkpoint before an upgrade rehearsal.
 */
export function chainThrough(version: string): MigrationEntry[] {
  const index = migrationChain.findIndex(entry => entry.version === version)
  if (index < 0) throw new Error(`unknown migration version ${version}`)
  return migrationChain.slice(0, index + 1)
}

/** The migrations a database at `version` has not yet received. */
export function chainAfter(version: string): MigrationEntry[] {
  const index = migrationChain.findIndex(entry => entry.version === version)
  if (index < 0) throw new Error(`unknown migration version ${version}`)
  return migrationChain.slice(index + 1)
}
