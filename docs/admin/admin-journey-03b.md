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

`docs/admin/20261016233000_admin_journey_evidence_draft_wording_v1.sql` is the migration-ready change. It is not in `supabase/migrations`, and it has not been applied to DEV or Production. The local communications database test applies it to a disposable PGlite database.

It corrects the earlier wording proposal: plain-text checks are stricter, the upload path must occur once and must name the same action, and a superseded draft cannot be approved. Execute is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted to `service_role`, in that same file.

Until that migration is approved and applied, saving wording on the preview returns an unavailable result. Generating a draft, reading it, and the disabled-sending state can still be checked. `CUSTOMER_ORIGIN`, `COMMUNICATIONS_LINK_SECRET`, and `COMMUNICATIONS_FROM_EMAIL` are still required before a draft can be created or approved. Sending stays off.

## Still deferred

- Applying the wording migration.
- Live sending, Resend, the worker, and webhooks.
- The no-documents decision.
- ADMIN-JOURNEY-04.
