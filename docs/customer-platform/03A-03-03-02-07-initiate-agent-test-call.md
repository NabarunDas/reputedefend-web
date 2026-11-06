# Phase 03A-03-03-02-07 — Secure controlled web-call initiation

`20261106200000_admin_commercial_initiate_agent_test_call_v1.sql` is a forward-only repository file. It is not applied to hosted DEV. It is not applied to Production. The verified DEV ledger contains 114 entries and ends at `20261106140000`. `20261106120000` and `20261106140000` are applied and must not be replayed. The repository has 118 migration files. This initiation file is the only pending migration.

The Admin command opens a controlled web conversation for one selected location. Staff confirm that the call may incur a provider charge, then the browser SDK connects through an authenticated adapter. The server records an intent, claims provider creation once, and binds only the call id from its own response. A repeated idempotency key cannot create another provider call. An uncertain provider response stays in reconciliation. A typed call id is rejected.

The provider call is Retell HTTP API `POST /v3/create-web-call`. The OpenAPI document identifies info version `3.0.0` and spec revision `2026-11-06-e7339fa`. The request body sends `agent_id` and the numeric `agent_version` mapped from the stored `rev-` plus four digits. It does not send metadata, a version tag, or `latest`. The browser uses `retell-client-js-sdk` 3.0.4. `RetellClient.createWebCall()` uses the authenticated adapter and does not receive the provider secret. Verification continues to read `GET /v2/get-call/{callId}`. The page does not render the access token, transcript, or recording.

`ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED` stays off. It also requires `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED`. The dev and production provider credentials are catalogued and are not configured by this change. Tests mock the provider response. No real provider call is placed.

The command does not place a telephone call, enable forwarding, write a routing binding, verify the conversation, or move a service to live. A passed conversation still requires the separate verification command.
