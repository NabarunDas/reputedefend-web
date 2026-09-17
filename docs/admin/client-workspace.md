# Client workspace — step 5

Built from main after merging PR #87. The approved single account remains `admin@profilerelaunch.com`.

## What the admin can do

- Search client names, email addresses and phone numbers; search businesses and locations. Directories use 50-row keyset pages.
- Create and edit clients and businesses. Add multiple locations to a business and edit their details.
- See existing case and monitoring submissions without treating those submissions as proof of ownership or active coverage.
- Record a completed email/phone control check, with evidence and an explicit confirmation. This is manual verification; it does not send an email, make a call or create customer authentication.
- Create business relationships, record verified authority, place a relationship back into review or withdraw it. One client can represent multiple businesses; multiple clients can represent the same business.
- Review exact-name duplicate candidates and compare any two client or business records. The comparison is read-only and shows case/monitoring counts and original references. It cannot move or delete records.
- Read the reason, target, changed field names and record versions in Activity. Contact values are not copied into audit snapshots.

Use Clients & businesses in the admin navigation. Start a location from its business page. To link a business, open the client, choose Link a business, search for the business, then record its relationship status and evidence. The default is Awaiting authority check.

## Identity and authority rules

Contact verification applies only to the exact current contact value. Changing a phone clears its proof. Changing an email clears its proof and puts verified business relationships back into pending review, with an audited system event. Changing the value back does not revive old proof. These rules also run on existing marketing intake writes.

Business authority verification requires at least one currently verified contact method, evidence of authority and an admin OTP sign-in within five minutes. An enquiry, matching name, matching email text, or a case/monitoring foreign key is never sufficient by itself. Email changes and contact verification also require a recent admin sign-in.

The future customer field projections are private SQL functions with explicit field lists. They require a verified business relationship and a current verified email. No browser or service-role caller can execute them directly. A future customer portal must first resolve the customer identity from its own verified session; a caller-supplied customer ID must never become an authentication mechanism. No customer portal or customer permissions are activated by this PR.

## Commands and data protection

Every mutation uses a fixed server RPC, exact Origin/URL origin checks, JSON-only requests, a bounded 16 KiB streamed body and an exact payload schema. The browser cannot choose a table, actor, role, function name or record version after the fact. The database independently validates identity, freshness, payload and scope.

New record-version triggers cover all updates, including marketing intake. Update commands compare the version shown in the form and return 409 for stale edits. Relationship creation locks its parent client to serialise races; later edits use the relationship version. A location cannot be reassigned to another business through this workspace, because that could invalidate existing case/monitoring links.

Record saves carry a UUID idempotency key. A private receipt stores a fingerprint and committed result. Retrying the same key/payload returns the original result; reusing it with different data returns a conflict. Receipts, record changes and audit entries commit together. Verification and relationship commands also use versions to reject stale repeated writes. No command triggers external messages or financial transactions.

On a network error, uncertain commit or conflict, the form keeps its values and blocks blind resubmission. Refresh and inspect the record/directory before trying again. Receipt retention is not automated; it belongs to the approved retention policy in the privacy stage.

New tables have RLS and no direct browser/service-role access. Secret-key server access is limited to the new RPCs for these tables. Existing marketing table grants remain intact. Private helper functions use fixed search paths and have no public execute grants. The contact-invalidation trigger is security-definer because existing marketing writers must be able to invalidate private proofs without being granted access to those tables.

## Database changes

The additive `admin_client_workspace_v1` migration adds record versions, contact proofs, business memberships, private command receipts, scoped read/write RPCs and indexes. It extends the existing audit action allowlist and adds redacted details/reason fields. It never rewrites case/Guard IDs, their customer/business/location links, public references or intake snapshots. Do not replay the baseline migrations against the existing dev project.

## Verification

Tests execute the repository schemas and new SQL through PGlite, with only pgcrypto UUID support substituted for the local test runtime. They cover browser/service grants, cross-customer projection denial, stale versions, duplicate retries, fresh OTP checks, revoked access, contact-change invalidation, safe customer field lists, many-to-many relationships, duplicate review preserving references, and transaction rollback if audit writing fails.

Direct HTTP tests exercise all three new commands without relying on proxy authentication. Form tests check explicit payloads, idempotency keys, conflict handling, pending defaults and manual confirmation. Existing admin authentication tests remain in the suite. Production builds, lint and HTTP protection smoke checks cover the added routes. No customer email or test client record is created in the connected project during verification.

After merge/deployment: open Clients & businesses, inspect any existing intake records, create an intentional test client/business/location if desired, verify a contact with real evidence, and check the relationship and Activity. Complete this authenticated browser acceptance before using the workspace operationally.

## Scope boundaries

Record detail pages show up to 100 recent submissions/relationships and 20 exact-name duplicate suggestions; these are bounded summaries, not complete reports. Directories paginate; the client’s Link a business flow can retrieve and update an exact relationship outside the summary limit. Full case history/reporting belongs to the case/report stages.

Duplicate merging is not enabled. The plan asks for a merge preview that preserves references; actual consolidation needs a reviewed migration covering financial history and future dependent records. Business relationship verification is not Google Manager-access verification, service consent or a paid service activation; those are separate later workflows.

Next: step 6, persistent enquiries and triage, including general contact capture that remains reliable when notification email fails.

## Connected-project verification — 17 September 2026

Applied to `profilerelaunch-dev` (`rmzozuiamjcclvtgutgd`) as migration version `20260917183422`, matching Supabase migration history. Read-only checks confirmed record-version columns, RLS on all three new tables, no direct browser/service access to proofs/memberships/receipts, no browser access to the seven admin RPCs, and no browser/service execute access to customer projections. Invalid read/write credentials were rejected. No customer records or messages were created as part of live verification.

The security advisor reported no new warnings. The new [RLS-without-policies informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) are intentional for private RPC-managed tables. Pre-existing function/password notices are recorded with remediation links in `audit-foundation.md`.

Local acceptance: 154 admin tests, production admin build, admin typecheck, repository lint and production HTTP smoke checks passed. Authenticated live UI acceptance remains the deployment check described above.

Rollback: revert the application change while retaining additive tables, proofs and audit history. Do not replay baselines or drop the new audit actions while records use them. Existing marketing writes retain their grants; version and invalidation triggers remain safe with the prior application.
