/**
 * Authoritative description of the migration chain that has been applied to
 * `profilerelaunch-dev`, in the exact order PostgreSQL received it.
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
    version: "20261003120000",
    filename: "20261003120000_case_communications_workspace_v1.sql",
    step: "UX-8 case communications workspace",
    kind: "additive",
    appliedToDev: false,
    containsDataChange: false,
    safeToReplay: false,
    verification: { category: "case communications read", probe: "public.admin_case_communications_v1" },
  },
]

/**
 * The newest migration in the repository. A project rebuilt from source
 * receives the whole chain, so a clean-schema rehearsal records this as its
 * schema head.
 */
export const migrationHead = migrationChain[migrationChain.length - 1]

/**
 * The newest migration `profilerelaunch-dev` has actually received. This is
 * what remote migration history should end at, and it is behind
 * `migrationHead` whenever a reviewed migration is still waiting to be applied.
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
