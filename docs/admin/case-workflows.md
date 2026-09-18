# Case workflows and tasks — step 7

Built from main after merging PR #89. The operator remains admin@profilerelaunch.com, using the existing OTP session. No new environment variables are required.

## What is available

Cases lists existing formal intake and enquiry-converted cases immediately, with stable 50-row pagination, reference/client/business search, track filters, assignment and overdue filters. Existing PR/RV references, relationships, original request and top-level status values remain intact. Closed historical cases receive the Finished work stage without inventing an outcome.

Each case has a service track, work stage, priority and reason, admin assignment, first-response target, next action, tasks, notes, submission attempts, outcome and closure summary. Changing the track is allowed only during initial assessment and before a submission is recorded. No inferred two-hour response promise is introduced.

The transition matrix runs in the database. Invalid jumps fail even when a caller bypasses the page. Waiting stages require a next action and date and create a customer/admin follow-up task. An assessment-ready stage is not a published recommendation: publication belongs to the document workflow. The central command preserves the existing top-level statuses.

Task ownership distinguishes the sole admin from a customer action. Tasks cover follow-ups, evidence, calls, complaints, cancellation and other work. Every task has a deadline, source, original IANA timezone and manual-queue reminder policy. Enter the timestamp in UTC; the workspace displays UK time. The global task queue uses 50-row pages ordered by deadline. To correct or reschedule a task, cancel it with a reason and add its replacement so history remains clear. Automatic email reminders are a later jobs/communications feature.

## Guided and Managed work

Guided cases move toward upfront payment; Managed cases move toward permission. The preparation and ready-to-submit gates intentionally remain disabled until the payment, agreement and document approval stages supply authoritative checks. A note or checkbox cannot activate these gates. This is a dependency on steps 8–9 and 13–14, not a new service promise.

The workspace can separately record an externally completed submission after service selection. It requires a receipt/reference, channel, actual submission timestamp, evidence and explicit operator confirmation. Guided records name the customer as submitter; Managed records name ProfileRelaunch. It does not submit to Google, grant authority or certify payment. The action must have happened after the case was created and cannot have a future timestamp. Historical work from before intake needs a reviewed import rather than a fabricated date.

Only one unresolved attempt is allowed per case. Record a decision or withdrawal before another attempt. Submission facts stay unchanged, and results are stored separately. The next attempt retains the previous evidence and reference. Managed agreement verification and Google/API execution are still later stages; recording an external action does not grant either capability.

## Notes, closure and reopening

Notes default to internal. The operator can explicitly approve a note for a read-only customer preview. That preview contains only the public reference, type, approved notes (latest 100) and closure summary. It excludes contact details, internal notes, task instructions and submission evidence. No customer endpoint, email or impersonation is enabled.

Workflow history uses 50-row keyset pages. The original request is shown separately. Notes are append-only through the available commands: add a correction instead of overwriting history. The central Activity feed records every successful mutation.

Closing requires an appropriate outcome and customer summary, all tasks resolved, and no unresolved submission. Success/negative outcomes require Outcome review; withdrawal is available earlier. Open complaints cannot disappear when a case closes. Reopening requires a reason and a new dated task; it preserves the old outcome and summary in history and resets the current case to Further review. Neither action bills a customer or starts Guard.

## Data and security

The additive admin_case_workflows_v1 migration adds workflow columns, versioning, task/event/submission tables, private idempotency receipts, a private transition matrix and four scoped RPCs. All new tables use RLS with direct grants revoked. Public functions are executable only by service_role and independently validate the existing opaque admin session. Private helpers have fixed search paths and no exposed execute permission.

Commands validate exact payload keys, request size, origin, content type and UUID request key. They lock the case row before checking its version. Tasks, submissions and closure therefore serialize against the same case. Receipts fingerprint the operation and payload; retries of a committed request return its result, while changed content or stale versions conflict. Changes, history, audit and receipt commit atomically. The service-key remains server-only. No customer ownership is inferred from a case link.

## Release and acceptance

Tests execute the actual SQL with the existing schemas in PGlite (only pgcrypto byte generation is substituted for the test runtime). Coverage includes session/grant denial, transitions, track rules, waiting requirements, stale versions, retry deduplication, customer preview exclusions, complaint closure, reopening, submission evidence, duplicate attempts, deadline pagination and rollback on audit failure. Direct route tests bypass proxy protection; form tests cover UTC input, Guided wording and visibility confirmation. Build, lint and protected-route HTTP smoke checks are required before release.

Authenticated deployed acceptance remains: sign in, open Cases and Tasks, inspect an existing genuine case, and confirm a legitimate note/follow-up when operationally needed. No synthetic live customer, case or outgoing message is created during automated verification.

The additive migration was applied to the connected profilerelaunch-dev project as 20260918083220. Live checks confirmed RLS, revoked table access and rejection of invalid sessions. No new warning-level advisor findings were introduced. Other environments must apply it once before deploying this application. Do not replay baseline migrations already applied through the SQL editor. For rollback, redeploy the preceding app while retaining workflow data. Do not drop tables after operational use. Existing Supabase advisor findings are documented in the earlier stage notes; they are not silently treated as fixed here.

Next: step 8, private evidence storage, review and prepared-pack controls. Payment/permission gates must be integrated with their authoritative records before activation.
