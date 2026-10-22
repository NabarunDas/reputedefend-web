/**
 * Step 24A production release-readiness model.
 *
 * One row per thing that has to be true before ProfileRelaunch Admin can be
 * used in production, and one row per capability that must stay switched off
 * until its own gate is deliberately opened. The table in
 * `docs/admin/production-cutover-readiness.md` is checked against this module,
 * so the prose cannot claim a readiness the model does not record.
 *
 * Two rules keep this honest. A row is `READY` only when something in the
 * repository proves it; anything that lives in an external account is
 * `ACTION_REQUIRED` with the account named, because no repository check can
 * observe a Vercel setting, a DNS record or a Supabase project option. And no
 * row carries a value: `evidence` names files and behaviours, never secrets.
 */

import type { CapabilityId } from "./gates"

export type ReadinessStatus =
  /** Proven in this repository and needs nothing further. */
  | "READY"
  /** The code is complete and correct, and the capability is intentionally off. */
  | "READY_DISABLED"
  /** Something must be done, usually in an external account, before cutover. */
  | "ACTION_REQUIRED"
  /** Cannot proceed until a named prerequisite or decision is resolved. */
  | "BLOCKED"
  /** Deliberately postponed to a later step, with the step named. */
  | "DEFERRED"

export type ReleaseArea =
  | "Admin application"
  | "Vercel"
  | "Supabase"
  | "AWS evidence"
  | "Email — Supabase Auth OTP"
  | "Email — outgoing transactional"
  | "Email — inbound"
  | "Stripe"
  | "Guard"
  | "Google"
  | "Privacy"

export type ReadinessItem = {
  /** Stable identifier. Quoted in the release record. */
  id: string
  area: ReleaseArea
  /** What must be true. */
  requirement: string
  status: ReadinessStatus
  /**
   * Why the status is what it is. Repository evidence names files; external
   * evidence names the account and what would have to be observed there.
   * Never a secret, never a value.
   */
  evidence: string
  /** Work that would have to happen in this repository. Null when none. */
  codeAction: string | null
  /** Work that has to happen in an external account. Null when none. */
  externalAction: string | null
  /** True when a signed-in Admin cannot work in production until this holds. */
  requiredBeforeAdminProductionAccess: boolean
  /** Capabilities whose activation this item gates. Empty when it gates none. */
  requiredBeforeActivationOf: CapabilityId[]
  /** How an operator confirms it, in a way that produces evidence. */
  verification: string
  /** What must stop, and what the safe response is, if verification fails. */
  stopCondition: string
}

const stopAndReclose =
  "Stop the activation, return the gate to its previous value, redeploy, and confirm the capability reads disabled in Settings before investigating. Preserve the audit trail and any provider event already received."

export const readinessModel: readonly ReadinessItem[] = [
  // ---------------------------------------------------------------- Admin app
  {
    id: "admin.single-identity",
    area: "Admin application",
    requirement:
      "Exactly one Admin identity exists and the database refuses to delete, disable or rebind it. There is no second Owner, no staff hierarchy and no invitation flow.",
    status: "READY",
    evidence:
      "The singleton identity trigger and its refusals are exercised in lib/auth/database.test.ts and lib/settings/database.test.ts. No route, command or migration creates a second identity.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "After cutover, count rows in admin_identity. The expected value is 1, and that count is written into the release record.",
    stopCondition:
      "If the count is not 1, stop the cutover before any customer-facing capability is enabled. An unexpected identity is an access-control incident, not a configuration difference.",
  },
  {
    id: "admin.single-operator-continuity",
    area: "Admin application",
    requirement:
      "The consequence of a single Admin identity is recorded rather than engineered away: if that identity cannot sign in, nobody can operate the system.",
    status: "ACTION_REQUIRED",
    evidence:
      "A code fact, not a defect. Every protected surface calls requireStaff() against the one identity. Earlier Step 24 wording that expected a backup owner to be able to operate the system is superseded and has been corrected in the implementation plan.",
    codeAction:
      "None in Step 24A. A second identity would be a product and security change: roles, scoping and audit attribution all follow from it, and the current schema deliberately forbids it.",
    externalAction:
      "Owner decision. The recovery path today is access to the admin@profilerelaunch.com mailbox, so whoever can read that mailbox can obtain a session. Decide and record how that mailbox is protected and recovered.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "Record in the release record who holds mailbox recovery for the Admin address and by what method, or record explicitly that the risk is accepted.",
    stopCondition:
      "If the Admin mailbox is lost, do not create a second identity under incident pressure. Recover the mailbox through the provider. A schema change made during an outage is the larger risk.",
  },
  {
    id: "admin.session-and-cookie",
    area: "Admin application",
    requirement:
      "Production serves the session as a host-only __Host-pr-admin cookie that is httpOnly, Secure, SameSite=strict and path-scoped to /, with only the SHA-256 hash stored server-side.",
    status: "READY",
    evidence:
      "Cookie naming switches on NODE_ENV=production in apps/admin/lib/auth/config.ts; lib/auth/session.test.ts and proxy.test.ts cover issuance, expiry and revocation.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "Sign in on the production domain and read the Set-Cookie header. The name must be __Host-pr-admin, with no Domain attribute present.",
    stopCondition:
      "A Domain attribute, a missing Secure flag or the development cookie name means the deployment is not running as production. Revoke the session, stop, and fix the deployment before signing in again.",
  },
  {
    id: "admin.mutation-boundary",
    area: "Admin application",
    requirement:
      "Every mutation goes through a route handler that re-checks the session and a SECURITY DEFINER RPC that re-checks it again. No page relies on the proxy alone.",
    status: "READY",
    evidence:
      "lib/mutation-boundary.test.ts, lib/access.test.ts and lib/database-hardening.database.test.ts. The last of these calls Admin RPCs as anon and authenticated and proves they are refused.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "The non-mutating smoke pass requests every /api/* path without a session and expects 401 with no body beyond the standard refusal.",
    stopCondition:
      "Any 200 from an unauthenticated /api/* request stops the cutover immediately. Take the deployment out of the domain alias rather than attempting a live fix.",
  },
  {
    id: "admin.no-runtime-errors",
    area: "Admin application",
    requirement:
      "Every Admin page and command renders and answers without a runtime error on the production build.",
    status: "READY",
    evidence:
      "Step 23 exercised every page and command and fixed the ten defects it found; scripts/smoke-admin.mjs walks every route and every command against a real production server build.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "Run the authenticated smoke pass in the production deployment, then read the deployment's runtime logs for the window and confirm no unhandled error was recorded.",
    stopCondition:
      "An unhandled error on a page that an operator needs is a launch blocker. Fix it forward in a reviewed change; do not disable the page to get through the cutover.",
  },

  // ------------------------------------------------------------------- Vercel
  {
    id: "vercel.admin-project-and-domain",
    area: "Vercel",
    requirement:
      "The Admin workspace is deployed as its own project served at admin.profilerelaunch.com, separate from the marketing project.",
    status: "ACTION_REQUIRED",
    evidence:
      "The repository provides the separate apps/admin workspace with its own build, start and smoke commands. Whether the Vercel project and domain exist can only be observed in the Vercel account, and this PR creates and mutates nothing there.",
    codeAction: null,
    externalAction:
      "In Vercel: confirm the Admin project exists, is building from this repository, and has admin.profilerelaunch.com assigned with a valid certificate.",
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "Resolve admin.profilerelaunch.com, inspect the served certificate's subject and expiry, and confirm the deployment id shown in Vercel matches the one written into the release record.",
    stopCondition:
      "Do not proceed on an unverified domain or certificate. Until both are observed, keep the Admin URL unpublished and do not sign in from it.",
  },
  {
    id: "vercel.environment-contract",
    area: "Vercel",
    requirement:
      "Production environment variables match the contract in apps/admin/lib/release/environment.ts: everything marked PRESENT is set, and everything marked ABSENT is not.",
    status: "ACTION_REQUIRED",
    evidence:
      "The contract is derived from the code that reads each variable and environment.test.ts fails if the two disagree. Whether a given name is set in Vercel is an external fact this repository cannot read.",
    codeAction: null,
    externalAction:
      "In Vercel: compare the Production variable names against the contract. Check names and presence only. Do not copy values anywhere.",
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: ["stripe_payments", "outgoing_mail", "inbound_mail", "guard_automation", "privacy_deletion", "google_api"],
    verification:
      "Record in the release record, per variable, whether presence matched the contract. Record presence only; never a value.",
    stopCondition:
      "If a variable marked ABSENT is present, treat it as a capability that may be live. Read Settings → system configuration before doing anything else, remove the variable, redeploy, and re-read.",
  },
  {
    id: "vercel.static-aws-credentials-absent",
    area: "Vercel",
    requirement:
      "No static AWS credential is configured in production. Evidence storage is reached by assuming a role through Vercel OIDC.",
    status: "READY_DISABLED",
    evidence:
      "evidenceAwsConfig() and inboundStorageConfig() both return null the moment AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY or AWS_SESSION_TOKEN is present, so a long-lived key disables storage instead of being used.",
    codeAction: null,
    externalAction:
      "In Vercel: confirm none of the three static credential names exists in the Production environment.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "Request an evidence upload in the controlled-mutation pass. A presigned POST means role assumption worked; a null config means a static credential is set or the role is wrong.",
    stopCondition:
      "If a static credential is found, remove it and redeploy before any evidence upload is attempted, then have the key rotated in AWS by whoever owns it.",
  },
  {
    id: "vercel.cron-unchanged",
    area: "Vercel",
    requirement:
      "The scheduler stays at 0 4 * * *. The daily cadence is itself a safety property, because live mail requires a cadence of 300 seconds or less.",
    status: "READY",
    evidence:
      "MAX_LIVE_MAIL_CADENCE_SECONDS in apps/admin/lib/communications/gate.ts is 300 and the default cadence is 86400, so Production outgoing mail stays closed on the current schedule. The develop DEV preview can open the same queue without that cadence, and that lane leaves the scheduled worker disabled.",
    codeAction: null,
    externalAction:
      "None for Admin cutover. Changing the schedule is part of outgoing mail activation and must not be done ahead of it.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["outgoing_mail"],
    verification: "Read the schedule in the Vercel project and record it verbatim in the release record.",
    stopCondition:
      "If the schedule has changed without an activation decision, restore 0 4 * * * and check the outbox for anything the faster worker may already have attempted.",
  },

  // ----------------------------------------------------------------- Supabase
  {
    id: "supabase.applied-head",
    area: "Supabase",
    requirement:
      "Observed DEV ledger head and repository applied-file head are 20261022172455 quote_offer_email_v1. The seven already-applied versions 20261016175917, 20261017111446, 20261017113702, 20261017145801, 20261017210826, 20261017215625 and 20261019163645 were recovered from applied source and recorded without replay. 20261015230000 remains the previous repository file. Step 10B 20261019183000 admin_journey_10b_record_outcome_v1 was applied to DEV only, with the Supabase-generated ledger version aligned to canonical 20261019183000 after verifying the exact SQL and grants. Step 12A 20261019235000 admin_journey_12a_close_billing_v1 was applied to DEV only, with its canonical ledger version aligned after exact SQL and privilege verification. ADMIN-JOURNEY-E2E-02 20261020120000 admin_journey_e2e_02_managed_stage_v1 was independently applied to DEV only, with its exact stored SQL, canonical version and function grants verified. ADMIN-JOURNEY-E2E-03 20261020150000 admin_journey_e2e_03_success_fee_guard_v1 was independently applied to DEV only after exact SQL and ACL verification; generated ledger version aligned to canonical. ADMIN-JOURNEY-E2E-04 20261020210000 admin_journey_e2e_04_customer_outcome_v1 was independently applied to DEV only on 20 October 2026 after exact source-to-ledger SQL and privilege verification; generated ledger version 20261020122920 was aligned to canonical 20261020210000. It is not applied to Production. Do not replay. It was not applied to Production. Production applied head and AWS ApprovedMigrationHead remain 20261014170000 evidence_content_sha256_v1 after the verified SEC-03 backup 20261014T153911Z and reviewed CloudFormation update. A genuine scheduled SEC-08 new-head backup 20261014T213909Z subsequently passed completed-marker, manifest, source/migration-head alignment and streamed S3 archive SHA-256 validation. CodeBuild project, IAM role and ENABLED three-hour Scheduler identities were preserved. PAY-ENV-04 20261015230000 dev_stripe_one_shot_v1 was reviewed in PR #203 and applied to DEV only on 16 October 2026; Supabase generated version 20261015231210 was aligned in the DEV ledger to canonical 20261015230000. The new claim RPC is service_role-only and no queued events were processed. Production and AWS ApprovedMigrationHead remain at SEC-08. DEV-MAIL-01 dev_send_email_claim_v1 was applied to DEV only. The Supabase runner recorded version 20261021132018 and the repository filename was aligned to that ledger version. The stored SQL was not replayed and it was not applied to Production. Applying that chain to Production later does not enable Production mail, the scheduled worker, or the develop send route. Repository migration 20261021155147 communication_access_preliminary_evidence_v1 was applied to DEV only. The repository filename was aligned to that ledger version. The stored SQL was not replayed and it was not applied to Production. Repository migration 20261021214813 gross_customer_price_v1 was applied to DEV. The repository filename was aligned to that ledger version. The stored SQL was not replayed and it was not applied to Production.",
    status: "READY",
    evidence:
      "On 2026-10-10 SEC-02 was applied from merged commit 2be435047769e5e7ff0108f657f7f55c34c7e682 to profilerelaunch-dev, and the Supabase-generated migration history version was aligned to canonical 20261010200000 customer_action_otp_limits_v1. Live verification confirmed five SECURITY DEFINER functions, empty search_path, service_role-only EXECUTE, private RLS, no direct customer or service_role challenge-column access, and generic rejection of invalid tokens. Five existing customer actions remained and no OTP challenge was active. The canonical chain starts at 20260915120000. appliedToDev true for that migration. On 2026-10-13 DEV applied supabase/migrations/20261013153000_public_request_rate_limit_v1.sql (admin_private.public_rate_limit_buckets, public.consume_public_rate_limit_v1()) from the reviewed PR #176 SQL; the auto-generated ledger version was aligned to canonical. Live checks confirmed the 8/10-minute rate limit, 8 allowed + 8 limited in 16 parallel calls, service_role execution, RLS with no direct grants, and 24-hour / 32-row retention with no active client deletion. Auth-user, case and action counts were unchanged. PROD applied SEC-02 and SEC-03 on 13 October 2026. Both migration versions reconciled to canonical; all five OTP functions retain service_role-only EXECUTE, and SEC-03 RPC permissions, RLS, retention index and live concurrency were checked. SEC-03 scheduled backup 20261014T153911Z and SEC-08 scheduled backup 20261014T213909Z both passed S3 archive/checksum and manifest checks. On 2026-10-14 the reviewer applied supabase/migrations/20261014170000_evidence_content_sha256_v1.sql to profilerelaunch-dev (rmzozuiamjcclvtgutgd) as canonical 20261014170000 evidence_content_sha256_v1. The apply mutated no data rows. DEV still has 4 uploaded evidence versions, 2 customer-visible, and 0 trusted hashes. appliedToDev true. Production project cxwwekdzkkjjbiyofrov applied canonical SEC-08 on 2026-10-14 in an atomic transaction; 0 evidence versions existed. AWS ApprovedMigrationHead was updated to 20261014170000 by reviewed change set with CodeBuild, IAM role and Scheduler identities preserved and schedule ENABLED. Genuine scheduled new-head backup 20261014T213909Z passed S3 completed-marker, matching manifest and streamed archive SHA-256 verification. Older scheduled backups had DB_CONNECTIVITY_RETRIES_EXHAUSTED, followed by successful scheduled builds. On 2026-10-15 DEV alone received COM-13A 20261014234000, COM-13B 20261015013000, COM-14A 20261015140000 and PAY-ENV-01 20261015153000; all four remote versions were reconciled to canonical source versions. COM-14A introduced six RLS deny-all commercial tables, three eligibility triggers and a seller NOT_VAT_REGISTERED fact but zero approved countries, customer binding orders or solicitor approvals. Rolled-back transactional assertions proved a verified UK purchasing business may use the UK treatment and an Irish business owning a UK Google listing does not inherit it. PAY-ENV-01 added an RLS-protected private payment lane, eight livemode isolation triggers and retired the off-session Managed collection RPC. Both directions of mismatched Stripe event/payment preparation were tested in rollback-only DEV transactions. No lane row was seeded, no provider/receipt/invoice rows persisted and no Stripe network call was made. PROD/AWS remain at SEC-08. The exact-hash paid-service catalogue is SOLICITOR_REVIEW, operative false, with no approval or paid acceptance records. DEV has three pre-existing unrecorded initial foundation versions, tracked for investigation in GitHub issue #190 without replaying their SQL. As of 16 October 2026 DEV legal agreement PS-2026-10-14.2 has one authenticated solicitor approval record and is operative (Production remains separate). PAY-ENV-04 was installed in DEV only with the reviewed service_role-only claim RPC, 4 queued test-mode Stripe events unprocessed, and no payment obligations/receipts/ledger rows. The DEV one-shot feature flag remains absent. On 19 October 2026 the observed DEV ledger continued past the repository applied-file mark 20261015230000 through 20261016175917, 20261017111446, 20261017113702, 20261017145801, 20261017210826, 20261017215625 and 20261019163645 admin_journey_05_assessment_dev_v1. DEV-HISTORY-01 recorded those seven statements in supabase/migrations without replaying them. Step 10B 20261019183000 is applied to DEV only. 20261019235000 admin_journey_12a_close_billing_v1 is applied to DEV only, not Production. ADMIN-JOURNEY-E2E-02 20261020120000 admin_journey_e2e_02_managed_stage_v1 was independently applied to DEV only, with its exact stored SQL, canonical version and function grants verified. ADMIN-JOURNEY-E2E-03 20261020150000 admin_journey_e2e_03_success_fee_guard_v1 was independently applied to DEV only after exact SQL and ACL verification; generated ledger version aligned to canonical. ADMIN-JOURNEY-E2E-04 20261020210000 admin_journey_e2e_04_customer_outcome_v1 was independently applied to DEV only on 20 October 2026 after exact source-to-ledger SQL and privilege verification; generated ledger version 20261020122920 was aligned to canonical 20261020210000. It is not applied to Production. Do not replay. COM-GROSS-01 20261021214813 gross_customer_price_v1 was applied to DEV. The repository filename was aligned to that ledger version. The stored SQL was not replayed and it was not applied to Production.",
    codeAction: null,
    externalAction:
      "Do not replay applied DEV or Production migrations, including DEV-only COM-13A/COM-13B/COM-14A/PAY-ENV-01/PAY-ENV-04 and the seven DEV-HISTORY-01 statements. Do not apply those seven statements to Production. Do not replay DEV-applied 20261019235000, 20261020120000, 20261020150000 or 20261020210000. Do not replay DEV-applied 20261020210000 or apply it to Production. Do not replay DEV-applied 20261021214813 or apply it to Production. Both approved-head scheduled backups were accepted, including genuine new-head SEC-08 archive 20261014T213909Z. Preserve the ENABLED three-hour AWS backup schedule and keep customer and paid-service feature gates disabled.",
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "Compare DEV head against canonical 20261021214813 and Production head against 20261014170000. Do not replay DEV-applied 20261021214813 or apply it to Production. Do not replay the seven DEV-HISTORY-01 statements and do not apply them to Production. ADMIN-JOURNEY-E2E-02 20261020120000 admin_journey_e2e_02_managed_stage_v1 was independently applied to DEV only, with its exact stored SQL, canonical version and function grants verified. ADMIN-JOURNEY-E2E-03 20261020150000 admin_journey_e2e_03_success_fee_guard_v1 was independently applied to DEV only after exact SQL and ACL verification; generated ledger version aligned to canonical. ADMIN-JOURNEY-E2E-04 20261020210000 admin_journey_e2e_04_customer_outcome_v1 was independently applied to DEV only on 20 October 2026 after exact source-to-ledger SQL and privilege verification; generated ledger version 20261020122920 was aligned to canonical 20261020210000. It is not applied to Production. Do not replay. Verify COM-13A/COM-13B/COM-14A/PAY-ENV-01/PAY-ENV-04 each appears once in DEV only, and SEC-08 appears once in both migration ledgers, with service_role-only digest RPC grants. Track the separate DEV foundation-ledger provenance gap in issue #190. Confirm AWS ApprovedMigrationHead equals the PRODUCTION head 20261014170000, Scheduler remains ENABLED, and scheduled SEC-08 backup 20261014T213909Z passed completed-marker, manifest, migration-head and archive SHA-256 checks.",
    stopCondition:
      "If DEV head differs from canonical 20261022172455 or Production head differs from canonical 20261014170000 unexpectedly, stop and investigate; DEV has a separately tracked three-foundation-entry provenance gap. Never replay an applied migration, including the seven DEV-HISTORY-01 statements, and do not apply those statements to Production. Do not replay DEV-applied 20261019235000. Do not replay DEV-applied 20261020210000 or apply it to Production. Do not replay DEV-applied 20261021132018. Do not replay DEV-applied 20261021155147. Do not replay DEV-applied 20261021214813 or apply it to Production. Stop the release if the AWS backup head drifts from PRODUCTION 20261014170000, the schedule is disabled, or the next required scheduled backup archive or checksum fails. PAY-ENV-04 is applied in DEV only; no queued Stripe event was processed and the one-shot feature flag remains OFF.",
  },
  {
    id: "supabase.migration-ledger-discrepancy",
    area: "Supabase",
    requirement:
      "Strategy A was chosen and production was built from the canonical repository chain, so the historical DEV ledger discrepancy is not inherited by production.",
    status: "READY",
    evidence:
      "Strategy A was chosen and executed on 2026-10-04. Production was created from empty from the canonical supabase/migrations chain, so its ledger contains all three foundation migrations normally. The new default-privilege hardening migration is forward-only and does not change that historical fact. apps/admin/lib/recovery/history.ts continues to report the historical profilerelaunch-dev discrepancy honestly; it is not inherited by production.",
    codeAction:
      "Track the three missing early DEV history entries in issue #190; verify provenance before any repair. Do not replay foundation migrations or edit Production history merely to make DEV and Production match.",
    externalAction: null,
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "Record the chosen strategy, who chose it and when, in the release record. A production cutover without that record is not signed off.",
    stopCondition:
      "Never replay, reapply, rename or fabricate a history row for the three foundation migrations. If the ledger cannot be reconciled, build production from the canonical chain instead of adopting the development database.",
  },
  {
    id: "supabase.legacy-objects",
    area: "Supabase",
    requirement:
      "Production inspection confirms public.set_case_public_ref and public.rls_auto_enable are absent; neither is created by the canonical chain.",
    status: "READY",
    evidence:
      "No file under supabase/migrations creates public.set_case_public_ref or public.rls_auto_enable. Strategy A production was built from that canonical chain, and direct production inspection on 2026-10-04 confirmed both objects are absent while the repository-managed cases_assign_public_ref path is present.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "Record the inspection output, the decision and the reason in the release record. A clean production database built from the canonical chain will not contain either object, which closes the item by construction.",
    stopCondition:
      "If the inspection shows a dependent object, do not drop anything. A dependency means something in the live schema is not described by the repository, and that has to be understood before it is removed.",
  },
  {
    id: "supabase.rls-and-grants",
    area: "Supabase",
    requirement:
      "Every table carries row-level security, every function pins an empty search_path, and service_role is the only role that can execute an Admin RPC.",
    status: "READY",
    evidence:
      "lib/database-hardening.database.test.ts rebuilds the whole chain and calls Admin RPCs, an admin_private helper and a direct table read as anon and authenticated, proving each is refused.",
    codeAction: null,
    externalAction:
      "Run the Supabase database linter against production after the schema is in place and confirm no new error-level finding.",
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification: "Attach the linter result to the release record.",
    stopCondition:
      "An error-level finding on a table that holds personal data stops the cutover. Do not grant a role to work around it.",
  },
  {
    id: "supabase.leaked-password-protection",
    area: "Supabase",
    requirement:
      "Leaked-password protection is enabled on the Supabase project as a project-level hardening measure.",
    status: "READY",
    evidence:
      "Enabled on the production Supabase project on 2026-10-05. apps/admin/lib/release/external-evidence.ts records the observation from a fresh Supabase Security Advisor run: auth_leaked_password_protection is absent. The Admin application remains OTP-only and does not enable password login.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "Observe the setting in the dashboard and record the date it was enabled. Do not record it as configured on the strength of this document.",
    stopCondition:
      "If it cannot be enabled, record the exception rather than leaving the item silently open. Do not weaken the OTP-only Admin application flow as a workaround.",
  },
  {
    id: "supabase.recovery-rehearsal",
    area: "Supabase",
    requirement:
      "A recovery rehearsal against a real restored project proves the database and its evidence objects can be recovered together.",
    status: "DEFERRED",
    evidence:
      "Step 22A is complete. The launch objectives are approved at RPO <=4 hours and core-service RTO <=4 hours. .github/workflows/prod-db-backup.yml plus infra/aws/prod-db-backup.yaml implement the source-controlled three-hour logical-backup path with seven-day S3 retention. Step 22B, the rehearsal against a real restored project, has not yet been performed.",
    codeAction:
      "Deploy the source-controlled backup stack, configure the GitHub secret/variables, and obtain one accepted live backup before the restore rehearsal.",
    externalAction:
      "In AWS, deploy infra/aws/prod-db-backup.yaml. In GitHub, set PROD_SUPABASE_DB_URL and the three AWS_DB_BACKUP_* variables, manually run Production database backup, then execute Step 22B against a throwaway Supabase project.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "Step 22B produces its own evidence. Until it does, the release record carries Step 22B as outstanding and final production sign-off is withheld.",
    stopCondition:
      "Admin code readiness can complete with Step 22B outstanding. Final production sign-off cannot. Do not record sign-off as achieved by noting that the rehearsal is planned.",
  },

  // -------------------------------------------------------------- AWS evidence
  {
    id: "aws.evidence-role-and-bucket",
    area: "AWS evidence",
    requirement:
      "The evidence bucket exists, is private, and the Admin and Customer runtimes reach it through two separate assumed roles scoped to what each one needs.",
    status: "ACTION_REQUIRED",
    evidence:
      "AWS_EVIDENCE_ROLE_ARN and AWS_CUSTOMER_EVIDENCE_ROLE_ARN are read separately, and both the ARN and the bucket name are validated against their grammars before use. Whether the bucket and roles exist in AWS cannot be read from here, and this PR performs no AWS operation.",
    codeAction: null,
    externalAction:
      "In AWS: confirm the bucket exists with public access blocked, versioning and encryption as decided, and that the Vercel OIDC trust policy allows only the intended project.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "In the controlled-mutation pass, request one evidence upload against a record created for the purpose, confirm the presigned POST is returned and that the response carries no storage key.",
    stopCondition:
      "If role assumption fails, stop at evidence. The rest of Admin works without it, so there is no reason to loosen the trust policy under time pressure.",
  },
  {
    id: "aws.evidence-scan-boundary",
    area: "AWS evidence",
    requirement: "An uploaded file is reviewable only after a clean scan result is recorded.",
    status: "READY",
    evidence:
      "lib/evidence/database.test.ts and lib/evidence/command.test.ts prove a threatened or incomplete scan blocks acceptance and that a version belonging to another case conflicts without disclosing its key.",
    codeAction: null,
    externalAction:
      "Confirm the scanning service is enabled on the production bucket. A bucket with no scanner leaves every upload permanently unreviewable, which fails closed but is still broken.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification: "Upload one controlled file and confirm it becomes reviewable only after the scan result arrives.",
    stopCondition:
      "Never record a scan result by hand to unblock a review. An unscanned file that reads as clean is worse than one that cannot be reviewed.",
  },

  // ------------------------------------------------------- Email: Auth OTP
  {
    id: "email.auth-otp",
    area: "Email — Supabase Auth OTP",
    requirement:
      "Supabase Auth can deliver a one-time code to admin@profilerelaunch.com. This is the only email path Admin sign-in depends on, and it is not the transactional mail path.",
    status: "ACTION_REQUIRED",
    evidence:
      "Sign-in calls Supabase Auth with SUPABASE_PUBLISHABLE_KEY; delivery is performed by the Supabase project's own mail configuration. It is unrelated to RESEND_API_KEY, COMMUNICATIONS_SEND_ENABLED and the job worker, none of which take part in sign-in.",
    codeAction: null,
    externalAction:
      "In Supabase: confirm Auth email delivery is configured for the production project, with a sender the Admin mailbox will accept, and confirm the rate limit permits the expected sign-in frequency.",
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification:
      "One real sign-in to the production domain, performed by the operator, during the authenticated smoke pass. Do not automate an OTP send, and never from CI.",
    stopCondition:
      "If the code does not arrive, stop before enabling anything else. Check the Supabase Auth logs and the mailbox. Do not add a second identity or a password fallback to get in.",
  },
  {
    id: "email.otp-attempt-limits",
    area: "Email — Supabase Auth OTP",
    requirement:
      "Code verification is rate-limited and a code cannot be brute-forced or reused.",
    status: "READY",
    evidence:
      "lib/auth/database.test.ts proves the sixth verification attempt is refused, a resend inside 60 seconds is refused, and an expired or mismatched challenge is refused.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: true,
    requiredBeforeActivationOf: [],
    verification: "Covered by the test suite. No live attempt is made against production.",
    stopCondition:
      "Not applicable at cutover. If the limits were ever relaxed, that would be a reviewed code change, not an operational one.",
  },

  // ------------------------------------------------- Email: outgoing transactional
  {
    id: "email.outgoing-disabled",
    area: "Email — outgoing transactional",
    requirement:
      "Outgoing transactional mail is off at cutover and cannot be turned on by a single setting.",
    status: "READY_DISABLED",
    evidence:
      "On a production deployment, communicationsSendEnabled() requires all six of VERCEL_ENV=production, COMMUNICATIONS_SEND_ENABLED=true, JOB_WORKER_ENABLED=true, provider mode production, a Resend key, a parseable sender, and a worker cadence of 300 seconds or less. gates.test.ts proves credentials alone do not open it. The develop DEV preview is a separate lane and does not change these Production settings.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["outgoing_mail"],
    verification:
      "Read Settings → system configuration on the production deployment. Outgoing communications must read Disabled.",
    stopCondition:
      "If it reads Enabled before activation was decided, assume mail may already have been sent. Read the outbox and communication_events first, then unset the gate. " + stopAndReclose,
  },
  {
    id: "email.outgoing-activation",
    area: "Email — outgoing transactional",
    requirement:
      "Activation of outgoing mail happens as its own phase, after a verified sending domain and a registered delivery webhook.",
    status: "DEFERRED",
    evidence:
      "The send path, the template lifecycle, the link-secret derivation and the delivery webhook are all implemented and tested against the recorded provider boundary. What is missing is external configuration and an Owner decision to send.",
    codeAction: null,
    externalAction:
      "In Resend: verify the sending domain and its DNS records, then register the delivery webhook against the production Admin domain. In Vercel: set the link secret, the webhook secret and the sender, change the schedule to meet the cadence ceiling, then set the enable flags.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["outgoing_mail"],
    verification:
      "Send one message to a mailbox the operator controls, confirm it arrives, and confirm the delivery webhook moved the communication to its delivered state. Never use a real customer address for this.",
    stopCondition:
      "If the webhook does not arrive, the message state will not advance and a retry may send a duplicate. Unset COMMUNICATIONS_SEND_ENABLED before investigating. " + stopAndReclose,
  },
  {
    id: "email.cadence-ceiling",
    area: "Email — outgoing transactional",
    requirement:
      "The worker cadence required for live mail is treated as a decision, not an incidental setting.",
    status: "ACTION_REQUIRED",
    evidence:
      "The 300-second ceiling means outgoing mail activation necessarily changes the schedule away from 0 4 * * *, which in turn changes how often every other scheduled handler runs.",
    codeAction: null,
    externalAction:
      "Owner decision: accept the faster schedule and its effect on Guard maintenance and job retries, or keep the daily schedule and leave outgoing mail off.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["outgoing_mail"],
    verification:
      "Record the decision and the schedule in the release record before the schedule is changed, not after.",
    stopCondition:
      "Do not change the schedule as a step in a mail activation checklist without the decision recorded. The schedule drives more than mail.",
  },

  // ------------------------------------------------------------ Email: inbound
  {
    id: "email.inbound-disabled",
    area: "Email — inbound",
    requirement:
      "Inbound mail ingestion is off at cutover, and the existing Google Workspace mailbox on profilerelaunch.com is untouched.",
    status: "READY_DISABLED",
    evidence:
      "communicationsInboundEnabled() requires its own flag, independent of outgoing mail, and inboundMailDomain() refuses the apex profilerelaunch.com so inbound MX cannot be pointed at the mailbox domain.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["inbound_mail"],
    verification:
      "Settings → system configuration must read Not configured for inbound mail, and the inbound webhook must answer 503.",
    stopCondition:
      "If inbound reads configured before activation, check conversations for imported messages before changing anything, then unset the gate. " + stopAndReclose,
  },
  {
    id: "email.inbound-activation",
    area: "Email — inbound",
    requirement:
      "Inbound activation uses a dedicated subdomain and never changes the MX records of the root domain.",
    status: "DEFERRED",
    evidence:
      "Import is idempotent on the provider message id and an attachment is unavailable until its scan is clean; lib/conversations/receive.test.ts and lib/conversations/attachment.test.ts cover both.",
    codeAction: null,
    externalAction:
      "In DNS: add MX records for the inbound subdomain only. In Resend: enable receiving and register the inbound webhook. In Vercel: set the inbound domain, the owned addresses, the inbound webhook secret and the inbound bucket and role, then set the enable flag.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["inbound_mail"],
    verification:
      "Send one message from an address the operator controls to the inbound subdomain and confirm it appears as a conversation, then confirm a repeat of the same provider message id does not create a second one.",
    stopCondition:
      "If root-domain MX is modified at any point, stop and restore it. That record carries the Google Workspace mailbox, and losing it loses the address Admin sign-in codes are delivered to.",
  },

  // ------------------------------------------------------------------- Stripe
  {
    id: "stripe.code-readiness",
    area: "Stripe",
    requirement:
      "The payment code is complete and correct, independently of whether Stripe is ever switched on.",
    status: "READY_DISABLED",
    evidence:
      "Webhook signature verification, replay handling and exactly-once application are covered by lib/payments/webhook.test.ts and lib/payments/handlers.test.ts. invoice.paid is the authoritative paid-entitlement event and paid-through is monotonic.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["stripe_payments"],
    verification:
      "Settings → system configuration must read Disabled for the payment provider, and the Stripe webhook must answer 503.",
    stopCondition:
      "If the provider reads anything other than Disabled, check payments and payment_events for rows before changing the configuration. " + stopAndReclose,
  },
  {
    id: "stripe.live-key-structurally-refused",
    area: "Stripe",
    requirement:
      "A live Stripe key cannot move money unless Production, stripe_live, the activation flag, an explicit Production database lane, the Production Supabase project, the Production evidence bucket and a webhook secret all agree, and Preview can never initialise that key.",
    status: "READY_DISABLED",
    evidence:
      "paymentLane() uses VERCEL_ENV, not NODE_ENV. Preview and local development accept only stripe_test with sk_test_ or rk_test_. Production accepts only stripe_live, and only when STRIPE_LIVE_ACTIVATION is enabled, the key is sk_live_ or rk_live_, and the Supabase project and evidence bucket match Production. A live key on Preview does not construct a Stripe client.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["stripe_payments"],
    verification: "Covered by gates.test.ts, which drives a synthetic live-shaped key and asserts payments stay off.",
    stopCondition:
      "If a live key is found in the environment, remove it and have it rolled in the Stripe dashboard. Treat its presence as a credential exposure regardless of whether the code used it.",
  },
  {
    id: "stripe.account-and-webhook",
    area: "Stripe",
    requirement:
      "A Stripe account exists with the webhook registered against the production Admin domain, before any provider mode is set.",
    status: "ACTION_REQUIRED",
    evidence:
      "stripeWebhookSecret() requires at least 16 characters and lib/payments/webhook.test.ts proves an unsigned or replayed event is rejected, so the code is ready for a registration that does not yet exist. Whether the account and the endpoint exist can only be seen in the Stripe dashboard.",
    codeAction: null,
    externalAction:
      "In Stripe: create or confirm the account, register the webhook endpoint against the production Admin domain, and select the event types the handlers actually consume. This PR registers nothing and creates no Stripe object.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["stripe_payments"],
    verification:
      "Send one test event from the Stripe dashboard and confirm the Admin webhook accepts it and records it exactly once.",
    stopCondition:
      "Do not set a provider mode before the webhook is registered. Without it a payment can succeed at the provider and never be recorded here, which is the hardest state to reconcile afterwards.",
  },
  {
    id: "stripe.commercial-decisions",
    area: "Stripe",
    requirement:
      "Tax treatment, VAT registration and the legal terms shown at the point of payment are decided before any money moves.",
    status: "BLOCKED",
    evidence:
      "Catalogue prices seeded in Step 13 are explicitly tax-unconfirmed and imply no VAT registration. Nothing in the repository decides this and nothing should.",
    codeAction:
      "None until the decision exists. Tax behaviour is already explicit on a quote, so recording a decision is a data change rather than a schema change.",
    externalAction:
      "Owner decision, with accounting advice: VAT registration status, whether displayed prices include tax, and which terms apply at checkout.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["stripe_payments"],
    verification:
      "Record the decision and its source in the release record before the first payment, not after the first invoice is questioned.",
    stopCondition:
      "Do not take a payment against a price whose tax treatment is unconfirmed. Correcting tax on an issued invoice is materially harder than delaying the first charge.",
  },

  // -------------------------------------------------------------------- Guard
  {
    id: "guard.manual-operation-ready",
    area: "Guard",
    requirement:
      "Manual Guard can be operated at launch: an operator records an observation by hand, and that needs no provider, no automation flag and no Google API access.",
    status: "READY",
    evidence:
      "guard_check_observations.capture_method accepts only MANUAL. lib/guard/checks.database.test.ts and the checks pages cover recording an observation against an obligation from an approved schedule.",
    codeAction: null,
    externalAction:
      "Approve a Guard schedule version in Settings. Without one there are no obligations, which is correct behaviour rather than a fault.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "After cutover, approve a schedule and confirm the checks queue populates for the current Europe/London day.",
    stopCondition:
      "An empty queue with no approved schedule is expected. Do not set GUARD_CHECKS_ENABLED to populate it; that flag is scheduled generation, which is a different capability.",
  },
  {
    id: "guard.automation-disabled",
    area: "Guard",
    requirement:
      "Guard automation — scheduled obligation generation, alert maintenance and alert notification — stays off.",
    status: "READY_DISABLED",
    evidence:
      "All three flags are unset and lib/guard/gate.ts checks each independently; lib/guard/gate.test.ts and lib/guard/maintain-alerts.test.ts cover the refusals. Alert notification additionally depends on the outgoing mail gate, so it cannot send even if its own flag were set.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["guard_automation"],
    verification:
      "Settings → system configuration must read Disabled for Guard checks, Guard alerts and Guard alert notifications.",
    stopCondition:
      "If any reads Enabled, check guard_check_obligations and guard_alerts for rows created without an operator before unsetting it. " + stopAndReclose,
  },
  {
    id: "guard.operating-decisions",
    area: "Guard",
    requirement:
      "The clock windows, the first-response target and the number of locations one operator can actually check by hand each day are decided before Guard is sold.",
    status: "BLOCKED",
    evidence:
      "Step 17 recorded the exact production clock windows as an open Owner decision and Step 20 ships no approved service hours, response targets or retention policies. The system does not invent any of them.",
    codeAction: null,
    externalAction:
      "Owner decision: check windows, first-response target, Guard capacity per operator per day, and what happens when capacity is exceeded.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification:
      "Approve the corresponding setting versions in Settings and record the version numbers in the release record.",
    stopCondition:
      "Do not take on Guard customers against an unapproved schedule. A monitoring promise with no clock behind it is a commitment the system cannot evidence.",
  },

  // ------------------------------------------------------------------- Google
  {
    id: "google.manual-workflow-supported",
    area: "Google",
    requirement:
      "The manual Google Business Profile workflow is fully supported at launch. API access is not required for it.",
    status: "READY",
    evidence:
      "resolveGoogleBusinessProfileProvider() in lib/google-business-profile/resolve.ts returns the manual adapter by two independent routes: the provider mode defaults to manual, and no production code supplies a live transport, so a complete configuration still falls back with live_transport_unavailable.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: [],
    verification: "Settings → system configuration reads Manual mode for Google.",
    stopCondition:
      "Not applicable. Missing Google API access is an external dependency and must not be recorded as an Admin application defect.",
  },
  {
    id: "google.api-inactive",
    area: "Google",
    requirement:
      "The Google Business Profile API stays inactive, and that cannot be changed by configuration alone.",
    status: "READY_DISABLED",
    evidence:
      "googleLiveStack is null, so googleConnectExecution() reports connection_not_implemented. A deployment with every Google variable set still cannot begin an OAuth flow, return an authorization URL or create a state row.",
    codeAction:
      "Activation requires a token exchange and a transport to be written and reviewed. Step 24A adds neither and changes neither the null stack nor any Google gate.",
    externalAction:
      "Google Business Profile API access is an approval from Google, obtained outside this repository. Its absence is not a defect.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["google_api"],
    verification:
      "gates.test.ts drives a fully populated synthetic Google configuration and asserts the connection remains unavailable.",
    stopCondition:
      "If an authorization URL is ever returned in production, a live stack has been shipped. Stop, and establish what was deployed before anything is connected.",
  },

  // ------------------------------------------------------------------ Privacy
  {
    id: "privacy.deletion-disabled",
    area: "Privacy",
    requirement:
      "Physical deletion stays off. A privacy request records the decision and deletes nothing.",
    status: "READY_DISABLED",
    evidence:
      "privacyDeletionEnabled() requires exactly \"true\". lib/settings/command.test.ts and the privacy page prove the page says deletion is unavailable rather than offering an action that would not run.",
    codeAction: null,
    externalAction: null,
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["privacy_deletion"],
    verification: "Settings → system configuration must read Disabled for privacy deletion.",
    stopCondition:
      "If it reads Enabled, check privacy dispositions for anything already actioned before unsetting it. Deletion is the one capability whose effect cannot be undone by closing the gate. " + stopAndReclose,
  },
  {
    id: "privacy.export-and-holds",
    area: "Privacy",
    requirement:
      "A subject access export works and a legal hold blocks deletion in the database, not only in the interface.",
    status: "READY",
    evidence:
      "lib/settings/database.test.ts proves the hold blocks deletion at the database level and that the preview separates retained from blocked categories. Export requires a sign-in from the last five minutes.",
    codeAction: null,
    externalAction:
      "Owner decision on retention periods per category. None is approved today, and the system invents none.",
    requiredBeforeAdminProductionAccess: false,
    requiredBeforeActivationOf: ["privacy_deletion"],
    verification:
      "Run one export against a record created for the purpose during the controlled-mutation pass. Do not export a real customer.",
    stopCondition:
      "If an export contains a field it should not, stop and treat it as a disclosure issue rather than a formatting one.",
  },
]

export function item(id: string): ReadinessItem | undefined {
  return readinessModel.find(entry => entry.id === id)
}

export function byArea(area: ReleaseArea): ReadinessItem[] {
  return readinessModel.filter(entry => entry.area === area)
}

/** Items that must hold before an operator signs in to production Admin. */
export function adminAccessBlockers(): ReadinessItem[] {
  return readinessModel.filter(
    entry => entry.requiredBeforeAdminProductionAccess && entry.status !== "READY" && entry.status !== "READY_DISABLED",
  )
}

/** Items that must hold before the named capability may be activated. */
export function activationBlockers(capabilityId: CapabilityId): ReadinessItem[] {
  return readinessModel.filter(
    entry =>
      entry.requiredBeforeActivationOf.includes(capabilityId)
      && entry.status !== "READY"
      && entry.status !== "READY_DISABLED",
  )
}

export function statusCounts(): Record<ReadinessStatus, number> {
  const counts: Record<ReadinessStatus, number> = {
    READY: 0,
    READY_DISABLED: 0,
    ACTION_REQUIRED: 0,
    BLOCKED: 0,
    DEFERRED: 0,
  }
  for (const entry of readinessModel) counts[entry.status] += 1
  return counts
}
