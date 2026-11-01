# CUSTOMER-AUTH-IDLE-01

Customer Portal sessions now end after 30 minutes without genuine activity. The eight-hour absolute lifetime, counted from email OTP verification, is unchanged. Expiry requires a new email code. This file is the security rationale and the DEV rollout order. It is not an instruction to apply SQL or to deploy Production.

## What is enforced

`admin_private.customer_portal_session_v1` stays `STABLE`. It returns null when the row is revoked, when `expires_at` has passed, or when `last_activity_at + 30 minutes` is not still in the future. Exactly 30 minutes is denied. 29 minutes remains valid. The function does not write, so a case page, document download, payment API, message list, Guided handover, prefetch, or poll cannot extend the session.

`admin_private.customer_portal_touch_session_v1` is the only writer. It locks the row, refuses an idle, absolutely expired, revoked, or otherwise invalid session, and updates `last_activity_at` only when the row is still valid. A second call inside one minute confirms the session and does not write. `expires_at` is never assigned. The public wrapper is `service_role` only. The raw token is not stored and is not returned.

The browser records activity only for a visible tab: pointer and keyboard, debounced to 60 seconds, plus the explicit **Stay signed in** control. Hidden tabs, `visibilitychange`, `pageshow`, `popstate`, and navigation re-check the read-only session endpoint. Restoration hides portal content until that check succeeds. A portal cookie that fails validation sends the customer to `/login?ended=security`.

When the earlier of the idle deadline and the eight-hour absolute deadline passes, the browser hides portal content and the customer name in the header immediately, before it asks the server. It then reads `/api/portal/auth/session` once. That read does not extend the session. The one-second warning clock does not send a request. An expired session goes to `/login?ended=security`. A session another tab has kept valid replaces the deadlines and shows the page again. If the server cannot be reached, the concealed page stays concealed until the customer chooses **Try again**, which reads the session again and does not record activity. A late response cannot reveal the page or redirect a second time.

Sign out still calls `customer_portal_sign_out_v1`. If that call throws or does not return `ok`, the response is 503, the cookies stay, and the screen does not say the session was revoked.

## Existing DEV sessions

The migration sets `last_activity_at = authenticated_at` for rows that do not have one. It does not set it to `now()`.

After the migration commits, a DEV session whose OTP is already older than 30 minutes is idle-expired immediately, even if the eight-hour cookie and `expires_at` are still in date. That customer needs a new email code. A session younger than 30 minutes stays valid until 30 minutes after `authenticated_at`, until the new Customer app records genuine activity.

The column initialisation is an `UPDATE` of existing `admin_private.customer_portal_sessions` rows outside a function body. The manifest therefore records `containsDataChange: true`. It does not change customer, case, payment, message, or quotation rows. The verified DEV ledger head is `20261031160000`. `appliedToDev` is true. `safeToReplay` stays false. Do not replay this file. Production and AWS approved heads stay at `20261014170000`.

## Source

`supabase/migrations/20261031160000_customer_portal_idle_timeout_v1.sql`

SHA-256 `bdb533e18a4a947f2726c9007a59f90288985d4eeae1ca9afc5c5d0d4329db8f` (7,609 bytes). This is the hash of the statement already stored on DEV. Do not replay `20261031160000`, `20261031150000`, or any earlier DEV-applied migration.

## DEV rollout order

1. Do not apply this migration to Production. Do not deploy this Customer app to Production.
2. `20261031160000_customer_portal_idle_timeout_v1.sql` is already the verified DEV head. Do not apply it again. It was applied before the Customer deployment that calls `customer_portal_touch_session_v1`.
3. Confirm the DEV ledger version, the SHA-256 above, and that existing `last_activity_at` values equal `authenticated_at`.
4. Confirm a session older than 30 minutes and younger than eight hours is rejected by `customer_portal_session_v1` while its cookie would still look present.
5. Deploy the Customer app after that confirmation. Until that deploy, the previous app does not send activity, so a customer is signed out 30 minutes after OTP verification even if they keep using the portal.
6. Do not deploy the app first. The new app calls a function the old database does not have, and the old database does not enforce idle expiry.

OTP login, the Stripe return path, Guided handover, and customer-action sessions keep their own rules. Handover and portal data routes call `customer_portal_session_v1`, so they inherit idle expiry. Action sessions stay on `customer_action_session_v1`.
