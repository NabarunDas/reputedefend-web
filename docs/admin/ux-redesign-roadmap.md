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
| UX-7 | Commercial and money surfaces | COMPLETE |
| UX-8 | Communications and conversations | COMPLETE |
| UX-9 | Visual system, wording and accessibility | COMPLETE |
| UX-10 | Customer-facing surfaces | IN PROGRESS |

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

Complete. `/cases/[id]/commercial` reads `summariseCommercial`, `summarisePayment` and `resolveCaseFlow`, and shows quote, acceptance, service order and Guided payment or Managed setup for that case. Case-specific commercial and money destinations point there. `/commercial` stays the catalogue and the queues. `/money` stays cross-case obligations, approval, recovery and Guard billing. No migration. See ux-commercial-money.md.

## UX-8 — Communications and conversations

Complete. `/cases/[id]/communications` is the case communications workspace. `CASE_COMMUNICATIONS` goes there. `/communications` and `/conversations` stay the global queues and link back when a row belongs to a case. Contact and delivery stay `evidenceContactState` and the existing delivery statuses. See ux-communications-conversations.md.

## UX-9 — Visual system, wording and accessibility

Complete. The shared visual language, the wording review and the accessibility sweep over the Admin surfaces UX-2 to UX-8 already built. See ux-visual-wording-accessibility.md. No migration.

## UX-10 — Customer-facing surfaces

In progress. The Customer Portal is not launched. UX-10A is the security boundary. UX-10B is the visual and navigational shell. UX-10C is the customer dashboard and case list. UX-10D is the case workspace. UX-10E is documents and evidence. UX-10F is quotes, agreements, and permissions. UX-10G is payments and receipts. UX-10H is Relaunch Guard in the customer portal. UX-10I is messages and account. The UX-10G and UX-10H migrations are applied to `profilerelaunch-dev`. The UX-10I migration is source review only.

| Phase | Deliverable | Status |
| --- | --- | --- |
| UX-10A | Authentication and security foundation | COMPLETE |
| UX-10B | Brand and portal shell | COMPLETE |
| UX-10C | Dashboard and cases | COMPLETE |
| UX-10D | Case workspace | COMPLETE |
| UX-10E | Documents and evidence | COMPLETE |
| UX-10F | Quotes, agreements and permissions | COMPLETE |
| UX-10G | Payments and receipts | COMPLETE |
| UX-10H | Relaunch Guard | COMPLETE |
| UX-10I | Messages and Account | COMPLETE IN SOURCE / MIGRATION PENDING |
| UX-10J | Final integration, security, accessibility and launch | NOT STARTED |

UX-10A adds passwordless email OTP and a separate eight-hour portal session. Its migration `20261003125151_customer_portal_auth_foundation_v1.sql` is applied to `profilerelaunch-dev`. The applied development head remains the UX-10H migration `20261004000625_customer_portal_relaunch_guard_v1.sql`. The repository head is the source-only UX-10I migration `20261004080853_customer_portal_messages_account_v1.sql`, and `pendingMigrations()` contains that migration alone. `CUSTOMER_PORTAL_ENABLED` is not set. See `docs/customer/ux-10a-auth-foundation.md` and `docs/customer/customer-portal-security.md`.

UX-10B copies the approved ProfileRelaunch logo and icons into the customer app, applies the marketing palette with Inter and Manrope, and adds the customer header, footer, login presentation, and portal shell. At the end of UX-10B only Dashboard linked somewhere. No migration. See `docs/customer/ux-10b-brand-portal-shell.md`.

UX-10C replaces the placeholder dashboard and adds `/portal/cases`. A customer sees only cases where `cases.customer_id` is the portal session customer. Attention is a presentation of live evidence obligations and usable secure actions. The portal still cannot complete those steps. `CUSTOMER_PORTAL_ENABLED` stays off. Its migration is applied to `profilerelaunch-dev`. See `docs/customer/ux-10c-dashboard-cases.md`.

UX-10D adds `/portal/cases/[reference]`. The customer opens one owned case by its public reference and sees a header, what happens next, a six-step progress presentation, a curated timeline, and case details. Case cards link with "View case". Its migration is applied to `profilerelaunch-dev`. See `docs/customer/ux-10d-case-workspace.md`.

UX-10E adds `/portal/documents` and `/portal/cases/[reference]/documents`. A customer sees evidence requests, submitted evidence, and documents ProfileRelaunch has published for cases they directly own, and can upload a file for an eligible open request. The upload reuses the existing evidence records, storage, scan, and review lifecycle. Its migration is applied to `profilerelaunch-dev`. See `docs/customer/ux-10e-documents-evidence.md`.

UX-10F adds `/portal/cases/[reference]/service`. A customer reviews the offered quote snapshot, the stored Service Agreement, and the stored Case Management Permission, and can accept or decline those existing actions. An existing eligible authorization revocation can be completed. The portal and the emailed secure link call the same private mutation helper. Its migration is applied to `profilerelaunch-dev`. `CUSTOMER_PORTAL_ENABLED` stays off. See `docs/customer/ux-10f-quotes-agreements-permissions.md`.

UX-10G adds `/portal/payments` and `/portal/cases/[reference]/payments`. A customer sees the stored payment position for an owned case and can continue the existing guided checkout, managed payment-method setup, recovery authentication, success-fee consent, issued-invoice redirect, and receipt download. The portal and the emailed secure link call the same private payment helper. Checkout does not mark a payment paid, and a disabled payment provider does not produce a successful payment. Its migration is applied to `profilerelaunch-dev`. `CUSTOMER_PORTAL_ENABLED` stays off. See `docs/customer/ux-10g-payments-receipts.md`.

UX-10H adds `/portal/guard` and `/portal/guard/[selector]`. A customer sees owned Guard coverage in customer language and can respond to an existing eligible Guard permission, recurring-consent, subscription, or price-change action. The portal and the emailed secure link call the same private helpers. Checkout does not activate a subscription, and a disabled provider does not produce a paid result. Its migration is applied to `profilerelaunch-dev`. `CUSTOMER_PORTAL_ENABLED` stays off. See `docs/customer/ux-10h-relaunch-guard.md`.

UX-10I adds `/portal/messages`, `/portal/messages/[selector]`, and `/portal/account`. A customer sees communication that already crossed the existing delivery boundary, and the contact details on the authenticated customer. The page does not send messages, and it does not edit name, email, phone, or verification. Its migration is source review only and has not been applied. `CUSTOMER_PORTAL_ENABLED` stays off. UX-10J is not started. See `docs/customer/ux-10i-messages-account.md`.

## Sequencing notes

UX-1 is a precondition for everything else, which is why it is non-visual and why it ships on its own. UX-3 is a precondition for UX-4. UX-2 and UX-6 are independent of each other but both consume the same model, so divergence between them would be a defect rather than a difference of opinion. UX-1 implements none of the later phases. UX-2, UX-3, UX-4, UX-5, UX-6, UX-7, UX-8 and UX-9 are complete. UX-10 is in progress: UX-10A through UX-10H are complete. UX-10I is complete in source and its migration is pending. UX-10J is not started. The UX-10H migration is applied to `profilerelaunch-dev`. The Customer Portal is not launched. No phase should be marked complete until its own acceptance evidence exists.
