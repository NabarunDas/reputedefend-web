# Production cutover and readiness

**STEP 24A COMPLETE / FINAL PRODUCTION SIGN-OFF PENDING EXTERNAL AND STEP 22B GATES**

This document and the modules under `apps/admin/lib/release` are the readiness
package for putting the ProfileRelaunch Admin workspace into production. They
describe what is ready, what is deliberately switched off, what has to happen
in an external account, and the order in which it happens.

Nothing in this step performs a cutover. No DNS record, Vercel resource,
Supabase setting, AWS object, webhook registration or provider configuration is
created or changed from here, and no migration is created or applied. Every
live capability stays off.

## What this document is, and is not

It is a record of state that can be checked. The readiness model is a module,
not a table of prose, and the table below is verified against it on every test
run, so the document cannot claim a readiness the model does not hold.

It is not a claim that production exists. A repository cannot observe a DNS
record, a Vercel environment variable, a Supabase project setting or an AWS
role. Everything of that kind is recorded as `ACTION_REQUIRED` with the account
named and the observation that would settle it, and it stays that way until a
person observes it and writes down what they saw.

It contains no secret value. The environment contract records expected
*presence* and has no field a value could be written into, and
`apps/admin/lib/release/secrets.test.ts` scans these artifacts for credential
shapes on every run.

## Readiness model

Statuses mean: `READY` proven in this repository; `READY_DISABLED` the code is
complete and the capability is intentionally off; `ACTION_REQUIRED` something
must be done, usually in an external account; `BLOCKED` a named prerequisite or
decision is unresolved; `DEFERRED` postponed to a named later step.

| ID | Area | Status | Requirement |
| --- | --- | --- | --- |
| `admin.single-identity` | Admin application | READY | Exactly one Admin identity exists and the database refuses to delete, disable or rebind it. There is no second Owner, no staff hierarchy and no invitation flow. |
| `admin.single-operator-continuity` | Admin application | ACTION_REQUIRED | The consequence of a single Admin identity is recorded rather than engineered away: if that identity cannot sign in, nobody can operate the system. |
| `admin.session-and-cookie` | Admin application | READY | Production serves the session as a host-only __Host-pr-admin cookie that is httpOnly, Secure, SameSite=strict and path-scoped to /, with only the SHA-256 hash stored server-side. |
| `admin.mutation-boundary` | Admin application | READY | Every mutation goes through a route handler that re-checks the session and a SECURITY DEFINER RPC that re-checks it again. No page relies on the proxy alone. |
| `admin.no-runtime-errors` | Admin application | READY | Every Admin page and command renders and answers without a runtime error on the production build. |
| `vercel.admin-project-and-domain` | Vercel | ACTION_REQUIRED | The Admin workspace is deployed as its own project served at admin.profilerelaunch.com, separate from the marketing project. |
| `vercel.environment-contract` | Vercel | ACTION_REQUIRED | Production environment variables match the contract in apps/admin/lib/release/environment.ts: everything marked PRESENT is set, and everything marked ABSENT is not. |
| `vercel.static-aws-credentials-absent` | Vercel | READY_DISABLED | No static AWS credential is configured in production. Evidence storage is reached by assuming a role through Vercel OIDC. |
| `vercel.cron-unchanged` | Vercel | READY | The scheduler stays at 0 4 * * *. The daily cadence is itself a safety property, because live mail requires a cadence of 300 seconds or less. |
| `supabase.applied-head` | Supabase | READY | The applied migration head on profilerelaunch-dev is 20261003204538 customer_portal_quotes_agreements_permissions_v1, matching the repository migration head. |
| `supabase.migration-ledger-discrepancy` | Supabase | BLOCKED | The difference between the repository chain and the remote ledger on profilerelaunch-dev is resolved deliberately before a production database is chosen. |
| `supabase.legacy-objects` | Supabase | ACTION_REQUIRED | public.set_case_public_ref and public.rls_auto_enable are accounted for. Neither is created by any repository migration, and Step 1 created the hardened public.cases_assign_public_ref in their place. |
| `supabase.rls-and-grants` | Supabase | READY | Every table carries row-level security, every function pins an empty search_path, and service_role is the only role that can execute an Admin RPC. |
| `supabase.leaked-password-protection` | Supabase | ACTION_REQUIRED | Leaked-password protection is enabled on the Supabase project as a project-level hardening measure. |
| `supabase.recovery-rehearsal` | Supabase | DEFERRED | A recovery rehearsal against a real restored project proves the database and its evidence objects can be recovered together. |
| `aws.evidence-role-and-bucket` | AWS evidence | ACTION_REQUIRED | The evidence bucket exists, is private, and the Admin and Customer runtimes reach it through two separate assumed roles scoped to what each one needs. |
| `aws.evidence-scan-boundary` | AWS evidence | READY | An uploaded file is reviewable only after a clean scan result is recorded. |
| `email.auth-otp` | Email — Supabase Auth OTP | ACTION_REQUIRED | Supabase Auth can deliver a one-time code to admin@profilerelaunch.com. This is the only email path Admin sign-in depends on, and it is not the transactional mail path. |
| `email.otp-attempt-limits` | Email — Supabase Auth OTP | READY | Code verification is rate-limited and a code cannot be brute-forced or reused. |
| `email.outgoing-disabled` | Email — outgoing transactional | READY_DISABLED | Outgoing transactional mail is off at cutover and cannot be turned on by a single setting. |
| `email.outgoing-activation` | Email — outgoing transactional | DEFERRED | Activation of outgoing mail happens as its own phase, after a verified sending domain and a registered delivery webhook. |
| `email.cadence-ceiling` | Email — outgoing transactional | ACTION_REQUIRED | The worker cadence required for live mail is treated as a decision, not an incidental setting. |
| `email.inbound-disabled` | Email — inbound | READY_DISABLED | Inbound mail ingestion is off at cutover, and the existing Google Workspace mailbox on profilerelaunch.com is untouched. |
| `email.inbound-activation` | Email — inbound | DEFERRED | Inbound activation uses a dedicated subdomain and never changes the MX records of the root domain. |
| `stripe.code-readiness` | Stripe | READY_DISABLED | The payment code is complete and correct, independently of whether Stripe is ever switched on. |
| `stripe.live-key-structurally-refused` | Stripe | READY_DISABLED | A live Stripe key cannot be used by this build even if one is configured. |
| `stripe.account-and-webhook` | Stripe | ACTION_REQUIRED | A Stripe account exists with the webhook registered against the production Admin domain, before any provider mode is set. |
| `stripe.commercial-decisions` | Stripe | BLOCKED | Tax treatment, VAT registration and the legal terms shown at the point of payment are decided before any money moves. |
| `guard.manual-operation-ready` | Guard | READY | Manual Guard can be operated at launch: an operator records an observation by hand, and that needs no provider, no automation flag and no Google API access. |
| `guard.automation-disabled` | Guard | READY_DISABLED | Guard automation — scheduled obligation generation, alert maintenance and alert notification — stays off. |
| `guard.operating-decisions` | Guard | BLOCKED | The clock windows, the first-response target and the number of locations one operator can actually check by hand each day are decided before Guard is sold. |
| `google.manual-workflow-supported` | Google | READY | The manual Google Business Profile workflow is fully supported at launch. API access is not required for it. |
| `google.api-inactive` | Google | READY_DISABLED | The Google Business Profile API stays inactive, and that cannot be changed by configuration alone. |
| `privacy.deletion-disabled` | Privacy | READY_DISABLED | Physical deletion stays off. A privacy request records the decision and deletes nothing. |
| `privacy.export-and-holds` | Privacy | READY | A subject access export works and a legal hold blocks deletion in the database, not only in the interface. |

Twelve items are `READY`, eight are `READY_DISABLED`, nine are
`ACTION_REQUIRED`, three are `BLOCKED` and three are `DEFERRED` — the Step 22B
recovery rehearsal plus the two mail activations, each deferred to its own
phase.

Each item also carries evidence, the code action, the external action, whether
it blocks Admin production access, which capability activations it gates, how
it is verified and what to do when verification fails. Those fields live in
`apps/admin/lib/release/readiness.ts` rather than being duplicated here, so
there is one copy of each.

## Environment contract

Derived from the code that reads each variable, not from documentation. The
scan in `apps/admin/lib/release/environment.test.ts` re-derives the set on
every run and fails if this contract and the code disagree in either
direction, so a new configuration read cannot reach production unclassified.

`At cutover` is the expected *presence* for Admin production access, before any
capability activation. `ABSENT` is a real requirement: static AWS credentials
present in production deliberately disable evidence storage, and every live
capability gate is expected to be missing.

| Variable | Apps | Classification | Secrecy | At cutover | Behaviour when absent |
| --- | --- | --- | --- | --- | --- |
| `ADMIN_AUTH_ENABLED` | admin | FEATURE_GATE | non-secret | PRESENT | authConfig() is null, every Admin page redirects to /login and /login says sign-in is not available yet. |
| `ADMIN_ORIGIN` | admin | REQUIRED_FOR_ADMIN_CORE | non-secret | PRESENT | authConfig() is null, so Admin has no sign-in at all. |
| `SUPABASE_URL` | marketing, admin, customer | REQUIRED_FOR_ADMIN_CORE | non-secret | PRESENT | authConfig() and customerBackendConfig() are null, so customer actions and the Customer Portal both stay closed. The marketing site falls back to its email-only intake path. |
| `SUPABASE_SECRET_KEY` | marketing, admin, customer | PROVIDER_SECRET | secret | PRESENT | authConfig() and customerBackendConfig() are null, so no Admin, customer-action, or Customer Portal request can reach the database. |
| `SUPABASE_PUBLISHABLE_KEY` | admin, customer | REQUIRED_FOR_ADMIN_CORE | non-secret | PRESENT | authConfig() and customerBackendConfig() are null, so no Admin or customer one-time code can be issued or verified. |
| `CUSTOMER_AUTH_ENABLED` | customer | FEATURE_GATE | non-secret | OPTIONAL | customerConfig() is null, so no customer action link can be opened. The Customer Portal keeps its own gate. Admin is unaffected. |
| `CUSTOMER_PORTAL_ENABLED` | customer | FEATURE_GATE | non-secret | OPTIONAL | Portal login, /portal and the portal auth routes stay closed. Existing customer action links keep using CUSTOMER_AUTH_ENABLED. |
| `CUSTOMER_ORIGIN` | admin, customer, marketing | REQUIRED_FOR_OPTIONAL_FEATURE | non-secret | OPTIONAL | customerBackendConfig() is null, so customer actions and the Customer Portal both stay closed and no customer-facing link can be composed. |
| `NODE_ENV` | marketing, admin, customer | NON_SECRET_CONFIGURATION | non-secret | PRESENT | Next.js sets it. A non-production value would select the development cookie names, which is why the production smoke test checks the cookie name. |
| `VERCEL_ENV` | marketing, admin, customer | NON_SECRET_CONFIGURATION | non-secret | PRESENT | Every one of those capabilities stays off, which is the safe direction. |
| `VERCEL_DEPLOYMENT_ID` | admin | NON_SECRET_CONFIGURATION | non-secret | PRESENT | The heartbeat records null. Nothing else changes. |
| `CRON_SECRET` | admin | PROVIDER_SECRET | secret | PRESENT | jobWorkerConfig() reports disabled and the cron entry point answers 503 rather than running work. |
| `JOB_WORKER_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | The worker is disabled, no job is claimed, and both mail gates read false whatever else is set. |
| `JOB_PROVIDER_MODE` | admin | FEATURE_GATE | non-secret | ABSENT | Provider mode is "disabled" and no handler performs an external effect. |
| `JOB_WORKER_CADENCE_SECONDS` | admin | NON_SECRET_CONFIGURATION | non-secret | OPTIONAL | Falls back to 86400 seconds, matching the unchanged 0 4 * * * schedule. |
| `AWS_REGION` | admin, customer | NON_SECRET_CONFIGURATION | non-secret | PRESENT | Evidence and inbound storage config are null, so no upload can be presigned and no attachment fetched. |
| `AWS_EVIDENCE_BUCKET` | admin, customer | NON_SECRET_CONFIGURATION | non-secret | PRESENT | Evidence storage config is null and the Admin evidence surface cannot presign an upload. |
| `AWS_EVIDENCE_ROLE_ARN` | admin | NON_SECRET_CONFIGURATION | non-secret | PRESENT | Evidence storage config is null. |
| `AWS_CUSTOMER_EVIDENCE_ROLE_ARN` | customer | NON_SECRET_CONFIGURATION | non-secret | OPTIONAL | Customer evidence upload config is null; Admin-side evidence is unaffected. |
| `AWS_INBOUND_MAIL_BUCKET` | admin | NON_SECRET_CONFIGURATION | non-secret | ABSENT | Inbound storage config is null, so an inbound attachment cannot be fetched. |
| `AWS_INBOUND_MAIL_ROLE_ARN` | admin | NON_SECRET_CONFIGURATION | non-secret | ABSENT | Inbound storage config is null. |
| `AWS_ACCESS_KEY_ID` | admin, customer | PROVIDER_SECRET | secret | ABSENT | The intended state. Credentials come from Vercel OIDC role assumption instead. |
| `AWS_SECRET_ACCESS_KEY` | admin, customer | PROVIDER_SECRET | secret | ABSENT | The intended state. |
| `AWS_SESSION_TOKEN` | admin, customer | PROVIDER_SECRET | secret | ABSENT | The intended state. |
| `COMMUNICATIONS_SEND_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | communicationsSendEnabled() is false, the queue command refuses and the worker sends nothing. |
| `COMMUNICATIONS_INBOUND_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | communicationsInboundEnabled() is false and the inbound webhook answers 503. |
| `COMMUNICATIONS_FROM_EMAIL` | admin | NON_SECRET_CONFIGURATION | non-secret | OPTIONAL | The outgoing gate reads false because it requires a parseable from-address. |
| `COMMUNICATIONS_LINK_SECRET` | admin | PROVIDER_SECRET | secret | ABSENT | linkSecret() is null, so an EVIDENCE_REQUEST communication cannot be drafted or sent. |
| `COMMUNICATIONS_LINK_KEY_VERSION` | admin | NON_SECRET_CONFIGURATION | non-secret | OPTIONAL | Falls back to version 1. An unparseable or out-of-range value also falls back to 1 rather than failing. |
| `RESEND_API_KEY` | marketing, admin | PROVIDER_SECRET | secret | OPTIONAL | Marketing enquiry config is not ready and both Admin mail gates read false. |
| `RESEND_WEBHOOK_SECRET` | admin | PROVIDER_SECRET | secret | ABSENT | The outgoing webhook rejects every request, so no delivery state is recorded. |
| `RESEND_INBOUND_WEBHOOK_SECRET` | admin | PROVIDER_SECRET | secret | ABSENT | The inbound webhook rejects every request. |
| `INBOUND_MAIL_DOMAIN` | admin | NON_SECRET_CONFIGURATION | non-secret | ABSENT | The inbound gate reads false. |
| `INBOUND_OWNED_ADDRESSES` | admin | NON_SECRET_CONFIGURATION | non-secret | ABSENT | The owned-address list is empty; the inbound gate is already false without it. |
| `PAYMENTS_PROVIDER_MODE` | marketing, admin | FEATURE_GATE | non-secret | ABSENT | Payment provider mode is "disabled" and no Stripe object can be created. |
| `STRIPE_SECRET_KEY` | marketing, admin | PROVIDER_SECRET | secret | ABSENT | No Stripe client is constructed. |
| `STRIPE_WEBHOOK_SECRET` | marketing, admin | PROVIDER_SECRET | secret | ABSENT | The Stripe webhook rejects every request. |
| `GUARD_ACTIVATION_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | Activation stays manual and direct billing stays PENDING. |
| `GUARD_SUBSCRIPTIONS_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | No subscription is created or reconciled. |
| `GUARD_REFUNDS_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | No refund can be issued. |
| `GUARD_CHECKS_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | No MAINTAIN_GUARD_CHECKS job or obligation is generated. An operator can still record a manual observation. |
| `GUARD_ALERTS_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | No alert is raised, escalated or closed automatically. |
| `GUARD_ALERT_NOTIFICATIONS_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | No Guard alert notification is composed or queued. |
| `GOOGLE_BUSINESS_PROFILE_API_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | The manual adapter resolves and the API is reported disabled. |
| `GOOGLE_BUSINESS_PROFILE_PROVIDER` | admin | FEATURE_GATE | non-secret | ABSENT | Mode is "manual". |
| `GOOGLE_BUSINESS_PROFILE_CLIENT_ID` | admin | NON_SECRET_CONFIGURATION | non-secret | ABSENT | googleOAuthConfig() is null and the configuration blocker oauth_not_configured is reported. |
| `GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET` | admin | PROVIDER_SECRET | secret | ABSENT | googleOAuthConfig() is null. |
| `GOOGLE_BUSINESS_PROFILE_REDIRECT_URI` | admin | NON_SECRET_CONFIGURATION | non-secret | ABSENT | googleOAuthConfig() is null. |
| `GOOGLE_BUSINESS_PROFILE_TOKEN_KEY` | admin | PROVIDER_SECRET | secret | ABSENT | googleTokenEncryptionKey() is null and the blocker token_key_missing is reported. |
| `GOOGLE_BUSINESS_PROFILE_TOKEN_KEY_VERSION` | admin | NON_SECRET_CONFIGURATION | non-secret | ABSENT | Falls back to "v1". |
| `GOOGLE_LIVE_ACCEPTANCE_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | The harness does not run. |
| `GOOGLE_SITE_VERIFICATION` | marketing | NON_SECRET_CONFIGURATION | non-secret | OPTIONAL | No verification meta tag is emitted. |
| `PRIVACY_DELETION_ENABLED` | admin | FEATURE_GATE | non-secret | ABSENT | Deletion performs nothing and the privacy page says so instead of offering an action that would not run. |
| `CASE_PERSISTENCE_ENABLED` | marketing | FEATURE_GATE | non-secret | PRESENT | Intake stays on the email-only path and no row reaches the Admin queue. |
| `MONITORING_PERSISTENCE_ENABLED` | marketing | FEATURE_GATE | non-secret | OPTIONAL | The monitoring form reports itself temporarily unavailable. |
| `SITE_LAUNCHED` | marketing | FEATURE_GATE | non-secret | OPTIONAL | Pre-launch mode: noindex, robots.txt disallows everything, the sitemap is empty. |
| `ENQUIRY_FROM_EMAIL` | marketing | REQUIRED_FOR_OPTIONAL_FEATURE | non-secret | PRESENT | Enquiry email config is not ready and the notification is not sent. |
| `ENQUIRY_TO_EMAIL` | marketing | REQUIRED_FOR_OPTIONAL_FEATURE | non-secret | PRESENT | Enquiry email config is not ready. |
| `ENQUIRY_REPLY_TO_EMAIL` | marketing | NON_SECRET_CONFIGURATION | non-secret | OPTIONAL | Only the customer's own address is used as Reply-To. |
| `ENQUIRY_SEND_CUSTOMER_ACK` | marketing | FEATURE_GATE | non-secret | OPTIONAL | No acknowledgement is sent; internal delivery only. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | marketing | NON_SECRET_CONFIGURATION | non-secret | OPTIONAL | No analytics script is loaded and no consent banner is rendered. |
| `VITEST` | admin | TEST_ONLY | non-secret | ABSENT | The intended state in every deployment. |

One family cannot be found by scanning, because it is read by a computed name:
`COMMUNICATIONS_LINK_SECRET_V{n}` holds a superseded evidence-link HMAC key so
that a communication stamped with an older version can still be re-derived on
retry. It is recorded in `computedEnvFamilies` rather than being silently
missing.

Five variables block Admin production access on their own:
`ADMIN_AUTH_ENABLED`, `ADMIN_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and
`SUPABASE_PUBLISHABLE_KEY`. Without them `authConfig()` returns null and there
is no sign-in at all.

## Live capability gates

Six capabilities produce an effect outside ProfileRelaunch. All six are off,
and `apps/admin/lib/release/gates.test.ts` proves it from the gate functions
the runtime itself calls, over synthetic configurations only.

| Capability | How it is held off | Code-level block that no setting can clear |
| --- | --- | --- |
| Google Business Profile API | `GOOGLE_BUSINESS_PROFILE_API_ENABLED` unset and the provider mode defaults to manual | `googleLiveStack` is `null`, so a fully configured deployment still reports `connection_not_implemented` |
| Stripe payments | `PAYMENTS_PROVIDER_MODE` unset, so the mode resolves to disabled | `stripeSecret()` accepts only `sk_test_` and `rk_test_` prefixes; there is no mode value that selects live Stripe |
| Outgoing transactional mail | Six conditions, all required | The 300-second cadence ceiling means the unchanged daily schedule cannot carry live mail |
| Inbound mail ingestion | Its own flag, independent of outgoing mail | `inboundMailDomain()` refuses the apex `profilerelaunch.com`, so inbound MX cannot be pointed at the mailbox domain |
| Guard automation | Three independent flags, all unset | `guard_check_observations.capture_method` accepts only `MANUAL` |
| Physical deletion | `PRIVACY_DELETION_ENABLED` unset | A legal hold blocks deletion in the database independently of the flag |

What the test proves, in order of importance:

1. An environment in which **every credential is present and no enable flag is
   set** turns nothing on. Provider credentials alone are never sufficient.
2. An empty environment turns nothing on, and neither does a production
   deployment with nothing optional configured.
3. Every near-miss spelling of yes — `1`, `yes`, `on`, `TRUE`, `True`,
   `true ` — leaves every gate closed. The gates accept exactly `true`.
4. Outside a Vercel production deployment, mail and Google stay off even with
   every flag set.
5. Removing any single one of the six outgoing-mail conditions closes that gate
   again, and a daily worker cadence closes it on its own.
6. A live-shaped Stripe key is refused rather than used.
7. Enabling outgoing mail does not enable inbound mail, and the three Guard
   automation flags are three switches rather than one.

None of this depends on a production secret, so it runs in CI unchanged.

## Migration state

The applied head is `20261003204538 customer_portal_quotes_agreements_permissions_v1`, file
`supabase/migrations/20261003204538_customer_portal_quotes_agreements_permissions_v1.sql`,
applied to `profilerelaunch-dev` on 2026-10-03 after independent review.
Supabase MCP initially registered `20261003220517`; that single history row
was repaired immediately to `20261003204538` so the remote ledger matches the
repository filename. `appliedMigrationHead` and `migrationHead` now match,
and `pendingMigrations()` is empty. Applied migrations stay immutable. Do not
replay them.

### The ledger discrepancy, recorded rather than repaired

The repository chain begins with three migrations the remote ledger on
`profilerelaunch-dev` does not contain:

- `20260915120000_core_data_foundation_v1.sql`
- `20260915193000_case_intake_transaction_v1.sql`
- `20260916000000_relaunch_guard_data_foundation_v1.sql`

Supabase migration history on that project begins at
`20260917080553 single_admin_auth_v1`. The three migrations are present in the
live schema and absent from the ledger, so the Step 22A history validator
cannot be assumed to read `clean` against it.

None of them may be replayed, reapplied or renamed, no migration-history row
may be fabricated, and the live ledger must not be marked `clean` to silence
the finding. A foundation migration recreates tables and an additive one
re-runs its seed data, so a replay to close the gap would be destructive.

**OWNER DECISION REQUIRED.** Two strategies exist and neither is implemented
here.

**Strategy A — build production from the canonical repository chain.** Create a
new Supabase project and apply the 34 migrations in order from empty.

The discrepancy then does not exist in production, because the three foundation
migrations are applied there normally. The history validator can read clean, so
the Step 22A fail-closed check stays meaningful instead of being permanently
degraded. The two legacy objects never exist, because no repository migration
creates them. And the rehearsal already proves this exact path: the recovery
harness rebuilds the whole chain from zero on every test run.

Against it: data in the development database is not carried over, and whether
that matters is a question about what that data is. A new project also needs
its own Auth configuration, its own Admin identity row and its own keys.

**Strategy B — promote the existing development project.** Keep
`profilerelaunch-dev` and treat it as production.

Existing data and the applied schema are preserved exactly, with no replay of
anything, and no new Auth configuration or key set is needed.

Against it: the ledger stays three migrations short of the repository chain, so
the validator cannot read clean unless the discrepancy is reconciled
deliberately. Both legacy objects remain and have to be decided individually.
And a database used for development carries whatever was done to it by hand,
which the repository cannot describe — so comparing the live schema against a
rebuild from the canonical chain becomes a prerequisite rather than a
formality.

Either way, Step 22B is a prerequisite: the restore path has to be rehearsed
against a real project before production depends on it.

### Legacy objects

`public.set_case_public_ref` and `public.rls_auto_enable` are created by no
file under `supabase/migrations`, and Step 1 created the hardened,
`search_path`-pinned `public.cases_assign_public_ref` that the repository
actually relies on.

`docs/admin/operator-sql/legacy-object-inspection.sql` reports whether each
object exists, which triggers and event triggers call it, what depends on it,
and what a removal statement would look like. It is read-only, it is not
imported by application code, it is not wired into any build, start, test or
deploy path, and the removal statement it prints carries no `CASCADE`. It is
standard PostgreSQL with no psql meta-command, so it runs unchanged in the
Supabase SQL Editor. A person pastes it in and reads the output. Do not run it
as a cutover step without reading what it returns first.
`apps/admin/lib/release/operator-sql.test.ts` holds the file to all of that.

Under Strategy A the question closes by construction, because neither object is
ever created.

## Smoke-test runbook

Three passes, in order. None of them is run from CI, none of them uses a real
customer record, and the OTP send is performed by a person.

### Pass 1 — non-mutating, no session

Run against the production domain before signing in. Nothing in this pass
writes.

1. Request every `/api/*` path with no session. Each must answer `401` with the
   standard refusal and nothing else.
2. Request every page path with no session. Each must redirect to `/login` with
   no query string carrying the attempted path.
3. Confirm the security headers on every response: `x-robots-tag` noindex,
   `cache-control` no-store, `x-frame-options` DENY, `referrer-policy`
   no-referrer, and a content security policy with `default-src 'self'` and
   `frame-ancestors 'none'`.
4. Request `/api/internal/jobs/run` without the scheduler secret. It must
   answer `503` with a disabled status rather than running work.
5. Request each provider webhook. Each must answer `503` while its capability
   is off.
6. Fetch `/robots.txt` and confirm it disallows everything.

`npm run smoke:admin` performs exactly this set against a local production
build, so the production pass is the same checks against the real domain.

### Pass 2 — authenticated, read-only

Performed by the operator after signing in once with a real one-time code.

1. Read the `Set-Cookie` header. The name must be `__Host-pr-admin`, with no
   `Domain` attribute, and the `Secure`, `HttpOnly` and `SameSite=Strict`
   attributes all present.
2. Open Settings → system configuration and record every capability state.
   Every one must read Disabled, Not configured or Manual mode.
3. Open each page: Today, search, activity, tasks, enquiries, cases, documents,
   records, commercial, money, communications, conversations, Guard and its
   checks and alerts, operations jobs, reports, settings, templates, privacy,
   complaints, incidents, security. Each must render.
4. Open the activity log and confirm the sign-in appears with its outcome and
   request id, and that no token material appears anywhere in the payload.
5. Read the deployment's runtime logs for the window and confirm no unhandled
   error.

Nothing in this pass changes a record.

### Pass 3 — controlled mutation

Performed against records created for the purpose, clearly labelled, and
cleaned up deliberately afterwards. Never against a real customer.

1. Submit one enquiry through the marketing site. Confirm it reaches the Admin
   queue.
2. Triage it and convert it to a case.
3. Create a client, a business and a location, and verify the relationships.
4. Request evidence and complete one upload. Confirm the browser receives a
   presigned POST and that no storage key appears in the response.
5. Confirm the uploaded version becomes reviewable only after a clean scan.
6. Approve a Guard schedule version, confirm the manual checks queue populates
   for the current Europe/London day, and record one manual observation.
7. Run one privacy export against the record created here.
8. Close the case and confirm `admin_audit_events` carries every step with its
   request id.
9. Confirm no message was sent, no payment was taken and nothing was deleted.

## Admin domain cutover

`admin.profilerelaunch.com`. No DNS record is changed from this repository, and
nothing below may be recorded as verified without an observation.

1. The Admin project is a separate Vercel project from the marketing site,
   building from this repository.
2. `admin.profilerelaunch.com` resolves to it. Record what the resolver
   returned, not what was requested.
3. TLS: inspect the served certificate's subject, issuer and expiry. Record all
   three.
4. `ADMIN_ORIGIN` matches the served origin exactly, including scheme.
5. The session cookie is host-only. There must be no `Domain=.profilerelaunch.com`
   anywhere: a domain-scoped cookie would be sent to the marketing site, which
   is a different trust boundary.
6. No redirect sends an Admin path to the marketing site or the reverse.
7. Every Admin response carries `x-robots-tag: noindex`, and `/robots.txt`
   disallows everything. The Admin workspace must never be indexed.
8. Confirm no analytics script loads anywhere in Admin.

## Auth and sign-in cutover

1. The Supabase project that becomes production has Auth email delivery
   configured, with a sender the Admin mailbox accepts.
2. The Auth rate limit permits the expected sign-in frequency.
3. Exactly one `admin_identity` row exists, for `admin@profilerelaunch.com`.
   **Do not create a second Admin identity.** The database refuses to delete,
   disable or rebind the one that exists.
4. One real sign-in is performed by the operator. Do not automate an OTP send,
   and never from CI.
5. The session cookie is checked as above.
6. Revocation is confirmed: revoke the session and verify the next request
   fails.
7. Leaked-password protection is enabled on the project. Admin auth is
   one-time-code only and no password exists for the Admin identity, so this
   protects no current flow — but it is a project-level setting that should be
   on, and it is an external Supabase setting that repository code cannot
   configure.

## Outgoing transactional mail activation

Separate from inbound, and separate again from the Auth OTP path. Not performed
in Step 24A.

**Prerequisites.** A verified sending domain in Resend with its DNS records in
place; the delivery webhook registered against the production Admin domain; at
least one approved template version; and a recorded decision to change the
scheduler, because the 300-second cadence ceiling means activation necessarily
moves the schedule away from `0 4 * * *` and that affects every other scheduled
handler.

**Test before anyone depends on it.** Queue and send one message to a mailbox
the operator controls. Confirm the delivery webhook advanced the communication
to its delivered state, and that a retry does not produce a second message.

**Enable.** Set the sender, the link secret and the delivery webhook secret;
change the schedule; then set `COMMUNICATIONS_SEND_ENABLED` and
`JOB_WORKER_ENABLED` and redeploy.

**Verify.** The message arrives. The communication reaches its delivered state
from a recorded provider event rather than from a timer.

**Stop and roll back.** Unset `COMMUNICATIONS_SEND_ENABLED` and redeploy. This
stops further sends. It does not recall a message the provider already
accepted, so read the outbox before unsetting rather than after.

## Inbound mail activation

Not performed in Step 24A.

**Prerequisites.** MX records for the inbound subdomain only. **The root
domain's MX records are not touched**: they carry the Google Workspace mailbox
that Admin sign-in codes are delivered to, and losing that record loses
sign-in. Receiving enabled in Resend with the inbound webhook registered. The
inbound bucket and role in place, with no static AWS credential configured.

**Test.** Send one message from an address the operator controls to the inbound
subdomain. Confirm it appears as a conversation with the correct direction,
then replay the same provider message id and confirm no second conversation is
created.

**Enable.** Set the inbound domain, the owned addresses, the inbound webhook
secret and the inbound bucket and role, then set
`COMMUNICATIONS_INBOUND_ENABLED` and redeploy.

**Verify.** The conversation appears, and an attachment is unavailable until
its scan is clean.

**Stop and roll back.** Unset `COMMUNICATIONS_INBOUND_ENABLED` and redeploy.
Mail already delivered stays where the provider put it; nothing new is
imported. If root-domain MX was modified at any point, restore it first.

## Stripe activation

Not performed in Step 24A. Code readiness and activation are separate things:
the payment code is complete and tested against the recorded provider boundary,
and that is not an argument for switching it on.

**Prerequisites.** The tax, VAT and terms decision recorded — this is an Owner
decision with accounting advice, and nothing in the repository should decide
it. Prices reviewed against that decision; the seeded catalogue prices are
explicitly tax-unconfirmed and imply no VAT registration. A Stripe account with
the webhook registered against the production Admin domain. And a reviewed code
change, because the current code accepts only test-mode keys.

**Test.** Complete one payment end to end in test mode against a quote created
for the purpose, and confirm the webhook applies exactly once when replayed.

**Enable.** Set `PAYMENTS_PROVIDER_MODE`, the Stripe key and the webhook
secret, and redeploy. Live keys additionally require the code change.

**Verify.** The payment reconciles to the obligation, `invoice.paid` is what
grants paid entitlement, and a replayed webhook returns the first outcome.

**Stop and roll back.** Unset `PAYMENTS_PROVIDER_MODE` and redeploy. This stops
new charges. It does not reverse a charge already made, which has to be
refunded through Stripe.

## Guard

**Manual Guard is ready at launch.** An operator records an observation by
hand. That needs no provider, no automation flag and no Google API access.
`guard_check_observations.capture_method` accepts only `MANUAL`, and that is
unchanged here. The only prerequisite is an approved Guard schedule version: no
schedule means no obligations, which is correct behaviour rather than a fault.

**Guard automation is deferred.** Scheduled obligation generation, alert
maintenance and alert notification each have their own flag and all three are
unset. Alert notification additionally depends on the outgoing mail gate, so it
cannot send even if its own flag were set. Activation order, if it happens:
scheduled generation first, alone; alerts second; notifications only after
outgoing mail is activated and observed.

**Unresolved.** The production clock windows, the first-response target and
Guard capacity per operator per day are Owner decisions. Step 17 recorded the
windows as open and Step 20 ships no approved service hours, response targets
or retention policies. The system invents none of them, and a monitoring
promise with no approved clock behind it cannot be evidenced.

## Google

The manual workflow is supported and is what production uses. The manual
adapter resolves by two independent routes: the provider mode defaults to
manual, and no production code supplies a live transport.

API access is inactive and stays inactive. `googleLiveStack` is `null`, so a
deployment with every Google variable set still cannot begin an OAuth flow,
return an authorization URL or create a state row. Activation requires a token
exchange and a transport to be written and reviewed — a code change, not a
setting.

Missing Google API access is an external dependency on an approval from Google.
It is **not** an Admin application defect, and it is not required for initial
manual operation.

## Privacy

`PRIVACY_DELETION_ENABLED` is unset and stays unset. A deletion disposition
records the decision and removes nothing, and the privacy page says so rather
than offering an action that would not run. A legal hold blocks deletion in the
database independently of the flag.

Subject access export works and requires a sign-in from the last five minutes.

Retention periods per category are an Owner decision and none is approved.
Deletion is the one capability whose effect closing the gate cannot undo, which
is why it is activated last and why the preview is run against a test record
first.

## Owner decisions

Recorded in `apps/admin/lib/release/decisions.ts`. Each carries what the system
does today in the absence of an answer, what the answer unblocks, and — where
an older document suggested a figure — that figure marked as prior art rather
than as a decision.

| ID | Area | Question |
| --- | --- | --- |
| `guard.check-windows` | Guard operations | What are the production Guard check windows, in Europe/London, including weekends and bank holidays? |
| `guard.capacity` | Guard operations | How many locations can one operator check manually in a day, and what happens when that number is exceeded? |
| `service.first-response` | Service commitments | What is the first-response target for an enquiry and for a case, and during which service hours? |
| `retention.periods` | Data retention | What is the retention period for each data category, and which categories are retained regardless of a deletion request? |
| `commercial.tax` | Commercial and legal | Is ProfileRelaunch VAT registered, do catalogue prices include tax, and which terms apply at the point of payment? |
| `recovery.objectives` | Recovery objectives | What recovery point and recovery time objective is ProfileRelaunch committing to for the database and for evidence objects? |
| `database.production-topology` | Production database | Does production come from a new project built from the canonical migration chain (Strategy A), or from promoting the existing development project (Strategy B)? |
| `activation.order` | Activation order | In what order are the optional capabilities activated after Admin is in production, and who approves each one? |

One more is recorded separately because it follows from the architecture rather
than from a feature: ProfileRelaunch has exactly one Admin identity, so if that
identity cannot sign in, nobody can operate the system. The recovery path is
access to the `admin@profilerelaunch.com` mailbox. How that mailbox is
protected and recovered is an Owner decision, and creating a second identity is
not the answer — it would be a product and security change, and the schema
deliberately forbids it.

## Cutover sequence

Five phases, run in order, which do not overlap. The point of the phasing is
that when something misbehaves there is one recent change to look at and one
small thing to undo. **Do not combine these into a single event.**

### Phase 0 — decisions and external verification

Resolve everything that is a decision or an external account fact, while
nothing is live.

Record an answer to each Owner decision or an explicit deferral. Choose
Strategy A or B and record who chose it and when. In Vercel, compare Production
variable *names* against the contract — names and presence only. In Supabase,
enable leaked-password protection. In AWS, confirm the bucket and both roles
exist with public access blocked. Confirm DNS and TLS, recording what was
observed rather than what was requested.

Do not change DNS from the repository, do not set any enable flag, and do not
record an external setting as configured because this document says it should
be.

**Stop condition.** If an external fact cannot be observed, record it as
unverified and stop. An unobserved certificate or environment variable is
exactly what fails at the first real sign-in.

### Phase 1 — production database

Create or designate the production database by the recorded strategy. Under
Strategy A, apply the repository chain in order from empty. Under Strategy B,
apply nothing and instead compare the live schema against a rebuild from the
canonical chain. Read the migration head and compare it with the manifest head.
Run the legacy-object inspection and read the dependency output; decide, but
drop nothing yet. Run the Supabase linter.

Do not replay an applied migration, do not edit one, do not insert a
migration-history row, and do not drop a legacy object with `CASCADE`.

**Stop condition.** If the heads differ, stop before the domain points
anywhere. Establish which chain the database actually carries. Do not close the
gap by replaying.

### Phase 2 — Admin production access

Deploy the Admin project and assign the domain. Run smoke pass 1. Request a
one-time code and sign in by hand. Check the session cookie. Read every
capability state in Settings. Walk smoke pass 2.

Do not create a second Admin identity, do not enable a capability to make a
page look complete, and do not use a real customer record.

**Stop condition.** If any capability reads enabled, stop and establish whether
an effect was already produced — read the outbox, `communication_events`,
payments and privacy dispositions — before changing the configuration.
Unsetting the gate will not undo what was already sent, charged or deleted.

### Phase 3 — controlled first operations

Run smoke pass 3. Marketing intake must be enabled so the enquiry queue can
receive work.

**Stop condition.** A failure here is an application defect and is fixed
forward in a reviewed change. Do not disable a surface to get past it, and do
not roll the schema back: every migration is forward-only, so a rollback would
destroy data to work around something that is not a schema problem.

### Phase 4 — capability activation, one at a time

Activate exactly one capability, with no other change in the same deployment.
Verify it against a target the operator controls. Record the result, then wait
long enough to observe it in ordinary use before starting the next.

Each capability's own prerequisite, test, enable action, verification and
rollback are in `activationPlans` and summarised in the activation sections
above.

**Stop condition.** If a capability misbehaves, close its gate, redeploy and
confirm it reads disabled before investigating. Preserve the audit trail and
every provider event already received: a provider that accepted a request will
keep reporting on it, and discarding those events loses the record of what
actually happened.

## Stop conditions

| ID | Trigger | What stops |
| --- | --- | --- |
| `unauthenticated-success` | Any /api/* path answers something other than 401 without a session. | The whole cutover, before any capability is activated. |
| `unexpected-capability-enabled` | Settings reports a live capability as enabled when it was not activated. | Everything else, until it is established whether an effect was produced. |
| `migration-head-mismatch` | The production migration head does not match the manifest head. | Phase 1, before the domain points anywhere. |
| `second-admin-identity` | admin_identity contains more than one row. | The cutover, immediately. |
| `otp-not-delivered` | The one-time code does not arrive at the Admin address. | Phase 2, at sign-in. |
| `provider-effect-unexpected` | A provider reports an effect nobody asked for: a message sent, a charge made, an inbound message imported. | All activation work. |
| `application-defect-in-phase-3` | A controlled first operation fails with a runtime error or a wrong result. | Phase 3, and therefore Phase 4. |

The safe response is always the same shape: stop the activation, return the
gate to its previous value, confirm the capability reads disabled, preserve the
evidence and the audit trail, and only then diagnose. The ordered response for
each is in `stopConditions`.

A destructive database rollback is never the default. Every migration in the
chain is forward-only; rolling one back to recover from a forward change
destroys data to fix something a forward fix would address.

## Release record

Filled in by the person performing the cutover. Nothing is populated
automatically, because a field filled in by a tool that cannot observe
production would be a claim nobody made. "Observed" means the operator saw it
directly.

| Field | What it records | Kind |
| --- | --- | --- |
| Release identifier | A name for this cutover, unique and referenced by anything that follows it. | recorded |
| Git commit SHA | The exact commit the deployment was built from. | recorded |
| Deployment identifier | The platform's identifier for the deployment serving the domain. | observed |
| Admin domain | The domain served, and whether DNS and TLS were observed rather than requested. | observed |
| Migration head applied | The migration version the production database reports, and the manifest head it was compared with. | observed |
| Database verification | Row-level security, service-role-only execution and the linter result. | observed |
| Admin identity count | The number of rows in admin_identity. The expected value is 1. | observed |
| Environment contract check | Per variable, whether presence matched the contract. Presence only; never a value. | observed |
| Live capability gate states | What Settings → system configuration reported for each of the six capabilities. | observed |
| Smoke test results | Non-mutating, authenticated and controlled-mutation passes, each with its outcome. | observed |
| Runtime error check | What the deployment's runtime logs showed for the cutover window. | observed |
| Step 22B status | Whether the cloud recovery rehearsal has been performed. Outstanding withholds final sign-off. | observed |
| Exceptions accepted | Anything knowingly left unresolved, with who accepted it. | recorded |
| Owner decisions recorded | Which decisions were answered and which remain open. | recorded |
| Operator | Who performed the cutover. | recorded |
| Date and time | When, in Europe/London. | recorded |
| Outcome | Completed, completed with exceptions, or stopped. Stopped is a valid outcome. | recorded |
| Rollback notes | What was undone, how, and what the undo did not reverse. | recorded |

No secret value appears in a release record. Record presence, not content.

## Step 22B

**DEFERRED — CLOUD RECOVERY REHEARSAL REQUIRED BEFORE FINAL PRODUCTION
SIGN-OFF.**

Step 22A is complete: the chain rebuilds from zero and upgrades from the Step
10 checkpoint under test, and the rehearsal reports execution and verified
recovery as separate statuses so a correctly executed rehearsal can still read
`BLOCKED`.

Step 22B is the rehearsal against a real restored project, and it has not been
performed. Nothing in Step 24A performs it: no Supabase branch or project is
created, no restore or point-in-time recovery is run, and no AWS evidence
object is touched.

Admin code readiness can complete with Step 22B outstanding, and it has. Final
production sign-off cannot, and it has not been given. Noting that the
rehearsal is planned is not acceptance of it.

## Running the repository-safe check

```bash
npm run release:admin-check
```

It runs only local, repository-safe checks: the release suite, the migration
manifest and history suites, and a summary of the readiness model.

It does not contact a provider, send a one-time code, send email, call Stripe,
call Google, access an AWS object, change Supabase, change Vercel, or require a
production secret value. It can run in CI unchanged, and it reports external
readiness as information rather than deciding it, because it cannot observe
production.
