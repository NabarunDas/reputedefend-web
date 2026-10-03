# UX-10A — Customer Portal authentication foundation

UX-10A is the security boundary for the Customer Portal. It is not the portal design. The only signed-in page is a confirmation that the session is valid.

The Customer Portal is not launched.

## What this phase does

- Passwordless login with a six-digit email code.
- A ProfileRelaunch portal session, separate from the existing 15-minute action session.
- Sign-out that revokes that session.
- A feature gate, `CUSTOMER_PORTAL_ENABLED`, left unset. It uses `customerBackendConfig()` and does not read `CUSTOMER_AUTH_ENABLED`. Customer actions stay on `customerConfig()`.
- Request checks in `apps/customer/proxy.ts`.
- Database tables and RPCs in `supabase/migrations/20261003125151_customer_portal_auth_foundation_v1.sql`.

The migration is in the repository and is not applied to `profilerelaunch-dev`. `pendingMigrations()` contains only that file. `appliedMigrationHead` remains `20261003120000_case_communications_workspace_v1.sql`.

## What this phase does not do

No dashboard, case list, timeline, documents, evidence, messages, account editing, payments, Guard, portal navigation, or marketing header. No Customer Login link on the marketing site. No change to payments, Stripe, mail, Google, Guard workers, job workers, monitoring, or production provider gates.

## Routes

| Route | Who may call it |
| --- | --- |
| `GET /login` | Public when the portal gate is on. When it is off, the page says sign-in is unavailable. |
| `POST /api/portal/auth/start` | Public. Authorises itself through the challenge. |
| `POST /api/portal/auth/resend` | Public. Same. |
| `POST /api/portal/auth/verify` | Public. Same. |
| `POST /api/portal/auth/sign-out` | Uses the portal cookie and still clears an invalid cookie. |
| `GET /portal` | Requires `customer_portal_session_v1`. |

`/case` and the existing action APIs still require the action session. A portal cookie does not satisfy them.

## Login

The customer enters the email verified with ProfileRelaunch. The server normalises it, asks `customer_portal_begin_login_v1` whether a verified customer exists, and only then ensures the Auth identity and calls `signInWithOtp` with `shouldCreateUser: false`. After the provider accepts the send, `customer_portal_confirm_otp_sent_v1` records `sent_at` and the ten-minute expiry.

The code screen always follows a syntactically acceptable email. The visible sentence is: "If this email is linked to a ProfileRelaunch account, we've sent a six-digit code." If `verifyOtp()` returns an access token, the server revokes that provider session with `admin.signOut(jwt, "local")` before it accepts the user id, the email, or `email_confirmed_at`. A failed revocation does not create a portal session or set the portal cookie. A successful login inserts a new session hash that is not the pending hash.

Failure copy is: "We couldn't verify that code. Check it and try again, or request a new code."

## Session

`getPortalSession()` reads the portal cookie, checks the 64-hex token, hashes it, and calls `customer_portal_session_v1`. Database failures return null. The page renders "Signed in securely." and a sign-out control. It does not render the customer id or the email.

Sign-out calls `customer_portal_sign_out_v1`, clears both portal cookies, and returns the customer to `/login`. It does not call a browser Supabase sign-out, because the browser holds no provider session.

## Isolation

Action cookies stay `__Host-pr-action` and `__Host-pr-action-pending`. Portal cookies are `__Host-pr-portal` and `__Host-pr-portal-pending`. Neither token is accepted by the other session function.

If the customer's current verified email changes, `customer_portal_session_v1` returns null immediately. It also returns null when the stored Supabase Auth user no longer has that email, is unconfirmed, is marked deleted, or is actively banned. An expired `banned_until` does not keep the session invalid. Login uses the same `customer_portal_auth_identity_current_v1` check.

## Tests

Customer HTTP tests cover the gate, origin, content type, body limits, enumeration, OTP destination, cookie flags, resend throttling, verify failure cases, session fixation, and sign-out isolation.

`apps/admin/lib/customer-portal/database.test.ts` runs the migration on the real chain in PGlite and checks verified-email eligibility, customer-level send limits including a concurrent pair, challenge attempt limits, the eight-hour session, email-change invalidation, and role privileges.

The security model is in `docs/customer/customer-portal-security.md`.
