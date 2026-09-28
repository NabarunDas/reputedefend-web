# Customer actions — Step 9A

Step 9A is the secure customer-action foundation. It is not a customer dashboard and not Step 9B (evidence upload / pack viewing).

Step 8 is complete, with live acceptance confirmed on 18 September 2026.

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

Admin issues `/action/{id}#t={secret}` against a valid absolute `CUSTOMER_ORIGIN`. Link issuance (`create_agreement_action`, `create_revocation_action`) fails closed with a generic 503 if `CUSTOMER_ORIGIN` is missing or invalid, and does not generate a raw secret or call the database RPC. There is no relative `/action/{id}` fallback. Other Admin operations do not require `CUSTOMER_ORIGIN`. The fragment is not sent in the HTTP request. The customer app exchanges `actionId` + secret for an opaque pending cookie, then removes the fragment with `history.replaceState`. Raw secrets are never stored: the database keeps SHA-256 only. A lost copy-link response cannot be reconstructed; Admin must revoke and issue a new action.

Secrets use 256 bits of cryptographic randomness. They must not appear in SQL, receipts, events, audit, logs, analytics, error trackers or page metadata.

## OTP and session

OTP is requested only after a valid, OPEN, unexpired, unrevoked action whose expected email still matches the customer's current verified email and whose business membership is still `verified`. The customer cannot type a destination email. The UI shows a masked address such as `n***@example.com`.

`customer_action_begin_otp_v1` writes `OTP_REQUESTED` and stamps `last_attempt_at` for the 60-second anti-abuse throttle before the provider is called. `OTP_SENT` is written only by `customer_action_confirm_otp_sent_v1` after `signInWithOtp` succeeds, and only once per send attempt (`sent_at`). Verification requires `sent_at`. A provider failure leaves truthful `OTP_REQUESTED` history and no `OTP_SENT`. If the session projection is unexpectedly NULL after OTP finish, the customer app does not set the action cookie.

Resend delay 60 seconds, 5 failed attempts per challenge, 10-minute challenge, 15-minute action session after successful OTP. The session cookie is host-only, Secure, HttpOnly, SameSite=Strict, `__Host-` in production, bound to one action. No Domain=.profilerelaunch.com. Provider JWTs are discarded. This is not a long-lived customer login.

If the verified email has no Auth identity, the customer server may create it with the Admin API only after a valid action secret. Public signup stays disabled. `shouldCreateUser` is false on OTP send. Customer identities cannot use Admin (`admin@profilerelaunch.com` only).

## Agreements

`agreement_versions` rows are immutable snapshots of owner-approved wording supplied by Admin. `content_hash` is SHA-256 (64 lowercase hex) over `agreement_kind`, `title`, `body_text` and `scope_text`. The application does not invent legal or success-fee text. `authorization_records` store the current ACTIVE/REVIEW_REQUIRED/REVOKED state from an accepted snapshot. Acceptance source is `CUSTOMER_OTP` and those accepted-scope fields (including `location_id`) are never overwritten. Admin emergency revocation requires a fresh sign-in within five minutes, the current `recordVersion`, and records `ADMIN_RECORDED_REVOCATION` on the event, not by rewriting acceptance.

OPEN actions are revoked if the customer email changes or membership leaves `verified`. Affected ACTIVE authorisations become `REVIEW_REQUIRED` with an `AUTHORIZATION_REVIEW_REQUIRED` system event (`CUSTOMER_EMAIL_CHANGED` or `BUSINESS_AUTHORITY_CHANGED`). They never auto-reactivate; a new customer acceptance of a new snapshot is required. Changing the email back does not revive a revoked link or a `REVIEW_REQUIRED` record.

Customer-action and authorisation events record `actor_type` (`ADMIN`, `CUSTOMER`, `SYSTEM`, `PRE_AUTH`). `ADMIN`/`CUSTOMER` require `actor_id`; `SYSTEM`/`PRE_AUTH` require `actor_id` NULL. Pre-auth events (`ACTION_EXCHANGED`, `OTP_REQUESTED`, `OTP_SENT`) and trusted-fact system events do not pretend an Admin performed them. `customer_action_session_v1` re-checks `customer_action_eligible_v1` before returning a projection; expired, revoked or stale-trust sessions return NULL. A completed command can still replay from its receipt with the same request ID.

Customer-action scope (`customer_id`, `business_id`, `location_id`, `case_id`, `agreement_version_id`, `authorization_id`, `kind`, `secret_hash`, `expected_email_snapshot`, `expires_at`, `created_by`, `created_at`) is immutable after insert. Status may move only `OPEN` → `COMPLETED` / `DECLINED` / `REVOKED`. Agreement-acceptance and revocation actions must match the referenced snapshot; authorisation inserts must match the referenced agreement.

Manager-access current state may be overwritten on re-verification, but append-only events keep the evidence and access level that were verified at that time, and the revocation reason plus previous access level.

## Manager access

`location_manager_access` is verified by Admin, not by a customer checkbox. Evidence 10–1000 characters, fresh sign-in, explicit confirmation. Never collect a Google password or one-time code.

## Apps

- Admin: `/cases/[id]` panel “Agreements & permissions”
- Customer: `apps/customer` routes `/action/[actionId]` plus `/api/action/exchange|otp|verify|command`

Environment for the customer app: `CUSTOMER_AUTH_ENABLED`, `CUSTOMER_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. The secret key is server-only. Do not enable public signup. Do not change AWS or existing Vercel projects in this step. Deploying the customer app later needs a new Vercel project, `CUSTOMER_ORIGIN`, and Admin `CUSTOMER_ORIGIN` so copy-link URLs are absolute.

## Out of scope (Step 9B+)

Customer evidence upload, pack View/Download, task responses, payments, Stripe, Resend/outgoing agreement email, quotes, and a full dashboard.
