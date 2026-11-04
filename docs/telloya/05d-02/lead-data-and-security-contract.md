# Telloya lead data and security contract

**Status:** proposed contract for a later implementation. No migration is created by this document.  
**Date:** 4 November 2026 (UK).  
**Baseline:** `docs/telloya/05d-01/` and `docs/telloya/05d-02/voice-pilot-architecture.md`.

A caller lead is not a Telloya sales enquiry. Sales enquiries remain in `public.enquiries`. This contract does not add columns to that table.

## Minimal lead

Store one row per accepted provider call. All fields are required as columns. A missing caller fact is null plus `incomplete = true`, not a dumped transcript.

| Field | Type | Necessary | Why it is or is not kept |
| --- | --- | --- | --- |
| `tenant_business_id` | uuid | Yes | Isolates the lead. Without it, delivery and portal reads cannot be scoped. |
| `tenant_location_id` | uuid | Yes | The number map is per location. Two locations of one business must not share leads by accident. |
| `provider_call_ref` | text, max 128 | Yes | Idempotency key from the provider. A lead with no provider reference cannot be retried safely. |
| `callback_number` | text, max 32, normalised | Yes when the caller supplied one | This is the number the business will use. It is caller-provided, not assumed from the network. |
| `caller_name` | text, max 120, null | Only if the caller gave it | Useful for the callback. A lead is still valid without it, and it must not be invented. |
| `service_requested` | text, max 280, null | Only if the caller stated a job | The reason for the call. Free text is capped so it cannot become a transcript. |
| `job_location` | text, max 280, null | Only if the caller gave a place | Needed for many trades. Omit when the caller did not say. Do not geocode it in the pilot. |
| `callback_window` | text, max 120, null | Only if the caller expressed a preference | A preference, not a booking. The application must not write “confirmed” or a promised arrival. |
| `summary` | text, max 600 | Yes | The short note the business reads. It is generated from the structured fields, not from a stored transcript. |
| `incomplete` | boolean | Yes | True when the call ended before the callback number, or before the reason, was collected. |
| `call_status` | enum | Yes | Distinguishes a completed lead, a partial lead, a provider failure, and a rejected event. |
| `created_at` | timestamptz | Yes | Orders the lead and supports a later retention job. The retention period is OWNER DECISION REQUIRED. |

Recommended `call_status` values: `completed`, `incomplete`, `failed`, `rejected`. No other status is required for the pilot.

### Rejected as default columns

| Data | Decision |
| --- | --- |
| Raw provider payload | Do not store. Keep a hash if replay protection needs it. |
| Full transcript | Do not store. |
| Audio | Do not store. |
| Network CLI, when a callback number was supplied | Do not store. It is a second telephone number and is not required to call back. |
| Provider account id, agent prompt, or webhook secret | Do not store on the lead. |
| Enquiry `submission_key` or `TY-` reference | Do not copy. That identity belongs to the sales enquiry. |
| Minute cost or a charge | Do not store a charge. Usage is a separate, inactive design. |

If the caller does not supply a callback number, the row is `incomplete`. Storing the network CLI in that case is a separate **OWNER DECISION REQUIRED**. The recommendation is to leave it null until that decision, so the pilot does not grow a second phone field by default.

`summary` is capped at 600 characters so a transcript cannot be hidden in it. The mapper rejects a summary that equals the raw provider body.

## Number map

A later migration, not this PR, would add a server-only map:

| Field | Rule |
| --- | --- |
| `provider_number_ref` | Opaque reference for the called number. Unique. The telephone number itself is not required in the lead row if the map is secret. |
| `business_id`, `location_id` | Must match an existing location. |
| `environment` | `dev` or `production`. A DEV webhook ignores a production row and the reverse. |
| `active` | One active row per number reference. |

`public.service_provisions.provider_binding_ref` is already unique and server-side. The pilot may store the same opaque reference there only after a reviewed change. It must not set `state` to `LIVE`. The current check `service_provisions_live_closed` forbids `LIVE` (`supabase/migrations/20261101170000_commercial_foundation_v1.sql`).

The map is not editable from the marketing site or from the caller.

## Security rules

| Rule | Requirement |
| --- | --- |
| Access | Same posture as `public.enquiries`: no direct grant to `PUBLIC`, `anon`, or `authenticated`. Reads and writes go through security-definer functions. Admin or customer reads require a session bound to that tenant. |
| Signature | Invalid signatures create no lead. They may create a security log line with no payload and no number. |
| Idempotency | Unique `(tenant_location_id, provider_call_ref)`. Same hash returns the row. Different hash returns conflict and does not update. |
| Replay window | Hash plus provider timestamp. The duration is OWNER DECISION REQUIRED. No number is chosen in this contract. |
| Logs | Tenant id, call reference, status, notification status. No name, number, summary, transcript, or raw body. |
| Notification | After commit. Idempotency key `{leadId}-business`. Status `SENT`, `FAILED`, or `SKIPPED`, using the enquiry delivery statuses as the model. The email contains the summary and the callback number because the business cannot act without them. It does not contain a transcript. |
| Portal | Later. A customer session for business A receives no row for business B. The current portal does not offer this view. |
| Encryption | Application code does not add field encryption in the first phase. Disk encryption is PROVIDER CONFIRMATION REQUIRED, as already recorded for Supabase. |
| Deletion | No period is set. A later job deletes by `created_at` only after the owner sets a period. Admin physical deletion stays off unless a separate change enables it. |

## Usage and billing boundary

Design only. Nothing in this section creates a price, a meter, or a Stripe call.

| Control | Rule |
| --- | --- |
| Measurement | A later worker sums provider-reported billable seconds per `tenant_location_id` and calendar month. The application does not invent seconds that the provider did not report. Rounding rules are PROVIDER CONFIRMATION REQUIRED and OWNER DECISION REQUIRED. |
| Included minutes | Basic 120, Growth 300, Pro 500, Custom as quoted. Source of the published figures: `apps/telloya/lib/pricing.ts`. The commercial offer, not the marketing page, is the entitlement. |
| Reconciliation | Compare the provider usage export with the sum of call references stored for that tenant. A call reference with no lead, or a lead with no provider usage, is an exception. It is not silently billed. |
| Overage | £0.25 per minute only after a separate opt-in and a monthly spending cap. An enquiry field, including `overageInterested` and `overageMonthlyCapGbp`, does not authorise a charge. |
| Cap | The cap is a maximum, not a target. Raising it needs a new agreement. |
| Fail closed | If the entitlement, the included minutes, the opt-in flag, or the cap cannot be read, do not accept another billable call and do not record a charge. A failed read is not unlimited usage. |
| Guard | Relaunch Guard minutes are not Telloya minutes. Guard is not measured by this meter. |

The voice webhook must not call Stripe and must not write a payment receipt.

## What phase 1 may code without a migration

Phase 1 may define the TypeScript types and pure functions for this contract and test them with fixtures. It may not create the table, write to `public.enquiries`, or persist a fixture lead in a shared database.
