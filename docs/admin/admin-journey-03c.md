# ADMIN-JOURNEY-03C — Customer communication quality

DEV preview only. No template row was approved or updated. No email was sent. Step 4 was not started.

Version 1 templates in `admin_private.communication_templates` stay as they are. The proposal below inserts version 2 as `DRAFT` only. The draft command still selects `status = 'APPROVED' ORDER BY version DESC LIMIT 1`, so live evidence requests and case updates keep using version 1 until a separate review approves version 2.

## Unapplied SQL

`docs/admin/20261017143000_admin_journey_communication_templates_v2.sql`

Do not apply it from this change. It is not under `supabase/migrations`.

The evidence-request body greets the customer, names case `{case_ref}`, puts the one `{specific_document}` on its own line, signs off as ProfileRelaunch, and ends with the one `{upload_url}`. The link stays last because the existing wording command copies that trailing link and will not treat a link in the middle as the secure upload link. It does not invite a reply: the evidence-request sender is not confirmed here as a monitored reply mailbox. It does not mention payment, a Google outcome, or a review time. `{specific_document}` remains the title of one evidence request. One message still has one upload link. A title saved as several checklist items joined with `; ` is still one request, not several emails.

The case-update body uses only `{case_ref}`, `{fact}`, `{effect}` and `{next_step}`.

There was no separate agreed sample in the repository. The wording follows the customer-communication standard for this change: a greeting, plain paragraphs, one specific document, the secure link alone, and a sign-off, without a promise.

## What the journey shows

Step 1 shows the submitted email and whether it is verified. Verified requires the customer record and the case projection to agree. A matching format, a delivered message, or an opened message does not verify an address. The intake review can still be recorded.

Step 2 repeats that status and, when verification is outstanding, points to the existing “Record a contact verification” action on the customer record. That action already asks for evidence. This workflow does not add a checkbox and does not write a verification. If the customer record cannot be opened, the screen says so.

A verified address that the communications read reports as suppressed is shown as suppressed. The page does not clear the suppression. If that read is unavailable, a verified address is not described as clear to email.

An evidence request titled “Other evidence”, or another vague name, cannot be saved as the customer-facing title and cannot be used to prepare the email. An existing saved row with that title is left unchanged. Staff cancel it and save a specific name. The description stored on the request is not what the template shows; the title is.

The draft preview shows recipient, subject and the message, with the upload link once. Edit email opens the subject and message. Cancel restores the saved wording and does not write. Save changes uses the existing wording command. Approval stays hidden while an edit is open, unsaved, uncertain, or waiting on the saved version. An approved message stays read-only.

## Other active customer communications

| Communication | Where it lives | This change | Further proposal |
| --- | --- | --- | --- |
| Evidence request, version 1 | `communication_templates` `EVIDENCE_REQUEST` version 1, status approved | Not modified. Still the live template. | Version 2 draft insert in the unapplied SQL. |
| Case update, version 1 | `CASE_UPDATE` version 1 | Not modified. | Version 2 draft insert in the same SQL. |
| Get Help acknowledgement | `lib/enquiry-email.ts`, sent at enquiry time, not stored as a template version | Greeting, sign-off, and a sentence that submitting the form does not confirm an outcome. It does not ask the customer to reply. | None in the database. |
| Case-received receipt | `lib/cases/received-email.ts` | Unchanged. It already greets, names the case, separates the next step, refuses passwords and codes, and invites a reply. `replyTo` is the from address. | No versioned migration. A later edit would change the next receipt, not a stored snapshot. |
| Relaunch Guard setup receipt | `lib/monitoring/received-email.ts` | Unchanged, for the same reason. It already says monitoring is not active yet. | No versioned migration. |
| Conversation reply, version 1 | `CONVERSATION_REPLY` version 1: subject `Re: {subject}`, body `This is a ProfileRelaunch conversation reply.` plus `{reply_body}` | Not modified. `{reply_body}` is staff text, so a wrapper greeting could duplicate a greeting the staff member already wrote. | A later draft insert could add a sign-off only after the reply composer shows the wrapped result. Not in this SQL. |
| Guard alert, version 1 | `GUARD_ALERT` version 1: `{fact}`, `{effect}`, `{next_step}` | Not modified. | A later draft insert could add the same greeting and sign-off as the case update, still without an outcome or payment claim. Not in this SQL. |
| Customer action and portal one-time code | Supabase Auth for staff sign-in. Customer actions send a code only after the customer asks, to the masked address on that action. | Not modified. The code is not requested back by email, and it is not placed in a link. | Auth template text is outside this repository. Do not change it here. |
| Customer portal pages | Agreement and billing copy already says opening a link or verifying a code is not acceptance. | Not modified. | No email migration. |

Reviewed, queued and sent communications are snapshots. This change does not update them.
