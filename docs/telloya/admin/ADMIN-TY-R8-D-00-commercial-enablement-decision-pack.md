# ADMIN-TY-R8-D-00 — Commercial readiness and reuse (decision pack)

**Status:** audit and owner decision preparation only.  
**Baseline tip at pack authoring:** `43d8c815fb26e4481f09bd2c75bd08d21221346c` on draft PR #487.  
**DEV ledger:** 124 migrations; applied head `20261113120000`; repository head `20261113120000`; `pendingMigrations()` empty. Allowlist applied once; do not replay; grants not seeded; send still disabled.  
**This pack does not** create or approve commercial rows, enable email, send messages, run hosted SQL, change Vercel, create Stripe objects, contact Retell, modify Production, or merge.

Reuse ProfileRelaunch commercial mechanisms. Do not build a second Telloya sales stack. Do not re-ask decisions already recorded in `telloyaOwnerApprovedPolicy`, `telloyaLocationPolicy`, C-06A/C-06B, or `docs/telloya/phase-c/catalogue-proposal.md`.

## 1. Already approved — do not re-ask

| Topic | Recorded decision | Source |
| --- | --- | --- |
| Basic | £49 / month, 120 minutes (4900 minor) | Owner 2026-11-07; `telloyaOwnerApprovedPolicy` |
| Growth | £79 / month, 300 minutes (7900 minor) | Same |
| Pro | £120 / month, 500 minutes (12000 minor) | Same |
| Custom | Separate quotation: manual GBP amount and included minutes; no catalogue price | Same; basis `separate_quotation` |
| Relaunch Guard | £9.99 per confirmed location / month (999 minor) | Same |
| Standard footprint | One operating location and one receptionist number on Basic/Growth/Pro | Owner 2026-11-06; `telloyaLocationPolicy` |
| Overage | £0.25 / minute with authenticated opt-in and hard spending cap | Owner 2026-11-07 |
| Cadence / renewal | GBP, monthly; renews at accepted amount until cancel | Same |
| Unused minutes | Expire at period end; `minutes_rollover` false | Same |
| Setup | Standard included; complex quoted separately | Same |
| Cancellation | End of paid period; no automatic pro-rata; subject to law and service-failure remedies | Same |
| Caller data policy (commercial rule) | Structured summary only; no persistent transcript/audio in our platform; 90-day lead retention; no model training | Same |
| International enquiries | Welcome; prices stored and billed in GBP | Same; draft agreement §11 |
| Seller | ProfileRelaunch Ltd (Telloya is a service of that company) | Same |

£150 / £250 / £98.98 figures in tests or UI illustrations are **not** customer prices.

## 2. What ProfileRelaunch already supplies (reuse)

| Capability | Reuse | Boundary |
| --- | --- | --- |
| Commercial onboarding (customer / business / location / invitation) | As-is | Do not fabricate authority or membership |
| `plan_versions` + `commercial_plan_conditions` + `commercial_agreement_versions` | Same schema and APPROVED immutability | Telloya needs its own TELLOYA product rows; do not alter Guided/Managed/Guard legal rows |
| Offer read / accept / amendment (Customer Portal) | As-is | Telloya CTA is authenticated review, not a payment link |
| Durable `communications` + `SEND_EMAIL` outbox | As-is | Queue ≠ provider-accepted ≠ delivered |
| Template catalogue + `admin_settings_command_v1` approve | As-is | `TELLOYA_OFFER` v1 is still DRAFT (`record_version` 2) |
| `admin_private.telloya_offer_mail_control` | Empty on DEV | Explicit enable required for any send |
| Payment preparation (`20261103213000`) and settlement (`20261104190000`) | Pattern reuse | Monthly Telloya Checkout still `not_created` |
| Setup checklist commands | Operator record only | No Retell, number buy, or live forwarding |

Shared company identity and legal **mechanisms** apply. Published ProfileRelaunch Guided/Managed/Guard agreements and omnibus `PS-2026-10-14.2` stay untouched. Telloya needs a **Telloya-specific** paid Service Agreement version and privacy supplement before customers see terms.

## 3. Outstanding approvals (only re-ask these)

| ID | Decision | Accountable | Why it blocks R8-D |
| --- | --- | --- | --- |
| D1 | Final paid Telloya Service Agreement text (liability, availability, remedies, overage rounding wording) | Owner + legal | `agreementStatus: LEGAL_REVIEW_REQUIRED`; no hosted APPROVED TELLOYA agreement |
| D2 | Telloya privacy supplement, subprocessors, international transfers | Owner + legal | `PROVIDER_VERIFICATION_REQUIRED` / unpublished supplement |
| D3 | Tax treatment for UK recurring GBP subscriptions **and** cross-border digital/voice customers | Owner + accountant (+ legal if needed) | `productionTaxBehaviour` is null; server `NOT_APPLICABLE` gate is **not** universal tax policy |
| D4 | Authorise DEV seed of APPROVED Basic/Growth/Pro `plan_versions` + conditions citing D1 terms ref and D3 tax | Owner | Hosted DEV has 0 approved Telloya plans |
| D5 | Per-customer Custom quotation approval process (amount, minutes, locations/numbers) | Owner | Custom has no catalogue price; each quote needs written approval |
| D6 | Approve immutable `TELLOYA_OFFER` template (composer contract V1 body) | Owner via settings approve | Template remains DRAFT |
| D7 | Verified sender identity + Resend/domain readiness for DEV transactional mail | Owner / ops | Outgoing mail activation still deferred |
| D8 | Named DEV-only test recipient mailbox and test business (authority verified) | Owner | Controlled offer-email test must not use fabricated identity |
| D9 | Explicit DEV `telloya_offer_mail_control` enable for that test only | Owner | Mail control empty; send stays closed |
| D10 | Recurring Stripe TEST Checkout dependencies after D1–D5 (R9, not R8-D send) | Owner | `startTelloyaCheckout` returns `not_created` |

## 4. Owner approval table (one page)

| # | Item | Type | Status | Role | Technical action (later, not now) |
| --- | --- | --- | --- | --- | --- |
| A | Catalogue prices & commercial rules (§1) | Policy | **APPROVED** | — | None; reuse constants |
| B | Telloya paid Service Agreement | Legal | **OPEN (D1)** | Owner + legal | Seed DRAFT → APPROVE `commercial_agreement_versions` TELLOYA row |
| C | Privacy supplement / subprocessors | Legal | **OPEN (D2)** | Owner + legal | Publish supplement; verify provider settings |
| D | UK + international tax | Tax | **OPEN (D3)** | Owner + accountant | Set plan/subscription `tax_behaviour`; do not treat `NOT_APPLICABLE` as default policy |
| E | Hosted Basic/Growth/Pro catalogue | Technical after B+D | **OPEN (D4)** | Owner | Insert APPROVED `plan_versions` + conditions; Guard add-on pricing aligned |
| F | Custom quotations | Policy process | **OPEN (D5)** | Owner | Approve each Custom GBP/minutes before official offer |
| G | `TELLOYA_OFFER` template | Ops | **OPEN (D6)** | Owner | `admin_settings_command_v1` `approve_template_draft` |
| H | Verified sender + DEV recipient | Ops | **OPEN (D7, D8)** | Owner / ops | Domain verify; name internal mailbox |
| I | Mail-control enable (DEV test) | Ops | **OPEN (D9)** | Owner | Insert/enable singleton control for controlled test only |
| J | Recurring Stripe TEST Checkout | Payment (R9) | **OPEN (D10)** | Owner | Product/price/session after catalogue+agreement+tax; keep live off |

## 5. Recommended DEV trial order (after owner sign-off)

Smallest safe transactional order. **No step runs in this pack.**

1. Record D1–D3 in writing (agreement text, privacy supplement stance, tax behaviours for UK and non-UK).
2. Seed and APPROVE Telloya agreement version + Basic/Growth/Pro plan versions/conditions (and Guard pricing) on **DEV only**, citing approved terms ref and tax.
3. Approve `TELLOYA_OFFER` template; confirm composer contract V1 body immutable.
4. Confirm verified sender and named internal recipient; confirm business authority on the chosen test enquiry (do not fabricate).
5. Enable `telloya_offer_mail_control` for DEV controlled test only.
6. One controlled journey: save reviewed quote → Approve & Send → outbox → provider accepted vs delivered → customer authenticated review/amend/accept. **Do not claim paid.** Recurring Checkout is R9.
7. Stop / rollback: disable mail-control; retire mistaken plan/agreement only via audited path; never replay applied migrations; never touch Production.

### Acceptance criteria for a later controlled DEV offer-email test

- Official offer cites APPROVED plan + APPROVED Telloya agreement + decided tax.
- Template APPROVED; mail-control explicitly enabled; journey flag already true on this Preview only.
- Recipient is owner-named internal mailbox; authority verified without fabrication.
- Exactly one communication row for the version; delivery status truthful.
- 0 Production changes; Stripe Checkout still not created until R9.

## 6. Safe Admin Preview smoke (human, no send)

Corrected 2026-11-13: TY-26-ESMZ23 has **one** real business location. Guard UI uses location checkboxes, not a free proposed-quantity field.

| Step | Allowed | Forbidden |
| --- | --- | --- |
| Growth £79 / month, 0 Guard | Save → Refresh → Preview Email | Approve & Send |
| Growth + that **one** Guard (£88.99) | Same | Fabricating a second location for £98.98 |
| Custom £150 + minutes, 0 or 1 Guard | Same | Claiming an official offer |

Expect illustrative banner (“not an approved offer; no email sent”), greeting, itemised totals, no live payment link. Changes only the enquiry’s internal draft trail.

## 7. Dependency matrix (R8-D gates)

| Gate | Current DEV | Blocks |
| --- | --- | --- |
| Approved Telloya catalogue | 0 plan versions | Official prepare / send |
| Approved Telloya agreement | 0 | Official prepare / send / accept terms |
| Tax decision | null | Honest offer and settlement |
| `TELLOYA_OFFER` APPROVED | DRAFT v1 rv2 | Queue body |
| Mail control | 0 rows | Any send |
| Verified sender / recipient | Deferred | Provider acceptance |
| Recurring Checkout | `not_created` | Paid claim (R9) |

## 8. Related documents

- Prior packs (pricing already locked): `docs/telloya/phase-c/catalogue-proposal.md`, `06a-commercial-agreement-decision-pack.md`, `06b-usage-privacy-foundation.md`
- Code constants: `apps/admin/lib/commercial/telloya-catalogue-proposal.ts`, `apps/telloya/lib/pricing.ts`
- Checkout stub: `apps/admin/lib/commercial/telloya-checkout.ts` (`startTelloyaCheckout` → `not_created`)
- Next bounded plan: `docs/telloya/admin/ADMIN-TY-R8-D-01-enablement-plan.md`
- Handover / reuse: `ADMIN-TY-PREVIEW-HANDOVER.md`, `ADMIN-TY-REUSE-MATRIX.md`
