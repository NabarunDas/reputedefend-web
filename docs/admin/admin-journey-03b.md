# ADMIN-JOURNEY-03B — Edit the evidence email before approval

DEV/develop preview only. The employee generates the evidence-request email, edits the subject and message, then approves the saved wording. Approving does not send the email.

## What is reused

- The existing evidence request and the existing `EVIDENCE_REQUEST` draft. One draft still names one open request and one `COMMUNICATION_ACCESS` upload link.
- `admin_communication_command_v1` `review` still records the approval, sets the server sender, and locks that version. This step never calls `queue`.
- A later replacement is still a new draft. The approved wording is not edited in place.

## Wording

`POST /api/cases/journey/wording` is available only on the develop Preview. It calls `admin_communication_revise_evidence_draft_v1`. The browser may send a plain subject and message. It cannot send the recipient, the sender, HTML, or the upload link. The function copies the recipient, copies the existing upload path, and appends that path to the message. The token is not stored in the email.

The previous draft row stays in the ledger. Its wording cannot later be rewritten, approved, or queued. A retry uses the same idempotency key. An older version cannot replace a newer one.

## Several document requests

Saving the checklist still creates one evidence request. If other open requests already exist, the page names the request this email covers and the requests it does not. Approving does not cancel or merge those requests, and the upload link stays limited to the covered request. A request that should not be asked for is cancelled only by the existing cancel action, with a note.

## Migration

`supabase/migrations/20261017111446_admin_journey_03b_evidence_draft_wording_dev_v1.sql` is the statement already applied to DEV as `20261017111446`. It is the same bytes as `docs/admin/20261016233000_admin_journey_evidence_draft_wording_v1.sql`. It has not been replayed and it has not been applied to Production. The local communications database test still applies the docs copy to a disposable PGlite database.

It corrects the earlier wording proposal: plain-text checks are stricter, the upload path must occur once and must name the same action, and a superseded row cannot be rewritten or moved into reviewed or queued. A message that was already queued, then superseded by the existing replacement draft, can still receive provider delivery updates, including a first RFC Message-ID. Execute is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted to `service_role`, in that same file.

The wording function is applied on DEV and is not applied on Production. `CUSTOMER_ORIGIN`, `COMMUNICATIONS_LINK_SECRET`, and `COMMUNICATIONS_FROM_EMAIL` are still required before a draft can be created or approved. Sending stays off.

## Still deferred

- Replaying the wording migration, or applying it to Production.
- Live sending, Resend, the worker, and webhooks.
- The no-documents decision.
- ADMIN-JOURNEY-04.
