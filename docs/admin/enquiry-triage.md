# Enquiries and triage — step 6

Built from main after merging PR #88. The only operator remains admin@profilerelaunch.com.

## Operating the queue

Open Enquiries in the admin navigation. Contact and homepage submissions are saved before notification emails are attempted. Formal Get help submissions keep their existing case intake path and are not copied into this queue. Historical email-only enquiries are not automatically backfilled.

Search names, business names, phone numbers or email addresses. Filter by status, assignment, overdue follow-up or email attention. Pages contain 50 records with a stable timestamp/UUID cursor. Open a record to read its original message, notification outcomes and latest 100 history entries.

Record phone enquiries with the caller's details and a note. This creates a queue record without sending an email or creating a verified customer identity. Assign an enquiry to the sole admin, move it through New, Open, Waiting, Closed or Spam, and reopen closed/spam records when needed. Waiting requires a next action and due date. Date entry is explicitly UTC; displayed dates use UK time. Assignment and changes are audited.

## Converting an enquiry

First check existing client, business, location and work records to avoid creating duplicate work from separate enquiries. Create missing client/location records through Clients & businesses. Search and select the existing client and location in the conversion form, choose recovery, review protection or monitoring, and record why the work is being opened.

A conversion creates exactly one linked work record. Retries of the same conversion return the existing result; a conflicting conversion is rejected. Recovery and review cases start at RECEIVED. Monitoring requests start at REQUESTED for the selected single location. Monitoring requires the actual terms acceptance date and supporting evidence. Conversion does not invent consent, verify ownership, take payment or activate monitoring. Detailed case handling follows in step 7; monitoring activation remains step 15.

## Delivery and failure handling

A public success response means the enquiry is stored. Internal and optional acknowledgement emails are then attempted with bounded timeouts. Sent means accepted by the email provider, not confirmed inbox delivery. Failed and Not confirmed outcomes remain visible to the admin. If email fails, the saved enquiry is retained and the customer does not need to resubmit it.

The existing ENQUIRY_SEND_CUSTOMER_ACK setting controls acknowledgements. No new environment variables are required; both applications need their existing server-only Supabase configuration, and marketing needs its existing email configuration. Production intake fails closed if storage is unavailable. Development simulation is explicitly marked. An old cached form without a submission key must be reloaded.

Durable email jobs, delivery webhooks and controlled retry tools belong to steps 10–11. This stage does not automatically retry an unknown delivery, which could duplicate an email. Review the saved contact details and use the agreed telephone fallback where necessary. No customer email or call is sent by an admin triage or conversion command.

## Security and consistency

New tables have RLS enabled with direct access revoked from anon, authenticated and service_role. Fixed, server-only RPCs expose the required operations. Admin RPCs independently validate the opaque session. HTTP mutations enforce exact Origin, content type, bounded request size, explicit payload keys and UUID request keys. Private helpers use fixed search paths and no public execute grants.

Intake and phone creation deduplicate by submission key and payload fingerprint. Triage uses record versions to prevent lost updates. Conversion locks the enquiry. Work creation, its history and the audit entry commit together; audit failure rolls back the work. Public duplicate responses expose no stored contact details or internal IDs. Contact values are not copied into the audit details.

## Migration and verification

The additive admin_enquiry_triage_v1 migration was applied to the connected profilerelaunch-dev project as 20260917185905. It adds enquiries, history, scoped functions and indexes, expands audit actions and permits ADMIN_ENQUIRY as a monitoring request source. It does not rewrite existing customer or work records. Do not replay the SQL-editor baseline migrations against this project.

Local database tests exercise the actual schema, session denial, table grants, duplicate retries, stale edits, follow-up requirements, all three conversions, consent evidence requirements and audit rollback. Route tests cover authentication, origin checks, request size, lookup bounds and safe errors. Marketing tests cover storage failure, email failure, unknown delivery and submission retries. Production build and HTTP smoke checks cover the routes. No test customer or enquiry was inserted into the connected project and no customer notification was sent during verification.

Authenticated browser acceptance remains: sign in, inspect the queue and existing client selectors, then use a genuine enquiry to confirm the deployed end-to-end flow. Do not fabricate a live enquiry solely to populate the dashboard.

Supabase advisors retain the previously documented warnings concerning set_case_public_ref, rls_auto_enable and leaked-password protection. The new private tables intentionally have RLS without browser policies; their only entry points are scoped server RPCs.

For application rollback, redeploy the preceding application commit while keeping the additive database migration and any captured enquiries. Do not drop the tables after intake begins. A database rollback requires an export and a reviewed forward migration; do not replay or reverse baseline migrations blindly.
