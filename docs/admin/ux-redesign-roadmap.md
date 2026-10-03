# Admin UX redesign roadmap — UX-1 to UX-10

The functional build is complete through Step 24A. What remains is that an operator has to know the database stage machine and which of twenty Admin modules holds each fact in order to run a case. The UX programme closes that gap. It is sequenced deliberately: the model comes first, everything after it renders the same model, and no phase invents a second source of truth.

The whole programme is additive to the existing domain. No phase in this roadmap is permitted to create a competing workflow engine, persist a second status or checklist, duplicate a database business rule in TypeScript, or activate a provider. Where a phase genuinely needs a fact that cannot be retrieved safely from existing application queries, it stops on that capability and documents the gap rather than adding schema to work around it.

| Phase | Deliverable | Status |
| --- | --- | --- |
| UX-1 | Canonical case journey and next action engine | COMPLETE |
| UX-2 | Case page rendering the model | COMPLETE |
| UX-3 | Case list, queue and batch fact projection | COMPLETE |
| UX-4 | Today as an operator home | COMPLETE |
| UX-5 | Navigation and information architecture | COMPLETE |
| UX-6 | Evidence workspace | COMPLETE |
| UX-7 | Commercial and money surfaces | IN PROGRESS |
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

Complete. Today is now the place the working day starts: what needs doing now, ordered by the priority band the UX-1 resolver already chose, drawn from the UX-3 batch projection in chunks of fifty rather than from a separate ranking or a wider query. It adds no migration, no urgency score and no service level. See ux-today-workbench.md.

## UX-5 — Navigation and information architecture

Complete. Reorganises the Admin sidebar around the operating model UX-1 to UX-4 established: Today, Intake, Cases, then Guard and Finance, then Reports, with the remaining modules under Operations and Settings kept directly visible. Routes are unchanged. Search stays in the header. Active nested groups stay expanded so the current destination cannot be hidden. No migration. See ux-navigation-information-architecture.md.

## UX-6 — Evidence workspace

Complete. The case Evidence page (`/cases/[id]/evidence`) reads the same request, version and contact interpretation as CaseFlow. Fulfilment stays a manual command. Contact stays case-level, because communications are not linked to an evidence request. No migration. See ux-evidence-workspace.md.

## UX-7 — Commercial and money surfaces

In progress. `/cases/[id]/commercial` reads `summariseCommercial`, `summarisePayment` and `resolveCaseFlow`, and shows quote, acceptance, service order and Guided payment or Managed setup for that case. Case-specific commercial and money destinations point there. `/commercial` stays the catalogue and the queues. `/money` stays cross-case obligations, approval, recovery and Guard billing. No migration. See ux-commercial-money.md. UX-8 is not started.

## UX-8 — Communications and conversations

Case-scoped communications, the contact-recovery and alternate-contact flow that currently does not exist, a place to reconcile a message whose provider acceptance was never established, and delivery state presented honestly, with provider acceptance never shown as delivery.

## UX-9 — Visual system, wording and accessibility

The shared visual language, the central wording review across every surface, and the accessibility sweep extended from the Step 23 baseline to the redesigned pages. Deliberately late: a visual system settled before the surfaces exist would be a guess.

## UX-10 — Customer-facing surfaces

The customer portal and the customer-visible previews brought into line with the Admin work. Last, because it is the only phase with an external audience and should not move until the internal model and wording have stopped changing.

## Sequencing notes

UX-1 is a precondition for everything else, which is why it is non-visual and why it ships on its own. UX-3 is a precondition for UX-4. UX-2 and UX-6 are independent of each other but both consume the same model, so divergence between them would be a defect rather than a difference of opinion. UX-1 implements none of the later phases. UX-2, UX-3, UX-4, UX-5 and UX-6 are complete. UX-7 is in progress. UX-8 onwards is not started, and no phase should be marked complete until its own acceptance evidence exists.
