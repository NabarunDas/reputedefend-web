# ProfileRelaunch Admin

Separate Next.js application for `admin.profilerelaunch.com`. Marketing stays at the repository root with no admin navigation link.

## Current stage

The application foundation and single-account email OTP are implemented. Only `admin@profilerelaunch.com`, bound to its exact Supabase Auth user ID, can sign in. There are no staff levels, invitations, signup or password forms. No client, enquiry or payment dashboard is implemented yet.

Authentication uses Supabase OTP and private PostgreSQL-backed opaque sessions. No provider tokens reach browser code. Protected pages must call `requireStaff()` independently of proxy. Future APIs and commands must perform the equivalent server-side session check themselves; the catch-all API continues to deny access.

## Commands

From the repository root, run `npm ci`, then `npm run dev:admin`, `npm run test:admin`, `npm run typecheck:admin`, `npm run build:admin` or `npm run smoke:admin`.

Port 3001 is used for admin. Marketing scripts remain independent. Admin tests include PostgreSQL migration and permission tests using PGlite with a minimal Auth fixture; no live credentials or emails are used.

## Activation

See `docs/admin/single-admin-auth.md` for the migration, account binding, SMTP/template settings, environment variables, acceptance checks and recovery procedure. Without complete configuration the app remains closed. No migration runs automatically.

See `docs/admin/deployment.md` for the separate Vercel project and DNS setup. A successful marketing preview does not deploy the admin application.
