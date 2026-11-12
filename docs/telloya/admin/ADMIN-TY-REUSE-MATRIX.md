# ADMIN-TY-00 — Reuse matrix and preview dependency map

**Status:** inventory only. This document does not change behaviour, apply a migration, or enable a flag.
**Baseline:** `origin/develop` is `c3ba97a19492eb2b7ae27ec906f77e740ef12cae` (“Telloya: polish enquiry success screens and acknowledgement emails (MKT-FINAL-05C)”). This implementation starts from plan branch `plans/telloya-admin-e2e-preview-20261112` at `a9d925204e39a9e590e5fe964a0314f0679f83cf`, which adds the runbook on top of that develop history.
**Observed repository ledger:** applied DEV head in the manifest is `20261110170000` (118 applied entries in the manifest’s recorded count). `20261111130000_telloya_marketing_enquiry_retention_v1.sql` is present and `appliedToDev: false` in `apps/admin/lib/recovery/manifest.ts`. A marketing note on this branch says that retention file was applied to DEV. That disagreement is unresolved here. Do not apply or replay either file from this work. Voice ingestion `20261107130000` and PR #457 are untouched.

## Dependency map

| Surface | What it already does | Boundary for this journey |
| --- | --- | --- |
| Telloya marketing enquiry | `apps/telloya` intake, `requestIntent=personalised-demo`, acknowledgement email, TY reference | Do not change public wording or prices. Admin reads the saved payload. |
| Admin enquiries | `apps/admin/app/enquiries/page.tsx`, `[id]/page.tsx`, `forms.tsx`, `onboarding.tsx`, `telloya-interest.tsx` | One TY record stays the hub. Legacy enquiries stay on the same pages. |
| Enquiry model | `apps/admin/lib/enquiries/model.ts`, `queries.ts`, `command.ts` | Interest fields are not consent, purchase, or booking. |
| Commercial onboarding | `apps/admin/lib/commercial/onboarding.ts`, `apps/admin/app/enquiries/onboarding.tsx` | Reuse customer, business, location, and invitation matching. Do not auto-verify authority. |
| Customer offer | `apps/customer/app/portal/onboarding/offer/[selector]/page.tsx` | Authenticated offer read. Real checkout stays behind existing payment flags. |
| Customer setup | `apps/customer/app/portal/onboarding/setup/page.tsx` | Paid handover status. Live activation stays blocked. |
| Payments | Commercial settlement and webhook tests under `apps/admin/lib/payments` | One-off Guided checkout is not monthly Telloya billing. New recurring preparation stays mocked and off. |
| Email | Existing durable queue and enquiry acknowledgement states | Queue a proposal. Do not send from a button and do not call Resend in this work. |
| Catalogue | `apps/telloya/lib/pricing.ts` and `usage-policy.ts` | Display prices. A persisted offer must cite an approved plan version, not the marketing form. |
| Setup commands | Begin setup, preferences, AI configuration, number allocation, forwarding, test-call record | Operator checklist only. No Retell call, number purchase, or forwarding change. |
| Flags | `TELLOYA_ENQUIRY_ENABLED`, `TELLOYA_USAGE_EVENTS_ENABLED`, `TELLOYA_INBOUND_ADMISSION_ENABLED` | Remain off. A new admin-journey write flag will also default off and cannot approve legal or tax. |
| Preview | Vercel Preview builds the PR branch | No Production promotion, no Vercel env edit, no hosted SQL. |

## Reuse matrix

| Current component | Reuse as-is | Minimal extension | New work | Tests | Risks |
| --- | --- | --- | --- | --- | --- |
| Enquiry list and detail | Yes | Telloya progress and next step on the existing detail page | None as a second queue | Legacy enquiry still renders; missing plan says “Plan to be confirmed” | A new read of an unapplied RPC would break Preview. The page must not call a missing function. |
| `TelloyaEnquiryInterest` | Yes | Keep interest separate from offer and demo | Progress sits beside it | Existing interest tests | Do not treat Guard interest or overage interest as consent. |
| Enquiry triage and conversion | Yes | Do not replace enquiry status with subscription state | Derived progress only | Existing triage tests | Converting an enquiry is not activating Telloya. |
| Commercial onboarding panel | Yes | Offer preparation waits for a completed offline demo and verified authority | Composer is a gated preview until a hosted approved plan exists | Duplicate prepare does not create a second subscription in fixtures | Hosted DEV has no approved Telloya plan or agreement to sell. |
| Customer offer page | Yes | Telloya copy can point at this authenticated route | No public TY-id lookup | Stale version cannot be accepted | Email CTA must not be a payment link. |
| Stripe settlement | Pattern only | Monthly subscription mode is a mocked adapter | No Stripe API call | Currency mismatch, duplicate checkout, payment failure, cancellation | A return URL is not payment. |
| Mail dispatch | Pattern only | Idempotent proposal payload per version | Render and queue decision in source | Double send, send before legal approval | Provider acceptance is not delivery. |
| Setup handover | Yes | Checklist of existing steps and a blocked go-live | No new Retell client | Unpaid setup stays closed; go-live stays blocked | Recording forwarding is not turning forwarding on. |
| Usage ledger and admission | Do not edit | Not part of this sales journey | None | Existing files untouched | PR #457 stays independent. |
| ProfileRelaunch Guided, Guard, cases, messages | Yes | Telloya entitlements stay separate | No shared-login rewrite | Do not retarget those tests | A Telloya flag must not change Guided settlement. |

## Feature-flag strategy

- Read-only Telloya interest and the derived progress indicator render from the enquiry already stored for staff. They do not write.
- Demo status writes, offer issue, outbound proposal email, customer acceptance, recurring Checkout, and provisioning stay off unless `TELLOYA_ADMIN_JOURNEY_ENABLED` is exactly `true`.
- That flag does not override a missing approved service agreement or an unapproved tax treatment. Those paths return a closed result.
- Preview may show a section labelled “Preview / test only, not available to customers” around a synthetic fixture. The fixture uses no real lead from production.

## What this phase does not do

No route, schema, flag default, email, Stripe object, Retell setting, or Production change.
