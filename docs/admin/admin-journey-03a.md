# ADMIN-JOURNEY-03A — Guided evidence request and email draft

DEV/develop preview only. Steps 1 and 2 are unchanged. CaseFlow transitions are unchanged. This step saves an evidence requirement and drafts or reviews the existing evidence-request message. It does not send email, enable Resend, schedule a worker, or mark the step complete.

## What is reused

- `admin_evidence_request_v1` through `POST /api/evidence/command` `create_request` and `cancel_request`. The request stays on the case. The case already names the customer. A retry uses the same idempotency key and the existing evidence receipt. A second save of the same open title is refused in the page before another command is sent.
- `admin_communication_command_v1` through `POST /api/operations/communications` `draft`, `review` and `cancel`. The draft uses the approved `EVIDENCE_REQUEST` template. The server builds the upload link, the action id and the sender. The browser cannot supply them. Review locks the recipient, subject and body. Cancelling a draft or a reviewed message is how a replacement draft is started. `resend_draft` stays the communications-workspace path for a failed delivery and a different verified address.
- `admin_evidence_case_v1` and `admin_case_communications_v1` for the requirements and the exact message. An incomplete or disagreeing communication history does not offer a draft or a review.
- `communicationsSendEnabled()` remains false outside production, and this step never calls `queue`. A reviewed draft stays visible with the existing reason that outgoing mail is not enabled.

Saving a requirement does not contact the customer. A draft is not an approved or sent message. Provider acceptance is not delivery. Only a recorded `DELIVERED` status completes Step 3, which was already the projection rule.

## No documents required

No existing audited record means “no additional documents are required”. An evidence request is a requirement. An empty request list, a cancelled request, a draft and a reviewed draft are not that decision. Step 4 also has no waiver: silence is not accepted evidence.

The minimal proposed record is in `proposed-admin-journey-03a-no-documents.sql`. It is not applied, it is not in `supabase/migrations`, and this page does not call it.

If that record were later approved:

- Step 3 could treat a current `EVIDENCE_NOT_REQUIRED` event as completion instead of a delivered email, because there would be nothing to send. This change does not do that. An empty checklist still does not complete the step.
- Step 4 would stay incomplete. The event would not accept a file and would not fulfil a request. A case with no documents could not pass evidence review until ADMIN-JOURNEY-04 defines its own waiver. This record must not be reused as that waiver.

## Still deferred

- Live sending, Resend, worker scheduling and webhook delivery.
- ADMIN-JOURNEY-03B and ADMIN-JOURNEY-04.
- Production application of the proposed no-documents record.
