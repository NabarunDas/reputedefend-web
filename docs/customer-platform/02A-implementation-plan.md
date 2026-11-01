# 02A — Implementation plan

Status: **sequence only**. This PR stops at the documents. Phase 02B does not start until the decisions in `02A-decisions.md` are accepted.

Base for that future work: latest `develop` after this documentation PR. DEV ledger at planning time: `20261031160000`, 91 entries. Re-read `apps/admin/lib/recovery/manifest.ts` and `history.test.ts` immediately before writing a migration. Do not apply anything to Production.

## Principles

- One migration per phase, additive, registered in the manifest, `appliedToDev: false` until a human applies it on DEV.
- No migration rewrites a previous file.
- Do not edit `apps/customer/lib/portal/products/present.ts`, the hub routes, or the Phase 1 flag in the schema phases. A later portal PR may call the new RPC and pass the result into the existing presenter.
- Do not edit `apps/telloya` marketing files.
- Reuse `admin_guard_command_v1` for Guard mutations. Reuse `customer_portal_session_v1` for identity. Reuse `communications` and `SEND_EMAIL` for mail. Reuse `stripe_event_receipts` for webhooks. Reuse `stripe_customer_maps` for the Stripe customer.
- Tests are SQL or RPC tests in the admin recovery style, plus customer tests that the Phase 1 hub is unchanged.

## Phases

### 02B — Empty commercial schema

Migration only. Tables, checks, indexes, RLS, revokes, and append-only event tables from `02A-data-model.md`. No RPCs that change state except the internal event writer if tests need it. No seeds. No Stripe. No portal change.

Depends on: accepted decisions D1–D8.

Tests: migration history validator; constraints reject a second open subscription, a Guard entitlement that writes `guard_coverages`, a null price offered as payable, overlapping approved plan windows, and a raw invitation token column. Rollback script documented and rehearsed on a database that has only these empty tables.

Rollback: drop the new objects if no foreign key from old tables points at them. None should.

### 02C — Admin onboarding commands

`admin_commercial_command_v1` with session actor, `p_request`, receipts, and audit. Operations: create request from an enquiry, match customer, match or create business and membership through the existing record commands, decline, offer an approved plan, queue one invitation.

Does not create a portal session. Does not send mail until the template is approved. The command may insert a `QUEUED` communication only when the template exists; otherwise it stops at `OFFERED` and records "mail not configured".

Depends on: 02B, an approved invitation template (can be a later small PR if copy is not ready).

Tests: existing customer is reused; unknown email does not become a session; duplicate request is rejected; duplicate `event_key` does not queue a second send; revoked membership cannot be offered; enquiry conversion XOR is unchanged.

Rollback: stop calling the RPC. Leave rows. Do not drop tables that hold requests.

### 02D — Portal read

`customer_portal_products_v1(p_token_hash)`. Wire it behind a new server flag that defaults off, in a PR that only reads. The Phase 1 presenter stays the renderer. When the flag is off, the hub behaviour shipped in PR #384 is byte-for-byte the same.

Depends on: 02B. 02C is not required for a read of empty tables.

Tests: another customer's business is absent; idle session is unauthenticated; a thrown Guard read returns unknown rather than unpurchased; Telloya without a provision is not Active; no `customer_id` parameter exists. Customer route inventory still lists the hub routes and does not add `/portal/telloya`.

Rollback: flag off.

### 02E — Provisioning commands

Admin commands set the six Telloya timestamps and the customer confirmation recorded from the portal session. `LIVE` is rejected unless the checks in `02A-entitlements-and-security.md` pass. No Retell, Twilio, or phone-number provider calls.

Depends on: 02B, 02D for the customer confirmation path.

Tests: each missing timestamp blocks `LIVE`; payment pending blocks `LIVE`; suspension clears Active without deleting timestamps; a second member of another business is rejected.

Rollback: stop the commands. Do not delete provision rows.

### 02F — Trial and manual paid

Admin can record an authorised trial and a manually confirmed paid period. Both require actor, reason, and dates. This is the DEV stand-in for Stripe. It still does not treat a checkout redirect as payment, because there is no checkout.

Depends on: 02B, 02C.

Tests: expired trial becomes `EXPIRED`; manual paid without provision is not Active; a second open subscription for the business fails.

Rollback: flag off. Do not delete financial history.

### 02G — Stripe, only after prices exist

Out of scope until a plan version has a verified `amount_minor` and a human has created the Stripe product outside this repository's planning. That phase reuses `stripe_customer_maps`, `provider_operations.idempotency_key`, and `stripe_event_receipts`. `invoice.paid` is the transition into commercial `ACTIVE`. Guard invoice handling stays `guard_apply_invoice_paid_v1`.

Depends on: 02F and a price decision (D5).

This plan does not schedule 02G.

### 02H — Complete and Guard reconciliation

Link Complete Guard seats to existing coverages. Call existing Guard cancel, credit, and continuation commands. Set `reconciled_guard_subscription_id` only after those commands succeed. Refuse a second non-ended coverage.

Depends on: 02B and the current Guard command surface. Does not require Telloya to be live.

Tests: upgrade does not insert a second `guard_subscriptions` row; entitlement `ELIGIBLE` with coverage not `ACTIVE` is not shown as Active; `guard_set_billing_entitlement_v1` is still not executable by `service_role`.

Rollback: leave the link null. Guard ledger unchanged if the command refused.

## Suggested PR order

| PR | Ships | Does not ship |
| --- | --- | --- |
| 02A (this PR) | These documents | SQL, UI, flags |
| 02B | Empty tables on a branch, unapplied until DEV approval | RPCs used by apps |
| 02C | Admin match, offer, invite | Portal change, Stripe |
| 02D | Session-scoped read, flag off | `/portal` cutover, Telloya route |
| 02E | Setup checks | Provider accounts |
| 02F | Trial and manual paid recording | Stripe prices |
| 02H | Guard reconciliation | A second Guard billing authority |
| Later | Stripe, Retell, phone numbers, `/portal` becoming My Products | Anything not accepted in a fresh design note |

02D can follow 02B before 02C if the read of empty data is useful. 02H can proceed in parallel with 02E once 02B exists. 02G waits.

## Test layers to keep

- Manifest and history tests for every new filename.
- Constraint tests for uniqueness, source shape, and "payment is not Active".
- RPC tests that a forged customer id is impossible because the parameter does not exist.
- Customer tests that `/portal` still renders `PortalHome` when the hub flag is off, and that Telloya still has no href.
- Security tests that `anon` and `authenticated` cannot select the new tables.
- No live DEV data inserted for UI fixtures.

## Dependencies that are not code

- Approved Telloya and Complete terms, prices, trial length, and Guard location cap (D5).
- Invitation email copy and from-address, using the existing mail gate.
- Confirmation that a second business member must not see Recovery cases or Guard invoices (D3, recommended: they must not).
- A named admin who may record a trial (D6).

## Rollback of the whole programme

Turn every new flag off. `/portal`, Guard, Recovery payments, and portal OTP keep working because their tables and functions were not replaced. Dropping tables is allowed only while they are empty and only on DEV. After the first real subscription, rollback is flags plus a forward migration that revokes entitlements, not a drop.
