# ADMIN-TY-R8-D-01A — Telloya commercial catalogue DRAFT install runbook

**Status:** source-only preparation. Does not seed hosted DEV or Production. Does not approve plans, agreements, tax, or Custom prices.

## Reuse

Use the existing shared tables only:

- `public.product_catalogue`
- `public.commercial_agreement_versions`
- `public.plan_versions`
- `public.plan_components`
- `public.commercial_plan_conditions`

Do not create a second catalogue, price book, or agreement store.

## Approved commercial amounts (policy already locked)

| Tier | Monthly GBP | Minor units | Included minutes | Locations / numbers |
| --- | --- | --- | --- | --- |
| Basic | £49 | 4900 | 120 | 1 / 1 |
| Growth | £79 | 7900 | 300 | 1 / 1 |
| Pro | £120 | 12000 | 500 | 1 / 1 |
| Guard add-on | £9.99 per confirmed location | 999 | — | per confirmed location |
| Custom | Individually approved quotation only | none seeded | none seeded | stated on quotation |
| Overage | £0.25 / minute | 25 | opt-in + hard cap | — |

## Isolated installer (tests / local only)

`installTelloyaCatalogueProposal` in `apps/admin/lib/commercial/telloya-catalogue-proposal.fixture.ts`:

- Inserts DRAFT Telloya product, DRAFT agreement `TELLOYA-DRAFT-2026-11-1`, DRAFT Basic/Growth/Pro plans and conditions, and an unpriced Custom DRAFT plan template.
- Uses local tax placeholder `EXCLUSIVE` so rows stay **unofferable** under current offer/settlement SQL (which requires `NOT_APPLICABLE`).
- Refuses to run if `telloyaTaxDecision.productionTaxBehaviour` is no longer null.
- **Must not** be pointed at hosted DEV or Production.

Approved disposable fixtures used by journey tests (`installTelloyaCatalogueFixture`) are separate rehearsal data under `TELLOYA-TEST-*` refs. They are not a customer catalogue.

## Hosted install (future, owner-authorised only)

When D1 (agreement) and D3 (UK tax) in the R8-D-00 pack are signed:

1. Insert DRAFT agreement and DRAFT plan/condition rows matching the locked amounts above.
2. Stop. Do **not** auto-transition to APPROVED in the same unreviewed step.
3. After separate owner authorisation, APPROVE agreement then plans/conditions with the accountant-confirmed UK tax behaviour (never silently copy international).
4. Custom remains without an auto-approved amount or minutes; each quotation is approved individually.
5. Record checksums in the migration manifest; `containsDataChange: true`; `safeToReplay: false`; never replay.

Until that authorisation, keep hosted DEV at **0** approved Telloya plans and agreements.

## Stop conditions

- Seeding `EXCLUSIVE` as APPROVED.
- Treating `NOT_APPLICABLE` as universal international tax policy.
- Approving Custom catalogue prices.
- Editing applied migrations or non-Telloya ProfileRelaunch agreement rows.
