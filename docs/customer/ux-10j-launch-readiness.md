# UX-10J — Customer Portal launch readiness

Complete in source. The Customer Portal is not launched. `CUSTOMER_PORTAL_ENABLED` remains unset. This phase added no migration and no new portal feature.

The repository route inventory matches the assembled portal: `/login`, the portal pages from `/portal` through account, and the portal APIs for auth, evidence, documents, service, payments, receipts, invoices, and Guard. There is no `/portal/relaunch-guard` route. Action routes stay on the action session.

## A. Proven in repository

- UX-10A through UX-10I are integrated behind one portal session and one feature gate. `CUSTOMER_PORTAL_ENABLED` is independent of `CUSTOMER_AUTH_ENABLED`, and only the exact string `true` opens the portal.
- `apps/customer/lib/portal/route-inventory.ts` classifies every portal page and API. It is not the authorisation engine. The proxy and each loader or handler still decide access. A new file under `apps/customer/app/api/portal/` or `apps/customer/app/portal/` fails the inventory test until it is classified. An unclassified `/api/portal/**` path fails closed and is not opened by an action session or a portal session.
- Portal pages require the gate and a portal session. Portal mutation and download routes require the gate, a portal session, and their own origin, content-type, and ownership checks. Pre-auth login posts reach the handler, which returns 404 when the gate is off and does not call a provider.
- A portal session does not open `/case` or an action API. An action session does not open `/portal` or a portal API. Portal sign-out revokes the current portal token and does not change action-session rows. The portal lifetime stays eight hours and the session read does not extend it.
- Customer A cannot read Customer B's case, documents, service, payments, receipt, invoice, Guard location, messages, or account. The same business and the same location do not grant access. A guessed reference or selector matches the not-found result. A changed verified email, an unconfirmed Auth user, or an active Auth ban fails the existing session closed across the portal reads.
- Public `customer_portal_*` functions are security definer, pin an empty `search_path`, and are executable by `service_role` only. `admin_private` portal helpers are not executable by `public`, `anon`, `authenticated`, or `service_role`. Portal auth tables stay in `admin_private`, with row level security and without browser-role grants or policies.
- Customer-facing portal views do not use `dangerouslySetInnerHTML`. Portal links stay on the inventoried routes. They do not put a session token, one-time code, email address, or internal UUID in the URL. Login still continues to `/portal` only after verify succeeds in the handler.
- The accessibility regression checks `lang="en-GB"`, the skip link to `#main-content`, one `h1` on each assembled surface, the named portal navigation and `aria-current`, labelled fields, image alternatives, and the absence of a positive tab index or an empty control. Portal navigation items are real links, so keyboard users can reach them when the list scrolls.
- The layout is fluid at 320, 360, 390, 768, 1024, and 1280 pixels: containers use a percentage width with a minimum of zero, long text wraps, and the page clips horizontal overflow. The existing breakpoints are 359, 480, 768, and 1024 pixels. Reduced motion remains respected. Authenticated portal pages were not opened in a browser in this phase because that requires a live portal session, and the gate stays off.
- `scripts/smoke-customer.mjs` covers `/login`, the portal pages, portal pre-auth posts, portal mutations, and receipt, invoice, and download reads while `CUSTOMER_PORTAL_ENABLED` is off. Those requests redirect or return 404, set no portal cookie, and do not call a provider.
- `npm run release:customer-check` runs the inventory, gate, security, accessibility, manifest, and database checks, then the customer typecheck, build, and smoke. Its closing line is: “Repository checks passed. This is not production launch approval.”
- The applied development head and the repository head are both `20261004080853_customer_portal_messages_account_v1.sql`. `pendingMigrations()` is empty.
- Google API, Stripe, outgoing mail, inbound mail, Guard automation, privacy deletion, job workers, and Cron are unchanged. The marketing site does not gain a Customer Login link.

## B. External action required before portal launch

The repository cannot prove these. None of them is done by UX-10J.

### Customer Vercel deployment

Confirm the production Customer app, project, and domain that will serve the portal.

### CUSTOMER_ORIGIN

Confirm the exact production origin that portal cookies and origin checks will use.

### Supabase production database strategy

The historical foundation migration-ledger discrepancy is still unresolved. It is recorded in `docs/admin/production-cutover-readiness.md` and is not repaired here. Do not choose or promote a production database until that discrepancy is resolved deliberately.

### Production migration head

After the production database strategy is chosen, verify the actual production migration head before anyone enables the portal.

### Customer OTP

Perform a real one-time-code delivery and login against the intended production customer email path. Do not do that as part of UX-10J.

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

1. Resolve the production database strategy and the historical ledger discrepancy.
2. Complete the required recovery and cloud prerequisites, including Step 22B.
3. Confirm the Customer Vercel project and domain.
4. Configure production customer backend variables without enabling the portal.
5. Confirm the production database migration head.
6. Confirm customer evidence infrastructure if upload will be available.
7. Verify the production Customer app while the portal gate remains off.
8. Perform a controlled one-time-code login check.
9. Confirm the providers that should stay disabled are still disabled.
10. Set `CUSTOMER_PORTAL_ENABLED=true` deliberately.
11. Verify login and an owned-customer portal journey.
12. Only then expose the marketing Customer Login entry point.
13. Watch authentication and errors closely during the first controlled use.
