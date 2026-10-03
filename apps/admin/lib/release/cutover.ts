/**
 * The production cutover sequence, the stop conditions that interrupt it, and
 * the record an operator fills in while carrying it out.
 *
 * The sequence is deliberately phased. Putting a database, a domain, a first
 * sign-in and a provider activation into one event means that when something
 * misbehaves there is no way to tell which change caused it, and no small
 * thing to undo. Each phase ends in a verification that produces evidence, and
 * each capability is activated in a change of its own.
 */

import type { CapabilityId } from "./gates"

export type CutoverPhase = {
  /** 0 through 4. Phases run in order and do not overlap. */
  number: number
  name: string
  /** What this phase is for, in one sentence. */
  intent: string
  /** What must already be true. */
  prerequisites: string[]
  /** The ordered actions. */
  steps: string[]
  /** How the phase is proven complete, producing something recordable. */
  verification: string[]
  /** What must not happen during this phase. */
  prohibited: string[]
  /** Where to stop and what the safe response is. */
  stopCondition: string
}

export const cutoverSequence: readonly CutoverPhase[] = [
  {
    number: 0,
    name: "Decisions and external verification",
    intent:
      "Resolve everything that is a decision or an external account fact, while nothing is live and nothing can be broken.",
    prerequisites: [
      "Step 23 is complete and merged.",
      "20261003154314 customer_portal_dashboard_cases_v1 is applied to profilerelaunch-dev and is the current repository/dev migration head. Applied migrations are not replayed.",
    ],
    steps: [
      "Record an answer to each Owner decision, or record explicitly that it is deferred and what that defers.",
      "Choose Strategy A or Strategy B for the production database and record who chose it and when.",
      "In Vercel, compare Production variable names against the environment contract. Names and presence only.",
      "In Supabase, enable leaked-password protection on the project that will be production.",
      "In AWS, confirm the evidence bucket and both assumed roles exist and that public access is blocked.",
      "Confirm DNS and TLS for admin.profilerelaunch.com, and record what was observed rather than what was requested.",
    ],
    verification: [
      "Every Owner decision has a recorded answer or a recorded deferral.",
      "The database strategy is recorded with a name and a date.",
      "Each external check names the account it was observed in.",
    ],
    prohibited: [
      "Do not change DNS from the repository.",
      "Do not set any capability enable flag.",
      "Do not record an external setting as configured because this document says it should be.",
    ],
    stopCondition:
      "If an external fact cannot be observed, record it as unverified and stop rather than assuming it. An unverified certificate or an unobserved environment variable is exactly the kind of thing that fails at the first real sign-in.",
  },
  {
    number: 1,
    name: "Production database",
    intent: "Bring a production database into existence by the chosen strategy, and prove the schema is what the repository describes.",
    prerequisites: [
      "Phase 0 complete.",
      "The database strategy is recorded.",
      "Step 22B has been performed, or its absence has been recorded as an outstanding gate on final sign-off.",
    ],
    steps: [
      "Create or designate the production database according to the recorded strategy.",
      "Under Strategy A, apply the repository chain in order from empty. Under Strategy B, apply nothing and instead compare the live schema against a database rebuilt from the canonical chain.",
      "Read the migration head and compare it with the manifest head.",
      "Run the legacy-object inspection SQL and read the dependency output. Decide; do not drop anything yet.",
      "Run the Supabase database linter and read every error-level finding.",
    ],
    verification: [
      "The migration head matches the manifest head, and both are written into the release record.",
      "Row-level security and service-role-only execution are confirmed on the live schema.",
      "The linter produces no new error-level finding.",
    ],
    prohibited: [
      "Do not replay an applied migration.",
      "Do not edit an applied migration.",
      "Do not insert a migration-history row.",
      "Do not drop a legacy object with CASCADE.",
    ],
    stopCondition:
      "If the heads differ, stop before the domain is pointed anywhere. Establish which chain the database actually carries. Do not close the gap by replaying a migration, because a foundation migration recreates tables and an additive one re-runs its seed data.",
  },
  {
    number: 2,
    name: "Admin production access",
    intent: "Put the Admin workspace on its domain and sign in once, with every optional capability still off.",
    prerequisites: [
      "Phase 1 complete.",
      "Every item marked as required before Admin production access is READY or READY_DISABLED.",
    ],
    steps: [
      "Deploy the Admin project and assign admin.profilerelaunch.com.",
      "Run the non-mutating smoke pass against the production domain.",
      "Request a one-time code to the Admin address and sign in. The operator does this by hand.",
      "Read the session cookie and confirm it is host-only.",
      "Open Settings → system configuration and read every capability state.",
      "Walk the authenticated smoke pass: open each page and confirm it renders.",
    ],
    verification: [
      "Every /api/* path without a session answered 401.",
      "The session cookie is named __Host-pr-admin and carries no Domain attribute.",
      "Every live capability reads Disabled or Not configured.",
      "The deployment's runtime logs record no unhandled error for the window.",
    ],
    prohibited: [
      "Do not create a second Admin identity.",
      "Do not enable a capability to make a page look complete.",
      "Do not run the smoke pass against a real customer record.",
    ],
    stopCondition:
      "If any capability reads enabled, stop before doing anything else and establish whether an effect has already been produced. Read the outbox, communication_events, payments and privacy dispositions before changing the configuration, because unsetting the gate will not undo what was already sent, charged or deleted.",
  },
  {
    number: 3,
    name: "Controlled first operations",
    intent: "Prove the paths that matter at launch using records created for the purpose, with no customer involved.",
    prerequisites: [
      "Phase 2 complete and its verification recorded.",
      "Marketing intake is enabled so the enquiry queue can receive work.",
    ],
    steps: [
      "Submit one enquiry through the marketing site and confirm it appears in the Admin queue.",
      "Triage it and convert it to a case.",
      "Create a client, a business and a location, and verify the relationships.",
      "Request evidence and complete one upload, confirming the presigned POST and the scan boundary.",
      "Approve a Guard schedule version and confirm the manual checks queue populates for the current day.",
      "Record one manual Guard observation.",
      "Run one privacy export against the record created for this pass.",
      "Close the case and confirm the audit trail carries every step.",
    ],
    verification: [
      "Each action appears in admin_audit_events with its request id.",
      "No message was sent, no payment was taken and nothing was deleted.",
      "The records created for this pass are identifiable and can be cleaned up deliberately.",
    ],
    prohibited: [
      "Do not use a real customer's name, email or business.",
      "Do not enable a capability to complete a step.",
      "Do not leave the test records unlabelled.",
    ],
    stopCondition:
      "A failure here is an application defect and is fixed forward in a reviewed change. Do not disable a surface to get past it, and do not propose a destructive database rollback: every migration in the chain is forward-only, so rolling the schema back to clear an application bug would destroy data to fix something that is not a schema problem.",
  },
  {
    number: 4,
    name: "Capability activation, one at a time",
    intent:
      "Open each gate deliberately, in its own change, with its own verification and its own way back.",
    prerequisites: [
      "Phase 3 complete.",
      "The activation order is recorded.",
      "Each capability's own blockers are resolved.",
    ],
    steps: [
      "Activate exactly one capability. Make no other change in the same deployment.",
      "Verify it against a target the operator controls.",
      "Record the result, then wait long enough to observe it in ordinary use before starting the next one.",
    ],
    verification: [
      "The capability reads enabled in Settings and produced exactly the effect that was expected.",
      "No other capability changed state in the same deployment.",
    ],
    prohibited: [
      "Do not activate two capabilities in one change.",
      "Do not activate anything whose blockers are unresolved.",
      "Do not activate a capability against a real customer as its first test.",
    ],
    stopCondition:
      "If a capability misbehaves, close its gate, redeploy and confirm it reads disabled before investigating. Preserve the audit trail and any provider event already received: a provider that has accepted a request will keep reporting on it, and discarding those events loses the record of what actually happened.",
  },
]

export type ActivationPlan = {
  capability: CapabilityId
  name: string
  /** What must be true first. */
  prerequisite: string[]
  /** The test that proves it works, performed before anyone depends on it. */
  test: string
  /** The change that opens the gate. */
  enableAction: string
  /** What is observed afterwards. */
  verification: string
  /** How to close it again, and what closing it does not undo. */
  rollback: string
}

export const activationPlans: readonly ActivationPlan[] = [
  {
    capability: "outgoing_mail",
    name: "Outgoing transactional mail",
    prerequisite: [
      "A verified sending domain in Resend with its DNS records in place.",
      "The delivery webhook registered against the production Admin domain.",
      "A recorded decision to change the scheduler to meet the 300-second cadence ceiling.",
      "At least one approved template version for the message being sent.",
    ],
    test: "Queue and send one message to a mailbox the operator controls, then confirm the delivery webhook advanced the communication to its delivered state.",
    enableAction:
      "Set the sender, the link secret and the delivery webhook secret, change the schedule, then set COMMUNICATIONS_SEND_ENABLED and JOB_WORKER_ENABLED and redeploy.",
    verification:
      "The message arrives, the communication reaches its delivered state from a recorded provider event rather than from a timer, and a retry does not produce a second message.",
    rollback:
      "Unset COMMUNICATIONS_SEND_ENABLED and redeploy. This stops further sends. It does not recall a message already accepted by the provider, so check the outbox before unsetting rather than after.",
  },
  {
    capability: "inbound_mail",
    name: "Inbound mail ingestion",
    prerequisite: [
      "MX records for the inbound subdomain only. The root domain's MX records carry the Admin mailbox and are not touched.",
      "Receiving enabled in Resend and the inbound webhook registered.",
      "The inbound bucket and role in place, with no static AWS credential configured.",
    ],
    test: "Send one message from an address the operator controls to the inbound subdomain, confirm it appears as a conversation, then replay the same provider message id and confirm no second conversation is created.",
    enableAction:
      "Set the inbound domain, the owned addresses, the inbound webhook secret and the inbound bucket and role, then set COMMUNICATIONS_INBOUND_ENABLED and redeploy.",
    verification:
      "The conversation appears with the correct direction, and an attachment is unavailable until its scan is clean.",
    rollback:
      "Unset COMMUNICATIONS_INBOUND_ENABLED and redeploy. Mail already delivered to the inbound address stays where the provider put it; nothing is lost, but nothing new is imported.",
  },
  {
    capability: "guard_automation",
    name: "Guard automated checks and alerts",
    prerequisite: [
      "An approved Guard schedule version with the decided clock windows.",
      "A recorded decision on Guard capacity per operator per day.",
      "For alert notifications only: outgoing mail already activated and observed.",
    ],
    test: "Enable scheduled obligation generation alone and confirm the next worker run produces the obligations the approved schedule implies, and no others.",
    enableAction:
      "Set GUARD_CHECKS_ENABLED. Set GUARD_ALERTS_ENABLED and GUARD_ALERT_NOTIFICATIONS_ENABLED only as separate, later changes.",
    verification:
      "Obligation counts match the approved schedule for the Europe/London day, and capture_method on every observation is still MANUAL.",
    rollback:
      "Unset the flag and redeploy. Obligations already generated remain and can be worked or cancelled by hand; they are not deleted automatically.",
  },
  {
    capability: "stripe_payments",
    name: "Stripe payments",
    prerequisite: [
      "The tax, VAT and terms decision recorded.",
      "Prices reviewed against that decision.",
      "A Stripe account with the webhook registered against the production Admin domain.",
      "A reviewed code change, because the current code accepts only test-mode keys.",
    ],
    test: "Complete one payment end to end in test mode against a quote created for the purpose, and confirm the webhook applies exactly once when replayed.",
    enableAction:
      "Set PAYMENTS_PROVIDER_MODE, the Stripe key and the webhook secret, and redeploy. Live keys additionally require the reviewed code change.",
    verification:
      "The payment reconciles to the obligation, invoice.paid is what grants paid entitlement, and a replayed webhook returns the first outcome.",
    rollback:
      "Unset PAYMENTS_PROVIDER_MODE and redeploy. This stops new charges. It does not reverse a charge already made, which has to be refunded through Stripe.",
  },
  {
    capability: "google_api",
    name: "Google Business Profile API",
    prerequisite: [
      "API access approved by Google.",
      "A token exchange and transport implemented and reviewed, because googleLiveStack is null and no setting changes that.",
      "The token encryption key and OAuth configuration in place.",
    ],
    test: "Connect one location in a non-production environment first and confirm token storage, revocation handling and quota failure all map to the normalised failure model.",
    enableAction:
      "Ship the live stack, then set the provider mode and the API gate. The code change comes first; the settings alone do nothing.",
    verification:
      "A connection is established, a provider event is recorded, and the manual workflow still works for anything the API cannot do.",
    rollback:
      "Unset the API gate and redeploy to fall back to the manual adapter. Stored tokens remain encrypted at rest and should be revoked at Google if the fallback is permanent.",
  },
  {
    capability: "privacy_deletion",
    name: "Physical deletion of personal data",
    prerequisite: [
      "Approved retention periods per category.",
      "Legal holds understood and the preview reviewed against a real request.",
      "A recorded decision that deletion is required rather than retention with restricted access.",
    ],
    test: "Run the preview against a record created for the purpose and confirm the retained and blocked categories are exactly what the approved policy says.",
    enableAction: "Set PRIVACY_DELETION_ENABLED and redeploy.",
    verification: "One deletion against the test record removes exactly the categories the preview named, and nothing else.",
    rollback:
      "Unset PRIVACY_DELETION_ENABLED and redeploy. This is the one capability whose effect closing the gate cannot undo, which is why the preview is run first and why it is activated last.",
  },
]

export function activationPlan(capability: CapabilityId): ActivationPlan {
  const found = activationPlans.find(entry => entry.capability === capability)
  if (!found) throw new Error(`No activation plan for ${capability}`)
  return found
}

/**
 * The fields a release record must carry. The record is written by the person
 * performing the cutover, which is why nothing here is auto-populated: a
 * field filled in by a tool that cannot observe production would be a claim
 * nobody made.
 */
export type ReleaseRecordField = {
  field: string
  description: string
  /** True when the field asserts something an operator personally observed. */
  requiresObservation: boolean
}

export const releaseRecordTemplate: readonly ReleaseRecordField[] = [
  { field: "Release identifier", description: "A name for this cutover, unique and referenced by anything that follows it.", requiresObservation: false },
  { field: "Git commit SHA", description: "The exact commit the deployment was built from.", requiresObservation: false },
  { field: "Deployment identifier", description: "The platform's identifier for the deployment serving the domain.", requiresObservation: true },
  { field: "Admin domain", description: "The domain served, and whether DNS and TLS were observed rather than requested.", requiresObservation: true },
  { field: "Migration head applied", description: "The migration version the production database reports, and the manifest head it was compared with.", requiresObservation: true },
  { field: "Database verification", description: "Row-level security, service-role-only execution and the linter result.", requiresObservation: true },
  { field: "Admin identity count", description: "The number of rows in admin_identity. The expected value is 1.", requiresObservation: true },
  { field: "Environment contract check", description: "Per variable, whether presence matched the contract. Presence only; never a value.", requiresObservation: true },
  { field: "Live capability gate states", description: "What Settings → system configuration reported for each of the six capabilities.", requiresObservation: true },
  { field: "Smoke test results", description: "Non-mutating, authenticated and controlled-mutation passes, each with its outcome.", requiresObservation: true },
  { field: "Runtime error check", description: "What the deployment's runtime logs showed for the cutover window.", requiresObservation: true },
  { field: "Step 22B status", description: "Whether the cloud recovery rehearsal has been performed. Outstanding withholds final sign-off.", requiresObservation: true },
  { field: "Exceptions accepted", description: "Anything knowingly left unresolved, with who accepted it.", requiresObservation: false },
  { field: "Owner decisions recorded", description: "Which decisions were answered and which remain open.", requiresObservation: false },
  { field: "Operator", description: "Who performed the cutover.", requiresObservation: false },
  { field: "Date and time", description: "When, in Europe/London.", requiresObservation: false },
  { field: "Outcome", description: "Completed, completed with exceptions, or stopped. Stopped is a valid outcome.", requiresObservation: false },
  { field: "Rollback notes", description: "What was undone, how, and what the undo did not reverse.", requiresObservation: false },
]

export type StopCondition = {
  id: string
  /** The observation that triggers it. */
  trigger: string
  /** What must stop. */
  halt: string
  /** The safe response, in order. */
  response: string[]
}

export const stopConditions: readonly StopCondition[] = [
  {
    id: "unauthenticated-success",
    trigger: "Any /api/* path answers something other than 401 without a session.",
    halt: "The whole cutover, before any capability is activated.",
    response: [
      "Remove the deployment from the domain alias rather than attempting a live fix.",
      "Preserve the runtime logs for the window.",
      "Establish which route answered and what it returned before redeploying anything.",
    ],
  },
  {
    id: "unexpected-capability-enabled",
    trigger: "Settings reports a live capability as enabled when it was not activated.",
    halt: "Everything else, until it is established whether an effect was produced.",
    response: [
      "Read the outbox, communication_events, payments and privacy dispositions before changing any configuration.",
      "Close the gate and redeploy.",
      "Confirm Settings now reads disabled.",
      "Record what was found, including a nil finding, in the release record.",
    ],
  },
  {
    id: "migration-head-mismatch",
    trigger: "The production migration head does not match the manifest head.",
    halt: "Phase 1, before the domain points anywhere.",
    response: [
      "Do not replay a migration and do not edit an applied one.",
      "Establish which chain the database carries by comparing its schema with a rebuild from the canonical chain.",
      "Treat the difference as a decision about which database becomes production, not as a gap to be patched.",
    ],
  },
  {
    id: "second-admin-identity",
    trigger: "admin_identity contains more than one row.",
    halt: "The cutover, immediately.",
    response: [
      "Treat it as an access-control incident rather than a configuration difference.",
      "Establish where the row came from before removing it.",
      "Revoke every active session.",
    ],
  },
  {
    id: "otp-not-delivered",
    trigger: "The one-time code does not arrive at the Admin address.",
    halt: "Phase 2, at sign-in.",
    response: [
      "Check Supabase Auth logs and the mailbox.",
      "Do not add a second identity, a password fallback or a bypass to get in.",
      "If the mailbox is the problem, fix the mailbox.",
    ],
  },
  {
    id: "provider-effect-unexpected",
    trigger: "A provider reports an effect nobody asked for: a message sent, a charge made, an inbound message imported.",
    halt: "All activation work.",
    response: [
      "Close the gate for that capability and redeploy.",
      "Preserve every provider event already received. A provider that accepted a request will keep reporting on it, and discarding those events loses the record of what happened.",
      "Reconcile what the provider did against what the database recorded before reopening anything.",
    ],
  },
  {
    id: "application-defect-in-phase-3",
    trigger: "A controlled first operation fails with a runtime error or a wrong result.",
    halt: "Phase 3, and therefore Phase 4.",
    response: [
      "Fix it forward in a reviewed change.",
      "Do not disable the surface to get past it.",
      "Do not roll the schema back. Every migration is forward-only, so a rollback would destroy data to work around something that is not a schema problem.",
    ],
  },
]
