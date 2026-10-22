# DEV quotation-email operational smoke test

Scope: **Admin Vercel Preview / develop** with DEV Supabase and DEV Customer portal only. Not a Production instruction.

## Setup after adding the feature

1. In the `profilerelaunch-admin` Vercel project, set `DEV_MAIL_ALLOWED_RECIPIENTS` to exactly one real, owner-controlled DEV test mailbox. Scope it only to Preview on the `develop` branch and store it as **sensitive**; do not add a list, wildcard, sample-domain address, or real customer's address. The email must be identical to the verified DEV customer email on the test quote. The setting must not appear in Git, logs, UI, or any Production environment.
2. Trigger a fresh Preview/develop deployment **after** the environment change and verify the new deployment is READY. A deployment of an unchanged commit can be ignored by the project's existing `commandForIgnoringBuildStep`; this document change provides a genuine `apps/admin` source-path diff for this isolated configuration refresh. Keep that ignore-build rule in place.
3. Check existing `COMMUNICATIONS_SEND_ENABLED`, `CUSTOMER_ORIGIN`, `RESEND_API_KEY`, `COMMUNICATIONS_LINK_SECRET`, monitored Reply-To, and the DEV Supabase project are all properly scoped to Preview/develop. Never copy Production credentials into DEV.
4. Start a **new synthetic** DEV business case through Marketing using the owner-controlled test mailbox, verify contact email and business authority, then progress the legitimate Admin screening and quote steps. An already ACCEPTED quotation is not eligible for a new invitation; don't replay or mutate historic quotations.
5. In Admin Step 6 on a current OFFERED service-specific quotation, review the branded HTML preview, amount, inclusions/exclusions, validity, and recipient. Click **Send quotation to customer** once. The signed-in Admin session may need fresh OTP for the one-off DEV sender; otherwise the durable send queue should remain visible through Communications → Process queued email.
6. Confirm at least QUEUED, then `PROVIDER_ACCEPTED` after Resend accepts it, and `DELIVERED` only if webhook/inbox evidence supports it. Check spam/Inbox in the actual test mailbox, open the secure **Review and accept quotation** button, and complete the Customer Portal acceptance with the synthetic account. Do **not** start any payment or change Stripe LIVE.
7. Verify one action, one recorded email and one customer acceptance. No raw `#t=` bearer appears in SQL/outbox, logs or snapshots. A customer's email address cannot be changed by a browser request.

## Expected safeguards

- No emails before an explicit authenticated Admin send.
- Fail closed if the DEV mailbox allowlist is missing/malformed or does not exactly match the verified recipient.
- Server restrictions still require OFFERED quotation, operative service-specific agreement and validated business authority.
- No Production deployment, billing, or real-customer communication as part of this smoke test.

Related: #276 and #277 (quotation email); #278 (later, separate payment flow).
