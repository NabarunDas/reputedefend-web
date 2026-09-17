# Single-admin OTP validation

Implemented on `codex/admin-email-otp`, based on the foundation in PR #85. This branch uses only admin@profilerelaunch.com with no staff levels.

## Local results

- 58 admin tests passed across route, proxy, session and PostgreSQL suites.
- Actual migration executed against PGlite with a minimal Supabase auth.users fixture. Tests cover browser-role denial, server RPC grants, account binding, challenge replay, global throttling, attempt limits, expired challenges, changed/banned/deleted identities, idle/absolute session expiry and revocation.
- OTP HTTP tests verify fixed recipient, disabled signup, origin enforcement, bounded bodies, provider/database failures, identity mismatch, opaque cookies and no provider-token disclosure. Provider email delivery is mocked.
- 476 marketing tests passed.
- Both production builds and TypeScript checks passed.
- Repository lint and admin production HTTP smoke checks passed.
- Smoke tests explicitly disable authentication regardless of inherited environment variables.

## Not yet verified live

The migration was subsequently applied to profilerelaunch-dev on 17 September 2026 as version 20260917080553. Live table/RPC permissions and fail-closed checks passed; see supabase-activation-status.md. Account provisioning/binding, SMTP configuration and real email delivery remain pending. PGlite does not replace final end-to-end staging acceptance.

Interactive browser/mobile testing and real mailbox delivery remain activation gates. Follow single-admin-auth.md. The marketing preview deployment does not prove that the separate admin application is deployed.

## Scope remaining

The landing page shows authenticated identity and active sessions only. Client/enquiry/payment dashboards, broader audit, fresh-OTP approval for sensitive operations and other operational modules remain later implementation stages. No fake totals, staff levels or operational actions are shown.
