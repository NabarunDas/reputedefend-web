# Phase C-06B-01 — Approved policies and usage-control foundation

Status: the commercial rules in `telloyaOwnerApprovedPolicy` are OWNER_APPROVED on 7 November 2026. The Telloya Service Agreement is not legally approved. `20261107110000_telloya_subscription_usage_ledger_v1.sql` is source only. Do not apply it to hosted DEV. Do not apply it to Production. No Stripe charge, invoice, or subscription is created. `TELLOYA_USAGE_EVENTS_ENABLED` stays off. Live call routing is not enabled.

Telloya remains a product of ProfileRelaunch Ltd. This phase reuses the company identity, customer accounts, commercial subscriptions, and `public.telloya_voice_leads`. It does not add a Telloya company, a second login, a second payment engine, or a second lead table.

## 1. What the owner approved

Recorded in `apps/admin/lib/commercial/telloya-catalogue-proposal.ts` and the draft agreement:

- Basic £49 a month, 120 minutes. Growth £79, 300 minutes. Pro £120, 500 minutes. Custom by a separate quotation.
- Relaunch Guard £9.99 per paid location a month.
- Additional minutes £0.25 a minute, only with explicit opt-in and a hard spending cap.
- One operating location and one receptionist number on a standard plan.
- Unused minutes expire at the end of the monthly billing period. `minutes_rollover` stays false.
- Cancellation is allowed at any time and takes effect at the end of the paid period. There is no automatic pro-rata refund. That rule is subject to applicable law and to a remedy where the service has failed.
- The subscription renews monthly at the accepted amount until cancellation.
- Standard setup is included. Complex setup is quoted separately.
- Only a structured lead summary and the caller details needed to act on it are retained. ProfileRelaunch does not keep a full transcript or call audio.
- Caller data is not authorised for AI-model training.
- Lead details and summaries are kept for 90 days, with deletion or erasure and a documented legal hold as exceptions.

`LEGAL_REVIEW_REQUIRED` remains on liability, governing law, courts, consumer cancellation wording, service credits, and the published privacy supplement. `PROVIDER_VERIFICATION_REQUIRED` remains on the provider account settings below. Tax stays `OWNER DECISION REQUIRED` with `productionTaxBehaviour` null.

## 2. Partial minutes

`REVIEW_BEFORE_CHARGE`. The proposed customer-facing calculation, in `reviewedOverageMinor`, is:

1. Use the provider-confirmed duration in integer seconds.
2. Seconds inside the included allowance are not charged.
3. Seconds beyond that allowance round up to the next whole minute. One second of overage is one minute. Sixty-one seconds are two minutes.
4. Each of those minutes is 25 minor units.
5. The resulting amount is capped at the accepted `overage_cap_minor`.

No charge is created. A reviewer must accept this rounding before any invoice item exists.

## 3. Usage ledger

`admin_private.commercial_usage_events` stores one row per provider call. A second delivery of the same body hash is a replay. A different hash for the same call is a conflict and does not add a second billable row. The original row cannot be updated or deleted. A later duration is an append-only row in `admin_private.commercial_usage_corrections`.

A customer phone call is linked to the existing subscription, business, and location. The period must be the subscription's current Stripe period, or the period already reserved for that call when the event arrives after renewal. An event is not added to the next period. Internal Admin web calls use `call_scope = admin_web_qa`, have no subscription, and are excluded from `commercial_usage_customer_seconds_v1`.

Included minutes, the overage choice, the rate, and the cap are copied from the accepted snapshot. A marketing form preference is not a charge.

## 4. Allowance evaluation

`evaluateUsage` in `apps/admin/lib/commercial/usage-policy.ts` is the server-side decision:

- An active subscription and a LIVE provision can start a call while included seconds remain, counting open one-minute reservations.
- With overage off, an exhausted allowance authorises no further paid AI usage.
- With overage on, the next minute is allowed only when it stays inside the accepted cap at 25 minor units.
- A cap that the next minute would pass authorises nothing further.
- A cancelled, paused, expired, or unpaid subscription authorises no new billable call. Cancellation scheduled for the period end still allows calls until that period ends.
- This decision does not create a charge and does not reject a live telephone call.

## 5. Provider events

`processUsageEvent` checks `TELLOYA_USAGE_EVENTS_ENABLED` and the existing Retell `x-retell-signature` over the raw body. A customer call is accepted only when the dialled number is bound in that environment. A subscription id in the payload that disagrees with the binding is rejected. `call_ended` supplies duration. `call_analyzed` may supply only `caller_name`, `callback_number`, `service_requested`, `callback_window`, and `summary`. Transcripts, recording URLs, and access tokens are dropped and are not logged.

The Admin controlled web-call path is unchanged and is classified as internal QA.

## 6. Privacy and provider settings

Checked against Retell's published docs on 7 November 2026. None of these account settings is confirmed as activated.

| Intended control | Published provider position | This repository |
| --- | --- | --- |
| Data storage Basic Attributes Only | A per-agent setting. It stores metadata only. The webhook can still contain the transcript and a short-lived recording URL. | Not assumed active. Ingress drops those fields. |
| No ProfileRelaunch transcript or audio | Application choice. | The usage command and the ledger have no transcript or recording column. |
| No caller-content training | An enterprise MSA says Retell does not train on that customer's data. The standard terms allow de-identified use when recording is not opted out. | Not verified for this account. The owner policy forbids authorising caller data for training. |
| 90-day lead retention | Retell retention is a separate per-agent setting and is not this policy. | `telloya_voice_redact_expired_leads_v1` clears lead personal fields after 90 days. An open row in `telloya_lead_legal_holds` keeps the lead. Usage and payment evidence are not deleted on that schedule. |

Before any live call, confirm the agent data-storage setting, the training terms that apply to this account, and that webhook logs do not retain caller content.

## 7. Why live quota enforcement is not claimed

Retell's inbound webhook can return `{ "call_inbound": { "reject": true } }` and hang up before the agent starts. That response works when the webhook succeeds, including when a default inbound agent is configured.

If every webhook attempt fails, Retell connects the call to the number's inbound agent when one is set. With a default agent, webhook failure is fail-open. An in-progress call is also outside that webhook: a later cap check cannot cut off speech that has already started, and this phase does not call the provider stop endpoint for a customer telephone call.

Live routing stays off. The next phase has to do all of the following before a cap can be described as enforced:

1. Put no default inbound agent on the number, or prove a provider configuration that disconnects when the webhook fails.
2. Answer the inbound webhook with `reject: true` before the agent starts when `evaluateUsage` denies the call, and treat a handler error as that same reject.
3. Reserve one minute before answering, and release or consume it from the provider's final duration.
4. Stop an in-progress call when a concurrent reservation would pass the cap, with a tested provider stop and a defined result when that stop fails.
5. Play only an approved short message that the business will call back. Do not turn on voicemail or telephone forwarding from this phase.
6. Keep `TELLOYA_USAGE_EVENTS_ENABLED` off until those checks are demonstrated.

The customer-facing fallback to prepare, and not to activate now, is a short message that the business will return the call, then the end of the call. It is not voicemail and it is not forwarding.
