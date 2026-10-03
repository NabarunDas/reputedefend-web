# UX-10E — Customer documents and evidence

UX-10E is the first Customer Portal phase in which a signed-in customer completes an action. The customer can see evidence requests and submitted evidence for cases they directly own, upload a file for an eligible open request, and download a document ProfileRelaunch has published to them.

The Customer Portal is not launched. `CUSTOMER_PORTAL_ENABLED` stays unset. UX-10F is not started. Quote acceptance, service agreement acceptance, case-management permission, payments, Guard, messaging, and account editing stay outside the portal.

## Routes

- `/portal/documents` lists evidence still needed, evidence already submitted, and published documents across owned cases.
- `/portal/cases/[reference]/documents` is the documents and evidence workspace for one owned case. The case workspace links here as "Documents and evidence".
- `POST /api/portal/evidence` starts and finishes an upload.
- `GET /api/portal/documents/download` rechecks publication and returns a short-lived read URL.

Cases navigation stays current for `/portal/cases/**`, including the case documents page. Documents navigation is current for `/portal/documents/**`. Payments, Relaunch Guard, Messages, and Account stay inactive.

## Ownership

Every portal RPC derives the customer from `admin_private.customer_portal_session_v1(p_token_hash)`. The browser does not send a customer id, case UUID, business id, location id, Auth user id, document id, evidence-request id, or storage key as authority.

A valid session may act only where `cases.customer_id` is that portal customer. Sharing a business or location is not enough. An invalid, expired, revoked, or identity-invalid session returns SQL `NULL`, and the page redirects to `/login`. A valid session with a missing or unowned public reference returns exactly `{ "found": false }`, and the page calls `notFound()`.

The Customer Action session and the Customer Portal session stay separate. A portal upload does not create a `CASE_ACCESS` action or an action session. The legacy `/case` flow is unchanged in its trust boundary.

## Identifiers

Pages and links use the public case reference, an `er-N` selector for an evidence request, and a `pd-N` selector for a published pack item. Those selectors are positions, not secrets. Every read and write resolves them again against the portal session, the owned case, and the current evidence or pack rows.

Internal UUIDs, storage buckets, and storage keys are not rendered in HTML, query strings, React keys, form fields, or data attributes. The upload transport still receives the storage key inside the presigned POST, because that is how the existing evidence upload works. That key is not part of the page.

## Upload

Portal upload writes the same `case_documents` and `case_document_versions` rows as the secure-link flow. `portal_submission` distinguishes a portal customer version, which has `customer_action_id` null, from an action-link version, which still requires an action id. `submission_source` stays `CUSTOMER`.

An upload can start only when the case is owned, the case is not closed or cancelled, the request belongs to that case, the request is `OPEN`, and no customer version for that request is already `UPLOADED`. File type and the 10 MB limit stay on `admin_private.evidence_extension_ok_v1`. Begin and finalise are idempotent. A conflicting replay is refused. Completing an upload sets `UPLOADED` and `uploaded_at` only. It does not accept the file, mark it visible, or skip scanning.

The customer sees `Not submitted`, `Upload in progress`, `Received`, `Being checked`, `Under review`, `Accepted`, or `We need another document`. A rejected upload does not become a replacement button. Another document needs a new evidence request.

## Published documents

`admin_private.customer_published_pack_documents_v1` is the shared eligibility projection. The legacy `customer_case_pack_v1` and `customer_published_pack_item_v1` functions read it and keep their existing response shape. A document is returned only when the current pack is approved and published, `pack_publishable_v1` is true, and the version is uploaded, clean, valid, accepted, and customer-visible. Other Admin documents stay hidden. Unpublishing removes the document from the portal.

Download authorisation happens when the file is requested. The route checks the portal session, the owned case, the current published item, and a clean scan, then records access and redirects to the existing signed read URL. A stale page cannot download a document that is no longer eligible.

## Attention

Only `EVIDENCE_REQUIRED` now points into the portal: "Upload the requested evidence in your customer portal." The link is `/portal/cases/{reference}/documents`. Quote, agreement, permission, and payment attention still tell the customer to use the secure link from email.

A finalised upload appears on the UX-10D timeline through the existing `EVIDENCE_SUBMITTED` source. UX-10E does not write a separate timeline.

## Migration

`supabase/migrations/20261003194353_customer_portal_documents_evidence_v1.sql` is additive. It adds `portal_submission` and replaces the customer provenance check so a portal version does not need a customer action. It does not create a table.

Public functions, granted only to `service_role`:

- `public.customer_portal_documents_v1(text)`
- `public.customer_portal_case_documents_v1(text, text)`
- `public.customer_portal_evidence_begin_v1(text, uuid, text, text, text, text, bigint, text)`
- `public.customer_portal_evidence_target_v1(text, text, text)`
- `public.customer_portal_evidence_finalize_v1(text, uuid, text, text)`
- `public.customer_portal_document_resolve_v1(text, text, text)`
- `public.customer_portal_document_access_v1(text, uuid, text, text)`

Private helpers are not executable by `service_role`:

- `admin_private.customer_portal_actor_v1(text)`
- `admin_private.customer_evidence_state_v1(text, text, text, text)`
- `admin_private.customer_portal_owned_case_v1(uuid, text)`
- `admin_private.customer_portal_evidence_selector_v1(uuid, text)`
- `admin_private.customer_published_pack_documents_v1(uuid)`
- `admin_private.customer_portal_case_evidence_v1(uuid)`

The migration is **not applied** to `profilerelaunch-dev`. `appliedMigrationHead` remains `20261003183002_customer_portal_case_workspace_v1.sql`. `pendingMigrations()` contains only this file.
