# Phase 03A-03-03-02-08-02 — DEV test subscription pathway and Retell cost-safety gate

This audit prepares the genuine DEV route to one `TEST_REQUIRED` location and the provider-side duration check required before the first authorised controlled web call. It does not enable a flag, store a credential, seed a plan, create a payment, place a Retell call, send mail, turn on forwarding, or change Production.

Current status: not ready for that call. The command chain exists in the repository and the DEV ledger is applied. The commercial records and the provider duration evidence do not.

## Current DEV readiness

- `develop` includes merged PR #443. The repository and confirmed DEV ledger head remain `20261106200000`. `pendingMigrations()` is empty. 115 migrations are applied.
- Every commercial feature flag named below stays off. `TELLOYA_RETELL_DEV_API_KEY` and `TELLOYA_RETELL_PRODUCTION_API_KEY` are not configured by this change.
- The migrations through forwarding instructions insert no `product_catalogue`, `plan_versions`, `commercial_plan_conditions`, or `commercial_agreement_versions` row. The local `TELLOYA-TEST-` fixture is for the isolated test database. Its agreement text says it is not a legal agreement and it is not approved for a customer.
- This audit did not read or write hosted rows. It does not treat a local rehearsal as a hosted subscription.

## Journey

| Step | Repository command | Usable on hosted DEV today | Exact gap |
| --- | --- | --- | --- |
| Telloya enquiry | Marketing `POST /api/telloya/enquiry` when `TELLOYA_ENQUIRY_ENABLED` is exactly `true` | No | The flag is off. The route answers 503 and the form hides submit. No Admin command inserts a Telloya enquiry. Test files insert `public.enquiries` directly. That is not a hosted operation. |
| Admin approval | `classify`, `review`, `match_customer`, `match_business`, `select_locations`, `mark_ready`, `prepare_offer` on an existing enquiry | The commands exist. They have no enquiry to open. | `prepare_offer` offers only an `APPROVED` plan whose conditions and agreement are also approved. The tier migration adds `tier_code` and inserts no plan. |
| Customer verification | `CUSTOMER_INVITATION_DISPATCH_ENABLED` on Admin and `CUSTOMER_INVITED_LOGIN_ENABLED` on the Customer Portal | No | Both stay off. Dispatch can queue mail. This phase does not send it. |
| Plan and terms acceptance | `CUSTOMER_COMMERCIAL_OFFER_READ_ENABLED` and `CUSTOMER_COMMERCIAL_OFFER_ACCEPT_ENABLED` | No | Acceptance requires the approved agreement for the plan `terms_ref`. A missing agreement is `terms_pending`. Acceptance moves the subscription from `OFFERED` to `ACCEPTED`. It does not create payment evidence or an entitlement. |
| Stripe test-mode payment | `CUSTOMER_COMMERCIAL_CHECKOUT_ENABLED`, then `CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED` and `CUSTOMER_COMMERCIAL_PAYMENT_SETTLEMENT_ENABLED` with `PAYMENTS_PROVIDER_MODE=stripe_test` on Preview | No | Preview accepts only `stripe_test` with a test key. The settlement worker writes one `commercial_payment_evidence` row and moves `PAYMENT_PENDING` to `ACTIVE` only after a second provider read is exactly `verified`. Both payment flags stay off. No Stripe price exists for the Telloya or Guard total. Checkout preparation in the rehearsal leaves the Stripe product, price, and session empty. |
| Active subscription | The settlement transaction above | No | A `BILLABLE`, `VOICE`, `ACTIVE` subscription requires that verified test-mode evidence. This phase does not invent a payment. |
| Admin setup through `TEST_REQUIRED` | Begin setup, confirm preferences, confirm AI configuration, record number allocation, record forwarding instructions as `SHARED` | The SQL and commands are on DEV. The flags are off. | Begin setup creates one `PROFILE_REQUIRED` Telloya provision after payment. `SHARED` forwarding can move `FORWARDING_REQUIRED` to `TEST_REQUIRED`. Sharing does not enable forwarding and does not set `live_at`. There is no paid subscription to attach these commands to. |

Tax behaviour and any Custom amount are still owner decisions. The rehearsal uses `NOT_APPLICABLE` so a local price can be accepted. That is not a tax decision. The catalogue proposal approves the one-location number policy. That approval is not a hosted seed.

## Stripe test-mode journey

Use this only after an owner has approved one DEV plan, its conditions, and its agreement, and a later change has created those rows through a reviewed path. This document does not create them.

1. Keep the deployment on the Admin and Customer Preview for `develop`. `PAYMENTS_PROVIDER_MODE` must be `stripe_test`. A live key does not construct a Stripe client on Preview.
2. Leave `STRIPE_LIVE_ACTIVATION` unset. Leave Production flags unset.
3. With the checkout flag exactly `true`, the signed-in customer prepares checkout for the accepted offer selector. The server chooses the amount from the acceptance. The browser does not choose a price.
4. Complete Checkout in Stripe test mode for that same amount. A return URL is not payment evidence.
5. With verification and settlement both exactly `true`, and the DEV payment worker open, one signed `invoice.paid` receipt can settle. The worker reads the invoice, Checkout session, and Stripe subscription again. Only an exact `verified` result inserts evidence and sets the subscription to `ACTIVE`.
6. Confirm one evidence row, `grant_kind = BILLABLE`, `plan_family = VOICE`, `state = ACTIVE`, and `current_period_end` in the future. Then turn the payment flags off again.

## Retell duration evidence

The pinned create contract and the Get Agent contract are the same OpenAPI info version `3.0.0`, spec revision `2026-11-06-e7339fa`.

`GET https://api.retellai.com/get-agent/{agent_id}?version={integer}` retrieves one agent version. The query value is an agent version, including an integer. Omitting it resolves to the latest version, so the DEV gate always sends the stored integer. The response must contain the same `agent_id` and the same integer `version`.

`max_call_duration_ms` is the provider hard stop. The documented minimum is 60000 ms, the documented maximum is 7200000 ms, and the documented default when the field is unset is 3600000 ms, one hour. A missing field is therefore a one-hour provider limit, which is not evidence of a five-minute cap.

The dev lane now reads that endpoint after the creation claim and before `POST /v3/create-web-call`. The call is opened only when `max_call_duration_ms` is an integer from 60000 through 300000. Five minutes is 300000 ms, which the provider allows. A missing value, a different version, a different agent id, a limit above 300000 ms, or a limit below 60000 ms records `rejected`, moves the attempt to `FAILED_BEFORE_CREATION`, and does not call create. A timeout, HTTP 408, 429, or 5xx on that read does the same: no web call is opened, and the result is not treated as an uncertain create. The read does not call `update-agent` or `create-agent`. The customer agent configuration is unchanged.

The browser safeguard stays 600 seconds. When it fires, the browser leaves the audio connection. That does not complete the attempt and does not prove the provider ended the call. Completion remains a Get Call `web_call` with status `ended`, or a confirmed stop of that same web call.

The production lane does not use this duration gate. This test must stay on the dev lane, with the production API key unset.

A rejected duration check still counts toward the existing limits of 8 attempts for one operator in 60 minutes and 3 attempts for one location in 24 hours.

## Recommended first test

Do not run it in this phase.

1. Clear the commercial gaps above so one location is `TEST_REQUIRED` on the dev lane, with a `rev-` plus four-digit revision.
2. In the Retell dashboard, on that exact DEV agent version only, set `max_call_duration_ms` to 300000. Do not change any other agent, and do not change a customer agent.
3. Read the agent back with the version query and keep the response where the operator can see `version` and `max_call_duration_ms`. The server repeats that read at Start and refuses the call when the evidence is missing or inconsistent.
4. Follow the controlled-call runbook: one operator, one location, one charge acknowledgement, microphone allowed, then Start. End the call from the page. Confirm the provider ended or cancelled that web call before recording QA.
5. Maximum provider-billed duration for one opened web call is 5 minutes when the gate has passed. The first authorised test should be that single call. Three successful creates for the same location in 24 hours would be 15 minutes. This repository does not set the provider’s per-minute price.

## Go / no-go

Go only when every line is true.

- The commercial records were created by the audited commands after the owner approved the agreement text and tax behaviour.
- The subscription is `BILLABLE`, `VOICE`, and `ACTIVE`, with stored payment evidence from Stripe test mode.
- One location is `TEST_REQUIRED`, instructions are `SHARED`, and forwarding on the customer telephone stays off.
- The Admin Preview lane is dev. The production API key is absent. The initiation flag is the only Retell write flag turned on for the window of the test.
- A read of the exact agent version shows `max_call_duration_ms` of 300000 or less, and at least 60000.
- The operator has ticked the charge acknowledgement and will stop after one call unless a failed QA is explicitly retested.

No-go while the enquiry flag is the only way to create an enquiry and that flag is off, while no approved hosted plan and agreement exist, while settlement is off, or while the duration read would be skipped because the deployment is on the production lane.

## Smallest safe next step

Obtain owner approval for one DEV agreement text and one tax behaviour. Then, in a separate reviewed change, create one approved Telloya plan, its conditions, and that agreement on hosted DEV. Do not copy the `TELLOYA-TEST-` fixture text. Do not enable Retell, checkout, or setup flags in that change.

The duration gate in this change is the provider safeguard. It is not a substitute for the missing plan, agreement, payment evidence, or `TEST_REQUIRED` location.
