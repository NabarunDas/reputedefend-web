# Admin UX redesign roadmap — UX-1 to UX-10

The functional build is complete through Step 24A. What remains is that an operator has to know the database stage machine and which of twenty Admin modules holds each fact in order to run a case. The UX programme closes that gap. It is sequenced deliberately: the model comes first, everything after it renders the same model, and no phase invents a second source of truth.

The whole programme is additive to the existing domain. No phase in this roadmap is permitted to create a competing workflow engine, persist a second status or checklist, duplicate a database business rule in TypeScript, or activate a provider. Where a phase genuinely needs a fact that cannot be retrieved safely from existing application queries, it stops on that capability and documents the gap rather than adding schema to work around it.

| Phase | Deliverable | Status |
| --- | --- | --- |
| UX-1 | Canonical case journey and next action engine | COMPLETE |
| UX-2 | Case page rendering the model | COMPLETE |
| UX-3 | Case list, queue and batch fact projection | COMPLETE |
| UX-4 | Today as an operator home | COMPLETE |
| UX-5 | Navigation and information architecture | NOT STARTED |
| UX-6 | Evidence workspace | NOT STARTED |
| UX-7 | Commercial and money surfaces | NOT STARTED |
| UX-8 | Communications and conversations | NOT STARTED |
| UX-9 | Visual system, wording and accessibility | NOT STARTED |
| UX-10 | Customer-facing surfaces | NOT STARTED |

## UX-1 — Canonical case journey and next action engine

Complete. Non-visual by design: no page, component or stylesheet changes. It establishes nine human phases projected from the fourteen technical stages, phase states that allow a case to move backwards and allow a later problem to reopen an earlier phase without rewriting history, one primary next action chosen by a documented four-band priority table, separate attention items that never compete with the recommendation, explained blockers, per-track prerequisite groups, validated internal destinations and a single `waitingOn`. The resolver is pure, takes `now` as a parameter, and requires zero migrations. See ux-case-flow-model.md for the model, the query cost, the UX-3 projection it identifies and the gaps report.

## UX-2 — Case page rendering the model

Complete. The first visual phase. The case page becomes a single place that answers where the case is, what is done, what is blocking and what to do next, by rendering the UX-1 model rather than by re-deriving any of it: the nine-phase journey, the primary action with its destination, the blockers, the attention items, the prerequisite groups with their individual items rather than a single authorised flag, and the technical stage kept available but secondary. Existing case commands stay exactly as they are; the page gains a better front door, not new powers. Zero migrations. See ux-case-cockpit.md for the page hierarchy, the same-page anchor map, the progressive disclosure rules, the closed-case treatment and the accessibility position.

## UX-3 — Case list, queue and batch fact projection

Complete. Extends the model to many cases at once, which UX-1 explicitly refuses to do with the earlier loader because it would be eight round trips per case including three unfiltered list reads. The single case-scoped batch projection identified in ux-case-flow-model.md exists as `admin_case_flow_facts_v1`, and the Cases page is an operational queue reading the same `CaseFlowModel` the case page reads. The resolver did not change: it is a pure function of the fact tree, so only the loader was replaced, and the single-case loader delegates to the batch path rather than running beside it. The migration `20261002194215_admin_case_flow_batch_v1.sql` was applied to `profilerelaunch-dev` on 2026-10-02 and is immutable. See ux-case-queue.md for the projection contract, its security envelope, the batch integrity checks and the queue itself.

## UX-4 — Today as an operator home

Complete. Today is now the place the working day starts: what needs doing now, ordered by the priority band the UX-1 resolver already chose, drawn from the UX-3 batch projection in chunks of fifty rather than from a separate ranking or a wider query. It adds no migration, no urgency score and no service level. See ux-today-workbench.md. UX-5 is not started.

## UX-5 — Navigation and information architecture

Reorganises the module list around the work rather than around the database. Depends on UX-2 and UX-4 having established where an operator actually starts, because navigation designed before the destinations are settled would have to be redone.

## UX-6 — Evidence workspace

The evidence surfaces made to match the distinctions the model already draws: a request is not a message, a message the provider accepted is not a message that arrived, a scan is not a validation, a validation is not a review, and an accepted document does not close its request. Likely to surface the manual scan refresh and the request-fulfilment step as first-class actions rather than as things an operator has to know to do.

## UX-7 — Commercial and money surfaces

The quote and payment ladders made legible end to end, including the distinction the model is careful about: a returned checkout page is not a payment, and the authoritative obligation state is. Also the natural home for the per-case commercial and payment filters whose absence forces UX-1 to read capped lists and flag the result as possibly incomplete.

## UX-8 — Communications and conversations

Case-scoped communications, the contact-recovery and alternate-contact flow that currently does not exist, a place to reconcile a message whose provider acceptance was never established, and delivery state presented honestly, with provider acceptance never shown as delivery.

## UX-9 — Visual system, wording and accessibility

The shared visual language, the central wording review across every surface, and the accessibility sweep extended from the Step 23 baseline to the redesigned pages. Deliberately late: a visual system settled before the surfaces exist would be a guess.

## UX-10 — Customer-facing surfaces

The customer portal and the customer-visible previews brought into line with the Admin work. Last, because it is the only phase with an external audience and should not move until the internal model and wording have stopped changing.

## Sequencing notes

UX-1 is a precondition for everything else, which is why it is non-visual and why it ships on its own. UX-3 is a precondition for UX-4. UX-2 and UX-6 are independent of each other but both consume the same model, so divergence between them would be a defect rather than a difference of opinion. UX-1 implements none of the later phases. UX-2 and UX-3 are complete. UX-4 is complete. UX-5 onwards is not started, and no phase should be marked complete until its own acceptance evidence exists.
