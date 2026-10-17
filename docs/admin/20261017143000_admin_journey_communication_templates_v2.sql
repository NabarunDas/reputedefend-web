-- ADMIN-JOURNEY-03C customer communication templates, version 2.
--
-- UNAPPLIED. Do not run this against DEV or Production from the application change.
-- It is not a file under supabase/migrations and it is not part of the recovery manifest.
--
-- Version 1 rows are left untouched. protect_communication_template_v1 rejects an
-- insert whose status is anything other than DRAFT, and it rejects changes to
-- approved subject or body text. The draft command selects
-- status = 'APPROVED' ORDER BY version DESC LIMIT 1, so these rows are not used
-- until a separate review approves them.
--
-- Placeholders are only the ones admin_communication_command_core_v1 already
-- supplies: evidence requests receive case_ref, specific_document and upload_url;
-- case updates receive case_ref, fact, effect and next_step.
-- specific_document is the title of one evidence request. Several checklist
-- items saved together are already joined with '; ' in that title.
-- render_template_v1 substitutes the whole title. It does not turn the
-- semicolon list into bullets. One rendered message still has one request
-- and one trailing upload link.
-- This file does not update public.communications. Drafted, reviewed and
-- queued snapshots stay as stored.

BEGIN;

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES (
  'EVIDENCE_REQUEST',
  2,
  'Evidence request',
  'Supporting information for your enquiry — {case_ref}',
  E'Hello,\n\nThank you for contacting ProfileRelaunch about your Google Business Profile.\n\nWe\'re reviewing your enquiry, reference {case_ref}. To help us understand the issue and advise you on the next steps, could you please provide the following supporting information?\n\n{specific_document}\n\nPlease upload the requested information using the secure link at the end of this email.\n\nIf you\'re unsure what to provide, you can contact our team through the ProfileRelaunch website.\n\nFor your security, please never share passwords, verification codes or sign-in credentials.\n\nKind regards,\n\nProfileRelaunch Support Team\n\nSecure document-upload link:\n\n{upload_url}',
  'DRAFT',
  'Proposed customer wording. Not approved. Version 1 remains the live approved template.'
), (
  'CASE_UPDATE',
  2,
  'Case update',
  'An update on your enquiry — {case_ref}',
  E'Hello,\n\nHere is an update on your enquiry, reference {case_ref}.\n\n{fact}\n\n{effect}\n\nWhat happens next:\n\n{next_step}\n\nKind regards,\n\nProfileRelaunch Support Team',
  'DRAFT',
  'Proposed customer wording. Not approved. Version 1 remains the live approved template.'
);

COMMIT;
