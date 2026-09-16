# Single admin account and email OTP

## Approved scope

The only admin account is **admin@profilerelaunch.com**. There are no levels, staff invitations, role selectors or public signup. This supersedes the multi-staff parts of the original plan. Client accounts never grant admin access.

This slice implements real authentication, a signed-in landing page, active session list, sign out and sign out all devices. Client management and other operational modules remain later work.

## Security and session contract

- Supabase generates and verifies a six-digit email OTP. `shouldCreateUser:false` prevents signup. The email destination is fixed server-side; a supplied email or role is ignored.
- A singleton database record binds the exact confirmed Supabase Auth user ID. Email, enabled state, deletion and ban status are checked when creating and using a session. Recreating the same email under a different ID grants no access.
- The browser receives a 256-bit random opaque session cookie. Only its SHA-256 hash is stored. Supabase access/refresh tokens are never saved or sent to the browser; the temporary provider refresh session is revoked after OTP verification. No token encryption key or refresh-token rotation is needed for this implementation.
- Production cookies use `__Host-`, Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. Local development uses separate cookie names. No customer/admin cross-subdomain cookies.
- Database time enforces 30-minute idle expiry and a 12-hour absolute expiry. Requests update last activity; there is no background heartbeat. Sign-out revokes database sessions before clearing cookies. “Sign out all devices” also invalidates the outstanding challenge.
- OTP challenge lasts ten minutes; five verification attempts per challenge. Only the latest browser-bound challenge is active for this single account. Resending from another browser invalidates the previous request.
- Database row locking enforces a 60-second send interval, ten sends per hour, and twenty verification attempts per ten minutes across all servers and IPs. Global limits are deliberately stricter than per-IP limits for one account. Abusive requests can temporarily exhaust the account budget; edge filtering/CAPTCHA is a future operational option, not a substitute for these limits.
- Exact origin checks protect all POST endpoints, including logout. Only same-origin JSON is accepted; streamed request bodies are limited to 1 KiB. Redirects are fixed, never taken from request input.
- RLS is enabled with no browser policies on authentication tables. anon/authenticated cannot execute the authentication RPCs. The server secret may call only the narrow RPC interface for these tables; it is never bundled into client code. Future customer-data commands must separately enforce identity and record scope.
- Database/provider failures fail closed. No OTP, raw session token, provider token or provider error text is logged. Minimal successful sign-in/out events are stored; wider audit and operational alerting remain step 4/10.

## Activation steps — staging first

1. Keep `ADMIN_AUTH_ENABLED=false`. Verify the correct Supabase project and existing migration history. Do not replay the core, case-intake or Guard baseline migrations.
2. Apply only `supabase/migrations/20260917000000_single_admin_auth_v1.sql` once. It creates private authentication tables and server RPCs; it does not change customer RLS or create an Auth user.
3. In Supabase Authentication, provision the account `admin@profilerelaunch.com` through the project owner's trusted administration process. Confirm the mailbox belongs to you and that the Auth user is confirmed and not banned. No application password is needed or shown. If the provider's creation flow requires a password, use an independently generated random value and never use it in this app.
4. Run `scripts/admin/bind-admin.sql` once in the same project's SQL Editor. It requires exactly one existing confirmed account and refuses to replace an existing binding. It does not create an account or mark an unconfirmed address as confirmed.
5. Configure **Supabase Auth custom SMTP**. Existing Resend API integration for enquiries does not configure Auth email. Use a verified sending domain, an appropriate sender such as `notifications@profilerelaunch.com`, and the SMTP credentials from your email provider. Store credentials in Supabase settings only.
6. Set Email OTP expiration to **600 seconds**, OTP length to **6** if configurable, and the resend interval to at least **60 seconds**. Use the Magic Link template below with `{{ .Token }}` rather than a clickable confirmation URL. These are shared-project settings: test customer authentication before changing an existing production template.
7. Configure the separate admin Vercel project and its environment variables from the table below. Use separate staging Supabase credentials for Preview, never production secrets. `ADMIN_ORIGIN` must match the exact origin being tested; update it for a chosen protected preview/custom staging hostname. Do not use a wildcard or trailing slash.
8. Deploy with the flag false, verify the unavailable screen, then enable `ADMIN_AUTH_ENABLED=true` in the isolated staging environment and redeploy. Complete the acceptance checklist below before enabling production.
9. Repeat the verified migration, binding, email and environment setup for production, with `ADMIN_ORIGIN=https://admin.profilerelaunch.com`. Configure the admin subdomain on its own Vercel project. Leave the marketing project's settings unchanged.

| Variable | Value / purpose |
| --- | --- |
| ADMIN_AUTH_ENABLED | `true` only after the activation prerequisites are complete; otherwise `false` |
| ADMIN_ORIGIN | Exact admin origin, e.g. `https://admin.profilerelaunch.com` |
| SUPABASE_URL | URL of the correct Supabase project |
| SUPABASE_PUBLISHABLE_KEY | Publishable/legacy anon key for that same project; server-side here |
| SUPABASE_SECRET_KEY | Server secret/legacy service-role key for the same project; never NEXT_PUBLIC |

For local development, put variables in `apps/admin/.env.local` (ignored by git), with `ADMIN_ORIGIN=http://localhost:3001`. Do not paste secret values into chat, PRs or source files. An enabled flag alone cannot grant access: both provider configuration and the database binding are required.

### Auth email template

Subject: `Your ProfileRelaunch sign-in code`

```html
<h2>Your sign-in code</h2>
<p>Enter this code in the ProfileRelaunch sign-in page:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>This code expires in 10 minutes. Keep it to yourself.</p>
<p>If you didn’t request this code, you can ignore this email.</p>
```

The wording deliberately also works for future customer OTP if the project shares the template. Codes are entered into the open browser tab; no token-bearing URL or callback is needed.

## Acceptance checklist

- Email arrives at the real admin mailbox using custom SMTP; code works once in the requesting browser and does not appear in logs or URLs.
- Another email/UID, a customer account, a forged cookie and a disabled/banned admin all fail.
- Incorrect code, expired code, resend cooldown, fifth failed attempt and resend from another browser behave as documented.
- Home and future data endpoints cannot be reached without a valid session; no protected response is cached.
- Current-session sign-out blocks reuse of its cookie. All-device sign-out blocks every old session.
- Idle and absolute timeouts work; active sessions show UK times.
- Mobile and keyboard use work, status text is announced, and the OTP field supports paste/autofill.
- Marketing and customer authentication retain their prior behaviour.

Repository tests run the actual migration against PostgreSQL through PGlite with a minimal auth.users fixture and check permissions, binding, limits, expiry and revocation. HTTP/provider unit tests mock Supabase delivery; they do not prove real SMTP deliverability or deployed project configuration. Live acceptance remains a deployment gate.

## Recovery and disabling access

If the mailbox is compromised or an account must be disabled, the trusted Supabase project owner runs, in a transaction:

```sql
BEGIN;
UPDATE public.admin_identity SET enabled=false, challenge_hash=NULL, challenge_expires_at=NULL WHERE singleton;
UPDATE public.admin_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
COMMIT;
```

New requests immediately fail. Set `ADMIN_AUTH_ENABLED=false` and redeploy as an additional application shutdown. Database revocation remains necessary because a flag alone does not erase sessions.

For recovery, restore control of the mailbox through Google Workspace administration and secure the account first. Confirm the Auth user's ID and status from the trusted Supabase console. Re-enable the existing binding only after revoking all sessions. Replacing a deleted Auth identity requires a deliberate operator-reviewed rebind to the confirmed replacement UID, with a record of the reason; it is never automatic on email matching. Retain evidence of provider setup/recovery outside application logs. Keep MFA enabled on the admin mailbox and cloud administration accounts.

Expired sessions older than 30 days are pruned on code requests. Auth events contain only the bound UID, event and timestamp; establish the final audit retention policy in the operational privacy stage.

## Sources

- [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
