# ADMIN-JOURNEY-01 — guided case workflow foundation

This is a presentation layer for a future eleven-step operator workflow. It does not store a second workflow, does not change `work_stage`, and does not perform the steps. The nine-phase case cockpit remains the working Admin page.

The preview is `/cases/[id]/journey`. It is available only when `VERCEL_ENV` is `preview`, `VERCEL_GIT_COMMIT_REF` is `develop`, and `SUPABASE_URL` is the DEV project `https://rmzozuiamjcclvtgutgd.supabase.co`. Production and every other Preview branch receive not-found before any case is read. No new environment variable is required.

## Source of truth

`presentCaseJourney` reads `CaseFlowFacts` and `resolveCaseFlow`. A step is `COMPLETED` only from the record in the completion column. The technical stage can choose where the operator is standing. It cannot turn an earlier step green. Where the record does not exist, the step is `UNKNOWN`, `WAITING`, `NEEDS_ATTENTION`, or `LOCKED`.

| Step | Completes only when | Existing record | Still missing |
| --- | --- | --- | --- |
| 1. Case Received | The latest `INTAKE_REVIEW` work event is `REVIEWED` and is not behind a reopen | The case row, the case message, and the current customer, business and location records | A confirmation email is not that review. The decision function is proposed and is not applied to DEV until it is approved |
| 2. Business, Profile & Contact Verification | The latest `BUSINESS_VERIFICATION` work event is `PRELIMINARY_COMPLETE`, with no material discrepancy, and is not behind a reopen or a revoked membership | Verified customer email and business-membership authority, separately. They are shown and are not created by this step | The purchasing establishment and tax eligibility stay quote checks. A website, Companies House registration, or accessible Google listing is not required. The decision function is proposed and is not applied to DEV until it is approved |
| 3. Review Request & Request Documents | An evidence request exists and the newest `EVIDENCE_REQUEST` message is `DELIVERED` | `summariseEvidence` and `evidenceContactState` | The preview does not record the need, review the draft, or issue the message. Queued, provider-accepted and delivered stay separate. A no-documents decision is an ADMIN-JOURNEY-03 record and is unknown here |
| 4. Evidence Review | At least one accepted version, no live blocked or pending file, and no open request | Evidence version and request states | Upload is not acceptance. A rejected file returns to the evidence loop. An outstanding threat blocks that file. A no-documents waiver is an ADMIN-JOURNEY-04 record and is unknown here |
| 5. Assessment & Recommended Path | Never, in this build | Nothing. `ASSESSMENT_READY` means ready to assess | No assessment record is projected. A suspended or missing listing does not have to be verified before assessment |
| 6. Quote & Contract Acceptance | Quote status `ACCEPTED` on a complete quote list | `summariseCommercial` | An open acceptance link is not acceptance. A truncated quote list stays unknown. Issuing a binding paid quote still requires the purchasing establishment and country and tax eligibility, which this projection does not carry and does not infer |
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
| ADMIN-JOURNEY-02 | Steps 1 and 2 | Case intake, client and business records, email verification, membership authority, `case_work_events` and `admin_audit_events` | The two decision functions in `docs/admin/proposed-admin-journey-02.sql` are not applied. The purchasing establishment remains a quote check |
| ADMIN-JOURNEY-03 | Step 3 | Evidence requests and the communications lifecycle, including queued, provider-accepted and delivered | A guided record, draft review and issue operation. A no-documents decision, which stays unknown until that record exists |
| ADMIN-JOURNEY-04 | Step 4 | Scan, review, accept, reject and fulfil on the evidence workspace | Those commands inside the new workflow, and an evidence waiver. Until the waiver exists, no documents is not completion |
| ADMIN-JOURNEY-05 | Step 5 | The stage `ASSESSMENT_READY` and the action `COMPLETE_ASSESSMENT` | An assessment record |
| ADMIN-JOURNEY-06 | Step 6 | Quotes, acceptance links and accepted orders | The quote operation inside the new workflow |
| ADMIN-JOURNEY-07 | Step 7 | Guided upfront settlement and Managed authorisation readiness | Removing saved-card setup as a Managed requirement, without rewriting payments here |
| ADMIN-JOURNEY-08 | Step 8 | Draft, approve, publish and stale pack handling | Pack commands inside the new workflow |
| ADMIN-JOURNEY-09 | Step 9 | Recording an external submission and an unresolved result | Live Google submission |
| ADMIN-JOURNEY-10 | Steps 10 and 11 | Case outcome, closure and reopen | Post-success Managed invoicing. Guard stays optional and must not block closure |

No migration is required. No Production setting changes.

## Readiness before documents and before a quote

Step 2 distinguishes four facts: basic business screening, verified customer email, business authority, and the legally verified purchasing establishment. Country and tax eligibility sit with the establishment.

An evidence request does not wait for the purchasing establishment. It also does not wait for Google listing verification when that verification is unavailable because the listing is suspended or missing. Assessment of that listing is not blocked by the missing verification record.

The purchasing establishment and the country and tax eligibility checks remain required before a binding paid quote is issued. Quote status `ACCEPTED` is still the authoritative acceptance. It is not treated as proof of those checks, and the existing agreement and payment gates are unchanged.

A delivered message, or an opened message, is not verified customer identity. Only the recorded email-control fact is, and that fact is not business authority.

## Evidence exceptions

The operator records the evidence needed, reviews the drafted request, and issues it. Queued, provider-accepted and delivered stay separate. A message is described as delivered only when its recorded status is `DELIVERED`.

A customer upload can be reviewed while delivery is still unconfirmed. That review does not mark the request delivered and does not accept the file. A rejected file, or a request for a replacement, returns to the evidence loop. An outstanding malware threat continues to block use of the affected file.

A genuine decision that no further documents are required needs an authoritative record this preview does not have. The request path depends on ADMIN-JOURNEY-03 and the review path depends on ADMIN-JOURNEY-04. Both stay unknown. An empty evidence list is not completion.

## Automated tests and the remaining DEV check

The acceptance row for `/cases/[id]/journey` stays `PASS` because the automated route, presentation and gate tests exercise the expected behaviour and the refusals. That status is not a real authenticated browser test on the deployed `develop` Preview.

The route gate is unchanged. This pull request's own Preview is not `develop`, so it must keep returning not-found before any case is read. The gate is not opened to make this preview reachable.

After this branch is merged to `develop`, the remaining DEV acceptance is:

1. Open the deployed `develop` Preview, which is the only Preview lane whose `VERCEL_GIT_COMMIT_REF` is `develop` and whose Supabase URL is the DEV project.
2. Sign in as staff and open `/cases/[id]/journey` for a DEV case.
3. Confirm the eleven steps render, a missing purchasing establishment does not block the evidence request, and a queued or provider-accepted message is not shown as delivered.
4. Confirm Production, and any Preview that is not `develop`, still return not-found for that route.

That browser check has not been run. It is not claimed by the automated `PASS`.
