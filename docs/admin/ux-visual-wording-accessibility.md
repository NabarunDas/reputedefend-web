# UX-9 — Admin visual system, wording and accessibility

UX-9 is a presentation pass over the Admin Portal that UX-1 to UX-8 already shaped. It does not add a workflow, a status, a table, or a provider. CaseFlow remains the only next-action authority. The database remains the authority for evidence, quotes, payments, communications and Guard.

## Visual hierarchy

A page reads in this order:

1. One page title (`h1`), usually through `PageHeader` or the case header.
2. A short explanation of what the page is for.
3. The current work: the next action, the queue, or the record being handled.
4. Supporting sections (`h2`, then `h3` where a section needs parts).
5. Technical or historical detail, behind a disclosure when it is not needed to decide.

Headings are chosen by level, not by the size someone wants. Admin type stays at the sizes already used: the page title is 1.6rem, a section is about 1.05rem. There is no marketing scale.

Case pages keep the public case reference, the client and the business in the header. Identifiers, filenames and addresses wrap (`overflow-wrap: anywhere`) so a long value does not widen the page. A real table may scroll inside a labelled, keyboard-focusable region.

The three case workspaces — Evidence, Commercial and money, and Communications — share the `case-workspace` page class: a white panel, the same title block, and a link back to the case.

## Colour and status

The brand stays the forest and green family, with a lime accent, a light workspace and white panels. Tokens live on `:root` in `apps/admin/app/globals.css`.

| Role | Token | Use |
| --- | --- | --- |
| Ink | `--ink` / `--forest` | Body text and headings |
| Quiet text | `--muted` | Help, secondary facts. Darkened so small text stays readable on the paper background |
| Primary action | `--green` | The thing to do now |
| Secondary action | paper button, green text, visible border | Navigation and optional support |
| High consequence | `button.danger` | Closure, cancellation and revocation. Outlined, not filled green |
| Information | `.notice` | Context that is not a failure |
| Warning | `.notice-warning` / `--warning` | Incomplete, withheld, or not yet due |
| Danger | `.notice-danger` / `--danger` | Disagreement, threat, or a failed load that must stay visible |
| Success | `.badge-success` / `.notice-success` | A completed or paid state, always with words |
| Blocked / unknown | `.notice-blocked` | The system does not know, or the step is not available |

`Badge` keeps the word and adds a decorative mark (hidden from assistive tech) so a colour is not the only cue. The case journey symbols are unchanged: Complete, In progress, Not started, Needs attention, Waiting, Blocked.

Disabled controls use a solid grey, not a faded green, so the label stays readable.

Focus is a 3px ring. On the forest sidebar the ring is lime, because the green ring disappears on the green background.

## Action hierarchy

- Primary: filled green. CaseFlow’s `ACTION_REQUIRED` step uses `button-link` and the action’s own name.
- Secondary: the `secondary` class, or a plain link. “View …” on a waiting or blocked step is a link, not a button.
- High consequence: `button.danger` on close case, cancel quote, revoke a quote action, cancel a complaint or incident, cancel a Guard check, revoke monitoring permission, revoke authorisation, and close a conversation.

Vague labels such as Continue, Go and Submit are not used for those operations. Closing a conversation is labelled “Close conversation”.

## Wording

Operator language stays short and factual.

| Term | Meaning on an Admin screen |
| --- | --- |
| Client | The person record |
| Customer | The person in a customer-facing action, link, preview or portal. Not a second name for the client record |
| Business | The business record |
| Location | A place belonging to a business |
| Case | The recovery or review matter, named by its public reference |
| Evidence / Evidence request | Files and the request they answer. A clean scan is not accepted evidence. Accepted evidence does not by itself complete a request |
| Quote | A priced offer. Offering it is not payment |
| Service order | The accepted commercial commitment |
| Payment / Payment method | Money due, or a saved method. A saved method does not authorise an arbitrary charge. Success-fee approval is not payment |
| Conversation | A thread with the client |
| Communication | One outbound or recorded message. Provider acceptance is not delivery. A replacement is a draft until it is queued |
| Guard | The monitoring service. An active Stripe subscription is not entitlement |

Service codes on Money are shown with the existing service names (Guided Relaunch, Managed Relaunch, and so on). Task types and case priority in the case plan form use those words; the stored values are unchanged.

Ordinary screens do not lead with RPC, database, UUID, webhook or service role. A qualified Guard snapshot still has to name the exact active coverage; the database still checks it. An issued test-mode invoice still does not mark an obligation paid.

These distinctions stay in the copy where the earlier phases put them: sender match is not authentication, a prepared pack is not a submitted appeal, and live providers stay off while their gates are off.

## Accessibility baseline

`apps/admin/lib/accessibility.test.ts` checks the whole Admin tree:

- exactly one top-level heading per page;
- visible fields have a label, and placeholder text is not the only label;
- client forms expose a live region;
- the navigation landmark marks the current page;
- the skip link targets `#main-content`;
- scrollable tables are labelled and focusable;
- images have an `alt`;
- tab order is not pulled forward with a positive `tabIndex`;
- buttons are not empty;
- a link that opens a new tab says so.

Component tests cover the shared badge and notice, the case next-action card (a waiting or blocked step is not an enabled mutation), and the shell.

`Notice` is ordinary page content. It has no live-region role unless the caller asks. `live="status"` is for a dynamic update. `live="alert"` is only for an interruption. Static commercial warnings, communications completeness warnings and Money explanations are read in document order. Async command results stay on the `role="status"` paragraph each form already renders. Case communications classify a disagreeing record as danger and an incomplete history as a warning. That is colour and wording, not a live region.

## Focus and the mobile menu

Below 900px the sidebar is a drawer.

- “Open menu” / “Close menu” sets `aria-expanded` and points at the sidebar with `aria-controls`.
- While the drawer is closed, the sidebar is `inert` and `aria-hidden`, so it is not a second tab stop behind the page.
- Opening it moves focus to the first link in the navigation.
- While it is open, the page and the header controls behind the backdrop are `inert`. Tab and focus stay on the menu button, the backdrop and the navigation. Escape still closes it.
- Escape, the close button and the backdrop close it and return focus to the menu button.
- Choosing a destination closes it without forcing focus back to the menu button, because navigation is happening.
- `aria-current="page"` still marks the current destination, and an active group stays expanded.

There is no new dependency. Desktop width does not inert the sidebar.

## Responsive rules

The shell stacks under 900px. Under 480px the header search wraps onto its own line so the menu, wordmark and sign-out fit a narrow viewport. Comparison columns, the case queue and the journey stack in DOM order. Evidence pipelines stack under 640px.

The page itself should not scroll sideways for ordinary reading. Tables keep an inner scroll region.

## Tables

Columns stay tables. A case the operator works one at a time stays a worklist, as Today and the case queue already do. Where a public case reference exists, the link goes to the case or to the case workspace that owns the fact. Money links a case-bound order to `/cases/[id]/commercial`.

## Progressive disclosure

The case cockpit still leads with the journey and the next action. Technical stage, identifiers and history stay in disclosures. Communications, evidence and commercial pages follow the same idea: the next action and the current fact are visible; provider identifiers and raw history are not the first thing on the page.

## Empty, unknown and error

`EmptyState` is for a genuine empty list (“No accepted service orders”), not for a failed load. A missing case outcome on Money is “could not be confirmed”, not “none” and not an approval. An incomplete communications history says the history is incomplete and withholds the action. A load failure is not rendered as an empty queue.

## Money success-fee consistency

Global `/money` used to show **Approve success fee** for every success-fee order that had no approval yet, including a case that had not reached the qualifying outcome. The case Commercial workspace already used `isQualifyingSuccessFeeOutcome`. The database command still denies an approval that does not qualify.

The Money page now loads case type and outcome through the existing batch projection `admin_case_flow_facts_v1`, in chunks of fifty, and only for success-fee orders that are not yet approved. It does not add a query per order and it does not copy the rule into SQL.

Approve success fee is shown only when the same presentation prerequisites as the case Commercial workspace all hold: the order is a success fee, it is not already approved, it is linked to a case, the case outcome loaded, `isQualifyingSuccessFeeOutcome` matches, a usable payment method is saved (`setupReady`), later-charge consent is recorded, and accepted outcome evidence exists. A saved payment method without consent is a setup conflict and approval is withheld. Consent without a usable payment method, or neither, is incomplete setup. A qualifying outcome without accepted evidence still does not offer approval. A missing case projection withholds approval. The row still links to the case commercial workspace. Fresh sign-in stays a requirement of the command. `approve_success_fee` checks the rules again. Approval still does not charge a card.

## What this pass does not change

- CaseFlow priority, actions and transitions
- Evidence acceptance and fulfilment
- Quote, order and payment rules, including the success-fee database check
- Communication lifecycle and delivery meaning
- Conversation sender meaning
- Guard entitlement
- Provider, mail, worker and payment gates
- Customer-action security, audit and idempotency

No migration. The applied head remains `20261003120000_case_communications_workspace_v1`.

## Remaining limitations

- The global conversations inbox can still offer Draft reply without knowing whether the case is closed. The command denies a closed or cancelled case. The case communications workspace hides that action.
- Creating a contact-recovery task still cannot tell whether an equivalent task is already open.
- Money reads case type and outcome from the full CaseFlow projection, which is more data than the two fields, because that is the existing safe batch read. A failed projection withholds every pending success-fee approval on the page.
- Some older operational forms still say “Save” for the submit control when the surrounding section already names the operation.
- This pass was checked with the Admin test suite, production builds and smoke checks. It was not signed in against a live Admin session at every viewport.
