# Develop DEV Get Help email

The Marketing develop Preview and Production use the same customer acknowledgement and the same internal notice. Each environment keeps its own database, storage, payment provider, credentials, and Resend configuration. This change does not set a Vercel variable, send a message, or run a migration.

The exact check that suppressed case `PR-26-RZYCE4` is undetermined. The deployed gate left the enable flag and the no-email switch open for the bytes Vercel reported. Several later checks in that old gate could still close it, and the allowlist and stored recipients were not readable. The live path removes those DEV-only gates.

## What is sent

On Production, and on the Preview whose git ref is `develop` and whose `SUPABASE_URL` hostname is the DEV project `rmzozuiamjcclvtgutgd`, Get Help sends when the normal enquiry configuration is ready:

- `RESEND_API_KEY`
- `ENQUIRY_FROM_EMAIL`
- `ENQUIRY_TO_EMAIL`

The customer acknowledgement goes to the address stored with the case. The internal notice goes to that environment's `ENQUIRY_TO_EMAIL`. No separate recipient allowlist and no second on/off switch is consulted. A valid customer address entered on the develop Preview receives the same confirmation Production would send.

Every other Vercel Preview persists the case and does not call Resend. If case persistence is off on one of those previews, Get Help does not fall through to the legacy enquiry sender either. The customer sees that confirmation email is not sent in that preview when a case was recorded. Production and the develop DEV Preview do not use that sentence.

Provider acceptance is `communications.status = SENT` with the provider message id. That status is not inbox delivery. This path does not write `DELIVERED`.

The public Get Help route keeps its existing rate limit. One submission key still creates one case. A repeated key returns the stored case and does not insert another.

## Idempotency

Each communication is claimed by one worker before Resend is called. The claim is stored on the communication row. A second worker that loses the claim does not call Resend. The provider call uses the idempotency key `case-intake:<communication id>`.

A definite provider rejection may be tried again, up to three attempts. A provider error, or a successful provider response whose acceptance row cannot be saved, is treated as unknown. That row is not sent again. There is no force-resend flag.

## Staff retry for a case that already exists

`PR-26-RZYCE4` stays as it is. This repository does not call the retry during tests or in this pull request.

After the develop Preview is deployed, a signed-in Admin opens the case communications page, or the communications section of the case details. When the two stored initial emails are genuinely unsent, the page shows **Retry unsent intake emails** with both destinations. The operator confirms those destinations and then sends. The control stays hidden when a row is already accepted, in flight, or left unknown. It does not review or send a later message.

That button posts to `POST /api/cases/intake-mail` on the Admin develop Preview, with the Admin session cookie, an `Idempotency-Key` UUID, and a JSON body of exactly `{ "caseId", "publicRef" }`. Both values must identify the same stored row. The body cannot contain an address or a URL.

Admin checks the session, then calls Marketing at the develop host derived from its own `VERCEL_BRANCH_URL` (`profilerelaunch-admin-git-develop-<team>.vercel.app` becomes `reputedefend-web-git-develop-<team>.vercel.app`). Any other host is refused. Marketing checks the same session again and only then sends. Production and every other Preview answer 404 before reading a case.

Both develop Previews keep Vercel Authentication. A POST that reaches Marketing without a Trusted Sources token is answered by Vercel before the application: HTTP 401, `protection.vercel_auth_enabled: true`, and the message "Protected by Vercel Authentication". That body has no `ok` field. The staff route's own session failure is a different 401 whose body is only `{ "ok": false }`.

The Admin server call sends the short-lived Vercel OIDC token in `x-vercel-trusted-oidc-idp-token` and keeps the Admin session in `Authorization`. The session token is not reused as the Vercel credential, and neither token is written into the Admin response. If the OIDC token is missing, Admin does not call Marketing. A Vercel protection denial says the marketing preview refused the server connection and that the Admin session is still signed in. An application `{ "ok": false }` 401 still says "Please sign in again."

Marketing must list the Admin project `profilerelaunch-admin` under Deployment Protection → Trusted Sources → Vercel Projects, with preview allowed to call preview. Secure Backend Access with OIDC Federation stays on for Admin. Deployment Protection stays enabled. This repository does not store a bypass secret.

A public reference on its own does not authorise a send. The removed public route is not registered.

The retry writes a `case_events` row with actor `ADMIN` and the outcome words only. It does not record an address, a token, or a recipient.

## What this pull request does not do

It does not change Production email configuration, Stripe, or applied migrations. It does not send a live message. Automated tests inject a fake provider. A test run does not construct the live Resend client, because that client is refused when `NODE_ENV` is `test`.

## Phase B: Admin outgoing email

Reviewed Admin email uses the same draft, review, queue, `SEND_EMAIL` outbox row and Resend send on Production and on the Admin develop Preview. Each environment keeps its own database, storage, customer portal and Resend credentials. The scheduled worker remains a Production control. `jobWorkerConfig.enabled` stays false on Preview, including when `JOB_WORKER_ENABLED=true`, so a cron run cannot claim payment, Guard, inbound or Google jobs.

The develop lane is open only when all of these hold:

- `VERCEL_ENV=preview`
- `VERCEL_GIT_COMMIT_REF=develop`
- `SUPABASE_URL` is exactly `https://rmzozuiamjcclvtgutgd.supabase.co`
- `VERCEL_BRANCH_URL` is `profilerelaunch-admin-git-develop-<team>.vercel.app`
- `CUSTOMER_ORIGIN` is exactly `https://profilerelaunch-customer-git-develop-<team>.vercel.app`
- `AWS_EVIDENCE_BUCKET=profilerelaunch-evidence-dev-01`
- `COMMUNICATIONS_SEND_ENABLED=true`
- `JOB_PROVIDER_MODE=production` (this selects Resend for that lane; it does not enable the scheduled worker)
- `RESEND_API_KEY` is the DEV Resend key
- `COMMUNICATIONS_FROM_EMAIL` is a sender verified on that DEV Resend account
- `COMMUNICATIONS_LINK_SECRET` is at least 32 characters and `COMMUNICATIONS_LINK_KEY_VERSION` matches the version stored on the approved email (version 1 when unset)

Set those on the Admin Preview environment for the develop branch. Leave them unset on Production. Do not set `JOB_WORKER_ENABLED` on Preview and do not change the daily Production schedule. The Customer develop Preview keeps the DEV Supabase project and the DEV evidence bucket so an upload link stores the file there.

Queue still requires a reviewed, locked snapshot. The communications page shows **Process queued email** only after that queue exists. The button posts `{ "communicationId", "confirmed": true }` to `POST /api/operations/dev-send-email` with an idempotency UUID. The route checks the Admin session, requires a sign-in created within 30 minutes, and claims `send-email:<id>:v<content version>` through `admin_dev_send_email_claim_v1`. The provider idempotency key remains that outbox event key.

A second request with the same idempotency key is read-only. While the job is `RUNNING`, that replay returns the stored claim without a lease and does not call the provider. After the job succeeds, the same key reports that the email was already processed. A crashed claim that never started a provider attempt can be recovered with a new idempotency key after the 120-second lease expires, and that recovery sends once. If a provider attempt has already started, or provider acceptance is unknown, a new request does not take a lease and does not send again. The Production scheduled worker is unchanged and still uses its own claim path.

The claim promotes and leases that one `SEND_EMAIL` row. It does not call `job_promote_outbox_v1` or `job_claim_batch_v1`. A probe, payment, Guard or Google outbox row stays where it is. An evidence request is claimed only when the plain-text body and the HTML body each contain exactly one upload URL, and that URL is the DEV customer portal plus the stored action id. A production host in either copy, or both hosts in one copy, is refused before the outbox row is promoted. The stored subject, body and recipient stay as approved. Case `PR-26-RZYCE4` already stores the DEV customer portal in both copies. This change does not rewrite or send that email. A snapshot whose upload host is `https://customer.profilerelaunch.com` still needs a new reviewed communication drafted against the DEV portal.

`supabase/migrations/20261021132018_dev_send_email_claim_v1.sql` is one additive function on the shared canonical chain. DEV applied that SQL. The Supabase runner recorded version `20261021132018`, and the repository filename was aligned to that ledger version. The SQL was not replayed and it was not applied to Production. Applying that same chain to Production later creates the function and does not enable Production mail, the scheduled worker, or this route. The function does not update a communication row. `EXECUTE` is granted only to `service_role`, which is the same boundary as the other Admin job functions. The route returns unavailable unless the process is the develop Preview pinned to the DEV Supabase project, so a Production deployment does not call it. Production activation flags stay unset.

## Customer acceptance uses the same Admin dispatcher

Quotation acceptance from a Secure Action and from the Customer Portal queues `GUIDED_PAYMENT_REQUEST` through the existing database communication command. The Customer application does not call Resend. It does not read `RESEND_API_KEY`, `JOB_PROVIDER_MODE`, `COMMUNICATIONS_SEND_ENABLED`, `COMMUNICATIONS_FROM_EMAIL`, `COMMUNICATIONS_REPLY_TO_EMAIL`, `COMMUNICATIONS_REPLY_TO_CONFIRMED`, `JOB_WORKER_ENABLED`, or `CUSTOMER_ORIGIN` in order to queue that email. No second provider key is required on the Customer project.

The sender, reply mailbox and portal origin are copied from the `QUOTE_OFFER` Admin already stored for that acceptance. The customer payload cannot replace them. The recipient remains the verified customer email on the order. There is no dispatch hold on either acceptance route, so the outbox is eligible as soon as the row is queued. An already-paid obligation is not queued, and a payment recorded before the provider is contacted cancels the unsent email. The request claim also refuses an already-paid obligation.

On the Customer develop Preview pinned to the DEV database, a successful queue asks the Admin develop Preview to dispatch that one stored request. The lane is the develop branch URL plus the DEV Supabase project. It does not depend on `CUSTOMER_ORIGIN`. The POST is `https://profilerelaunch-admin-git-develop-<team>.vercel.app/api/internal/mail/dispatch`. The JSON body is exactly `{ "requestId" }`. The Customer server sends its short-lived Vercel OIDC token in `x-vercel-trusted-oidc-idp-token`. It does not send a communication id, a recipient, or an origin.

Admin verifies that token for environment `preview` and the team in `VERCEL_ORG_ID`. The signed subject must contain `:project:profilerelaunch-customer:environment:preview`. `VERCEL_PROJECT_ID` on the Admin deployment is the Admin project, so it is not used as the caller id. The Customer project id is not stored in this repository. The claim `public.dev_mail_dispatch_claim_request_v1` then leases only a `GUIDED_PAYMENT_REQUEST` whose action is `GUIDED_PAYMENT`. A request id for a quotation, an evidence request, or any other template is refused. The lease is settled with the same Admin mail handler, Resend adapter, job lease and delivery tracking used for quotations and evidence requests. The lease owner is `dev-mail-dispatch`. The sweep claim `public.dev_mail_dispatch_claim_v1` and the signed-in Admin claim `admin_dev_send_email_claim_v1` are unchanged and still send those other templates. The sweep still requires the activation watermark, so mail queued before that watermark stays unclaimed by the sweep.

A failed dispatch leaves the acceptance valid and the outbox row queued. A retryable provider failure remains recoverable through the existing Admin send and job lease. Provider acceptance that is unknown is not submitted again.

This route does not read `DEV_MAIL_DISPATCH_WORKER_ENABLED` and does not insert an activation row. The scheduled recovery worker stays closed. Do not enable the worker, pg_cron, pg_net, or the activation row from this change. Do not add a poller for this email.

Both develop Previews keep Vercel Authentication. Admin must list the Customer project `profilerelaunch-customer` under Deployment Protection → Trusted Sources → Vercel Projects, with preview allowed to call preview. Prefer that exact project over a wildcard entry. This repository does not store a bypass secret and does not turn Deployment Protection off. If that call is refused, the email stays queued and the handover reason is `queue_unavailable` or `dispatch_not_configured`. Production customer acceptance can queue the same durable row, and the develop-only claim refuses the production portal host. Sending on Production still requires the Admin communications gates.

An already accepted case such as `PR-26-MEVY5P` is recovered by the existing Admin Step 7 payment request. That path uses the Admin session claim. It does not replay quotation acceptance and it does not need the unapplied `20261030200000` migration. Do not apply that migration from this change.
