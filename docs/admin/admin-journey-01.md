# ADMIN-JOURNEY-01 — guided case workflow foundation

This is a presentation layer for a future eleven-step operator workflow. It does not store a second workflow, does not change `work_stage`, and does not perform the steps. The nine-phase case cockpit remains the working Admin page.

The preview is `/cases/[id]/journey`. It is available only when `VERCEL_ENV` is `preview`, `VERCEL_GIT_COMMIT_REF` is `develop`, and `SUPABASE_URL` is the DEV project `https://rmzozuiamjcclvtgutgd.supabase.co`. Production and every other Preview branch receive not-found before any case is read. No new environment variable is required.

## Source of truth

`presentCaseJourney` reads `CaseFlowFacts` and `resolveCaseFlow`. A step is `COMPLETED` only from the record in the completion column. The technical stage can choose where the operator is standing. It cannot turn an earlier step green. Where the record does not exist, the step is `UNKNOWN`, `WAITING`, `NEEDS_ATTENTION`, or `LOCKED`.

| Step | Completes only when | Existing record | Still missing |
| --- | --- | --- | --- |
| 1. Case Received | The latest `INTAKE_REVIEW` work event is `REVIEWED` and is not behind a reopen | The case row, the case message, and the current customer, business and location records | A confirmation email is not that review. The decision function is proposed and is not applied to DEV until it is approved |
| 2. Business, Profile & Contact Verification | The latest `BUSINESS_VERIFICATION` work event is `PRELIMINARY_COMPLETE`, with no material discrepancy, and is not behind a reopen or a revoked membership | Verified customer email and business-membership authority, separately. They are shown and are not created by this step | The purchasing establishment and tax eligibility stay quote checks. A website, Companies House registration, or accessible Google listing is not required. The decision function is proposed and is not applied to DEV until it is approved |
| 3. Review Request & Request Documents | An evidence request exists, and either the newest `EVIDENCE_REQUEST` message is `DELIVERED` or a stored file is linked to a live evidence request | `summariseEvidence`, `evidenceContactState` and `linkedStoredUpload` | The preview does not record the need, review the draft, or issue the message. Queued, provider-accepted and delivered stay separate. A linked file does not write `DELIVERED` and does not accept the file. A no-documents decision is an ADMIN-JOURNEY-03 record and is unknown here |
| 4. Evidence Review | At least one accepted version, no live blocked or pending file, and no open request | Evidence version and request states | Upload is not acceptance. A rejected file returns to the evidence loop. An outstanding threat blocks that file. A no-documents waiver is an ADMIN-JOURNEY-04 record and is unknown here |
| 5. Assessment & Recommended Path | The latest approved assessment is current, recommends Guided or Managed, and still matches the case, profile and evidence | `case_assessments` | A draft, a review, a stale approval, a reopen, or the selected service track does not complete it. The recommendation is not an agreement. See `docs/admin/admin-journey-05.md` |
| 6. Quote & Contract Acceptance | Quote status `ACCEPTED` on a complete quote list, and that quote is the only one at that rank | `summariseCommercial` and the existing quote commands | A draft, an open link, a declined quote and an expired quote are not acceptance. A recommended pathway is not the customer's agreement and does not change the service track. Issuing a binding paid quote still requires the purchasing establishment and country and tax eligibility, which this projection does not infer |
| 7. Service Activation | Guided: the accepted quote's order id is the only upfront order, that order is accepted and paid, the obligation is `PAID`, and a receipt is recorded. Managed: that quote's order id is the only success-fee order, plus agreement, business authority, case permission, Google manager access, and database authorisation readiness | `summarisePayment`, the existing payment-link and authorisation commands | Checkout, a quote, a different order, a saved card, or the selected track is not activation. A revoked permission or disagreeing records keep it unfinished. See `docs/admin/admin-journey-07.md` |
| 8. Case Preparation & Approval | The current pack is approved, published and non-empty, no other approved pack is still published, and no live pack is stale | The existing pack commands and `getPreparedPackCase` | A draft, an unpublished approval, a stale pack, a superseded pack, another published pack, or a conflicting record is not completion. Approval does not publish, and publication does not submit to Google. See `docs/admin/admin-journey-08.md` |
| 9. Submission & Tracking | At least one submission, and every submission has a decision or a withdrawal | The existing external-submission commands on the case | An open attempt is still waiting. Recording an attempt does not submit it to Google. A conflicting record or the wrong submitting party is not completion. See `docs/admin/admin-journey-09.md` |
| 10. Outcome Verification & Billing | Guided: a recorded outcome, the linked upfront order `ACCEPTED_AWAITING_PAYMENT`, the obligation `PAID`, and a receipt. Managed: provider-confirmed settlement after a qualifying outcome, or a non-qualifying outcome with no success fee | The existing outcome, order, obligation, invoice and receipt records, and `record_outcome` | Recording an outcome does not close the case or approve a fee. The migration is not applied to DEV or Production. See `docs/admin/admin-journey-10.md` |
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
| ADMIN-JOURNEY-02 | Steps 1 and 2 | Case intake, client and business records, email verification, membership authority, `case_work_events` and `admin_audit_events` | The two decision functions are applied on DEV only as `20261016175917` and are not applied to Production. The purchasing establishment remains a quote check |
| ADMIN-JOURNEY-03 | Step 3 | Evidence requests and the communications lifecycle, including queued, provider-accepted and delivered | A guided record, draft review and issue operation. A no-documents decision, which stays unknown until that record exists |
| ADMIN-JOURNEY-04 | Step 4 | Scan, review, accept, reject and fulfil on the evidence workspace | Those commands inside the new workflow, and an evidence waiver. Until the waiver exists, no documents is not completion |
| ADMIN-JOURNEY-05 | Step 5 | The assessment record and its draft, review and approve commands | Selecting the service track. The recommendation is not an agreement. The DEV apply is recorded in `docs/admin/admin-journey-05.md` |
| ADMIN-JOURNEY-06 | Step 6 | The existing quote, tax, offer and acceptance-link commands | Payment, service activation and authorisation. Those stay on Step 7. See `docs/admin/admin-journey-06.md` |
| ADMIN-JOURNEY-07 | Step 7 | The existing upfront payment link and Managed authorisation commands | Saved-card setup, success-fee approval, pack preparation and Google submission. See `docs/admin/admin-journey-07.md` |
| ADMIN-JOURNEY-08 | Step 8 | The existing draft, approve, publish, unpublish and stale-pack commands | Google submission. See `docs/admin/admin-journey-08.md` |
| ADMIN-JOURNEY-09 | Step 9 | The existing external-submission and decision commands | Live Google submission. See `docs/admin/admin-journey-09.md` |
| ADMIN-JOURNEY-10 | Step 10 | The outcome record, upfront receipt, success-fee approval and TEST-MODE hosted invoice | Closure stays on Step 11. The record_outcome migration is applied to DEV only. See `docs/admin/admin-journey-10.md` |
| ADMIN-JOURNEY-11 | Step 11 | Case status `CLOSED` or `CANCELLED`, and reopen | Guard stays optional and must not block closure |

ADMIN-JOURNEY-10B adds `20261019183000_admin_journey_10b_record_outcome_v1.sql`. That migration is applied to DEV only, not Production. No Production setting changes.

## Readiness before documents and before a quote

Step 2 distinguishes four facts: basic business screening, verified customer email, business authority, and the legally verified purchasing establishment. Country and tax eligibility sit with the establishment.

An evidence request does not wait for the purchasing establishment. It also does not wait for Google listing verification when that verification is unavailable because the listing is suspended or missing. Assessment of that listing is not blocked by the missing verification record.

The purchasing establishment and the country and tax eligibility checks remain required before a binding paid quote is issued. Quote status `ACCEPTED` is still the authoritative acceptance. It is not treated as proof of those checks, and the existing agreement and payment gates are unchanged.

A delivered message, or an opened message, is not verified customer identity. Only the recorded email-control fact is, and that fact is not business authority.

## Evidence exceptions

The operator records the evidence needed, reviews the drafted request, and issues it. Queued, provider-accepted and delivered stay separate. A message is described as delivered only when its recorded status is `DELIVERED`. Provider acceptance does not create that status.

A stored file linked to a live evidence request is a response, including while the technical stage is still Initial Review. That response opens evidence review without writing `DELIVERED`. A pending malware scan can be checked there. It is not acceptance. A rejected file, or a request for a replacement, returns to the evidence loop. An outstanding malware threat continues to block use of the affected file. Invalid content is not acceptance either.

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
