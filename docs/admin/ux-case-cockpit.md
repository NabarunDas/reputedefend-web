# UX-2 — the case cockpit

The case page is now the place a case is run from. It answers, in its first screen, the six questions an operator previously had to reconstruct from the database stage machine and several other Admin modules: whose case this is, where it has got to, what is already done, what is stopping it, who it is waiting on, and what to do next. It answers them by rendering the UX-1 case flow model.

## Design objective

An operator should not have to know that `READY_TO_SUBMIT` is a stage rather than a statement about Google, that a prepared pack lives in the evidence workspace, that a quote lives in Commercial and an order in Money, or that accepting a document does not close its request. The model already knows all of this. UX-2's job is to show it and to get out of the way.

The page therefore recommends and navigates. It never acts. Every command on the page is the command that was there before UX-2, with the checks it had before: Admin authentication, CSRF and origin checks, fresh-auth requirements, the `SECURITY DEFINER` RPC boundary, evidence security, customer-action secrets, the Stripe protections and the Google gates are all untouched. No new business command and no new server action was added.

## No second source of truth

Nothing on this page works out what UX-1 already worked out. There is no phase inferred from a stage, no status mapping beside the model's, no blocker decided in React, no waiting owner guessed, no Managed prerequisite ladder reimplemented, no pack readiness reinterpreted and no payment readiness recomputed. `apps/admin/app/cases/[id]/cockpit/presentation.ts` is the only shared non-component module in the cockpit, and everything in it is wording, a symbol or a page anchor.

The one derivation on the page is counting the case's own open tasks for the snapshot and the Tasks heading, which is counting a list the page is already rendering.

## Page hierarchy

In order down the page:

1. **Back to cases.**
2. **Case header** — the reference as the single `<h1>`, the client and business, the service track, the priority, whether the case is open or closed, and links to the client, business and location records.
3. **Reopened notice**, when `flow.reopened`.
4. **Case journey** — the nine phases, the sentence describing the phase the case is in, and the count of phases complete.
5. **Next action** beside the **case snapshot**.
6. **Blocking progress**, when there are blockers.
7. **Other things needing attention**, when there are attention items.
8. **Case prerequisites** — the prerequisite groups, while that phase is the one worth reading them in.
9. **Work on this case** — planning, progress, agreements and permissions, tasks, submissions, notes, closure.
10. **Supporting workspaces** — evidence, communications, related records.
11. **Case details** — case context, customer preview, technical and operator details.
12. **History.**

The four lower groups exist so the page does not return to ten equally prominent standalone panels. Each is a `<section>` with its own `<h2>`; the panels inside use `<h3>`.

## The journey

All nine phases come from `flow.phases` and are rendered in order, each with a symbol, its name and a word for its state:

| State | Symbol | Word |
| --- | --- | --- |
| `COMPLETE` | ✓ | Complete |
| `CURRENT` | ● | In progress |
| `UPCOMING` | ○ | Not started |
| `NEEDS_ATTENTION` | ! | Needs attention |

The page does not force earlier phases to green. A case can move backwards and a problem found late can reopen an earlier phase, and the model says so: a case marked ready to submit whose pack was never published shows Submission as the current phase and Preparation as needing attention, at the same time. That pair is the clearest demonstration that the stage and the journey are different things, and the page is careful not to collapse them.

Progress is reported as "5 of 9 phases complete", never as a percentage, because a phase is not a fixed share of the work.

`aria-current="step"` marks the phase in `flow.phase`, which is the phase the case is in whether or not that phase is also flagged as needing attention. The journey is a semantic `<ol>` and contains no links: it describes the case, it is not navigation.

## The next action

`CaseNextActionCard` renders `flow.primaryAction` — its label as the heading, its description, its state, its owner, its date and whether that date has passed. It does not restate, narrow or widen the recommendation.

The state decides the treatment:

| State | Badge | Call to action |
| --- | --- | --- |
| `ACTION_REQUIRED` | Action required | A primary button labelled with the action itself |
| `READY` | Ready to do | A primary button labelled with the action itself |
| `WAITING` | Waiting | A plain secondary link, `View …` |
| `BLOCKED` | Blocked | A plain secondary link, `View …`, with the blockers below explaining why |

A waiting step never gets a button. "Waiting for the customer to upload evidence" is not something the operator can press, and dressing it as a primary mutation would be a lie about who the case is waiting on. A blocked step says it is blocked rather than looking available.

The button label is the action: `Create the quote`, `Approve the evidence pack`, `Close the case`. Never `Continue`, `Go` or a bare `Open`.

## Who the case is on

The owner enum is untouched; only the wording changes.

| Owner | Word |
| --- | --- |
| `ADMIN` | `You` on the action card, `ProfileRelaunch` wherever it is named beside another party |
| `CUSTOMER` | Customer |
| `GOOGLE` | Google |
| `PAYMENT_PROVIDER` | Payment provider |
| `SYSTEM` | System |
| `NONE` | No waiting label at all |

The sentence follows the action state: `Action owner: You` for `ACTION_REQUIRED` and `READY`, `Waiting on: Customer` for `WAITING`, `Blocked by: ProfileRelaunch` or `Blocked by: System` for `BLOCKED`. The blocked wording uses the organisation voice because "Blocked by: You" would be an odd thing to tell somebody about work they are about to do.

The action card and the case snapshot both get this from `actionOwnershipSummary`, which takes the primary action and returns the label and the name. Neither reads `flow.waitingOn`, which is the primary action's owner whatever the state of that action: on a case the operator has to act on it holds `ADMIN`, so a row labelled "Waiting on" would have told them the case was waiting for themselves. A case with no primary action is a finished case — the resolver proposes a step for every open one — and the snapshot says `Work state: Complete` rather than naming a party nobody is waiting for.

## Blockers and attention

A blocker answers the three questions the model's catalogue is built around — what is missing, why progress cannot continue, and who resolves it — and links to where it is dealt with when the model supplies a destination. Blocker codes, reason codes and action ids are not rendered. They remain in the model for tests and analytics.

Attention items sit below the recommendation under "Other things needing attention". Severity changes the badge and the emphasis, not the order: re-sorting them would break the journey sequence the model built them in. Each shows its title, its explanation, its owner, its date and whether that date has passed.

There is one dominant next action and everything else supports it.

## Prerequisites

Rendered from `flow.prerequisites`, group by group, with each item's own state:

| State | Symbol | Word |
| --- | --- | --- |
| `SATISFIED` | ✓ | Done |
| `IN_PROGRESS` | ● | In progress |
| `NOT_STARTED` | ○ | Not started |
| `ATTENTION` | ! | Needs attention |
| `NOT_APPLICABLE` | — | Not needed |

A Managed case shows both of its groups and all of their items rather than one authorised flag, including the model's own `AUTHORISATION_READY` item, which is the database's answer rather than this view's. An outstanding item links to where it is dealt with; a satisfied one is plain text. Items are not buttons, because the commands already exist and duplicating them here would be a second way to do the same thing.

### When the checklist appears

UX-1 returns the Guided and Managed groups for the whole life of a case, which is right for the model and would be wrong on screen the whole time: a case in Submission does not need its satisfied permissions read back to it, and a case still choosing a service does not yet need requirements it has not reached. So the journey decides, and the `PREREQUISITES` phase state is the whole rule:

| Phase state | Checklist | Typical case |
| --- | --- | --- |
| `UPCOMING` | Hidden | Still at Received, Evidence, Assessment or Service |
| `CURRENT` | Shown | At the prerequisites phase, waiting on an agreement, a permission or a payment |
| `COMPLETE` | Hidden | Preparation, Submission or Decision, with the prerequisites still holding |
| `NEEDS_ATTENTION` | Shown | A permission or payment that was met has since been invalidated |
| Closed case | Hidden | Every phase reads complete, so the rule hides it without a special case |

This is presentation relevance, not eligibility. The page does not ask whether the prerequisites are met; it asks which phase the model says the case is in, and the model has already answered both.

The heading is `Case prerequisites` rather than "Before work can begin" because the section legitimately returns after work has begun — the invalidated-permission row above is exactly that case, and by then the older heading would have been untrue.

## Same-page anchors

Several recommendations are performed on this page. Linking them to the case's own `href` would move the operator nowhere, so `actionTarget` maps the action to the section that holds the command:

| Section | Anchor | Actions that point at it |
| --- | --- | --- |
| Case planning | `#case-plan` | Choosing the service track |
| Progress case | `#case-progress` | Reviewing a new case, completing the assessment, every stage advance, further review, outcome review, the manual-check fallback |
| Agreements and permissions | `#case-authorisation` | Agreements, case permission, Manager access, an invalidated permission |
| Tasks | `#case-tasks` | Google follow-ups and customer actions on Google's request |
| Submission attempts | `#case-submissions` | Recording an external submission, recording what Google decided |
| Close or withdraw this case | `#case-closure` | Closing the case |

This map decides nothing about whether an action is allowed. It decides where on the page to go. The section it points at is opened on arrival, which opens a disclosure and nothing else: the form inside is the form that was already there, with the server checks it already had. An action with no entry simply gets no link.

Destinations outside this page — the evidence workspace, communications, Commercial, Money, Tasks, Complaints, the client and business records — are ordinary internal links built by UX-1's destination module, which cannot produce an external href.

## Progressive disclosure

Collapsed by default: the plan, progress and closure forms when they are not what the model recommends; adding a note; adding a task; resolving a task or a submission; completed and cancelled tasks; the customer-visible preview; the technical and operator details; and everything the authorisation panel already collapsed.

Never collapsed: the journey, the next action, the blockers, the attention items and the prerequisites relevant to the current case.

## The closed case

A closed case still uses the cockpit. All nine phases read as complete, the hero becomes a completion card with the outcome and the closure summary and no button, and the closure panel keeps the reopen path. An open complaint survives closure and is still shown, because a complaint is not closed by closing the case. Nothing that only applies to an open case — progressing the stage, the authorisation panel, the closure form, the prerequisite checklist — is rendered.

A reopened case says so at the top.

## Responsive behaviour

The next action and the snapshot share a two-column row above 900px and stack below it.

The journey never scrolls sideways. On wide layouts it is a responsive grid of equal tracks that fits as many phases on a row as the width allows and wraps the rest onto another row — nine across at 1440px and above, five and four at common laptop widths. Below 900px each phase becomes a full-width row with its symbol, name and state on one line. An earlier draft scrolled the strip horizontally; visual verification found that it left a phase half-visible at the edge of the panel, which is why it wraps instead.

Nothing clips, the page itself never scrolls sideways, phase names are never broken mid-word, and long model descriptions wrap rather than overflow.

## Accessibility

One `<h1>`, the case reference. Group headings are `<h2>`, panels inside them `<h3>`, and items inside those `<h4>`. The journey is an ordered list with `aria-current="step"` on the phase the case is in. Every state carries a word as well as a symbol and a colour, so none of it depends on colour or on an icon alone. Repeated destination links — two blockers both pointing at Money, several "Resolve this task" disclosures — carry a visually hidden suffix naming what they belong to, so no two interactive elements share an accessible name. There are no clickable `<div>`s, no nested interactive elements, no hover-only information and no ARIA where native HTML already does the job.

## Server and client boundary

Every cockpit component is a Server Component. Nothing was marked `"use client"` for visual rendering, no workflow is calculated in `useEffect`, and no part of the state machine runs in the browser. The existing client forms are unchanged.

## Loading

`getCase` runs first: it validates the identifier and the history cursor and decides whether the page exists at all. The authorisation read and `loadCaseFlow` then run concurrently. A failure in either propagates; a projection that cannot be built is a problem to see, not one to hide behind the old layout.

`loadCaseFlow` re-reads the case detail and the case authorisation internally, so the page performs those two reads twice. That is a cost, not a correctness problem, and the fix is the single case-scoped batch projection UX-3 is already scheduled to design. It is recorded here rather than worked around.

## Migrations

`Migration required: No.` UX-2 adds no table, column, function, policy or grant. It reads what UX-1 already reads.

## Tests

- `app/cases/[id]/cockpit/fixtures.ts` builds real `CaseFlowFacts` trees and resolves them with the real `resolveCaseFlow`. No component test asserts against a hand-written `CaseFlowModel`, because a hand-written model could have a shape the resolver never produces.
- `journey.test.tsx`, `next-action.test.tsx`, `prerequisites.test.tsx`, `notices.test.tsx` and `snapshot.test.tsx` cover the components.
- `page.test.tsx` renders the whole page across the sixteen case states UX-2 is accepted against, from a new case through to a closed case with an open complaint, and across the phases that decide whether the prerequisite checklist appears.
- `lib/accessibility.test.ts` holds the static "exactly one `<h1>` per page" invariant. A page may delegate that heading only to a component on an explicit allowlist — `PageHeader` and `CaseHeader` — and the allowlist is itself checked against those components' source, so neither an unknown `SomethingHeader` nor a listed component that stopped rendering a heading can satisfy it.

## Deferred

- **UX-3** — the batch projection that removes the duplicate reads described above, and the case list and queue.
- **UX-4** — Today.
- **UX-5** — navigation.
- **UX-6** — the evidence workspace, which is where the manual scan refresh and the request-fulfilment step should become first-class actions rather than things the cockpit can only point at.
- **UX-7** — Commercial and Money, including the per-case filters whose absence makes the model report the commercial and payment position as possibly incomplete.
- **UX-8** — communications, including contact recovery.
- **UX-9** — the shared visual system and the central wording review; the cockpit uses the existing Admin tokens and adds no new palette.
