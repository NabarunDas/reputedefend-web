# UX-3 — Case queue and batch CaseFlow fact projection

## What this phase is for

Two things, and they are the same thing seen from two ends.

An operator opening `/cases` was being shown the database. Each row carried a technical work stage out of fourteen, a next action somebody had typed into a text field by hand, and a date belonging to that note rather than to the work. Deciding what to pick up meant knowing the stage machine, trusting whatever the last person wrote, and opening cases to find out which ones were actually stuck. The Case Cockpit had already stopped doing that for one case; the queue had not.

Making the queue render the UX-1 model is the design half. The other half is that it could not be afforded. `loadCaseFlow(caseId)` composed eight Admin read RPCs per case, three of them unfiltered list reads. Fifty rows would have been four hundred round trips, three of them whole-table scans each. UX-1 wrote that cost down and refused to loop it; UX-3 is where the replacement gets built.

## Why the single-case loader could not simply be looped

`loadCaseFlowFacts` read `admin_case_detail_v1`, then in parallel `admin_case_authorization_v1`, `admin_evidence_case_v1`, `admin_prepared_pack_case_v1`, `admin_communication_list_v1`, `admin_quote_list_v1`, `admin_payment_list_v1` and `admin_complaint_list_v1`. Eight reads, two sequential waves deep.

Three of those take no case parameter. `admin_quote_list_v1` returns the hundred most recent quotes across the whole system, `admin_complaint_list_v1` the hundred most recent complaints, and `admin_payment_list_v1` every order. The facts were filtered in TypeScript afterwards. Calling that eight-read composition in a loop would have been an N+1 design, and running the eight reads concurrently per case would have been the same N+1 with more connections — not batching, just faster duplication.

Worse, the filtering was lossy in a way the operator saw. A case-filtered empty result from a page that came back full does not prove the case has no quote. UX-1 handled that honestly: the facts carried a `complete` flag per source, and the resolver treated an incomplete read as *unknown* rather than as *nothing*, which surfaced as the `CONFIRM_COMMERCIAL_STATE` recommendation and a `COMMERCIAL_STATE_UNKNOWN` blocker. Correct, but it meant a busy system could ask an operator to go and check a commercial position that was perfectly well known.

## The batch projection

One database function answers for a bounded set of cases:

```
public.admin_case_flow_facts_v1(p_token text, p_case_ids uuid[]) RETURNS jsonb
```

It returns `{"cases": [ <fact tree>, ... ]}`, one tree per requested case that exists, each carrying its own `caseId`. One call returns the complete CaseFlow fact tree for every requested case; there is no per-case call anywhere in the path.

The migration is `supabase/migrations/20261002194215_admin_case_flow_batch_v1.sql`. It adds a function and nothing else: no table, no column, no view, no trigger, no policy. Its header comment was written before the migration was applied and still describes it as unapplied, with the version the local CLI first generated; that text is deliberately left alone, because the file is now an applied migration and must stay byte-for-byte as applied. The applied state is recorded here and in the recovery manifest instead.

### It supplies facts, it does not make decisions

The projection carries no workflow logic. It does not say which phase a case is in, what the next action is, who is waiting, what is blocking, or anything else the operator reads. There is no precomputed phase, no precomputed action, no precomputed blocker and no second status field. `resolveCaseFlow(facts, now)` remains the single resolver and is unchanged from UX-1 — the parity tests run both readings of the same database through it and compare the resulting models.

### Maximum batch size

**Fifty.** It matches the Cases page size, and the database enforces it rather than trusting the caller:

- a null array is rejected
- a null element is rejected
- more than fifty identifiers is rejected
- an empty array returns an empty result rather than an error
- duplicates are collapsed before the query runs

The session is checked before any of those bounds, so a rejection can never tell an unauthenticated caller anything.

### Fact parity with UX-1

The tree is the same `CaseFlowFacts` shape UX-1 defined, field for field: the case itself with its stage, status, track, outcome, parties, recorded next action and allowed transitions; tasks; submissions; the authorisation block including the `admin_private.case_authorization_readiness_v1` aggregate consumed rather than recomputed; customer actions by identifier, kind, agreement kind, status and expiry; evidence requests and versions with their upload, scan, validation and review states; prepared packs with their item counts and the eligible-evidence count; quotes with their acceptance links; orders with their obligations; communications; and open complaints.

Two facts are stronger than they were, because the projection is case-scoped rather than filtered out of a global page:

- `commercial.complete` is now authoritatively true. The projection inspects every quote belonging to the requested case, so an empty result means there is no quote.
- `complaints.complete` is now authoritatively true, for the same reason.

One more is now exact. `reopened` was read from the bounded window of recent events `admin_case_detail_v1` returns, so a case reopened long ago with activity since would stop reporting it — recorded in UX-1 as a `DATA_PROJECTION_GAP`. It is now an `EXISTS` over the whole event history, returning a boolean and no history. **UX-3 closes that DATA_PROJECTION_GAP.**

The runtime capability facts — whether live mail is enabled, whether payments are enabled, whether the Google submission stack is live — are deployment configuration, not schema. They stay out of the database entirely and are attached in TypeScript after the facts are loaded.

### Security model

The projection follows the existing single-admin RPC pattern exactly, with no exceptions:

| Concern | Position |
| --- | --- |
| Session | `public.admin_session_v1(p_token)`, the same gate as every other Admin read; returns `NULL` and the function returns `NULL` |
| Token | The SHA-256 hash of the session cookie, hashed server-side in TypeScript; the raw cookie never reaches the database |
| Caller identity | Never trusted. There is no actor, user or role parameter |
| `search_path` | `SET search_path=''`, with every reference schema-qualified |
| Definer rights | `SECURITY DEFINER`, hardened identically to the existing Admin read RPCs |
| Grants | `REVOKE ALL ... FROM PUBLIC, anon, authenticated` then `GRANT EXECUTE ... TO service_role` |
| Anonymous access | None |
| Ordinary authenticated access | None |
| RLS | No policy added, widened or altered |
| Dynamic SQL | None. No `EXECUTE`, no string-built query, no injectable surface |
| Enumeration | Bounded at fifty identifiers per call, behind the Admin session |

Nothing secret-bearing is returned. Specifically absent: customer-action secrets (customer actions are projected by identifier, kind, agreement kind, status and expiry only), storage buckets and keys, OAuth tokens, Stripe and other provider secrets, the service-role key, session tokens, passwords, raw provider credentials, and email addresses in any form.

### Batch result integrity

The projection's answer is `jsonb`, so the loader narrows it rather than casting it, and fails closed on anything surprising. A queue rendering fifty operator decisions must never degrade quietly.

- every identifier is validated as a UUID before the call, so a malformed value never reaches a `uuid[]` parameter
- more than fifty identifiers is refused before the call as well as by the database
- duplicates are collapsed, preserving the caller's first-seen order
- a returned case that was not requested is an error
- a returned case that appears twice is an error
- a requested case that is missing is absent from the map, and `requiredCase` turns that into an error at the point the caller expected it
- a missing or wrongly typed field is an error; a missing array does not become an empty array, and a missing case does not become an empty fact tree
- enums are narrowed rather than trusted — an unknown service track reads as `UNDECIDED`, as UX-1 read it

There is no fallback. If the projection cannot be read, the page fails. Falling back to the technical stage or to the recorded `nextAction` would silently restore the thing UX-3 exists to remove.

## The loader

`apps/admin/lib/case-flow/load.ts` now exposes:

```ts
loadCaseFlows(caseIds: readonly string[], now?: Date): Promise<Map<string, CaseFlowModel>>
loadCaseFlowsFacts(caseIds: readonly string[]): Promise<Map<string, CaseFlowFacts>>
loadCaseFlow(caseId: string, now?: Date): Promise<CaseFlowModel>
loadCaseFlowFacts(caseId: string): Promise<CaseFlowFacts>
```

`loadCaseFlows` validates and deduplicates the identifiers, makes one projection call, narrows the payload, attaches the runtime capability flags, and calls the pure resolver once per fact tree at a single instant. Results are keyed by case identifier rather than returned as a list, because the database is under no obligation to answer in the order it was asked.

The single-case functions delegate:

```ts
const flows = await loadCaseFlows([caseId], now)
return requiredCase(flows, caseId)
```

The eight-read implementation has been removed, not left beside the new one — a loader left in place is a loader something will eventually loop. A test asserts that none of the eight RPC names, and neither `getCase` nor `getCaseAuthorization`, appears in the loader any more.

### A Case Cockpit improvement that falls out of this

The cockpit page reads the case detail and the case authorisation for its own purposes, and the old `loadCaseFlow` read both again internally. A single case page therefore made two duplicate round trips on every load. It no longer does: `loadCaseFlow` makes one projection call and reads neither `getCase` nor `getCaseAuthorization`. The case page is unchanged in every other respect; UX-3 does not redesign it further.

## The Cases page

### What it reads

1. the existing paginated `listCases(filters)` read, unchanged
2. `loadCaseFlows` for the identifiers on the current page only

That is two reads, not eight per row. Flows are never requested for rows beyond the fifty being displayed, and when nothing matched the filters the projection is not called at all.

### What a case says

Primary, for every row:

- the case reference, as the only link
- the client and the business
- the human phase label, from `flow.phaseLabel`
- the service track and the priority
- the primary action's own label, from `flow.primaryAction` — or `Complete` with the recorded outcome where the case is finished
- who the step sits with, under the wording the action's state makes true
- the action's date, where the model carries an authoritative one, and whether it has passed
- a count of blockers, where there are any
- a count of other things needing attention, where there are any

Secondary: whether the case is assigned.

The technical stage column is gone. The hand-recorded `nextAction` and its date are not rendered anywhere.

### Wording, action state and ownership

The queue reuses the presentation vocabulary UX-2 built rather than restating it. The genuinely shared parts — owner labels, the four action-state treatments, the ownership summary, service track labels, priority labels and case status labels — moved to `apps/admin/app/cases/presentation.ts`, which both the queue and `app/cases/[id]/cockpit/` import. The cockpit module keeps only what belongs to that page: its section anchors, its journey and prerequisite symbols and its severity treatment. Nothing about business logic moved, and there is no circular import.

Ownership is state-aware, which matters more in a list than on a page. `flow.waitingOn` is the primary action's owner whatever state that action is in, so reading it as a wait is wrong: a case the operator must act on would read "Waiting on: ProfileRelaunch" when it means "Action owner: You". The state decides the word — a step that can be taken now has an owner, a step that has been asked for is a wait, and a blocked step names what is holding it.

A completed case shows `Complete` and its outcome. It is never given an invented next action, and never shows a date.

### Attention, counted rather than listed

Fifty cases cannot each explain their blockers, and the case page already does that properly. The queue shows `2 blockers`, `1 other issue` and `Overdue` — counted, in words, with no codes and no severity jargon. `Overdue` is a word rather than a colour; the count labels name their noun rather than relying on position.

### Dates

A date is shown only when `flow.primaryAction.dueAt` carries one, and lateness only from `flow.primaryAction.overdue`. Dates are formatted the way the rest of Admin formats them. **No SLA is invented** — UX-1 defines none, and a case whose action has no authoritative date simply shows none, even though the row's own `due` column may hold one.

### Assignment

`Assigned` and `Unassigned` are preserved exactly as they were, and are kept visually and semantically separate from the primary action's owner. Who a case belongs to as staffing and who owes its next step are different questions, and conflating them would be a regression.

### Filters, search, ordering and pagination

All unchanged. The server-side filters are the same seven — Open cases, All cases, Closed and cancelled, Unassigned, Overdue, Guided, Managed — and search still covers reference, client and business. There is no client-side filter over the visible fifty rows, because filtering a page is not filtering a queue. Cursor pagination is preserved, carrying the filters into the next page.

**The queue does not re-rank anything.** Ordering is exactly what `admin_case_list_v1` returns. There is no urgency score, no sort by blocker severity, by next action, by attention count, by waiting owner or by phase. Re-ranking is a decision about priority, and UX-3 is not where it gets made.

### Responsive behaviour

The queue is a list of cases, not a wide technical table, so it reflows rather than scrolling horizontally. On a desktop or laptop each case is a three-column row: identity, status, action. Below 900px the columns stack in reading order — which case, what state, what to do — and the action keeps its left rule so it stays identifiable as the operative part of the row. Verified at 390px, tablet, laptop and wide desktop.

### Accessibility

- one `h1` on the page, from the page header; each case is an `h2`
- the queue is a semantic `<ul>` of `<li><article>`, each article labelled by its own reference
- the human phase is text, not a colour or an icon
- the action state is text — `Action required`, `Ready to do`, `Waiting`, `Blocked`
- `Overdue` is a word, not a colour alone
- counts are labelled with their noun
- exactly one keyboard-accessible link per case, and nothing else interactive
- the filter form keeps its labels and its focus states
- no hover-only information
- no clickable non-interactive containers — the `<li>` is not a fake button
- mobile DOM order is the reading order

The strengthened `h1` invariant from UX-2 is preserved.

### Empty state

`No cases match these filters.` The batch loader is not called when there are no rows.

## Components

| Component | Responsibility |
| --- | --- |
| `CaseQueue` | the list |
| `CaseQueueItem` | one case |
| `CaseQueueStatus` | phase, track, priority and the attention summary |
| `CaseQueueAction` | the primary action, its state, its owner and its date — or the completed state |

All are Server Components. There is no client-side CaseFlow resolution, no fetching of flows from the browser, no `useEffect`, no client-side batching and no state machine in React.

## Migration status

**The migration has been applied to the development database.** It was reviewed independently and applied once, by hand, outside this repository.

- migration file: `supabase/migrations/20261002194215_admin_case_flow_batch_v1.sql`
- applied to: `profilerelaunch-dev`
- applied on: 2026-10-02
- remote migration head afterwards: `20261002194215 admin_case_flow_batch_v1`
- applied development head: `20261002194215`, the same
- live function: `public.admin_case_flow_facts_v1(text, uuid[])`

The remote ledger assigned `20261002194215` rather than the version the local CLI had generated, so the repository file was renamed to match the applied one. Its contents were not touched: the file is byte-for-byte the SQL that was applied.

The live function was verified on the project after application: `SECURITY DEFINER` is on, `search_path` is pinned empty, `service_role` can execute it, `PUBLIC`, `anon` and `authenticated` cannot, and an invalid Admin session returns `NULL` rather than data. The Supabase security advisor reported no new finding; the existing unrelated warnings are unchanged.

The recovery manifest records this migration as `appliedToDev: true`. UX-8, UX-10A and UX-10C were later applied as well. The current repository/dev head is `20261003154314_customer_portal_dashboard_cases_v1.sql`, and `pendingMigrations()` is empty. The release readiness check reports `supabase.applied-head` as `READY` against that aligned head.

This is the development project. Nothing has been applied to a production database, no Supabase branch was created, and no cost-bearing cloud resource exists. The migration chain, the recovery rehearsal and the upgrade path continue to be tested in PGlite, which is local and disposable.

The historical foundation migration-ledger discrepancy is a separate, older matter and is untouched by this. `20260915120000_core_data_foundation_v1.sql`, `20260915193000_case_intake_transaction_v1.sql` and `20260916000000_relaunch_guard_data_foundation_v1.sql` are present in the dev schema but absent from the remote ledger, which begins at `20260917080553_single_admin_auth_v1`. `supabase.migration-ledger-discrepancy` remains `BLOCKED` and the Step 24 production topology decision remains outstanding.

No provider state changed: outgoing and inbound mail remain disabled, Stripe remains disabled, the Google live stack remains off, Guard live automation remains disabled, privacy deletion remains disabled, Cron is unchanged and Step 22B remains deferred.

## Reuse by UX-4

Today reads this same projection, in chunks of fifty. The cap above is unchanged and the migration is unchanged: a day with two hundred open cases is four calls of `admin_case_flow_facts_v1`, each at or under fifty identifiers, not one wider call and not a call per case. The Cases queue itself is not re-ranked. Today orders its own work list by the priority band the chosen action already carries; `/cases` keeps the order `admin_case_list_v1` returns.

## Remaining gaps and deferred work

Deliberately out of scope, and unchanged by this phase:

- the evidence-to-request communication linkage, so contact state is still a case-level answer rather than a per-request one
- Guard, contact recovery, Stripe provider state, Google submission and the workflow reverse transitions
- the `admin_private` readiness helpers that `CaseDetail.transitions` does not apply
- `pack_publishable_v1`'s per-item conditions, which the pack projection still does not expose
- re-ranking the Cases queue itself; Today orders its own work list and leaves `/cases` in list order
- navigation and the rest of the UX programme

Known and accepted in the design:

- the projection caps the per-case sub-lists it returns — twenty customer actions, twenty packs, fifty communications — matching what the underlying projections returned. These are per-case bounds on a case's own rows, not global page caps, so they do not reintroduce the uncertainty UX-1 had to flag.
- a requested case that does not exist is absent from the result rather than reported as missing. The caller decides whether that is an error: the single-case loader turns it into a 404, and the queue treats it as a failure, because a row that came back from the case list must have a flow.
