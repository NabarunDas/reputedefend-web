# 03A-03-03-02-01 — Audited Admin Begin Setup

`20261105130000_admin_commercial_begin_setup_v1.sql` is the repository head and is not applied. `20261105120000_telloya_voice_persistence_v1.sql` was applied once to DEV. The verified DEV ledger contains 105 entries and ends at `20261105120000`. Exactly one migration is pending. Do not replay `20261105120000`. Do not apply `20261105120000` to Production. Do not apply `20261105130000` to DEV or Production. Production remains at `20261014170000`.

## Command

`public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)` is service-role only. `anon` and `authenticated` cannot execute it. The Admin route calls it only when `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED` and `ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED` are both exactly `true`. Both flags stay off. The database command does not read those flags. It checks the Admin session, a sign-in within 30 minutes, the request id, the payload fingerprint, and the subscription version inside the transaction.

A successful command locks the subscription, the onboarding request, and the selected locations. It creates one `PENDING` `TELLOYA` entitlement and one `PROFILE_REQUIRED` provision for each selected location. It moves the onboarding request to `PROVISIONING` only from `OFFERED`, `INVITED`, or `AWAITING_PAYMENT`. It writes an append-only setup event, an onboarding event, entitlement events, and a commercial subscription event, then stores the command receipt. A repeated request id with the same payload returns that receipt. The same request id with different data conflicts. Two commands for one subscription are serialised. The second conflicts when the onboarding version has moved or a Telloya entitlement or provision already exists, and that existing row is left unchanged.

The command refuses a subscription that is not billable and `ACTIVE`, whose payment evidence does not match the accepted offer and the recorded period, whose checkout preparation does not match, whose business membership is not verified, whose locations are not that business’s, or whose location count does not match the accepted Telloya quantity. It does not start setup for a canceled, ended, or expired subscription.

## What setup in progress means

The existing handover classifier treats `PROFILE_REQUIRED` as setup started. The customer setup page then shows **Setup in progress**. Payment stays confirmed from the stored evidence. Business preferences, the AI receptionist, the number and forwarding, the test call, and activation stay planned. My Products keeps Telloya pending because the entitlement is `PENDING`, so it is not shown as operationally active. Guard rows are not created.

## Next command

`03A-03-03-02-02 — Confirm Business Preferences` is a separate unapplied command, described in `03A-03-03-02-02-confirm-preferences.md`. Begin setup does not invent hours, callback instructions, service behaviour, or language and voice preferences from the selected locations, the accepted payment, or the customer’s contact records.

This command does not call a telephone provider, buy or allocate a number, configure an AI agent, enable forwarding, answer calls, enable Guard monitoring, change a price, enable overage, send mail, or move a provision to live.
