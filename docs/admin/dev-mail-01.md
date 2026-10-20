# DEV-MAIL-01 Phase A — Marketing develop Preview email

Phase A opens real Resend delivery for Get Help on one lane only: the Marketing Preview whose git ref is `develop` and whose `SUPABASE_URL` is the DEV project `rmzozuiamjcclvtgutgd`. Production is unchanged. Other Preview branches stay closed. This change does not set any Vercel variable, send a message, or start Phase B.

## Flags

Set these only on the Marketing project, and only for the Preview environment of `develop`. Do not copy them to Production, to other Preview branches, or to a `NEXT_PUBLIC_` name.

| Variable | Required value |
| --- | --- |
| `DEV_MAIL_ENABLED` | The word `true`. Surrounding whitespace, including a trailing newline, is ignored. `TRUE`, `1` and `yes` leave the gate closed. |
| `DEV_MAIL_ALLOWED_RECIPIENTS` | A comma-separated list of exact mailboxes. The whole list is rejected when any token is empty, a display name, a wildcard, or more than one address. Comparison is case-insensitive and exact. |
| `DEV_MAIL_INTERNAL_RECIPIENT` | Optional. One exact mailbox that may receive only the internal notice, and only when it is different from the customer recipient. It never authorises the customer acknowledgement. A malformed value closes the gate. |
| `DEV_CASE_INTAKE_NO_EMAIL` | Existing kill switch. The word `true`, after surrounding whitespace is removed, suppresses every case-intake send on this lane, including when `DEV_MAIL_ENABLED` is also true. |

The customer acknowledgement and the internal notice are sent together or not at all. A recipient that is not approved suppresses both. The case is still saved once, keyed by the existing submission id, and a later retry does not create another case or send again after the provider has accepted the message.

Provider acceptance is recorded as `communications.status = SENT` with the provider message id. That status is not inbox delivery. Nothing in this path writes `DELIVERED`. The customer confirmation says the reference was passed to the email provider and that this does not confirm it reached the inbox. A closed gate says the confirmation email is not sent in this development environment.

`NEXT_PUBLIC_GA_MEASUREMENT_ID` is not set or read by this change. Preview analytics stay off.

When this lane still closes, the server logs one line, `[case-intake] dev mail closed reason=<code>`, with an optional `detail` from a fixed list. The codes are `git-ref`, `database`, `kill-switch`, `mail-disabled`, `allowlist-missing`, `allowlist-malformed`, `internal-approval-malformed`, `no-pending`, `customer-rejected` and `internal-rejected`. The line does not contain an address, the allowlist, a token or a secret. Feature-branch previews and Production do not write it. The HTTP response stays the existing suppressed or unavailable copy and does not include the reason.

## Retry of a case that already exists

`POST /api/dev/case-intake-mail` with `{ "publicRef": "<existing reference>" }` is available only on this lane. It loads the stored submission and the stored communication rows, then uses the same gate. It does not insert a case and it does not accept a recipient in the request. A row already marked `SENT` is not sent again. A recipient that is still not approved stays suppressed. Production and every other Preview answer 404 before reading a case. This repository does not call that route.

## Rollback

On the Marketing develop Preview, set `DEV_MAIL_ENABLED` to any value other than `true`, or set `DEV_CASE_INTAKE_NO_EMAIL=true`, or clear `DEV_MAIL_ALLOWED_RECIPIENTS`. The next request persists the case and does not call Resend. No deployment of Production is required.

## What this pull request does not do

It does not change Admin outgoing mail, the production-only worker, or the customer one-time-code path. It does not add a migration, a webhook, or a Vercel value. Automated tests inject a fake provider. A test run does not construct the live Resend client, because the live client is refused when `NODE_ENV` is `test`.

## Later operator check

After review, an operator chooses the test mailboxes and sets the three flags on the Marketing develop Preview only. One synthetic Get Help submission should then show one case, one accepted customer acknowledgement, and one accepted internal notice, both to approved mailboxes only. A second submit of the same submission must not create a second case or a second accepted send. An address that is not on the list must persist a case and send nothing. Preview must still load no GA4 tag.
