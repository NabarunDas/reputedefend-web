# PAY-ENV-03 — restricted DEV Stripe webhook hostname

Status: **source-only guard prepared**. This runbook does not register a domain, change Cloudflare DNS, create Stripe keys/webhooks, enable payments, approve legal terms, or modify Production's payment environment.

## Why this design

The Admin Vercel project has Vercel Authentication with `ssoProtection.deploymentType = all_except_custom_domains`. Current Preview deployment URLs are protected and ephemeral; Stripe cannot log into Vercel to POST webhooks. A custom domain bypasses that Vercel-auth layer on this **existing** project, so pointing a broad `dev-admin` domain at Preview would expose the whole Preview app as a public surface.

Instead, the chosen name `dev-hooks.profilerelaunch.com` is a **single-purpose** webhook origin. The Admin Next.js `proxy.ts` guard checks the canonical request URL hostname first. Under this hostname, it forwards **only** `POST /api/webhooks/stripe` **and only when** `VERCEL_ENV=preview`. Every other path or method fails with 404 and no-store headers. It also fails closed if mistakenly assigned to Production. The existing `admin.profilerelaunch.com` Production and normal Preview routes remain unchanged.

The handler still requires a configured sandbox provider, `whsec_` signature verification of the raw body, exact `livemode=false` and the DEV database lane; the database ensures idempotency. The guard is not a substitute for those checks. No Stripe activation occurs merely by routing an endpoint.

## Verified ownership and cost assumptions

- Vercel Admin project: `profilerelaunch-admin` (`prj_X0aYbKFJ2D5GeRVHu2bXhaunAhU0`).
- DEV Supabase: `rmzozuiamjcclvtgutgd`; DEV S3: `profilerelaunch-evidence-dev-01`.
- Production Supabase, Production bucket, DNS aliases, and payment gates are not changed by this source patch.
- `profilerelaunch.com` is already verified in Vercel but nameservers are at **Cloudflare**, so the owner or an authorised DNS connector must add the **one** resulting CNAME; Vercel project-domain registration alone cannot make HTTPS operational.
- This uses the existing Vercel Admin project and existing domain; it creates no extra Vercel project, paid custom environment, new domain purchase, or scheduled job. Preview deployments and function invocations still consume normal plan usage. Confirm any provider charges in the user's actual account before new resources.

## Deployment sequence — after PR CI and merge

1. Verify the source guard is in `main` and the Production Admin deployment is READY, with existing Admin flow unaltered.
2. Create a maintained `develop` branch from that reviewed merge commit. This branch must be updated deliberately to the release commit being tested before expecting DEV/PROD code parity; do not force overwrite active Preview work. Assign only **this** webhook domain to `develop` in the existing **Admin** Vercel project as a Preview-domain, never to Production or a Customer/Marketing project.
3. In Vercel, add the project domain `dev-hooks.profilerelaunch.com` linked to Git branch `develop`. Capture the exact DNS CNAME/verification requirements from Vercel's domain configuration response; do not hardcode or guess an unverified CNAME target.
4. In Cloudflare DNS for `profilerelaunch.com`, set only the required `dev-hooks` CNAME/TXT record(s). Use **DNS only** (no Cloudflare proxy) unless explicitly tested with Stripe's raw-body signature scheme. Preserve apex/www/admin/customer, MX, SPF, DKIM, DMARC and all other records. Do not change nameservers.
5. Confirm Vercel reports this project domain **verified**, the branch deployment READY and valid HTTPS. From an unauthenticated request to `https://dev-hooks.profilerelaunch.com`, `GET /login`, `GET /`, `POST /auth/send`, `POST /api/webhooks/resend` must return 404. A `POST /api/webhooks/stripe` with payments disabled should reach the signed handler and return its disabled 503, not a Vercel sign-in HTML page. An unsigned POST after sandbox provider configuration must be rejected.
6. In the already-connected **Stripe sandbox only**, register `https://dev-hooks.profilerelaunch.com/api/webhooks/stripe`. Subscribe only to the event types used in the code. Never use Production `admin.profilerelaunch.com` for a sandbox endpoint.
7. Securely put sandbox-only `rk_test_` (preferred, with the permissions required by the existing implementation) or `sk_test_` key and that endpoint's `whsec_` into Admin **Preview** Vercel variables. Set Customer Preview key only where the code actually requires it. Keep `STRIPE_LIVE_ACTIVATION` unset, `PAYMENTS_PROVIDER_MODE=stripe_test` only on Preview, and keep Marketing free of Stripe credentials. Existing DEV Supabase and DEV S3 must match the lane pins. Redeploy the branch and validate signature, replay, wrong livemode, no dual writes and no production operations.
8. Before any synthetic transactions or customer acceptance, use an expressly synthetic DEV agreement test fixture and approved commercial eligibility path. Record the actual solicitor evidence through the authenticated, version/hash-pinned Admin command for any real agreement. The owner's report alone does not manufacture evidence or set the catalogue operative. Production payment, Customer Portal, Guard and outgoing mail activation remain separate later decisions.
9. Validate test-only Guided checkout (success, failure and 3DS), Managed success-only 14-day hosted invoice, Guard opt-in recurring/cancellation/refund and signed-webhook idempotency. Keep Production disabled; no live charge.

## Reversal

Before Stripe configuration, removing the Vercel `dev-hooks` domain assignment and the **specific** Cloudflare `dev-hooks` record restores the prior network surface; do not affect existing production records. If a sandbox secret has been issued, first disable the sandbox endpoint and `PAYMENTS_PROVIDER_MODE` on Admin/Customer Preview, redeploy and revoke the endpoint's sandbox signing secret as appropriate. The `proxy.ts` host guard is safe to retain. An environment-variable rollback stops new calls; it does not reverse transactions already made.

## Formal solicitor status is separate

The owner reports that solicitor review of `PS-2026-10-14.2` is complete. In live DEV on 15 Oct 2026 the matching catalogue entry still reads `SOLICITOR_REVIEW`, `operative=false`, `solicitor_confirmed_at=null`, with **zero** approval rows. Only an authentic evidence reference for the exact reviewed SHA-256 `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4` entered through the authenticated Admin approval flow should change that. Never insert placeholder approval rows, silently change this hash or activate live payments.
