# UX-10J — Customer Portal launch readiness

Complete in source. The Customer Portal is not launched. `CUSTOMER_PORTAL_ENABLED` remains unset. This phase added no migration and no new portal feature.

The repository route inventory matches the assembled portal: `/login`, the portal pages from `/portal` through account, and the portal APIs for auth, evidence, documents, service, payments, receipts, invoices, and Guard. There is no `/portal/relaunch-guard` route. Action routes stay on the action session.

## A. Proven in repository

- UX-10A through UX-10I are integrated behind one portal session and one feature gate. `CUSTOMER_PORTAL_ENABLED` is independent of `CUSTOMER_AUTH_ENABLED`, and only the exact string `true` opens the portal.
- `apps/customer/lib/portal/route-inventory.ts` classifies every portal page and API. It is not the authorisation engine. The proxy and each loader or handler still decide access. A new file under `apps/customer/app/api/portal/` or `apps/customer/app/portal/` fails the inventory test until it is classified. An unclassified `/api/portal/**` path fails closed and is not opened by an action session or a portal session.
- Portal pages require the gate and a portal session. Portal mutation and download routes require the gate, a portal session, and their own origin, content-type, and ownership checks. Pre-auth login posts reach the handler, which returns 404 when the gate is off and does not call a provider.
- A portal session does not open `/case` or an action API. An action session does not open `/portal` or a portal API. Portal sign-out revokes the current portal token and does not change action-session rows. The portal lifetime stays eight hours and the session read does not extend it.
- Customer A cannot read Customer B's real case references, including a case that shares Customer A's business and location. The aggregate suite compares those references with a missing reference for the case, documents, service, and payments reads, and the results match. Alex's document, payment, Guard, and message lists do not contain Sam's business name. A changed verified email, an unconfirmed Auth user, or an active Auth ban fails the existing session closed across the portal reads.
- Unknown document, receipt, invoice, Guard, and message selectors also return the customer-safe not-found result. Those aggregate assertions use selectors that were never created, so they prove enumeration refusal, not isolation of a real Customer B selector. Real selector isolation is proved by the phase database suites that `release:customer-check` runs: documents and evidence (`pd-1` on another customer's published document, and an evidence begin on another customer's real request), quotes and agreements (another customer's real revocation selector), payments and receipts (another customer's real checkout selector, receipt selector, and invoice selector), Relaunch Guard (another customer's real Guard location selector), and messages (another customer's real message selector).
- Public `customer_portal_*` functions are security definer, pin an empty `search_path`, and are executable by `service_role` only. `admin_private` portal helpers are not executable by `public`, `anon`, `authenticated`, or `service_role`. Portal auth tables stay in `admin_private`, with row level security and without browser-role grants or policies.
- Customer-facing portal views do not use `dangerouslySetInnerHTML`. Portal links stay on the inventoried routes. They do not put a session token, one-time code, email address, or internal UUID in the URL. Login still continues to `/portal` only after verify succeeds in the handler.
- The accessibility regression checks `lang="en-GB"`, the skip link to `#main-content`, one `h1` on each assembled surface, the named portal navigation and `aria-current`, labelled fields, image alternatives, and the absence of a positive tab index or an empty control. Portal navigation items are real links, so keyboard users can reach them when the list scrolls.
- Source and component checks cover the responsive safeguards: percentage container widths, `min-width: 0`, long-text wrapping, horizontal portal-nav scrolling with a scroll margin, the existing 359, 480, 768, and 1024 pixel breakpoints, reduced motion, and `overflow-x: clip` on the page. Those checks do not measure a signed-in browser layout. The authenticated viewport sweep is an external launch gate below.
- `scripts/smoke-customer.mjs` covers `/login`, the portal pages, portal pre-auth posts, portal mutations, and receipt, invoice, and download reads while `CUSTOMER_PORTAL_ENABLED` is off. Those requests redirect or return 404, set no portal cookie, and do not call a provider.
- `npm run release:customer-check` discovers every `database.test.ts` and `*.database.test.ts` file under `apps/admin/lib/customer-portal/`, including the UX-10A auth suite and each later phase suite, and runs those files together with the migration manifest and migration history tests. A coverage test fails if a future Customer Portal database file in that directory is left out. It then runs the customer typecheck, build, and smoke. Its closing line is: “Repository checks passed. This is not production launch approval.”
- The repository, development project and clean Strategy A production project all end at `20261004080853_customer_portal_messages_account_v1.sql`. Production carries all 37 canonical migrations and `pendingMigrations()` is empty.
- Google API, Stripe, outgoing mail, inbound mail, Guard automation, privacy deletion, job workers, and Cron are unchanged. The marketing site does not gain a Customer Login link.

## B. External action required before portal launch

The repository cannot prove these. None of them is done by UX-10J.

### Customer Vercel deployment

Confirm the production Customer app, project, and domain that will serve the portal.

### CUSTOMER_ORIGIN

Confirm the exact production origin that portal cookies and origin checks will use.

### Supabase production database strategy

Resolved for production by Strategy A on 2026-10-04. The production project was built from empty from the canonical repository chain, so the historical DEV-only ledger discrepancy is not inherited by production.

### Production migration head

Verified on 2026-10-04: the production migration ledger contains all 37 canonical entries and ends at `20261004080853 customer_portal_messages_account_v1`. Continue to re-check this head before portal enablement if any later migration is merged.

### Customer OTP

Perform a real one-time-code delivery and login against the intended production customer email path. Do not do that as part of UX-10J.

### Authenticated Customer Portal responsive browser verification

This check is not completed. It is required before `CUSTOMER_PORTAL_ENABLED=true`.

The repository proves source and component responsive safeguards only. It does not prove the signed-in layout in a browser.

Inspect these signed-in routes at 320, 360, 390, 768, 1024, and 1280 pixels:

- Dashboard (`/portal`)
- Case
- Documents
- Service
- Payments
- Guard
- Messages
- Account

Confirm there is no page-level horizontal overflow, the portal navigation stays keyboard reachable, long values wrap, controls are not clipped, and focus styles stay visible.

### Customer evidence storage

If evidence upload is part of the first launch, verify the bucket, OIDC, the customer-specific evidence role, least privilege, and the scan boundary outside this repository phase.

### Recovery rehearsal

Step 22B, the real cloud recovery rehearsal, remains outstanding and is still required before final production sign-off.

### Customer Portal gate

`CUSTOMER_PORTAL_ENABLED=true` is a launch-day action after the blockers above are cleared. It stays off in this change.

### Marketing Customer Login link

Add that link only after the production customer origin is live and the portal gate has been deliberately enabled. UX-10J does not add a live or disabled marketing login control.

### Optional providers

Stripe, outgoing mail, inbound mail, the Google Business Profile API, Guard automation, and job-worker activation stay separate controlled activations. Launching the portal must not turn any of them on.

## Launch order

This sequence is documentation only. UX-10J does not execute it.

1. Production database strategy and historical ledger handling — COMPLETE by clean Strategy A build.
2. Complete the required recovery and cloud prerequisites, including Step 22B.
3. Confirm the Customer Vercel project and domain.
4. Configure production customer backend variables without enabling the portal.
5. Confirm the production database migration head.
6. Confirm customer evidence infrastructure if upload will be available.
7. Verify the production Customer app while the portal gate remains off.
8. Perform a controlled one-time-code login check.
9. Confirm the providers that should stay disabled are still disabled.
10. Complete the authenticated responsive browser verification at 320, 360, 390, 768, 1024, and 1280 pixels on the dashboard, case, documents, service, payments, Guard, messages, and account. This check is not done.
11. Set `CUSTOMER_PORTAL_ENABLED=true` deliberately.
12. Verify login and an owned-customer portal journey.
13. Only then expose the marketing Customer Login entry point.
14. Watch authentication and errors closely during the first controlled use.
