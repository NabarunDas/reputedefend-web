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
-- specific_document is the one evidence-request title. One rendered message
-- still names one request and one upload link.

BEGIN;

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES (
  'EVIDENCE_REQUEST',
  2,
  'Evidence request',
  'Documents for {case_ref}',
  E'Hello,\n\nThank you for contacting us about case {case_ref}.\n\nPlease send this document:\n\n{specific_document}\n\nWe will review what you send. This message does not confirm a Google outcome, a payment, or a time for that review.\n\nThe secure upload page below is only for this request.\n\nKind regards,\n\nProfileRelaunch\n\n{upload_url}',
  'DRAFT',
  'Proposed customer wording. Not approved. Version 1 remains the live approved template.'
), (
  'CASE_UPDATE',
  2,
  'Case update',
  'An update on {case_ref}',
  E'Hello,\n\nHere is an update on case {case_ref}.\n\n{fact}\n\n{effect}\n\nWhat happens next:\n\n{next_step}\n\nKind regards,\n\nProfileRelaunch',
  'DRAFT',
  'Proposed customer wording. Not approved. Version 1 remains the live approved template.'
);

COMMIT;
