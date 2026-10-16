# ADMIN-JOURNEY-01 — guided case workflow foundation

This is a presentation layer for a future eleven-step operator workflow. It does not store a second workflow, does not change `work_stage`, and does not perform the steps. The nine-phase case cockpit remains the working Admin page.

The preview is `/cases/[id]/journey`. It is available only when `VERCEL_ENV` is `preview`, `VERCEL_GIT_COMMIT_REF` is `develop`, and `SUPABASE_URL` is the DEV project `https://rmzozuiamjcclvtgutgd.supabase.co`. Production and every other Preview branch receive not-found before any case is read. No new environment variable is required.

## Source of truth

`presentCaseJourney` reads `CaseFlowFacts` and `resolveCaseFlow`. A step is `COMPLETED` only from the record in the completion column. The technical stage can choose where the operator is standing. It cannot turn an earlier step green. Where the record does not exist, the step is `UNKNOWN`, `WAITING`, `NEEDS_ATTENTION`, or `LOCKED`.

| Step | Completes only when | Existing record | Still missing |
| --- | --- | --- | --- |
| 1. Case Received | Never, in this build | The case row shows that a case exists | An intake-review record. A confirmation email is not that review and is not identity verification |
| 2. Business, Profile & Contact Verification | Never, in this build | Email control and business-membership authority, separately | Google listing verification and the legal purchasing establishment are not in the case-flow projection. Email control is not business authority |
| 3. Review Request & Request Documents | An evidence request exists and the newest `EVIDENCE_REQUEST` message is `DELIVERED` | `summariseEvidence` and `evidenceContactState` | The preview does not draft or send the message. Provider acceptance is not delivery |
| 4. Evidence Review | At least one accepted version, no live blocked or pending file, and no open request | Evidence version and request states | Upload is not acceptance. Accept and fulfil stay on the evidence workspace |
| 5. Assessment & Recommended Path | Never, in this build | Nothing. `ASSESSMENT_READY` means ready to assess | No assessment record is projected |
| 6. Quote & Contract Acceptance | Quote status `ACCEPTED` on a complete quote list | `summariseCommercial` | An open acceptance link is not acceptance. A truncated quote list stays unknown |
| 7. Service Activation | Guided: accepted quote and upfront obligation `PAID`. Managed: accepted success-fee order, `authorizationReady`, business authority, active case permission, and Google manager access | `summarisePayment`, `case_authorization_readiness_v1` via the projection | Checkout is not payment. Choosing Managed is not Google access. A saved card is not activation. A revoked permission is not still valid |
| 8. Case Preparation & Approval | An approved, published, non-empty pack that is not stale | Prepared-pack rows | Approval without publication is not enough |
| 9. Submission & Tracking | At least one submission, and every submission has a result | `cases` submissions | A row with a null result is still waiting. There is no live Google transport |
| 10. Outcome Verification & Billing | Guided: a case outcome and an upfront obligation already `PAID`. Managed: never, in this build | `cases.outcome`, upfront obligation | No post-success Managed invoice is projected |
| 11. Closure & Optional Guard | `cases.status` is `CLOSED` or `CANCELLED` | Case status and the reopen flag | Guard is optional and is not a condition. A reopened case is open again |

`NOT_APPLICABLE` is part of the state function for a step the case does not need. None of the eleven steps is track-exclusive: step 7 changes its branch with the service track, and Guard is a note on closure rather than a twelfth step that could block it.

## What this reuses

- `loadCaseFlowFacts` and `resolveCaseFlow` for facts, the primary action, blockers and attention
- `summariseEvidence`, `summariseCommercial` and `summarisePayment`
- `caseDestination` and `recordDestination` for links that stay inside Admin
- `requireStaff` and `getCase` for the route
- The evidence workspace, communications workspace, commercial workspace, and the existing case cockpit commands

The database gates are unchanged: `case_stage_ready_v1`, `guided_payment_ready_v1`, `managed_setup_ready_v1`, `published_pack_ready_v1`, `pack_publishable_v1` and `case_authorization_readiness_v1`.

## Agreement gap

Agreement `PS-2026-10-14.2` invoices a Managed success fee only after documented success. It has no automatic card charge and no collection in advance. The existing case-flow ladder can still recommend `START_MANAGED_PAYMENT_SETUP` and the blocker `MANAGED_PAYMENT_SETUP_INCOMPLETE`. This preview hides that recommendation as an action and does not treat a saved card as activation. It does not change payment behaviour. Retiring that ladder is ADMIN-JOURNEY-07.

## Gap matrix

| Later slice | Owns | Already in Admin | Not in this preview |
| --- | --- | --- | --- |
| ADMIN-JOURNEY-02 | Steps 1 and 2 | Case intake, client and business records, email verification, membership authority | Intake-review record, Google listing verification, legal purchasing establishment |
| ADMIN-JOURNEY-03 | Step 3 | Evidence requests and the communications lifecycle, including delivery versus provider acceptance | A guided request operation on this page |
| ADMIN-JOURNEY-04 | Step 4 | Scan, review, accept, reject and fulfil on the evidence workspace | Those commands inside the new workflow |
| ADMIN-JOURNEY-05 | Step 5 | The stage `ASSESSMENT_READY` and the action `COMPLETE_ASSESSMENT` | An assessment record |
| ADMIN-JOURNEY-06 | Step 6 | Quotes, acceptance links and accepted orders | The quote operation inside the new workflow |
| ADMIN-JOURNEY-07 | Step 7 | Guided upfront settlement and Managed authorisation readiness | Removing saved-card setup as a Managed requirement, without rewriting payments here |
| ADMIN-JOURNEY-08 | Step 8 | Draft, approve, publish and stale pack handling | Pack commands inside the new workflow |
| ADMIN-JOURNEY-09 | Step 9 | Recording an external submission and an unresolved result | Live Google submission |
| ADMIN-JOURNEY-10 | Steps 10 and 11 | Case outcome, closure and reopen | Post-success Managed invoicing. Guard stays optional and must not block closure |

No migration is required. No Production setting changes.
