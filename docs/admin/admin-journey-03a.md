# ADMIN-JOURNEY-03A — Guided evidence request and email draft

DEV/develop preview only. Steps 1 and 2 are unchanged. CaseFlow transitions are unchanged. This step saves an evidence requirement and can draft or review the existing evidence-request message when the preview has the settings below. It does not send email, enable Resend, schedule a worker, or mark the step complete.

Editing the customer-facing wording is **not implemented**. The message shown on Step 3 is the approved template snapshot.

## What is reused

- `admin_evidence_request_v1` through `POST /api/evidence/command` `create_request` and `cancel_request`. The request stays on the case. The case already names the customer. A retry uses the same idempotency key and the existing evidence receipt. A second save of the same open title is refused in the page before another command is sent.
- `admin_communication_command_v1` through `POST /api/operations/communications` `draft`, `review` and `cancel`. The draft uses the approved `EVIDENCE_REQUEST` template. `{specific_document}` is that one evidence request’s title. The server builds the upload link, the action id and the sender. The browser cannot supply them. Review locks the recipient, subject and body. Cancelling a draft or a reviewed message is how a replacement template draft is started. `resend_draft` stays the communications-workspace path for a failed delivery and a different verified address.
- `admin_evidence_case_v1` and `admin_case_communications_v1` for the requirements and the exact message. An incomplete or disagreeing communication history does not offer a draft or a review.
- `communicationsSendEnabled()` remains false outside production, and this step never calls `queue`. A reviewed draft stays visible with the existing reason that outgoing mail is not enabled.

The evidence and communications commands accept a request only when its `Origin` header is the request URL’s own origin and that origin is already in `authConfig().allowedOrigins`. On the DEV Preview that list is the branch hostname and the deployment hostname. A cross-host pair, an unknown host, the webhook host, and `https://admin.profilerelaunch.com` are refused on that preview. Production still accepts only `https://admin.profilerelaunch.com`. No host was added.

Saving a requirement does not contact the customer. A draft is not an approved or sent message. Provider acceptance is not delivery. Only a recorded `DELIVERED` status completes Step 3, which was already the projection rule.

## One email, one requirement

The approved template names one `evidence_requests.title`. The secure upload link is the `COMMUNICATION_ACCESS` action for that same request. Step 3 shows which open requirement is included and names any open requirement that is not. It does not describe that message as a request for every saved document. Mark reviewed is withheld while another open requirement would be left unrequested. The operator cancels the extra requirement, or cancels the draft and generates a separate email for each requirement that should still be requested. The request-to-link association is unchanged.

## DEV configuration this preview does not have yet

This pull request does not change Vercel. Draft creation and review stay unavailable until these DEV-only values exist on the Admin Preview. Do not set them in Production for this step. None of the values are shown in the page.

| Setting | Required for | Rule |
| --- | --- | --- |
| `CUSTOMER_ORIGIN` | Creating an evidence-request draft | An `https` origin with no userinfo, equal to its own URL origin. The server uses it only as the prefix of the upload path. |
| `COMMUNICATIONS_LINK_SECRET` | Creating an evidence-request draft | At least 32 characters. It stays on the server and is used to derive the access-token hash. The draft stores the hash and the upload path, not the token. |
| `COMMUNICATIONS_FROM_EMAIL` | Marking a draft reviewed | One email address, at most 254 characters. The server writes it as the sender at review. The browser cannot choose it. |

Sending stays off after those three exist. Do not set `COMMUNICATIONS_SEND_ENABLED`, `JOB_WORKER_ENABLED`, or a live `RESEND_API_KEY` for this step. `communicationsSendEnabled()` is still false on Preview, and Step 3 never calls `queue`.

Before those settings exist, this preview can still be checked for:

- the document checklist, saving a requirement, and refusing a duplicate open title
- idempotency, an ended session, and a conflict on the evidence command
- both Preview hostnames, and rejection of a cross-host, unknown, webhook, or Production origin
- the Step 3 notice that a draft or a review cannot be created yet
- the disabled-sending text on a reviewed draft, once one exists
- which requirement an email includes when several are open

These cannot be exercised until the settings exist:

- inserting an evidence-request draft, which needs `CUSTOMER_ORIGIN` and `COMMUNICATIONS_LINK_SECRET`
- the upload path inside that draft
- marking the draft reviewed, which also needs `COMMUNICATIONS_FROM_EMAIL`

## Customer-facing wording

`admin_communication_command_v1` cannot safely take custom wording:

- `draft` renders the approved template. The evidence sentence uses the request title. A subject or body on the request is not a template input, and the command drops those fields before the call.
- `review` locks `content_locked` and sets the sender from `COMMUNICATIONS_FROM_EMAIL`. It does not change the snapshot.
- The snapshot trigger rejects subject, body, recipient, upload action, and sender changes after that lock.
- `queue` refuses a different recipient, subject, or body, and this step does not call it.
- `resend_draft` renders the same template again, and only after a failed delivery to a newly verified address.

A browser field would bypass that workflow, so Step 3 does not add one. The page states that editing is not available yet.

The unapplied proposal is `proposed-admin-journey-03a-draft-wording.sql`. It would supersede an unlocked evidence-request draft with a new draft version. Staff prose would be plain text with no HTML and no URL. The existing upload path and the same evidence request would be copied. The recipient would be copied. The sender would still be set only by review. The change would be audited and idempotent. Reviewed rows would stay immutable. Default `PUBLIC`, `anon`, and `authenticated` execute would be revoked, and execute would be granted to `service_role` only. It is not in `supabase/migrations`, and this page does not call it.

## No documents required

No existing audited record means “no additional documents are required”. An evidence request is a requirement. An empty request list, a cancelled request, a draft and a reviewed draft are not that decision. Step 4 also has no waiver: silence is not accepted evidence.

The minimal proposed record is in `proposed-admin-journey-03a-no-documents.sql`. It is not applied and it is not in `supabase/migrations`. This page does not call it. The same proposal revokes execute from `PUBLIC`, `anon`, and `authenticated`, and grants execute to `service_role` only. That grant is part of the proposal, not a later follow-up, and it has not been deployed. Step 3 still completes only when the newest `EVIDENCE_REQUEST` is `DELIVERED`.

If that record were later approved:

- Step 3 could treat a current `EVIDENCE_NOT_REQUIRED` event as completion instead of a delivered email, because there would be nothing to send. This change does not do that. An empty checklist still does not complete the step.
- Step 4 would stay incomplete. The event would not accept a file and would not fulfil a request. A case with no documents could not pass evidence review until ADMIN-JOURNEY-04 defines its own waiver. This record must not be reused as that waiver.

## Still deferred

- Editing customer-facing wording before review.
- Live sending, Resend, worker scheduling and webhook delivery.
- Applying either proposed SQL file.
- ADMIN-JOURNEY-03B and ADMIN-JOURNEY-04.
