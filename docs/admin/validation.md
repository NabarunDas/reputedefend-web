# Foundation validation and handover

Base: `a83739380718bf1697d5a69ebcf9f24bd0cfbeb9` on `main`.
Branch: `codex/admin-foundation`.

## Scope

This change implements the repository baseline and separate admin application foundation from steps 1–2. Staff OTP, membership, database changes and operational modules are subsequent steps. Protected routes currently deny access deliberately; there is no working sign-in or demonstration session.

## Completed checks

- Unmodified main: 476 marketing tests, type checking and production build passed.
- Changed branch: 476 marketing tests passed (`npm test -- --maxWorkers=2`).
- Admin: 19 access-boundary tests passed.
- Marketing and admin type checking passed.
- Repository lint passed.
- Marketing and admin production builds passed.
- Built admin HTTP smoke checks passed, including protected routes, API denial, headers, robots and login.
- `git diff --check` passed.

The initial marketing test run used default worker concurrency alongside builds and encountered timeouts. The controlled rerun above passed. Browser screenshots were not verified: the local browser executable was unavailable and its download timed out. Interactive browser review remains required before deployment.

## Blockers and external setup

The initial GitHub publication attempt returned HTTP 403. After the repository owner updated integration permissions, branch creation succeeded. The prepared foundation is being published on `codex/admin-foundation` for review.

Provider configuration has not been verified. The separate admin Vercel project, preview protection, admin DNS and subsequent Supabase auth configuration remain pending. No production configuration, database migrations, email or payment actions were performed.

## Next implementation slice

Step 3: verified staff schema and real passwordless email OTP, following the approved plan. Validate existing Supabase schema and provider settings before writing migrations. Never turn off the bootstrap boundary without replacing it with server-side staff authentication and authorisation.
