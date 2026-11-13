# ADMIN-TY-R8-D-01 — Bounded commercial enablement plan

**Status:** plan only. Implements nothing.  
**Depends on:** owner decisions in `ADMIN-TY-R8-D-00-commercial-enablement-decision-pack.md` (D1–D10).  
**Out of scope for R8-D-01:** Production, live Stripe, Retell, Vercel env edits, PR merge, replaying applied SQL, changing approved ProfileRelaunch Guided/Managed/Guard legal records.

R8-D-01 is the first **implementation** slice after the owner signs the open rows in the R8-D-00 pack. It stays on draft PR #487 / DEV until each step is explicitly authorised.

## Goal

Enable one **controlled DEV-only** official Telloya offer path that reuses existing ProfileRelaunch catalogue, agreement, template-approval, outbox, and portal accept infrastructure — without claiming payment (payment remains R9).

## Preconditions (must already be true)

- DEV ledger applied head `20261112223000`; R8 approve/send RPCs present; repository head `20261113120000`; `pendingMigrations()` returns the allowlist source-only file.
- Owner policy prices and commercial rules unchanged (`telloyaOwnerApprovedPolicy`).
- Written owner sign-off for D1–D9 in R8-D-00 (D10 is R9).

## Work packages (ordered)

### WP1 — Legal and tax artefacts (docs + seed SQL design; no apply until owner says)

1. Freeze approved Telloya Service Agreement body and version_ref from D1.
2. Record privacy-supplement outcome from D2 (publish path separate from this WP if still LEGAL_REVIEW).
3. Record D3 tax behaviours: UK recurring subscription; non-UK / cross-border treatment. Do not invent `NOT_APPLICABLE` as production policy.
4. Produce a **single** additive migration (or audited Admin seed command if one already exists) that inserts DRAFT then transitions to APPROVED Telloya `commercial_agreement_versions` and Basic/Growth/Pro `plan_versions` + `commercial_plan_conditions`, Guard pricing aligned to owner policy, GBP, monthly. Custom has **no** seeded price.
5. Stop condition: refuse apply if D1/D3 incomplete; never edit ProfileRelaunch non-Telloya agreement rows.

### WP2 — Template approval (ops command; DEV)

1. Confirm hosted `TELLOYA_OFFER` v1 body still matches `TELLOYA_OFFER_COMPOSER_CONTRACT_V1`.
2. Owner-authorised `admin_settings_command_v1` `approve_template_draft` on DEV only.
3. Verify 1 APPROVED template version; composer contract unchanged; no customer send yet (mail-control still empty).

### WP3 — Mail readiness (DEV)

1. Confirm verified sender / domain (D7).
2. Confirm named internal recipient and test business with real authority (D8); no fabricated membership.
3. Insert/enable `admin_private.telloya_offer_mail_control` only after D6–D8 (D9).
4. Rollback: set `mail_enabled=false` or delete control row; leave template APPROVED state as recorded.

### WP4 — Controlled offer-email test (DEV Preview)

Target shape (adjust enquiry only with owner-named test data):

1. Admin: completed demo → save Growth (or approved Custom) draft → Preview (illustrative) → **Approve & Send**.
2. Assert: one `communications` row; truthful Admin delivery fields; portal review link authenticated.
3. Customer (test mailbox): review / optional amend / accept terms with required confirmations.
4. Assert: subscription `OFFERED` → `ACCEPTED` (or documented amend path); **payment still unpaid**; `startTelloyaCheckout` remains `not_created`.
5. Stop if authority missing, tax/agreement/plan not APPROVED, template DRAFT, or mail-control off.

### WP5 — Handoff to R9 (explicit non-goals)

Document only:

- Stripe TEST product / price / Checkout session creation.
- Settlement of first invoice via existing payment-prep and settlement RPCs.
- Live mode remains off; Production remains untouched.

## Migration / config checklist

| Item | R8-D-01 | Notes |
| --- | --- | --- |
| New hosted SQL for catalogue/agreement seed | Only after owner apply approval | Additive; `containsDataChange: true`; `safeToReplay: false` |
| Edit applied `20261112223000` (or earlier) | **Never** | Immutable |
| `TELLOYA_ADMIN_JOURNEY_ENABLED` | Preview-only already | Do not set on Production |
| Template approve | DEV settings command | D6 |
| Mail control | DEV singleton | D9; disable after test if required |
| Customer offer/accept flags | Reuse existing gates | Do not invent a second flag model |
| Stripe / Retell / Vercel | Off | R9 / later |

## Privacy and payment gates

| Gate | R8-D-01 expectation |
| --- | --- |
| Privacy supplement | Must not present unpublished wording as customer-facing if D2 still open; block send if terms require it |
| Tax | Offer/settlement paths only after D3 recorded on plan rows |
| Authority / contact verification | Fail closed; no fabrication |
| Paid claim | Forbidden until R9 verified invoice path |
| Production | Forbidden |

## Suggested acceptance criteria

- [ ] D1–D9 recorded as approved in the decision pack or a follow-up owner comment.
- [ ] DEV has APPROVED Telloya agreement + Basic/Growth/Pro plans; 0 Production changes.
- [ ] `TELLOYA_OFFER` APPROVED; mail-control enabled only for the test window.
- [ ] One controlled send to owner-named mailbox; delivery status truthful.
- [ ] Customer can authenticate and accept; no Stripe session created.
- [ ] CI green; Admin Preview READY; PR remains DRAFT.
- [ ] Handover updated with enablement tip SHA; R9 explicitly next for Checkout.

## Stop conditions

- Any attempt to reuse or alter non-Telloya approved legal rows.
- Tax undecided or `NOT_APPLICABLE` used as a silent default for international customers.
- Fabricated locations, membership, or authority to force Guard/commercial gates.
- Approve & Send without APPROVED template or mail-control.
- Production apply, live Stripe, Retell contact, or PR merge.

## Deliverables when R8-D-01 executes (future PR slice)

1. Reviewed seed migration or audited seed procedure + manifest entry.
2. Ops runbook for template approve + mail-control toggle.
3. Evidence pack: SQL verification counts, communication id, portal accept evidence (redacted).
4. Updated `ADMIN-TY-PREVIEW-HANDOVER.md` status.

This file is not authorisation to start WP1–WP4.
