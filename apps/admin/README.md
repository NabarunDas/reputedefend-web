# ProfileRelaunch Admin

Separate Next.js application for `admin.profilerelaunch.com`. The marketing app stays at the repository root. There is no marketing navigation link to admin.

## Current stage

This is the application foundation from implementation steps 1–2. No customer data or operational dashboard is exposed. Sign-in is explicitly unavailable until step 3 implements verified email OTP, active staff membership and secure sessions. There is no fake form, demo login, permissive flag or mock authentication.

All page requests except login, robots and static assets redirect to `/login`. All APIs and non-read requests return 401. The home page and catch-all API independently deny access as defence in depth. These bootstrap guards must be replaced with real server-side authorisation in step 3, not simply removed. Proxy alone will never be sufficient authorisation for staff commands or downloads.

## Local commands

Run `npm ci` from the repository root. Then:

```sh
npm run dev:admin
npm run test:admin
npm run typecheck:admin
npm run build:admin
npm run smoke:admin
```

Development and start default to port 3001. Marketing commands (`npm run dev`, `build`, `test`, `typecheck`) retain their existing role. Root lint covers both apps. Each app owns its TypeScript and test configuration; marketing cannot import admin routes through its `@/` alias.

No environment variables or database credentials are needed for this stage. Do not copy marketing production secrets into the admin project. The OTP stage will specify its own server-only configuration and staging setup.

## Deployment

See `docs/admin/deployment.md`. A second Vercel project and the admin DNS record are external setup tasks. Committing this app does not create either. No production migration or intake flag change is part of this PR.
