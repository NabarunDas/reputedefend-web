# ADMIN-JOURNEY-03C — Customer communication quality

DEV preview only. No template row was approved or updated. No email was sent. Step 4 was not started.

Version 1 templates in `admin_private.communication_templates` stay as they are. The proposal below inserts version 2 as `DRAFT` only. The draft command still selects `status = 'APPROVED' ORDER BY version DESC LIMIT 1`, so live evidence requests and case updates keep using version 1 until a separate review approves version 2.

## Unapplied SQL

`docs/admin/20261017143000_admin_journey_communication_templates_v2.sql`

Do not apply it from this change. It is not under `supabase/migrations`.

The evidence-request subject is `Supporting information for your enquiry — {case_ref}`. The body greets the customer, names the enquiry reference, asks for the following supporting information, puts `{specific_document}` in its own paragraph, and asks the customer to use the secure link. If they are unsure, it points them to the ProfileRelaunch website. It asks them never to share passwords, verification codes or sign-in credentials. It signs off as ProfileRelaunch Support Team. The last paragraph is the label `Secure document-upload link:` and the body ends with the one `{upload_url}`.

The link stays last, and it appears once, because the existing wording command copies that trailing link and will not treat a link in the middle as the secure upload link. The copy does not ask the customer to reply: the evidence-request sender is not confirmed here as a monitored reply mailbox. It does not say the message was delivered, and it does not mention payment, a Google outcome, reinstatement, or a review time.

`{specific_document}` remains the title of one evidence request. One message still has one upload link. Several checklist items saved together are already joined with `; ` in that title. `render_template_v1` substitutes the whole title. It does not turn `Shop licence; Proof of operating location` into a bulleted list, and the preview keeps that title as one paragraph. This proposal does not rewrite saved request titles to add bullet characters. The surrounding sentence, “the following supporting information”, stays grammatical for one name and for several names joined in that title.

The case-update subject is `An update on your enquiry — {case_ref}`. The body uses only `{case_ref}`, `{fact}`, `{effect}` and `{next_step}`, in separate paragraphs, and signs off as ProfileRelaunch Support Team. It does not add a defensive disclaimer.

The Get Help acknowledgement in `lib/enquiry-email.ts` uses the same greeting and sign-off. It says the form has been received and will be reviewed, and it keeps the commercial distinction that sending the form does not, by itself, create a client or paid-service relationship. It does not ask the customer to reply, and it does not say an outcome is confirmed or refused.

## What the journey shows

Step 1 shows the submitted email and whether it is verified. Verified requires the customer record and the case projection to agree. A matching format, a delivered message, or an opened message does not verify an address. The intake review can still be recorded.

Step 2 repeats that status and, when verification is outstanding, points to the existing “Record a contact verification” action on the customer record. That action already asks for evidence. This workflow does not add a checkbox and does not write a verification. If the customer record cannot be opened, the screen says so.

A verified address that the communications read reports as suppressed is shown as suppressed. The page does not clear the suppression. If that read is unavailable, a verified address is not described as clear to email.

An evidence request titled “Other evidence”, or another vague name, cannot be saved as the customer-facing title and cannot be used to prepare the email. An existing saved row with that title is left unchanged. Staff cancel it and save a specific name. The description stored on the request is not what the template shows; the title is.

The draft preview shows recipient, subject and the message, with the upload link once. Edit email opens the subject and message. Cancel restores the saved wording and does not write. Save changes uses the existing wording command. Approval stays hidden while an edit is open, unsaved, uncertain, or waiting on the saved version. An approved message stays read-only.

## Other active customer communications

| Communication | Where it lives | This change | Further proposal |
| --- | --- | --- | --- |
| Evidence request, version 1 | `communication_templates` `EVIDENCE_REQUEST` version 1, status approved | Not modified. Still the live template. | Version 2 draft insert in the unapplied SQL, using the wording above. |
| Case update, version 1 | `CASE_UPDATE` version 1 | Not modified. | Version 2 draft insert in the same SQL. Subject `An update on your enquiry — {case_ref}`. |
| Get Help acknowledgement | `lib/enquiry-email.ts`, sent at enquiry time, not stored as a template version | Greeting, sign-off, and the commercial sentence that sending the form does not, by itself, create a client or paid-service relationship. It does not ask the customer to reply. | None in the database. |
| Case-received receipt | `lib/cases/received-email.ts` | Unchanged. It already greets, names the case, separates the next step, refuses passwords and codes, and invites a reply. `replyTo` is the from address. | No versioned migration. A later edit would change the next receipt, not a stored snapshot. |
| Relaunch Guard setup receipt | `lib/monitoring/received-email.ts` | Unchanged, for the same reason. It already says monitoring is not active yet. | No versioned migration. |
| Conversation reply, version 1 | `CONVERSATION_REPLY` version 1: subject `Re: {subject}`, body `This is a ProfileRelaunch conversation reply.` plus `{reply_body}` | Not modified. `{reply_body}` is staff text, so a wrapper greeting could duplicate a greeting the staff member already wrote. | A later draft insert could add a sign-off only after the reply composer shows the wrapped result. Not in this SQL. |
| Guard alert, version 1 | `GUARD_ALERT` version 1: `{fact}`, `{effect}`, `{next_step}` | Not modified. | A later draft insert could add the same greeting and sign-off as the case update, still without an outcome or payment claim. Not in this SQL. |
| Customer action and portal one-time code | Supabase Auth for staff sign-in. Customer actions send a code only after the customer asks, to the masked address on that action. | Not modified. The code is not requested back by email, and it is not placed in a link. | Auth template text is outside this repository. Do not change it here. |
| Customer portal pages | Agreement and billing copy already says opening a link or verifying a code is not acceptance. | Not modified. | No email migration. |

Reviewed, queued and sent communications are snapshots. This change does not update them. A drafted message also keeps the subject and body copied onto its row. Approving version 2 later does not rewrite those snapshots.

## DEV activation

This change does not apply the SQL and does not approve version 2. Sending, Resend and Production stay off. After an independent review, the safe sequence is:

1. Independently approve `docs/admin/20261017143000_admin_journey_communication_templates_v2.sql`.
2. Apply that file to DEV only. Both inserts are version 2 with status `DRAFT`. Do not edit the statement to set `APPROVED`, and do not retire version 1. Do not also create a template draft for the same key: that command assigns the next version and would add a second draft.
3. Review the proposed template in Admin Settings → Templates. Approve it with the existing `approve_template_draft` action. That action requires the row to still be `DRAFT`, the record version to match, the text to pass `template_text_valid_v1`, and the staff session to have been created within the last five minutes. It sets that row to `APPROVED`. It does not change version 1.
4. Confirm a newly generated evidence-request draft uses approved version 2. The draft command selects `status = 'APPROVED' ORDER BY version DESC LIMIT 1`. Until step 3, that selection remains version 1.
5. Test the email preview, Edit email, Save changes, Cancel editing and Approve email on that new draft. Do not send it.
6. Leave every existing drafted, reviewed and queued communication as stored. Their subject, body and template version are the snapshot taken when they were created.
