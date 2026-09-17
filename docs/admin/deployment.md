# Admin deployment runbook

## Project separation

| Setting | Marketing | Admin |
| --- | --- | --- |
| Repository | NabarunDas/reputedefend-web | Same repository |
| Root Directory | Existing repository root | apps/admin |
| Framework | Existing Next.js | Next.js |
| Build | Existing npm run build | npm run build in admin root |
| Install | npm ci | npm ci at repository workspace root |
| Domain | Existing domain configuration | admin.profilerelaunch.com |
| Environment | Existing flags and secrets unchanged | Auth variables from single-admin-auth.md; disabled by default |

Vercel recognises npm workspaces from the root lockfile. Enable inclusion of source files outside the project's root directory so workspace dependencies are available. If an install override is required for the new project, use `cd ../.. && npm ci` from `apps/admin`. Do not change the marketing project's root or build settings. Use the same Node 24 major used for local validation, subject to the hosting account's supported runtime.

1. Import this repository as a **second** Vercel project with Root Directory `apps/admin`.
2. Use the PR branch for its first Preview. Enable deployment protection and isolated test environment configuration. Use the authentication setup guide for staging DB and Auth mail configuration.
3. Before enabling auth, verify `/login` shows sign-in unavailable; `/` and `/clients/example` redirect there; `/api/clients` returns 401 JSON; `/robots.txt` disallows all crawlers. Verify noindex, no-store, nosniff, no-referrer and frame protection headers.
4. Confirm the marketing Preview still builds and its homepage and intake gates retain their prior behaviour.
5. Add `admin.profilerelaunch.com` to the new admin project. Use only the DNS record displayed by Vercel; do not guess an IP or edit the marketing apex records.
6. Verify TLS and host routing. Configure the exact ADMIN_ORIGIN for this environment. Email codes need no token-bearing callback URL. Do not add wildcard customer/admin redirects or cross-subdomain cookies.
7. Keep admin access disabled until the single-account OTP acceptance checks pass. Foundation deployment is not an operational admin launch.

## Authentication activation

- Verify the correct Supabase staging and production projects and applied migrations using a read-only inventory. Existing baseline migrations must not be replayed.
- Verify Supabase Auth custom SMTP separately from the existing Resend transactional API setup.
- Bind only admin@profilerelaunch.com to its confirmed Auth UUID. There are no staff levels. Follow single-admin-auth.md.
- Keep Preview off production databases, mailboxes and payment accounts.
- Store secrets only in provider settings; never paste values into a PR or report.

## Rollback

Revert the foundation PR or redeploy the admin project's previous version. The foundation required no database changes. If OTP has since been enabled, disable access and revoke sessions using single-admin-auth.md before reverting application code; retain the additive tables for audit and do not blindly drop them. The marketing app and existing intake functions are not migrated. If admin DNS was added, remove only that subdomain mapping when rolling back; leave apex/www and email DNS intact.

## References

- https://vercel.com/docs/monorepos
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy

Provider setup remains unverified until the account owner or an authorised connection supplies deployment evidence.
