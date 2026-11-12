# Phase 03A-03-03-02-08 — Controlled Retell DEV operational readiness

This is a DEV-only audit and runbook. It does not enable a feature flag, store a provider credential, apply a migration, create a hosted fixture, place a Retell call, send a customer notification, turn on telephone forwarding, or activate a service.

## Verified baseline

- GitHub PR #440 and PR #442 are merged. `develop` records the initiation migration as applied.
- The repository migration head is `20261106200000_admin_commercial_initiate_agent_test_call_v1.sql`.
- The confirmed hosted DEV ledger contains 123 applied migrations and ends at `20261112223000`. `pendingMigrations()` is empty. The repository migration head is `20261112223000`.
- `containsDataChange` is true and `safeToReplay` is false for `20261112223000`. Do not replay it. Do not apply it to Production.
- The SQL file header still contains the earlier instruction not to apply `20261106200000` to hosted DEV. Leave that file unchanged. The manifest is the current ledger record.
- The confirmed apply created zero test attempts.
- All four Vercel deployments for that baseline were Ready.
- `ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED` stays off. Retell credentials are not configured by this change.
- Production remains at its existing ledger head. This phase does not change it.

## Controlled-call journey

The Admin paid-setup page at `apps/admin/app/commercial/setup/page.tsx` reads the queue only when `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED` is exactly `true`. Each later command has its own flag and also requires that queue flag. `VERCEL_ENV` selects the lane: `preview` and `development` use the dev lane; `production` uses the production lane. Any other value leaves the provider commands closed.

The server requires this order before it will open a web conversation. Each step is an audited command. A later step stays hidden until its own flag is exactly `true`.

1. Verified paid subscription. The subscription is `BILLABLE`, `VOICE`, and `ACTIVE`, with `current_period_end` in the future and a stored payment-evidence row. The business membership is `verified`. The onboarding request is `PROVISIONING` and includes the selected location.
2. Begin setup, then confirmed business preferences for every selected location.
3. Current AI configuration for that location. The stored provider revision must be `rev-` followed by exactly four digits. `rev-0004` is agent version 4. The configuration environment must be `dev` for a Preview test.
4. Current telephone allocation. The provision binding is `alloc:` plus the allocation id. Recording an allocation does not show that the number is routing calls.
5. Current forwarding instructions with status `SHARED`, tied to that allocation. `SHARED` shows the assigned number and the approved instructions in the Customer Portal and says not to enable forwarding yet. `DRAFT` stays internal and cannot open a test.
6. Service provision state `TEST_REQUIRED`, with forwarding already instructed, and with `provider_test_call_ref`, `agent_test_passed_at`, `customer_confirmed_at`, and `live_at` empty.
7. Start controlled receptionist test. The operator ticks the charge acknowledgement. The server claims provider creation once, sends `agent_id` and the numeric `agent_version` to `POST https://api.retellai.com/v3/create-web-call`, and returns the connection fields only in that response. Those fields are not stored. A typed call id is rejected.
8. The browser SDK joins the web conversation. End call, a provider-confirmed natural end, or Check test-call status settles the attempt only from provider evidence.
9. Verify AI receptionist test call. A pass moves that location from `TEST_REQUIRED` to `AWAITING_CONFIRMATION` and still says the final telephone connection is unconfirmed. A failed assessment leaves the location in `TEST_REQUIRED`.

The queue label while the conversation has not passed is `Verify AI receptionist test call`. The Start form is a separate control on the same row. Use Start to open the conversation. Use Verify only after the provider has confirmed that the web call ended.

## Server-side Retell variables

The implementation reads exactly two server-side credential names, in `apps/admin/lib/commercial/agent-test-call-provider.ts`.

| Lane | Variable | Where it may be set for this test |
| --- | --- | --- |
| Dev | `TELLOYA_RETELL_DEV_API_KEY` | Admin Preview, or a local development server, only |
| Production | `TELLOYA_RETELL_PRODUCTION_API_KEY` | Production only, and not for this DEV test |

`VERCEL_ENV=preview` or `VERCEL_ENV=development` selects the dev key. `VERCEL_ENV=production` selects the production key. The value must be a string of at least 8 characters with no leading or trailing space. The browser never receives the key. Do not print, log, or commit the value. Do not use a `NEXT_PUBLIC_` name.

The dev key is used for `POST /v3/create-web-call`, `GET /v2/get-call/{callId}`, and `POST /v2/stop-call/{callId}`. It does not buy a number, place a telephone call, enable forwarding, or activate routing.

## DEV-only enablement checklist

This checklist is for a later authorised operator. This change does not set any hosted variable.

Set these on the Admin project Preview environment that serves `develop`. Leave them absent on Production, and leave them absent on the Customer and marketing projects.

- `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED` exactly `true`.
- `ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED` exactly `true`.
- `ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED` exactly `true`, so the same operator can record the conversation assessment after the provider confirms the end.
- `TELLOYA_RETELL_DEV_API_KEY` present as a server-side secret.

Enable an earlier setup flag only when the chosen subscription still lacks that step:

- `ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED`
- `ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED`
- `ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED`
- `ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED`
- `ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED`

Each of those also requires the setup-queue flag. Redeploy the Admin Preview after the variable change so the server reads it. Leave `VERCEL_ENV` to the platform. On that Preview it is `preview`, which selects the dev lane.

Leave `TELLOYA_RETELL_PRODUCTION_API_KEY` unset on Preview. Leave every flag above unset on Production.

## Minimum safe test data

Do not create a hosted fixture from this phase. An authorised operator selects one existing DEV subscription that already meets the preflight:

- An Admin who can open the paid-setup page, with a session created less than 30 minutes ago and seen less than 30 minutes ago. Sign in again when that window has passed.
- One verified paid Telloya or Complete voice subscription, one business, and one selected location.
- Current confirmed preferences, current dev-lane AI configuration, and a `rev-` plus four-digit revision whose integer is the agent version the provider should run.
- The current allocation id and version, and the current `SHARED` instruction id and version.
- Provision state `TEST_REQUIRED`, with no stored provider test-call reference and no live timestamp.
- No active attempt for that subscription and location. Active states are `INTENT_RECORDED`, `CREATION_IN_PROGRESS`, `PROVIDER_CREATED`, `BOUND`, and `REQUIRES_RECONCILIATION`.

The durable limits are 8 attempts for one operator in 60 minutes and 3 attempts for one location in 24 hours. A completed or failed attempt still counts. The pre-authorised window for one attempt is 30 minutes.

## SDK and API compatibility

`apps/admin/package.json` pins `retell-client-js-sdk` at `3.0.4`. The page calls `RetellClient.createWebCall()` with `transcript: false` and a custom fetch adapter. The adapter sends the trusted command to `/api/commercial/initiate-agent-test-call` and forwards an SDK `POST /v2/stop-call/{callId}` to `/api/commercial/cancel-agent-test-call`. The provider secret stays on the server.

The create contract enforced by the server is Retell `POST https://api.retellai.com/v3/create-web-call`. The documented OpenAPI info version is `3.0.0` and the spec revision recorded for this implementation is `2026-11-06-e7339fa`. The request body is `agent_id` and integer `agent_version`. HTTP 200 and 201 can succeed. A usable success has `call_id`, `access_token`, `transport` equal to `gateway`, `ice_servers`, and `expires_at`. Status and verification use `GET https://api.retellai.com/v2/get-call/{callId}`. Cancellation uses `POST https://api.retellai.com/v2/stop-call/{callId}` with a 4 second timeout. There is no telephone-call create in this path.

`agent_version` from Get Call is an integer. The stored revision `rev-0004` matches integer 4. A missing, malformed, or different version does not pass verification.

## Manual test procedure

Run this only after the enablement checklist and the go/no-go checks. One operator, one location, one attempt.

1. Sign in to Admin on the Preview deployment. Confirm the session is inside the 30-minute window.
2. Open the paid-setup queue and select the prepared location. Confirm the configuration environment is dev, the instruction status is `SHARED`, and the provision is `TEST_REQUIRED`.
3. Allow the microphone in the browser before Start. A denial after the provider has created the call leaves an active attempt.
4. Tick “I understand this controlled web call may incur a provider usage charge.” Start stays disabled until that box is ticked.
5. Choose Start controlled receptionist test. Speak and confirm the receptionist audio is audible. The page does not show the access token, transcript, or recording.
6. Choose End call while the browser session is live. The button is available during the live session, including before the call id is painted. The page shows a completed state only when the server responds `completed`.
7. For reload recovery, start a second authorised attempt only after the first attempt is provider-confirmed complete and a fresh charge acknowledgement is ticked. After the call is connected, reload the page. End call must be available from the stored attempt. It posts the stored initiation request id and the stored call id. A typed call id is not accepted. Check test-call status and End call do not need the charge box.
8. Provider-confirmed completion is a Get Call result of `web_call` with call status `ended`, or a stop-call response in the 2xx range that the server settles as `provider_cancelled`. The local SDK end, the 600-second browser timer, and a page-close request are not completion.
9. Record verification. Pass every criterion only when the conversation supported it: greeting, language and voice, caller identity, enquiry details, callback windows, business hours, escalation, avoidance of unsupported promises, and conclusion. The staff attestation is 20 to 500 characters. Any criterion left unpassed is a failed conversation. The location stays in `TEST_REQUIRED`.
10. Failed-QA retest. After the attempt is `COMPLETED`, tick a fresh charge acknowledgement and start another controlled web call for the same location. The previous failed assessment does not write `provider_test_call_ref`. An active, ongoing, or reconciliation attempt blocks the new start.

## Usage charge, duration, and uncertain outcomes

The charge acknowledgement is explicit and applies to that start. A provider usage charge can be incurred when create-web-call succeeds. On the dev lane the server reads `GET /get-agent/{agent_id}?version=` for the stored integer version before create. The web call stays unopened unless that same version reports `max_call_duration_ms` from 60000 through 300000. The browser safeguard remains 600 seconds. At that limit the browser leaves the audio connection and shows that the test stays open until the provider confirms the end. The timer does not complete the attempt, does not prove the provider ended the call, and does not start another call.

Expected provider evidence:

- Create success: HTTP 200 or 201, `call_type` later reported as `web_call`, echoed agent id and integer version matching the stored configuration.
- Natural end: `GET /v2/get-call/{callId}` returns `web_call` and `ended`. Settlement basis `provider_ended`.
- End call: `POST /v2/stop-call/{callId}` returns 2xx for that same stored web call. Settlement basis `provider_cancelled`.
- The initiate, cancel, and review responses keep `forwardingVerified` false. A pass still says telephone forwarding is not verified and the receptionist is not live.

Uncertain creation is a timeout, network failure, HTTP 408, 429, or 5xx, or a 200/201 body that contains a call id the server cannot use. The attempt moves to `REQUIRES_RECONCILIATION`. Do not start another call. Use Check test-call status with the stored attempt. A lost browser response after a successful bind also returns reconciliation and does not create a second call to recover a token.

Uncertain cancellation is a timeout, network failure, HTTP 408, 429, or 5xx from stop-call. The attempt stays locked. A rejected stop releases the stop claim and leaves the attempt open. A `phone_call` result is not stopped and is not settled. A missing stored call id stays an investigation lock: End call stays hidden and another call is not started.

## Go / no-go

Go only when every line below is true.

- The deployment is the Admin Preview for `develop`, `VERCEL_ENV` is `preview`, and the dev API key is the only Retell key on that deployment.
- The production API key is absent from Preview and Production flags remain off.
- The selected provision is `TEST_REQUIRED`, with no live timestamp and no stored test-call reference.
- Forwarding instructions are `SHARED` and the customer copy says not to enable forwarding yet.
- Nobody has switched on call forwarding on the customer telephone, purchased a number, written a routing binding, or moved the service to `LIVE`.
- No customer email or SMS is sent for this test.
- The operator has ticked the charge acknowledgement for this start, allowed the microphone, and confirmed there is no active attempt for the location.
- The operator will stop at the first reconciliation, telephone-call, or missing-call-id result.

No-go, and leave the flags off, when any of those checks fails.

## Outstanding blockers

- The initiation and verification flags are off. The setup-queue flag is off. The page hides Start and does not call the provider.
- `TELLOYA_RETELL_DEV_API_KEY` is not configured. With the flag on and the key absent, creation does not open a call.
- This phase does not authorise a real or chargeable Retell call.
- This audit did not select or create a hosted subscription. A qualifying DEV subscription still has to be identified by an authorised operator.
- Production is out of scope and stays unchanged.

Until those blockers are cleared by a later authorised change, the manual procedure stays unrun.

## Rollback and disable

1. If an attempt is active, use Check test-call status and End call while the initiation flag and the dev key are still present. Wait for `completed`, or leave a reconciliation lock in place. Do not start a replacement call to clear it.
2. On the Admin Preview only, remove `ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED` or set it to a value other than exactly `true`. Do the same for `ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED` when the assessment is finished. Redeploy that Preview.
3. Remove `TELLOYA_RETELL_DEV_API_KEY` from the Preview after no attempt is waiting on a provider read or stop. Leave the production key unset.
4. Leave the DEV migration in place. Do not replay `20261106200000`. Do not delete attempt or intent rows to force another start.
5. Leave telephone forwarding off and leave the service out of `LIVE`. A passed conversation stops at `AWAITING_CONFIRMATION`.

## Expected result of this phase

The repository contains this runbook and the commercial-readiness note names `20261106200000` as applied once on DEV. No hosted variable, credential, migration, or customer-facing state changes. No Retell call is placed.
