# DEV quotation-email operational smoke test

Scope: **Admin Vercel Preview / develop** with DEV Supabase and DEV Customer portal only. Not a Production instruction.

## Setup after adding the feature

1. Do not add a recipient allowlist, wildcard, or real customer address for quotation email. The recipient is the verified customer email on the quotation, and the send stays inside the DEV environment. `DEV_MAIL_ALLOWED_RECIPIENTS` is not a quotation-email gate. Do not put environment settings in Git, logs, the Admin screen, or Production.
2. Trigger a fresh Preview/develop deployment **after** any environment change and verify the new deployment is READY. A deployment of an unchanged commit can be ignored by the project's existing `commandForIgnoringBuildStep`. Keep that ignore-build rule in place.
3. Check existing `COMMUNICATIONS_SEND_ENABLED`, `CUSTOMER_ORIGIN`, `RESEND_API_KEY`, `COMMUNICATIONS_LINK_SECRET`, monitored Reply-To, and the DEV Supabase project are all properly scoped to Preview/develop. Never copy Production credentials into DEV.
4. Start a **new synthetic** DEV business case through Marketing using an owner-controlled test mailbox, verify contact email and business authority, then progress the legitimate Admin screening and quote steps. An already ACCEPTED quotation is not eligible for a new invitation; don't replay or mutate historic quotations.
5. In Admin Step 6 on a current OFFERED service-specific quotation, review the branded HTML preview, amount, inclusions/exclusions, validity, and recipient. Click **Send Quotation Email** once. Step 6 processes that queued quotation email directly. A sign-in within the last 30 minutes is required. Do not open Communications just to process that email.
6. Confirm **Queued** when processing has not finished, **Submitted to email provider** after Resend accepts it, and **Delivered** only if webhook or inbox evidence supports it. Check spam/Inbox in the actual test mailbox, open the secure **Review and accept quotation** button, and complete the Customer Portal acceptance with the synthetic account. Do **not** start any payment or change Stripe LIVE.
7. Verify one action, one recorded email and one customer acceptance. No raw `#t=` bearer appears in SQL/outbox, logs or snapshots. A customer's email address cannot be changed by a browser request.

## Expected safeguards

- No emails before an explicit authenticated Admin send.
- The recipient must be the verified customer email. A different address is refused. There is no wildcard recipient allowance.
- Server restrictions still require an OFFERED quotation, an operative service-specific agreement, and validated business authority.
- The DEV send stays on the DEV customer portal and the DEV database. It does not send from Production.
- No Production deployment, billing, or real-customer communication as part of this smoke test.

Related: #276 and #277 (quotation email); #278 (later, separate payment flow); #291 (Step 6).
