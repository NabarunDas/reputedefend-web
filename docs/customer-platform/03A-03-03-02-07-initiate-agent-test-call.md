# Phase 03A-03-03-02-07 — Secure controlled web-call initiation

`20261106200000_admin_commercial_initiate_agent_test_call_v1.sql` is a forward-only repository file. It is not applied to hosted DEV. It is not applied to Production. `20261106120000_admin_commercial_verify_agent_test_call_v1.sql` and `20261106140000_telloya_standard_location_cap_v1.sql` stay unapplied as well. The verified DEV ledger contains 114 entries and ends at `20261106140000`. `20261106120000` and `20261106140000` are applied and must not be replayed. The repository has 118 migration files. This initiation file is the only pending migration.

The Admin command opens a controlled web conversation for one selected location. It records a pre-authorised intent, then asks the provider to create the web call, then stores the call id from that response on a separate immutable binding. The browser cannot supply the call id. A typed reference is rejected before any provider request.

The provider call is Retell HTTP API `POST /v3/create-web-call`. The OpenAPI document identifies info version `3.0.0` and spec revision `2026-11-06-e7339fa`. The request body sends `agent_id` and the numeric `agent_version` mapped from the stored `rev-` plus four digits. It does not send metadata, a version tag, or `latest`. No Retell SDK package is installed. Verification continues to read `GET /v2/get-call/{callId}`.

`ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED` stays off. It also requires `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED`. The dev and production provider credentials are catalogued and are not configured by this change. Tests mock the provider response. No real provider call is placed.

The command does not place a telephone call, enable forwarding, write a routing binding, verify the conversation, or move a service to live. A passed conversation still requires the separate verification command.
