# COMMS-BRAND-01 — Professional branded customer email

DEV preview only. No email was sent. The version 3 template SQL was applied to DEV as `20261017210826` and inserted `EVIDENCE_REQUEST` version 3 as `DRAFT`. It is not approved. Version 2 stays the approved evidence-request template. Resend Receiving, inbound webhooks, MX records, Production and sending stay off.

## Shared renderer

`lib/email/customer-message.ts` renders email-client HTML and the matching plain text.

- The logo is the approved public file `https://profilerelaunch.com/brand/profile-relaunch-logo.png`, with alt text and the visible word ProfileRelaunch so a blocked image still shows the brand.
- Colours and type come from `lib/brand.ts`.
- Layout uses tables and inline CSS, with a 600px container and a small-screen rule.
- Paragraphs, headings, real `<ul>` lists and a text link styled as a button are the only content blocks.
- A button address must be a server-generated `https://host/action/{uuid}` with no query and no `#t=` token.
- The footer carries the case reference when one is known, the website, and one security reminder.
- Customer text is escaped. A script, a `javascript:` address or a token in the button fails closed.

The Admin preview uses this renderer. Editing stays plain text. The branded HTML is regenerated from that text, the saved requirement and the existing upload link before approval. The browser cannot submit HTML or a Reply-To address.

## Evidence request, version 3

The statement applied to DEV is `supabase/migrations/20261017210826_comms_brand_evidence_request_v3_dev.sql`. It is byte-identical to `docs/admin/20261017170000_comms_brand_evidence_request_v3.sql` (34433 characters). The applied header still says unapplied; those words are the applied text.

Do not replay it on DEV. Do not apply it to Production. Do not set the inserted row to `APPROVED`.

It inserts `EVIDENCE_REQUEST` version 3 as `DRAFT` only. It does not update version 1 or version 2. The draft command still selects `status = 'APPROVED' ORDER BY version DESC LIMIT 1`.

The subject is `Supporting documents for your ProfileRelaunch enquiry — {case_ref}`. The placeholders remain `case_ref`, `specific_document` and `upload_url`. A saved requirement title joined with `; ` is split into one bullet per selected name by the new insert trigger, only when `template_version >= 3`. `render_template_v1` itself still cannot loop. This file does not rewrite stored titles or existing communications.

A vague name such as “Other evidence” makes that insert fail. One message still names one evidence request and one upload link. The snapshot stores the action URL without the secret token. The existing send worker adds `#t=` only while sending, and sending is still disabled.

The default copy asks the customer to use the website if they are unsure. It does not say “simply reply”, because no monitored mailbox is configured for this channel.

A newly inserted version 3 draft uses the preferred subject. When an operator later edits the plain text, the trigger keeps that saved subject if it already contains the case reference. If it does not, the case reference is appended while the subject still fits in 200 characters. The document list, the upload button and the sign-off stay server-controlled and are appended after the edited introduction.

## Reply-To

`COMMUNICATIONS_REPLY_TO_EMAIL` is optional. When it is a single valid mailbox, the TypeScript evidence-request composer may say that a reply will be read. When it is absent, that sentence is omitted. The Admin sign-in address and `COMMUNICATIONS_FROM_EMAIL` are not treated as that mailbox.

The browser payload fields `replyTo` and `replyToAddress` are removed before the communication command. The version 3 insert trigger clears `reply_to_address` on a new version 3 draft. It does not write a mailbox of its own.

Case-received and Relaunch Guard receipts already set Reply-To to their own From address and already invite a reply. This change does not alter those messages.

Until inbound conversations are activated, a person reads any reply in the existing Google Workspace mailbox. They match the case reference in the subject and record the correspondence on that case. Do not change MX records. Do not enable Resend Receiving or `COMMUNICATIONS_INBOUND_ENABLED`.

## What this change does not replace

| Communication | Where it lives | This change |
| --- | --- | --- |
| Evidence request, versions 1 and 2 | `communication_templates`, approved | Not modified. Version 2 remains the live template. |
| Evidence request, version 3 | Unapplied SQL above | Draft insert and branded snapshot trigger. Not approved. |
| Case update | `CASE_UPDATE` version 1, and the unapplied version 2 draft | Not modified. Follow-up: render `{fact}`, `{effect}` and `{next_step}` through the shared layout after a separate template approval. |
| Conversation reply | `CONVERSATION_REPLY` | Not modified. Reply-To stays the opaque inbound alias. Follow-up: wrap `{reply_body}` only after the composer shows the wrapped result. |
| Get Help acknowledgement | `lib/enquiry-email.ts` | Now uses the shared layout. The commercial sentence is unchanged. It does not ask for a reply. |
| Case-received receipt | `lib/cases/received-email.ts` | Unchanged. It already has the logo, panels, security reminder and a monitored reply invitation. |
| Relaunch Guard setup receipt | `lib/monitoring/received-email.ts` | Unchanged, for the same reason. |
| Guard alert | `GUARD_ALERT` version 1 | Not modified. Follow-up: same layout, without an outcome or payment claim. |
| Customer portal pages | Agreement, billing and sign-in notices | Not modified. They are pages, not outbound templates. |
| Authentication and verification email | Supabase Auth | Outside this repository. Branding has to be configured in the Auth provider. Do not change it here. |

Reviewed, queued and sent communications stay snapshots. Approving version 3 later does not rewrite them.

## DEV activation

DEV already received this insert as `20261017210826`. Repeating that apply would replay it. Version 3 remains `DRAFT`.

1. The reviewed statement is `supabase/migrations/20261017210826_comms_brand_evidence_request_v3_dev.sql`. It has already been applied to DEV.
2. Do not apply it again, and do not apply it to Production. Version 3 was inserted as `DRAFT`. Do not set it to `APPROVED` in the file, and do not retire version 2.
3. Approve it with the existing `approve_template_draft` action after an Admin sign-in from the last 30 minutes. That approval does not change version 2. Until it happens, new drafts keep using version 2.
4. Confirm a newly generated evidence-request draft is template version 3, that its HTML contains one list and one action URL, and that the stored body has no `#t=`.
5. Review the branded preview, edit the plain text, save, and approve without sending.
6. Leave every existing communication snapshot as stored.
7. Set `COMMUNICATIONS_REPLY_TO_EMAIL` only after a person confirms that the mailbox is monitored in Google Workspace. Until then, do not tell the customer to reply.
