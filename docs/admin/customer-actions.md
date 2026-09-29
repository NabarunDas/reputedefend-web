# Customer actions — Step 9A, 9B1 and 9B2

Step 9A is the secure customer-action foundation. Step 9B1 adds case-scoped published-pack viewing. Step 9B2 adds request-driven customer evidence upload. This is not a customer dashboard.

Step 8 is complete, with live acceptance confirmed on 18 September 2026. Step 9A is merged. The live Service Agreement acceptance flow has succeeded. Case-management permission live acceptance is still pending unless separately confirmed. The 9A migration `20260928094817_admin_customer_actions_v1.sql` is applied to `profilerelaunch-dev` as version `20260928094817`.

Step 9B1 is LIVE-TESTED COMPLETE after PR #103. Admin published Pack #1, the customer completed CASE_ACCESS email OTP, viewed the published PNG/PDF, downloaded the PDF, and the live customer AWS read-only role passed GuardDuty tag checks with `CUSTOMER_CASE_ACCESS` audit records. The applied 9B1 migration is `20260928175738_customer_case_pack_access_v1.sql`.

Step 9B2 is source-only in this PR. The additive migration is `20260928190000_customer_evidence_upload_v1.sql`. It is not remotely applied. Customer IAM `s3:PutObject` is not configured. Customer replacement upload is not included. Do not mark all of Step 9 complete. `PREPARATION` / `READY_TO_SUBMIT` remain blocked.

Current Supabase advisor baseline still contains historical security findings for `public.rls_auto_enable()`, `public.set_case_public_ref`, and leaked-password protection. Step 9A introduced missing-FK-index performance recommendations; those are not security or correctness blockers and are deferred to the performance/production-readiness cleanup.

## Separate facts

These are not interchangeable:

- verified `business_memberships` status
- verified customer email
- service agreement acceptance
- case-management permission
- Google Manager access
- commercial quote, order or payment
- marketing/setup consent
- an approved prepared pack

`authorizationReady` may be true only when the case is on the Managed track and the Step 9A conditions are all true: verified business authority, verified customer email, an ACTIVE service agreement, an ACTIVE case-management permission, and VERIFIED Manager access. It does not mean payment ready, quote accepted, ready to submit, or that `PREPARATION` / `READY_TO_SUBMIT` may proceed. Guided and undecided cases can never be authorisation-ready. `CASE_MANAGEMENT_PERMISSION` and Manager-access commands are denied unless `service_track = MANAGED`. Leaving Managed revokes OPEN case-management permission (and matching revocation) actions with `CASE_TRACK_CHANGED` and moves an ACTIVE permission to `REVIEW_REQUIRED`. Switching back to Managed does not revive those rows; a new permission snapshot must be accepted. Service-agreement actions and `location_manager_access` are not changed by the track move. `customer_action_eligible_v1` also requires Managed for `CASE_MANAGEMENT_PERMISSION` acceptance.

## Action link

Admin issues `/action/{id}#t={secret}` against a valid absolute `CUSTOMER_ORIGIN`. Link issuance (`create_agreement_action`, `create_revocation_action`, `create_case_access_action`) fails closed with a generic 503 if `CUSTOMER_ORIGIN` is missing or invalid, and does not generate a raw secret or call the database RPC. There is no relative `/action/{id}` fallback. Other Admin operations do not require `CUSTOMER_ORIGIN`. The fragment is not sent in the HTTP request. The customer app exchanges `actionId` + secret for an opaque pending cookie, then removes the fragment with `history.replaceState`. Raw secrets are never stored: the database keeps SHA-256 only. A lost copy-link response cannot be reconstructed; Admin must revoke and issue a new action.

Secrets use 256 bits of cryptographic randomness. They must not appear in SQL, receipts, events, audit, logs, analytics, error trackers or page metadata.

## OTP and session

OTP is requested only after a valid, OPEN, unexpired, unrevoked action whose expected email still matches the customer's current verified email and whose business membership is still `verified`. The customer cannot type a destination email. The UI shows a masked address such as `n***@example.com`.

`customer_action_begin_otp_v1` writes `OTP_REQUESTED` and stamps `last_attempt_at` for the 60-second anti-abuse throttle before the provider is called. `OTP_SENT` is written only by `customer_action_confirm_otp_sent_v1` after `signInWithOtp` succeeds, and only once per send attempt (`sent_at`). Verification requires `sent_at`. A provider failure leaves truthful `OTP_REQUESTED` history and no `OTP_SENT`. If the session projection is unexpectedly NULL after OTP finish, the customer app does not set the action cookie.

Resend delay 60 seconds, 5 failed attempts per challenge, 10-minute challenge, 15-minute action session after successful OTP. The session cookie is host-only, Secure, HttpOnly, SameSite=Strict, `__Host-` in production, bound to one action. No Domain=.profilerelaunch.com. Provider JWTs are discarded. This is not a long-lived customer login.

If the verified email has no Auth identity, the customer server may create it with the Admin API only after a valid action secret, as `email_confirm: true`, because public signup is disabled and an unconfirmed passwordless identity cannot receive OTP. An existing unconfirmed identity for that exact email is confirmed the same way, then reused. Public signup stays disabled. `shouldCreateUser` is false on OTP send. Supabase `email_confirmed_at` is not customer-action authentication; the six-digit OTP is still required. Customer identities cannot use Admin (`admin@profilerelaunch.com` only).

## Agreements

`agreement_versions` rows are immutable snapshots of owner-approved wording supplied by Admin. `content_hash` is SHA-256 (64 lowercase hex) over `agreement_kind`, `title`, `body_text` and `scope_text`. The application does not invent legal or success-fee text. `authorization_records` store the current ACTIVE/REVIEW_REQUIRED/REVOKED state from an accepted snapshot. Acceptance source is `CUSTOMER_OTP` and those accepted-scope fields (including `location_id`) are never overwritten. Admin emergency revocation requires a fresh sign-in within five minutes, the current `recordVersion`, and records `ADMIN_RECORDED_REVOCATION` on the event, not by rewriting acceptance.

OPEN actions are revoked if the customer email changes or membership leaves `verified`. Affected ACTIVE authorisations become `REVIEW_REQUIRED` with an `AUTHORIZATION_REVIEW_REQUIRED` system event (`CUSTOMER_EMAIL_CHANGED` or `BUSINESS_AUTHORITY_CHANGED`). They never auto-reactivate; a new customer acceptance of a new snapshot is required. Changing the email back does not revive a revoked link or a `REVIEW_REQUIRED` record.

Customer-action and authorisation events record `actor_type` (`ADMIN`, `CUSTOMER`, `SYSTEM`, `PRE_AUTH`). `ADMIN`/`CUSTOMER` require `actor_id`; `SYSTEM`/`PRE_AUTH` require `actor_id` NULL. Pre-auth events (`ACTION_EXCHANGED`, `OTP_REQUESTED`, `OTP_SENT`) and trusted-fact system events do not pretend an Admin performed them. `customer_action_session_v1` re-checks `customer_action_eligible_v1` before returning a projection; expired, revoked or stale-trust sessions return NULL. A completed command can still replay from its receipt with the same request ID.

Customer-action scope (`customer_id`, `business_id`, `location_id`, `case_id`, `agreement_version_id`, `authorization_id`, `kind`, `secret_hash`, `expected_email_snapshot`, `expires_at`, `created_by`, `created_at`) is immutable after insert. Status may move only `OPEN` → `COMPLETED` / `DECLINED` / `REVOKED`. Agreement-acceptance and revocation actions must match the referenced snapshot; authorisation inserts must match the referenced agreement.

Manager-access current state may be overwritten on re-verification, but append-only events keep the evidence and access level that were verified at that time, and the revocation reason plus previous access level.

## Manager access

`location_manager_access` is verified by Admin, not by a customer checkbox. Evidence 10–1000 characters, fresh sign-in, explicit confirmation. Never collect a Google password or one-time code.

## Apps

- Admin: `/cases/[id]` panel “Agreements & permissions”, including **Issue customer case-access link**; Evidence & Documents shows a **Customer submitted** label on customer uploads
- Customer: `apps/customer` routes `/action/[actionId]`, `/case`, plus `/api/action/exchange|otp|verify|command`, `/api/case/evidence/access` and `/api/case/evidence/upload`

Environment for the customer app: `CUSTOMER_AUTH_ENABLED`, `CUSTOMER_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Production file access also needs `AWS_REGION`, `AWS_EVIDENCE_BUCKET`, and `AWS_CUSTOMER_EVIDENCE_ROLE_ARN`. The live role currently has only `s3:GetObject` and `s3:GetObjectTagging`. After this source/migration is reviewed we will add only `s3:PutObject` for `arn:aws:s3:::profilerelaunch-evidence-dev-01/cases/*`. The role must not receive DeleteObject, ListBucket, PutObjectTagging, DeleteObjectTagging, s3:*, multipart or extra KMS/admin permissions. The secret key is server-only. Do not enable public signup. Do not put static AWS keys in Vercel. This PR does not change the IAM role or Vercel environment variables.

## Step 9B1 case access and published packs

`CASE_ACCESS` is a temporary access capability, not an agreement. It stays `OPEN` after OTP until expiry, Admin revoke, trusted-fact invalidation, or the case becomes ineligible. Every new session still requires OTP. At most one currently usable `OPEN` `CASE_ACCESS` action exists per case. The action must not reference `agreement_version_id` or `authorization_id`.

Expiry makes the capability immediately unusable. Issuing a replacement terminalises the expired `OPEN` row as `REVOKED` with a SYSTEM `ACTION_REVOKED` event (`source=ACTION_EXPIRED`), deletes its challenges and sessions, and never reuses the old secret. Closing or cancelling a case terminalises every `OPEN` `CASE_ACCESS` for that case the same way (`source=CASE_CLOSED` or `CASE_CANCELLED`). Reopening does not revive the old action; Admin must issue a new link and the customer must complete OTP again.

After OTP, the customer is sent to `/case`. That route and `POST /api/case/evidence/access` derive scope only from the 15-minute `__Host-pr-action` session. Browser payloads may contain only `operation` (`view` / `download`) and `versionId`.

Pack publication is a separate axis from `DRAFT` / `APPROVED` / `STALE` / `SUPERSEDED`. Admin publishes through `admin_prepared_pack_command_v1` (`publish` / `unpublish`) with optimistic `record_version`. Only an `APPROVED` pack whose every item is uploaded, clean, valid, accepted and `customer_visible=true` can be published. STALE, SUPERSEDED, or visibility/eligibility loss ends publication immediately and does not auto-republish.

Customer RPCs `customer_case_pack_v1`, `customer_case_pack_version_v1` and `customer_case_pack_access_v1` re-check the session and live publication facts, including `pack_publishable_v1` for the whole pack on every file lookup. If any included item is no longer uploaded, clean, valid, accepted and customer-visible, no file from that pack is returned. Storage coordinates never appear in the page projection. Presigned GET expiry is at most 60 seconds and is never persisted. Actor on file-access events is the customer Auth user with source `CUSTOMER_CASE_ACCESS`.

## Step 9B2 customer evidence-request upload

Source-only. A customer may upload only in response to an `OPEN` `evidence_requests` row for the exact CASE_ACCESS case. `/case` projects customer-safe OPEN requests (`requestId`, `title`, `requestText`, `dueAt`, `createdAt`, `submissionStatus`, `filename`, `submittedAt`) and never storage coordinates, Admin notes or review internals. Published-pack projection is unchanged.

`POST /api/case/evidence/upload` accepts only `begin` and `finalize`. The browser may send `evidenceRequestId`, filename, declared MIME and size, or `versionId`. It must not send case/customer/business IDs, bucket, key, review, visibility, scan or validation fields. Scope comes from the HttpOnly CASE_ACCESS session.

Begin (`customer_evidence_begin_v1`) creates the first customer document for that request. Title is the evidence-request title. Object key is `cases/{case}/documents/{document}/versions/{version}`. Version 1 starts `PENDING_UPLOAD` / `PENDING` / `PENDING` / `UNREVIEWED` / `customer_visible=false` with `submission_source=CUSTOMER` and `customer_action_id` set to the current CASE_ACCESS action. `created_by` is the customer Auth user. Events use `source=CUSTOMER_CASE_ACCESS`. The same idempotency key replays; a different payload conflicts. After `UPLOADED`, the customer cannot create a replacement in this slice.

The customer Vercel server mints the same constrained presigned POST as Admin (exact bucket/key/Content-Type, content-length-range 1..10485760, 300 seconds). The browser uploads directly to S3. Finalize (`customer_evidence_finalize_v1`) requires the object to exist, then moves only `PENDING_UPLOAD` → `UPLOADED` and sets `uploaded_at`. Scan, validation, review and visibility stay pending/unreviewed/false. The evidence request stays `OPEN` until Admin fulfils it. The customer cannot accept/reject, set visibility, publish, refresh scan, or download the unreviewed upload.

Customer IAM PutObject is not configured by this PR. The 9B2 migration is not remotely applied. Replacement upload, customer scan/validation, Google submission and a dashboard remain later work. `PREPARATION` / `READY_TO_SUBMIT` stay blocked.
