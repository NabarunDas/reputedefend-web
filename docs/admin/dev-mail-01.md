# Develop DEV Get Help email

The Marketing develop Preview and Production use the same customer acknowledgement and the same internal notice. Each environment keeps its own database, storage, payment provider, credentials, and Resend configuration. This change does not set a Vercel variable, send a message, or run a migration.

## What is sent

On Production, and on the Preview whose git ref is `develop` and whose `SUPABASE_URL` hostname is the DEV project `rmzozuiamjcclvtgutgd`, Get Help sends when the normal enquiry configuration is ready:

- `RESEND_API_KEY`
- `ENQUIRY_FROM_EMAIL`
- `ENQUIRY_TO_EMAIL`

The customer acknowledgement goes to the address stored with the case. The internal notice goes to that environment's `ENQUIRY_TO_EMAIL`. No separate recipient allowlist and no second on/off switch is consulted. A valid customer address entered on the develop Preview receives the same confirmation Production would send.

Every other Vercel Preview persists the case and does not call Resend. The customer sees that confirmation email is not sent in that preview. Production and the develop DEV Preview do not use that sentence.

Provider acceptance is `communications.status = SENT` with the provider message id. That status is not inbox delivery. This path does not write `DELIVERED`.

The public Get Help route keeps its existing rate limit. One submission key still creates one case. A repeated key returns the stored case and does not insert another.

## Idempotency

Each communication is claimed by one worker before Resend is called. The claim is stored on the communication row. A second worker that loses the claim does not call Resend. The provider call uses the idempotency key `case-intake:<communication id>`.

A definite provider rejection may be tried again, up to three attempts. A provider error, or a successful provider response whose acceptance row cannot be saved, is treated as unknown. That row is not sent again. There is no force-resend flag.

## Staff retry for a case that already exists

`PR-26-RZYCE4` stays as it is. This repository does not call the retry during tests or in this pull request.

After the develop Preview is deployed, a signed-in Admin on that same Preview can replay the stored unsent messages without creating another case:

`POST /api/cases/intake-mail` on the Admin develop Preview, with the Admin session cookie, an `Idempotency-Key` UUID, and a JSON body of exactly `{ "caseId", "publicRef" }`. Both values must identify the same stored row. The body cannot contain an address or a URL.

Admin checks the session, then calls Marketing at the develop host derived from its own `VERCEL_BRANCH_URL` (`profilerelaunch-admin-git-develop-<team>.vercel.app` becomes `reputedefend-web-git-develop-<team>.vercel.app`). Any other host is refused. Marketing checks the same session again and only then sends. Production and every other Preview answer 404 before reading a case.

A public reference on its own does not authorise a send. The removed public route is not registered.

The retry writes a `case_events` row with actor `ADMIN` and the outcome words only. It does not record an address, a token, or a recipient.

## What this pull request does not do

It does not change Production email configuration, Stripe, or applied migrations. It does not send a live message. Automated tests inject a fake provider. A test run does not construct the live Resend client, because that client is refused when `NODE_ENV` is `test`.
