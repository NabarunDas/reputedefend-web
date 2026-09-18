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

`authorizationReady` may be true only when the Step 9A conditions are all true. It does not mean payment ready, quote accepted, ready to submit, or that `PREPARATION` / `READY_TO_SUBMIT` may proceed.

## Action link

Admin issues `/action/{id}#t={secret}` against `CUSTOMER_ORIGIN`. The fragment is not sent in the HTTP request. The customer app exchanges `actionId` + secret for an opaque pending cookie, then removes the fragment with `history.replaceState`. Raw secrets are never stored: the database keeps SHA-256 only. A lost copy-link response cannot be reconstructed; Admin must revoke and issue a new action.

Secrets use 256 bits of cryptographic randomness. They must not appear in SQL, receipts, events, audit, logs, analytics, error trackers or page metadata.

## OTP and session

OTP is sent only after a valid, OPEN, unexpired, unrevoked action whose expected email still matches the customer's current verified email and whose business membership is still `verified`. The customer cannot type a destination email. The UI shows a masked address such as `n***@example.com`.

Resend delay 60 seconds, 5 failed attempts per challenge, 10-minute challenge, 15-minute action session after successful OTP. The session cookie is host-only, Secure, HttpOnly, SameSite=Strict, `__Host-` in production, bound to one action. No Domain=.profilerelaunch.com. Provider JWTs are discarded. This is not a long-lived customer login.

If the verified email has no Auth identity, the customer server may create it with the Admin API only after a valid action secret. Public signup stays disabled. `shouldCreateUser` is false on OTP send. Customer identities cannot use Admin (`admin@profilerelaunch.com` only).

## Agreements

`agreement_versions` rows are immutable snapshots of owner-approved wording supplied by Admin. The application does not invent legal or success-fee text. `authorization_records` store the current ACTIVE/REVIEW_REQUIRED/REVOKED state from an accepted snapshot. Acceptance source is `CUSTOMER_OTP` and is never overwritten. Admin emergency revocation requires a fresh sign-in within five minutes and records `ADMIN_RECORDED_REVOCATION` on the event, not by rewriting acceptance.

OPEN actions are revoked if the customer email changes or membership leaves `verified`. Changing the email back does not revive a revoked link.

## Manager access

`location_manager_access` is verified by Admin, not by a customer checkbox. Evidence 10–1000 characters, fresh sign-in, explicit confirmation. Never collect a Google password or one-time code.

## Apps

- Admin: `/cases/[id]` panel “Agreements & permissions”
- Customer: `apps/customer` routes `/action/[actionId]` plus `/api/action/exchange|otp|verify|command`

Environment for the customer app: `CUSTOMER_AUTH_ENABLED`, `CUSTOMER_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. The secret key is server-only. Do not enable public signup. Do not change AWS or existing Vercel projects in this step. Deploying the customer app later needs a new Vercel project, `CUSTOMER_ORIGIN`, and Admin `CUSTOMER_ORIGIN` so copy-link URLs are absolute.

## Out of scope (Step 9B+)

Customer evidence upload, pack View/Download, task responses, payments, Stripe, Resend/outgoing agreement email, quotes, and a full dashboard.
