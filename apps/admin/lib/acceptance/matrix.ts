/**
 * Step 23 acceptance matrix.
 *
 * One row per Admin area. The matrix is the machine-readable record: the
 * companion table in `docs/admin/step23-acceptance-security.md` is generated
 * from this module so the prose cannot drift from it, and
 * `matrix.test.ts` fails if a page route exists without a row, if a row
 * names a test file that is not on disk, or if a row is left incomplete.
 *
 * A row is only `PASS` when the behaviour named in `expected` and the refusal
 * named in `negative` are both exercised by the tests in `evidence`. Rendering
 * a component is not acceptance.
 */

export type AcceptanceStatus = "PASS" | "FAIL" | "NOT_APPLICABLE" | "DEFERRED_EXTERNAL"

export type AcceptanceRow = {
  /** Short name of the Admin area. */
  area: string
  /** Page routes this row covers. Empty for areas with no page of their own. */
  routes: string[]
  /** Non-page surfaces: route handlers, webhooks, the cron entry point. */
  surfaces: string[]
  /** The thing an operator is primarily trying to do here. */
  action: string
  /** What the system must do when the action succeeds. */
  expected: string
  /** Who may perform it and what else must hold first. */
  authorization: string
  /** What must survive the request: stored state plus the audit record. */
  persistence: string
  /** The refusal that matters most, which must be proven, not assumed. */
  negative: string
  /** Test files that exercise the two above. Checked against disk. */
  evidence: string[]
  status: AcceptanceStatus
  /** Required when the status is not PASS. */
  statusNote?: string
}

const staffAndSession =
  "requireStaff() on the page and on the command, plus a database session that is unrevoked, inside its 12-hour expiry and seen in the last 30 minutes."

export const acceptanceMatrix: AcceptanceRow[] = [
  {
    area: "Authentication and session",
    routes: ["/login"],
    surfaces: ["/auth/[action]", "proxy.ts"],
    action: "Sign in with a one-time code and hold a session for the working day.",
    expected:
      "A code issued to the single Admin identity exchanges for a __Host- cookie whose SHA-256 hash is the only server-side record of the token.",
    authorization:
      "The single enabled admin_identity row only. A Supabase user who is not that identity cannot finish the exchange.",
    persistence:
      "admin_sessions holds the hash, never the token; admin_auth_events records SIGNED_IN, SIGNED_OUT and SESSION_REVOKED.",
    negative:
      "A disabled identity, an expired or mismatched challenge, a sixth verification attempt and a resend inside 60 seconds are all refused, and revocation takes effect on the next request.",
    evidence: ["lib/auth/database.test.ts", "lib/auth/session.test.ts", "app/login/login-form.test.tsx", "proxy.test.ts"],
    status: "PASS",
  },
  {
    area: "Today dashboard",
    routes: ["/"],
    surfaces: [],
    action: "Open the day and see what needs attention.",
    expected:
      "Counts and amounts come from the same report payloads the reports pages use, over an explicit Europe/London period, with worker freshness shown next to them.",
    authorization: staffAndSession,
    persistence: "Read-only. Opening the page writes nothing and claims no job.",
    negative:
      "An invalid period is refused rather than silently widened, and a never-run worker reads as NEVER_RUN rather than healthy.",
    evidence: ["app/page.test.tsx", "lib/admin/database.test.ts", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Global search",
    routes: ["/search"],
    surfaces: [],
    action: "Find a record by reference, name or email.",
    expected: "Matching enquiries, cases, clients, businesses and locations come back ranked, with a stable cursor.",
    authorization: staffAndSession,
    persistence: "Read-only.",
    negative:
      "Wildcards in the query are escaped rather than executed, and a tampered cursor is refused instead of paging past the result set.",
    evidence: ["lib/admin/database.test.ts", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Activity log",
    routes: ["/activity"],
    surfaces: [],
    action: "Review sign-in and session activity.",
    expected: "Authentication events list newest first with their outcome and request id.",
    authorization: staffAndSession,
    persistence: "Read-only over an append-only table.",
    negative:
      "An unrecognised action or outcome filter raises rather than returning everything, and no session token appears in the payload.",
    evidence: ["lib/admin/activity.test.ts", "lib/admin/database.test.ts", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Tasks",
    routes: ["/tasks"],
    surfaces: [],
    action: "See open and overdue case work across all cases.",
    expected: "Open tasks list by due date with the case reference and owner.",
    authorization: staffAndSession,
    persistence: "Read-only; tasks are created and resolved through the case command.",
    negative: "An unrecognised filter raises, and a half-supplied cursor is refused.",
    evidence: ["lib/cases/database.test.ts"],
    status: "PASS",
  },
  {
    area: "Enquiries queue",
    routes: ["/enquiries"],
    surfaces: ["/api/enquiries/options"],
    action: "Work the inbound enquiry queue.",
    expected:
      "Active enquiries list newest first with assignment, next action and the notification state of each one.",
    authorization: staffAndSession,
    persistence: "Read-only. The marketing site writes enquiries through its own idempotent intake function.",
    negative: "An unrecognised status or filter raises; the option lookup returns an explicit column list, never a raw row.",
    evidence: ["lib/enquiries/database.test.ts", "lib/enquiries/command.test.ts", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Enquiry triage and conversion",
    routes: ["/enquiries/[id]", "/enquiries/new"],
    surfaces: ["/api/enquiries/triage", "/api/enquiries/convert", "/api/enquiries/create"],
    action: "Triage an enquiry and convert it into a case or monitoring request.",
    expected:
      "Status, assignment and next action are recorded against the expected version, and conversion creates exactly one case or monitoring request linked back to the enquiry.",
    authorization: staffAndSession,
    persistence:
      "enquiry_events keeps the history; admin_audit_events records ENQUIRY_TRIAGED and ENQUIRY_CONVERTED with the request id.",
    negative:
      "A stale version conflicts rather than overwriting, a waiting status without a follow-up is invalid, a repeated conversion with different values conflicts, and a second conversion never creates a second case.",
    evidence: ["lib/enquiries/database.test.ts", "lib/enquiries/command.test.ts", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Cases list",
    routes: ["/cases"],
    surfaces: [],
    action: "Find and filter active cases.",
    expected: "Cases list with reference, stage, status and the next action date.",
    authorization: staffAndSession,
    persistence: "Read-only.",
    negative: "An unrecognised filter raises rather than falling back to everything.",
    evidence: ["lib/cases/database.test.ts", "app/cases/forms.test.tsx"],
    status: "PASS",
  },
  {
    area: "Case workflow",
    routes: ["/cases/[id]"],
    surfaces: ["/api/cases/command"],
    action: "Plan a case, move it through the workflow and close it.",
    expected:
      "Only transitions the matrix allows are taken, waiting stages demand a follow-up, and a customer-waiting stage creates the customer task.",
    authorization: staffAndSession + " Managed-track planning additionally requires the authorization prerequisites.",
    persistence:
      "case_work_events is append-only; admin_audit_events records CASE_CHANGED; the receipt table makes a retried command return its first result.",
    negative:
      "A transition outside the matrix is denied, a stale version conflicts, closing with unresolved complaint work is refused, and a closed case rejects further notes.",
    evidence: ["lib/cases/database.test.ts", "lib/cases/command.test.ts", "app/cases/[id]/page.test.tsx", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Case authorization and manager access",
    routes: ["/records/client/[id]/link"],
    surfaces: ["/api/authorization/command", "/api/manager-access/command"],
    action: "Record the service agreement, case-management permission and verified manager access a managed case needs.",
    expected:
      "Readiness reports each requirement separately and only reads ready when every one of them holds on the managed track.",
    authorization: staffAndSession + " Issuing a customer-facing authorization also requires a verified contact.",
    persistence: "authorization_events and location_manager_access_events are append-only and immutable.",
    negative:
      "Readiness never reads ready while any requirement is missing, and an authorization for another case conflicts rather than applying.",
    evidence: [
      "lib/authorization/database.test.ts",
      "lib/authorization/case-access.database.test.ts",
      "lib/authorization/command.test.ts",
      "app/cases/[id]/authorization-forms.test.tsx",
      "lib/workday.database.test.ts",
    ],
    status: "PASS",
  },
  {
    area: "Case evidence",
    routes: ["/cases/[id]/evidence"],
    surfaces: ["/api/evidence/command"],
    action: "Request evidence, take an upload, scan it and review it.",
    expected:
      "The browser receives a short-lived presigned POST and nothing else; a version becomes reviewable only after a clean scan.",
    authorization: staffAndSession + " Every command carries the case id and is checked against the version's own case.",
    persistence:
      "case_document_events is append-only; admin_audit_events records EVIDENCE_CHANGED; the storage key never leaves the signed fields.",
    negative:
      "A version belonging to another case conflicts without disclosing its key, a threatened or invalid scan blocks acceptance, and a stale review version conflicts.",
    evidence: [
      "lib/evidence/database.test.ts",
      "lib/evidence/command.test.ts",
      "lib/evidence/storage.test.ts",
      "lib/evidence/content.test.ts",
      "app/cases/[id]/evidence/page.test.tsx",
      "app/cases/[id]/evidence/forms.test.tsx",
      "lib/workday.database.test.ts",
    ],
    status: "PASS",
  },
  {
    area: "Prepared packs",
    routes: [],
    surfaces: ["/api/packs/command"],
    action: "Assemble accepted evidence into a pack and approve it.",
    expected:
      "Only accepted, clean versions from the same case can be added; approval needs a reason and an explicit confirmation and supersedes the previous approved pack.",
    authorization: staffAndSession,
    persistence:
      "Item snapshots are written from the version row, not from the request; case_prepared_pack_events is append-only and the approval reaches admin_audit_events.",
    negative:
      "Adding an unreviewed, scanning, threatened or other-case version is denied, browser-supplied snapshot metadata is rejected, approving an empty pack is denied, and a forged direct insert is rejected by the database.",
    evidence: ["lib/packs/database.test.ts", "lib/packs/command.test.ts", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Evidence queue",
    routes: ["/documents"],
    surfaces: [],
    action: "Work the cross-case queue of evidence waiting for review.",
    expected: "Versions needing review list oldest first with their scan state.",
    authorization: staffAndSession,
    persistence: "Read-only.",
    negative: "An unrecognised filter raises, and no storage key or signed URL appears in the payload.",
    evidence: ["lib/evidence/database.test.ts", "app/documents/page.test.tsx"],
    status: "PASS",
  },
  {
    area: "Client, business and location records",
    routes: ["/records/[entity]", "/records/[entity]/[id]"],
    surfaces: ["/api/records/save", "/api/records/membership", "/api/records/verify"],
    action: "Create and correct the records a case hangs off, and verify the relationships between them.",
    expected:
      "A save writes only the fields on the allowlist for that entity, against the expected version, with a reason of at least ten characters.",
    authorization: staffAndSession + " Contact verification additionally requires a sign-in from the last five minutes.",
    persistence: "admin_audit_events records RECORD_CREATED, RECORD_UPDATED, MEMBERSHIP_CHANGED and CONTACT_VERIFIED.",
    negative:
      "An unknown field, a short reason, a stale version and a malformed email are each refused, a new relationship starts pending rather than verified, and verification outside the fresh-auth window returns reauth_required.",
    evidence: ["lib/records/database.test.ts", "lib/records/command.test.ts", "app/records/forms.test.tsx", "lib/workday.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Duplicate review",
    routes: ["/records/duplicates"],
    surfaces: [],
    action: "Review records that look like duplicates before merging anything by hand.",
    expected: "Candidate pairs are listed with the field that matched.",
    authorization: staffAndSession,
    persistence: "Read-only. The Admin workspace performs no automatic merge.",
    negative: "Nothing is merged or deleted from this page; it offers no destructive action at all.",
    evidence: ["lib/records/database.test.ts"],
    status: "PASS",
  },
  {
    area: "Customer preview",
    routes: ["/records/client/[id]/preview"],
    surfaces: [],
    action: "See exactly what a customer would see before releasing anything.",
    expected: "The preview contains the reference, type, summary and customer-visible notes, and nothing else.",
    authorization: staffAndSession,
    persistence: "Read-only.",
    negative: "Internal notes and internal contact details never appear in the preview payload.",
    evidence: ["lib/cases/database.test.ts", "lib/records/database.test.ts"],
    status: "PASS",
  },
  {
    area: "Commercial catalogue, quotes and orders",
    routes: ["/commercial", "/cases/[id]/commercial"],
    surfaces: ["/api/operations/catalogue", "/api/operations/quotes"],
    action: "Price a service, offer a quote and follow it to an order.",
    expected:
      "A draft takes the current approved price version, tax behaviour is explicit, and offering freezes the version the customer would accept.",
    authorization: staffAndSession + " A quote needs a verified contact and a verified business relationship.",
    persistence: "quote_events is append-only and admin_audit_events records COMMERCE_CHANGED.",
    negative:
      "A retired or non-current price is refused, an acceptance action belonging to another quote cannot be revoked, and the order list stays empty until an acceptance actually happens.",
    evidence: [
      "lib/commerce/database.test.ts",
      "lib/commerce/quote-surface-fixes.database.test.ts",
      "lib/commerce/command.test.ts",
      "app/commercial/page.test.tsx",
      "app/cases/[id]/commercial/page.test.tsx",
      "lib/commercial-workspace/model.test.ts",
      "lib/workday.database.test.ts",
    ],
    status: "PASS",
  },
  {
    area: "Money, payments and invoices",
    routes: ["/money"],
    surfaces: ["/api/operations/payments", "/api/webhooks/stripe"],
    action: "See what is owed and what has been collected, and record provider outcomes.",
    expected:
      "Obligations, invoices and payments reconcile to the same totals the reports use, and a provider event is applied exactly once.",
    authorization: staffAndSession + " The provider webhook authenticates by signature instead, with no session at all.",
    persistence: "Payment events are append-only; a replayed webhook returns the first outcome rather than applying twice.",
    negative:
      "An unsigned or replayed Stripe webhook is rejected, and no collection can be started while the live payment gate is off.",
    evidence: [
      "lib/payments/database.test.ts",
      "lib/payments/command.test.ts",
      "lib/payments/webhook.test.ts",
      "lib/payments/provider.test.ts",
      "lib/payments/handlers.test.ts",
      "app/money/page.test.tsx",
    ],
    status: "DEFERRED_EXTERNAL",
    statusNote:
      "Readiness is proven against the simulated provider boundary. Live Stripe stays disabled, so end-to-end collection against the real provider is not part of Step 23.",
  },
  {
    area: "Outgoing communications",
    routes: ["/communications"],
    surfaces: ["/api/operations/communications", "/api/webhooks/resend"],
    action: "Prepare a templated message against a case and follow its delivery state.",
    expected:
      "A send is composed from the latest approved template version and moves through its lifecycle only on recorded provider events.",
    authorization: staffAndSession,
    persistence: "communication_events is append-only; a retried provider event is deduplicated by its message id.",
    negative:
      "An unapproved template cannot be sent, a message is not composed while the mail gate is off, and an unsigned provider webhook is rejected.",
    evidence: [
      "lib/communications/database.test.ts",
      "lib/communications/command.test.ts",
      "lib/communications/gate.test.ts",
      "lib/communications/mail.test.ts",
      "lib/communications/webhook.test.ts",
      "app/communications/page.test.tsx",
      "lib/workday.database.test.ts",
    ],
    status: "DEFERRED_EXTERNAL",
    statusNote: "Live mail stays disabled. Delivery is proven against the recorded provider boundary, not a real send.",
  },
  {
    area: "Inbound mail and conversations",
    routes: ["/conversations"],
    surfaces: ["/api/operations/conversations", "/api/webhooks/resend/inbound"],
    action: "Match an inbound message to a case and work the thread.",
    expected: "An imported message lands as a conversation that can be linked, assigned, closed and reopened.",
    authorization: staffAndSession,
    persistence: "Imports are idempotent on the provider message id; conversation events are append-only.",
    negative:
      "A mistyped case reference is answered as a field error rather than a database fault, an attachment is unavailable until its scan is clean, and an unsigned inbound webhook is rejected.",
    evidence: [
      "lib/conversations/database.test.ts",
      "lib/conversations/command.test.ts",
      "lib/conversations/receive.test.ts",
      "lib/conversations/attachment.test.ts",
      "lib/conversations/mailbox.test.ts",
      "app/conversations/page.test.tsx",
      "app/conversations/forms.test.tsx",
    ],
    status: "PASS",
  },
  {
    area: "Guard subscriptions and billing",
    routes: ["/guard"],
    surfaces: ["/api/operations/guard"],
    action: "Follow monitoring coverage, consent and billing state.",
    expected: "Coverage, consent and billing read from recorded events rather than from a provider call.",
    authorization: staffAndSession,
    persistence: "Subscription and billing events are append-only and immutable.",
    negative:
      "A refund above the refundable amount is refused, no subscription is activated without recorded consent, and no provider call is made from the Admin workspace.",
    evidence: [
      "lib/guard/database.test.ts",
      "lib/guard/subscriptions.database.test.ts",
      "lib/guard/command.test.ts",
      "lib/guard/gate.test.ts",
      "lib/guard/provider-boundary.test.ts",
      "lib/guard/reconcile.test.ts",
      "app/guard/page.test.tsx",
    ],
    status: "DEFERRED_EXTERNAL",
    statusNote: "Guard billing depends on the same Stripe gate, which stays off.",
  },
  {
    area: "Guard manual checks",
    routes: ["/guard/checks", "/guard/checks/[obligationId]"],
    surfaces: ["/api/operations/guard-checks"],
    action: "Work the day's monitoring obligations by hand and record what was observed.",
    expected:
      "Obligations appear only from an approved schedule version, and an observation is recorded only when an operator records it.",
    authorization: staffAndSession,
    persistence: "Attempts and observations are append-only against the obligation.",
    negative:
      "No schedule means no queue rather than an invented one, nothing is auto-completed, and a malformed obligation id reads as not found rather than as a database failure.",
    evidence: [
      "lib/guard/checks.database.test.ts",
      "lib/guard/checks-command.test.ts",
      "lib/guard/checks-validation.test.ts",
      "lib/guard/maintain-checks.test.ts",
      "lib/route-params.test.ts",
      "app/guard/checks/page.test.tsx",
      "app/guard/checks/[obligationId]/page.test.tsx",
      "lib/workday.database.test.ts",
    ],
    status: "PASS",
  },
  {
    area: "Guard alerts",
    routes: ["/guard/alerts", "/guard/alerts/[alertId]"],
    surfaces: ["/api/operations/guard-alerts"],
    action: "Review a monitoring alert and decide what to do about it.",
    expected: "An alert moves state only on an explicit operator decision with a reason.",
    authorization: staffAndSession,
    persistence: "guard_alert_events is append-only.",
    negative:
      "No alert is raised, escalated or closed automatically, and a malformed alert id reads as not found.",
    evidence: [
      "lib/guard/alerts.database.test.ts",
      "lib/guard/alerts-command.test.ts",
      "lib/guard/alerts-validation.test.ts",
      "lib/guard/maintain-alerts.test.ts",
      "lib/route-params.test.ts",
      "app/guard/alerts/page.test.tsx",
      "app/guard/alerts/[alertId]/page.test.tsx",
    ],
    status: "PASS",
  },
  {
    area: "Jobs and outbox",
    routes: ["/operations/jobs"],
    surfaces: ["/api/operations/jobs", "/api/internal/jobs/run"],
    action: "See worker health and decide whether a dead-lettered job should be replayed.",
    expected:
      "Health is derived from the heartbeat, and a replay happens only with a reason, an explicit confirmation and a recent sign-in.",
    authorization: staffAndSession + " Replay additionally requires a sign-in from the last five minutes.",
    persistence: "Attempts are append-only and the replay count is kept on the job.",
    negative:
      "Opening the page claims and runs nothing, a never-run worker reads as NEVER_RUN rather than healthy, and the cron entry point rejects a request without its secret.",
    evidence: [
      "lib/jobs/database.test.ts",
      "lib/jobs/command.test.ts",
      "lib/jobs/run.test.ts",
      "lib/jobs/worker.test.ts",
      "lib/jobs/config.test.ts",
      "app/operations/jobs/page.test.tsx",
      "lib/workday.database.test.ts",
    ],
    status: "PASS",
  },
  {
    area: "Reports",
    routes: ["/reports", "/reports/[key]"],
    surfaces: ["/api/operations/reports/export", "/api/operations/reports/filters"],
    action: "Read a report over a period and export it.",
    expected:
      "Summary and detail come from the same rows, over the same Europe/London period, and the export matches what is on screen.",
    authorization: staffAndSession,
    persistence: "Read-only. Saved filters are stored per report key.",
    negative:
      "An unrecognised report key or period is refused rather than defaulting, and CSV fields that begin with a formula character are neutralised.",
    evidence: [
      "lib/reports/database.test.ts",
      "lib/reports/command.test.ts",
      "lib/reports/csv.test.ts",
      "lib/reports/model.test.ts",
      "app/reports/[key]/page.test.tsx",
      "lib/workday.database.test.ts",
    ],
    status: "PASS",
  },
  {
    area: "Settings and operational policy",
    routes: ["/settings"],
    surfaces: ["/api/operations/settings"],
    action: "Draft and approve service hours, response targets and retention policy.",
    expected:
      "A draft is separate from an approved version, approval inserts the next immutable version, and nothing invents a value that was not approved.",
    authorization: staffAndSession + " Approval requires a sign-in from the last five minutes.",
    persistence: "Setting versions are immutable once approved; admin_audit_events records each change.",
    negative:
      "A response target cannot be approved without approved service hours, an approved version cannot be edited, and approval outside the fresh-auth window returns reauth_required.",
    evidence: ["lib/settings/database.test.ts", "lib/settings/command.test.ts", "lib/settings/model.test.ts", "app/settings/page.test.tsx"],
    status: "PASS",
  },
  {
    area: "Message templates",
    routes: ["/settings/templates"],
    surfaces: [],
    action: "Approve and retire the templates outgoing mail may use.",
    expected: "Only the latest approved version of an allowed key is available to the send path.",
    authorization: staffAndSession,
    persistence: "Template versions are immutable; approving inserts the next version.",
    negative: "A key outside the allowlist cannot be created, and a retired version cannot be sent.",
    evidence: ["lib/settings/database.test.ts", "lib/communications/database.test.ts", "app/settings/templates/page.test.tsx"],
    status: "PASS",
  },
  {
    area: "Privacy requests",
    routes: ["/privacy"],
    surfaces: ["/api/operations/privacy-export"],
    action: "Record a privacy request and export what is held about a person.",
    expected: "An export produces a CSV of the records held, against the expected version.",
    authorization: staffAndSession + " Export requires a sign-in from the last five minutes.",
    persistence: "The request and its export are recorded in the audit trail.",
    negative:
      "Deletion performs nothing while PRIVACY_DELETION_ENABLED is off, and the page says so rather than offering an action that would not run.",
    evidence: ["lib/settings/database.test.ts", "lib/settings/command.test.ts", "app/privacy/page.test.tsx"],
    status: "PASS",
  },
  {
    area: "Incidents",
    routes: ["/incidents"],
    surfaces: ["/api/operations/settings"],
    action: "Open, acknowledge, resolve and cancel an operational incident.",
    expected: "An incident carries its own status history and no invented acknowledgement target.",
    authorization: staffAndSession,
    persistence: "Status changes are recorded against the expected version.",
    negative: "A stale version conflicts, and the page offers no acknowledgement SLA that was never configured.",
    evidence: ["lib/settings/database.test.ts", "app/incidents/page.test.tsx"],
    status: "PASS",
  },
  {
    area: "Complaints",
    routes: ["/complaints"],
    surfaces: ["/api/operations/settings"],
    action: "Record a complaint against a customer or case and work it to resolution.",
    expected: "A complaint links to its case where one exists and blocks case closure until it is resolved.",
    authorization: staffAndSession,
    persistence: "Status changes are recorded against the expected version.",
    negative: "A case with an unresolved complaint cannot be closed.",
    evidence: ["lib/settings/database.test.ts", "lib/cases/database.test.ts", "app/complaints/page.test.tsx"],
    status: "PASS",
  },
  {
    area: "Security and sessions",
    routes: ["/security"],
    surfaces: ["/api/sessions/revoke"],
    action: "See active sessions and revoke them.",
    expected: "Sessions list with their last-seen time and which one is current; revoking takes effect immediately.",
    authorization: staffAndSession + " Revoking all sessions requires a sign-in from the last five minutes.",
    persistence: "admin_auth_events records SESSION_REVOKED and SIGNED_OUT_ALL.",
    negative: "No token material appears in the listing, and a revoked session fails its next request.",
    evidence: ["lib/auth/database.test.ts", "lib/admin/command.test.ts", "app/security/page.test.tsx"],
    status: "PASS",
  },
  {
    area: "Google Business Profile integration",
    routes: [],
    surfaces: ["/api/operations/integrations", "/api/integrations/google/callback"],
    action: "Hold the connection state a live Google integration would need, without making a call.",
    expected:
      "Status reports the connection as inactive and the live stack as absent; the OAuth state is single-use.",
    authorization: staffAndSession,
    persistence: "Connection and state rows are recorded; no token is ever returned to the browser.",
    negative:
      "A replayed or unknown OAuth state is refused, and no transport exists that could make a live Google call.",
    evidence: ["lib/integrations/database.test.ts", "lib/integrations/command.test.ts", "lib/integrations/status.test.ts"],
    status: "DEFERRED_EXTERNAL",
    statusNote: "The Google API stays inactive by design. Step 23 proves the gate, not a live call.",
  },
  {
    area: "Customer-facing action tokens",
    routes: [],
    surfaces: ["customer_action_* RPCs consumed by apps/customer"],
    action: "Issue a short-lived, single-purpose link a customer can use without an account.",
    expected:
      "An action exchanges a one-time code for a 15-minute __Host- session scoped to that one action.",
    authorization: "The action's own secret and code. No Admin session is involved on the customer side.",
    persistence: "customer_action_events is append-only; revoking an action deletes its challenges and sessions.",
    negative:
      "An expired, revoked or already-used action is refused, a session for one action cannot act on another, and an action cannot be revoked through a different quote or order.",
    evidence: [
      "lib/commerce/database.test.ts",
      "lib/commerce/quote-surface-fixes.database.test.ts",
      "lib/payments/database.test.ts",
      "lib/authorization/customer-evidence.database.test.ts",
      "lib/packs/database.test.ts",
    ],
    status: "PASS",
  },
  {
    area: "Route parameter and request boundary",
    routes: [],
    surfaces: ["proxy.ts", "all /api/* route handlers"],
    action: "Reach a page or command with a malformed, guessed or cross-origin request.",
    expected:
      "The proxy denies an unauthenticated request before the page runs, and each loader and command independently refuses a malformed identifier.",
    authorization: "requireStaff() is called by every protected page and command, not only by the proxy.",
    persistence: "A refused request writes nothing.",
    negative:
      "A malformed identifier gives a 404 or a field error rather than a database failure, and a mutation without a same-origin header is refused.",
    evidence: ["proxy.test.ts", "lib/route-params.test.ts", "lib/access.test.ts"],
    status: "PASS",
  },
  {
    area: "Database permission surface",
    routes: [],
    surfaces: ["supabase/migrations"],
    action: "Reach Admin data as an anonymous or signed-in Supabase role.",
    expected:
      "Every function pins its search_path, every table has row-level security, and the only role that can execute an Admin RPC is service_role.",
    authorization: "The service key, held only by the server runtime.",
    persistence: "Not applicable; this is a permission invariant over the whole schema.",
    negative:
      "An actual call from anon and authenticated is refused for an Admin RPC, an admin_private helper and a direct table read.",
    evidence: ["lib/database-hardening.database.test.ts"],
    status: "PASS",
  },
  {
    area: "Migration and recovery rehearsal",
    routes: [],
    surfaces: ["apps/admin/lib/recovery"],
    action: "Rebuild the schema from source and confirm the chain is intact.",
    expected:
      "The whole chain applies in order onto an empty database and onto an older checkpoint, and remote history is validated before anything is applied.",
    authorization: "Not applicable; the rehearsal runs in-process and never connects to a project.",
    persistence: "Not applicable.",
    negative:
      "A migration missing from the repository, applied out of order or still waiting for review is reported rather than applied.",
    evidence: [
      "lib/recovery/manifest.test.ts",
      "lib/recovery/history.test.ts",
      "lib/recovery/rehearsal.database.test.ts",
      "lib/recovery/upgrade.database.test.ts",
      "lib/recovery/report.test.ts",
      "lib/recovery/storage.test.ts",
      "lib/recovery/jobs.test.ts",
    ],
    status: "DEFERRED_EXTERNAL",
    statusNote:
      "Step 22A source rehearsal is complete. Step 22B, the rehearsal against a real restored project, is still required before production sign-off.",
  },
]