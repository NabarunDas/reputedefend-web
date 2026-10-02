# Case flow model and next action — UX-1

Built from main after Step 24A. No migration was created and Supabase was not touched. Nothing was activated: Stripe, outgoing mail, inbound mail, the Google API, Guard automation and privacy deletion are all exactly as Step 24A left them, and Cron remains `0 4 * * *`. UX-1 adds no page, no component and no stylesheet; it is the model the later UX phases will render.

## What this exists to answer

An operator opening a case today has to read the work stage, open Evidence to see whether a file is blocked, open Communications to see whether the customer was ever actually written to, open Commercial to see whether a quote was accepted, open Money to see whether anything was collected, and open the case again to see whether permissions are complete. Four questions follow from that and none of them has a single place to look: where is this case, what is already done, what is in the way, and what should I do next.

`resolveCaseFlow` answers those four questions from facts the database already holds. It is a projection and a resolver, not a workflow engine. It persists nothing, transitions nothing, creates no task, issues no customer action, sends no message, collects no payment, publishes no pack and submits nothing to Google. The existing domain remains authoritative: `admin_private.case_transitions`, `case_stage_ready_v1`, `guided_payment_ready_v1`, `managed_setup_ready_v1`, `published_pack_ready_v1` and `pack_publishable_v1` all still decide what is actually permitted. If this model recommends a transition the database then refuses, the database is right and the recommendation was optimistic; that is the correct relationship between the two and not a defect in either.

## The nine phases

The stage machine has fourteen stages because it encodes the rules an operation must satisfy. An operator needs a coarser answer. The nine phases are that answer, and they are strictly a projection: the exact technical stage stays in the result as `technicalStage`, with operator wording in `technicalStageLabel`, and is never replaced, rewritten or inferred.

| Technical stage | Phase |
| --- | --- |
| `INITIAL_REVIEW` | `RECEIVED` |
| `EVIDENCE_COLLECTION` | `EVIDENCE` |
| `ASSESSMENT_READY` | `ASSESSMENT` |
| `SERVICE_SELECTION` | `SERVICE` |
| `PAYMENT_REQUIRED` | `PREREQUISITES` |
| `AUTHORIZATION_REQUIRED` | `PREREQUISITES` |
| `PREPARATION` | `PREPARATION` |
| `READY_TO_SUBMIT` | `SUBMISSION` |
| `SUBMITTED` | `SUBMISSION` |
| `WAITING_GOOGLE` | `DECISION` |
| `OWNER_ACTION` | `DECISION` |
| `FURTHER_REVIEW` | `DECISION` |
| `OUTCOME_REVIEW` | `DECISION` |
| `FINISHED` | `COMPLETE` |

Payment and permission share the `PREREQUISITES` phase deliberately: they are the same point in the journey reached by the two service tracks, and an operator does not need to learn that Guided cases stop at one stage name and Managed cases at another. A stage this build does not recognise resolves to `RECEIVED` rather than throwing, because an unknown stage is a reason to show the case plainly, not a reason to fail the page.

## Phase states and moving backwards

Each phase carries one of `COMPLETE`, `CURRENT`, `UPCOMING` or `NEEDS_ATTENTION`. The base state comes purely from the current stage's position in the journey, so the model never assumes forward-only movement: a case sent from preparation back to evidence collection, or from a decision back for further review, is described as being where it actually is, with the later phases reading as upcoming again.

`NEEDS_ATTENTION` then overrides a complete or current phase wherever a critical or warning attention item points at it. That is how a stale pack reopens `PREPARATION` and an invalidated permission reopens `PREREQUISITES` on a case that has moved past both, without anything being rewritten. The history is untouched and the stage is unchanged; the phase simply says that something there needs looking at again. An upcoming phase is never flagged, because a phase the case has not reached cannot have a problem in it yet, and informational notices never flag a phase at all.

## One recommendation, and how it is chosen

The result carries exactly one `primaryAction`, or `null` on a case that is finished, closed or cancelled. Everything else that deserves a mention goes into `attentionItems`, which never compete for the recommendation. A case with ten things wrong still gets one answer, and it is the same answer every time for the same facts.

Precedence is a documented table in `lib/case-flow/actions.ts`, not an `if` chain and not array ordering spread across the per-phase rules. Five bands, highest first:

| Band | Meaning |
| --- | --- |
| 1 `SAFETY` | The integrity of the case: a threat in an upload, evidence that can no longer be validated, a permission that has been invalidated, a payment that needs reconciling, a message that failed to reach the customer it was blocking. |
| 2 `ADMIN_ACTION` | Work ProfileRelaunch owes the case right now: review the evidence, complete the assessment, approve the pack, record the Google decision. |
| 3 `OUTBOUND` | Something that has to be issued before the customer can do anything: request evidence, offer the quote, issue an agreement, permission or payment link. |
| 4 `WAITING` | It has been asked for and the answer has not arrived. |
| 5 `PROGRESSION` | A step the case has earned: advance a stage, close. |

Inside a band, the earlier entry in the action catalogue wins, and the catalogue is declared in journey order, so the earliest unfinished step is the one recommended. Declaration order is therefore load-bearing and the catalogue must not be sorted; a test asserts the bands are declared in order and that every action has a distinct priority key. The deliberate consequence of band 3 outranking band 4 is that issuing something the customer cannot act on yet always beats waiting for something else to come back: a Managed case with an agreement outstanding and no payment-setup link issued is told to issue the link, because the waiting is already happening and the issuing is not.

`waitingOn` is a single value of `ADMIN`, `CUSTOMER`, `GOOGLE`, `PAYMENT_PROVIDER`, `SYSTEM` or `NONE`, taken from the owner of the action actually being shown, so the two can never disagree. It is `CUSTOMER` only when the recommendation is genuinely a waiting state owned by the customer, never merely because a customer exists on the case.

## Phase by phase

**Received.** A new case has one recommendation: read what the customer reported and triage it.

**Evidence.** This is where most of the confusion lives, and the model separates eight things that are routinely conflated. Raising an evidence request is a record of what is needed and contacts nobody. Drafting the message, having it reviewed, and queueing it are three further steps. A message the provider accepted is not a message that arrived. The upload, the malware scan, the content validation and the review decision are four more. Finally, accepting a document does not close its request: somebody has to mark the request fulfilled and nothing in the database does it for them, so `OPEN_SATISFIED` is its own state and gets its own recommendation rather than reading as the customer being unresponsive.

Each uploaded version resolves to one of eleven states, with the per-version precedence consumed from `evidenceActions` in `lib/evidence/model.ts` rather than reimplemented, so the flow model and the evidence workspace cannot disagree about what a file is doing. A test asserts agreement across the exhaustive cross-product of the four status axes. Contact resolves to one of nine states from the newest `EVIDENCE_REQUEST` message, and requests to one of five. A version somebody has already rejected or superseded stops counting as an outstanding problem, because nagging about resolved history would hide the thing that actually needs doing.

**Assessment.** With no accepted evidence the case is blocked and falls back to the evidence rules; with accepted evidence it is told to complete the assessment, subject to the transition being allowed.

**Service.** An undecided track blocks everything commercial, because the two tracks have different prerequisites, different pricing and different submitters. Once a track is chosen the commercial ladder runs: no quote, draft with unconfirmed tax, draft ready to offer, offered with no acceptance link, offered and awaiting the customer, accepted, declined, expired. A declined or expired quote is an attention item and a blocker rather than a silent dead end.

**Guided prerequisites.** Two items: an accepted quote, because payment is collected against an order and an order only exists once a quote has been accepted, and the upfront payment itself. Payment means the authoritative obligation state, and nothing else. A returned checkout page, a completed Checkout session and the existence of a provider object are explicitly not interpreted as payment; the case moves when the obligation reads `PAID`. Where payment collection is switched off in the deployment, the model says the capability is blocked rather than fabricating a payment step that cannot be performed.

**Managed prerequisites.** Six separate items, never one `authorised = true` flag. Five are the component facts the database checks — the customer's email verified, their authority over the business verified, the service agreement accepted, the case-management permission active, Google Manager access verified — so an operator sees which one is missing instead of being told the case is not authorised. The sixth is the authoritative aggregate itself, consumed from the existing readiness projection rather than recomputed, and the group's `satisfied` is that aggregate and not this model's reading of the five. If the two ever disagreed, the database is right and the disagreement is visible on the same screen. A permission moved to `REVIEW_REQUIRED` is treated as absent authority, raises a critical attention item, and is never auto-revived here; it has to be issued and accepted again. Managed payment setup is its own three-item group covering the success-fee order, consent to a later charge and a usable saved method, with consent recorded but no usable method treated as a failed setup rather than progress.

**Preparation.** Prerequisites are re-checked, because they can be undone after the case has moved past them. Then the pack ladder: no pack, empty draft, draft with items to approve, approved but unpublished, published and usable. Approval and publication are separate and approval alone is never enough. A stale pack takes priority over everything else in the phase.

**Submission.** `READY_TO_SUBMIT` means ProfileRelaunch is internally ready and nothing more. It does not mean Google has received anything, and the model never automates or fabricates a submission: the recommendation is to submit through the agreed external channel and then record the submission with its reference, channel, time and evidence, because recording it is what moves the case on. The absence of automated Google submission is stated as a capability blocker so the boundary is explicit rather than implied.

**Decision.** Waiting for Google produces a waiting recommendation with no invented date, and becomes a follow-up recommendation only when a follow-up somebody actually recorded falls due. `OWNER_ACTION` waits on a recorded customer task, or recommends recording one. `FURTHER_REVIEW` resolves any open submission first. `OUTCOME_REVIEW` resolves any open submission, then any open tasks, then recommends closure.

**Complete and reopened.** A finished, closed or cancelled case produces no recommendation at all and `waitingOn` of `NONE`. A case reopened after closure carries an informational notice saying the earlier history is intact, and is otherwise resolved as the open case it now is.

Where no rule matches at all, an open case still gets an answer: a fallback that says plainly that the combination of states is not recognised and should be looked at by hand. It sits last in its band so it can never shadow a real recommendation, and a test asserts that no scenario in the matrix reaches it.

## Blockers and wording

Every blocker answers three questions: what is missing, why progress cannot continue, and who must resolve it. Each carries a human-safe title and explanation alongside a stable code and a category of `SAFETY`, `EVIDENCE`, `AUTHORITY`, `PAYMENT`, `COMMERCIAL_CONFIGURATION`, `CAPABILITY` or `DATA`, so a later UI can group them without parsing prose.

All wording lives in one module, for the same reason the priority table does: there is a single place to check that nothing claims more than the facts support. Three claims in particular are made nowhere. An email is never described as delivered when the provider has only accepted it — provider acceptance gets an informational notice saying exactly that. Payment is never described as received without an authoritative payment record. A submission is never described as having happened without a submission record. Cross-cutting tests assert the absence of that language across every scenario.

No date is ever manufactured. `dueAt` is only ever a date somebody recorded — an evidence request's due date, a task's deadline, a customer action's expiry, a planned next action's date — and `overdue` is that date compared against the `now` passed in. There is no invented service level anywhere in the model.

## Shape and purity

`resolveCaseFlow(facts, now)` in `lib/case-flow/resolve.ts` is pure. It imports no React, touches no component state, reads no cookie and reads no clock: `now` is a parameter, so a fixture is reproducible and an overdue test does not depend on the day it runs. `loadCaseFlow(caseId, now)` in `lib/case-flow/load.ts` is the server-only side that gathers the facts and calls it. The split means the entire rule set is testable without a database, which is what makes a 92-scenario matrix practical.

Destinations are a closed set of eleven internal surfaces resolved by builders in `lib/case-flow/destinations.ts`. A destination is never a string from the database or the browser, case-scoped paths are built only from an identifier that passes a UUID check, and a test asserts every destination the model can emit is an internal path. There is no way for an arbitrary URL to become a destination and therefore no open redirect.

Nothing in the output is a secret. Every fact comes from an existing Admin projection behind `requireStaff()` and a `SECURITY DEFINER` RPC; those projections already mask email addresses and have never carried a customer action secret, a storage bucket or key, an OAuth token, a Stripe secret or the service-role key. No public endpoint is introduced.

## Query cost, and what UX-3 will need

`loadCaseFlowFacts` performs one sequential read of `admin_case_detail_v1` followed by six parallel reads: `admin_case_authorization_v1`, `admin_evidence_case_v1`, `admin_prepared_pack_case_v1`, `admin_communication_list_v1`, `admin_quote_list_v1`, `admin_payment_list_v1` and `admin_complaint_list_v1`. That is eight round trips for one case, two sequential waves deep.

Four of those are case-scoped and `admin_communication_list_v1` takes a case parameter, capped at 50 rows. Three are not case-filterable and are filtered client-side: `admin_quote_list_v1` is capped at 100 rows, `admin_complaint_list_v1` at 100, and `admin_payment_list_v1` is unpaginated. Because a capped list that came back full cannot prove a case has no quote, the facts carry a `complete` flag per source and the resolver treats an incomplete read as unknown rather than as nothing existing — hence the `CONFIRM_COMMERCIAL_STATE` and `CONFIRM_PAYMENT_STATE` recommendations and the two `DATA` blockers behind them. Silence is never read as absence.

This is acceptable for a single case page and must not be called in a loop. Resolving N cases this way would be 8N round trips including three whole-table scans each, which is an N+1 design by any other name. A list or dashboard that wants the next action for many cases needs a single case-scoped batch projection instead — something of the shape `admin_case_flow_facts_v1(p_token text, p_case_ids uuid[])` returning the same fact tree per case in one call, with the three unfiltered lists restricted to the requested cases. That projection is identified here and deliberately not built: UX-1 requires zero migrations, and the resolver is already a pure function of the fact tree, so swapping the loader for a batch one later changes no rule.

## Gaps report

Classified as required. None of these were introduced by UX-1 and none are fixed by it.

### ACTUAL_FUNCTIONAL_GAP

Two, both in the existing transition matrix.

`READY_TO_SUBMIT` has no outgoing transition in `admin_private.case_transitions`. The only way out of it is recording a submission. If a pack is discovered to be stale after the case has been marked ready to submit, the case cannot be returned to `PREPARATION` to rebuild it; the model raises the stale pack as a critical attention item and a blocker, but there is no stage movement available to resolve it correctly.

`PAYMENT_REQUIRED` and `AUTHORIZATION_REQUIRED` have no reverse edge to `SERVICE_SELECTION`, and the `plan` operation refuses a service track change outside `INITIAL_REVIEW`, `EVIDENCE_COLLECTION`, `ASSESSMENT_READY` and `SERVICE_SELECTION`. A quote declined after the case has reached a prerequisite stage therefore leaves the stage describing something that is no longer true. The commercial workspace is not stage-gated, so re-quoting is still possible and no work is actually blocked, but the case stage and the commercial reality diverge.

### BUSINESS_RULE_DECISION_REQUIRED

No service level exists anywhere in the system, so `dueAt` is only ever a recorded date. Whether the business wants response or completion targets on any of these steps is a decision nobody has taken, and the model will not invent one.

Where an invalidated permission and a stale pack are both present, the permission currently wins, on the grounds that authority to act is more fundamental than the contents of a pack. That ordering is a judgement, not a derived fact.

On a Managed case, commercial work currently outranks an unverified customer email, because the catalogue is ordered by journey position and the quote comes first. An argument exists for verifying the contact before quoting. That is a business preference.

`ACCEPTANCE_UNKNOWN` currently counts as the customer having plausibly been reached, with an informational notice saying delivery is unconfirmed. Treating it as not-yet-reached instead would change which recommendation a stalled evidence request produces.

A Managed case sitting at `AUTHORIZATION_REQUIRED` with no order currently recommends creating a quote. Whether the commercial step belongs at that point in a Managed journey or earlier is unsettled.

After a submission is recorded, an evidence threat currently remains the top recommendation on the case. Whether safety should continue to outrank the decision cycle once the submission has left is a decision.

### DATA_PROJECTION_GAP

The authoritative readiness helpers — `guided_payment_ready_v1`, `managed_setup_ready_v1`, `published_pack_ready_v1` and `case_stage_ready_v1` — live in `admin_private` and are unreachable from TypeScript. `CaseDetail.transitions` is the raw matrix and does not apply them, so the model composes the already-projected component fields to decide whether a stage looks reachable. The database remains the enforcing authority at transition time, which is why an optimistic recommendation is safe, but the two can disagree and a projection of the composite answer would remove the disagreement.

`admin_communication_list_v1` carries no evidence request identifier, so contact state is a case-level answer derived from the newest `EVIDENCE_REQUEST` message rather than a per-request one. A case with two concurrent evidence requests shares one contact state between them.

`admin_quote_list_v1` is capped at 100 rows with no case filter, and `admin_complaint_list_v1` is capped at 100 rows and loosely typed on the TypeScript side; rows that do not narrow cleanly are dropped so an unreadable row cannot become a phantom blocker.

`admin_case_detail_v1` returns a bounded window of recent events, so the `reopened` fact is window-limited: a case reopened long ago with much activity since may no longer report it.

`pack_publishable_v1` additionally requires every item in the pack to be clean, valid and accepted, which the pack projection does not expose. The model's published-and-usable test checks approval, publication and a non-empty item list, which is a weaker condition than the database's.

`MoneyOrder` does not say whether an attempt against a saved method failed, so a Managed payment problem is inferred from consent recorded without a usable method rather than read directly. `ServiceOrder` from `admin_order_list_v1` carries no case identifier, which is why order facts come from the payment projection.

### UX_ORCHESTRATION_GAP

There is no per-case communications route; case communications are reached through the Communications workspace filtered by case. There is no resend or alternate-contact flow, so the recommendation when a message bounces is to reach the customer another way rather than to press a button. Issuing agreements, permissions and payment links is spread across three surfaces. Nothing marks an evidence request fulfilled when evidence against it is accepted, and nothing refreshes a scan result on its own.

### CAPABILITY_NOT_LIVE

Outgoing customer email is switched off, so any step that depends on a message reaching the customer cannot start on its own. `googleLiveStack` is `null`, so there is no automated Google submission and the submission step is external by construction. Stripe is disabled, so no payment link or setup link can be issued. Inbound mail and Guard exist but are not consumed by this model at all; a Guard-created case resolves like any other case.

## What UX-1 deliberately does not do

It does not redesign the case page, the Today page or the navigation, and it adds no CSS. It does not persist a status, a next action, a phase or a checklist anywhere, and it creates no table, enum, function, RPC or trigger. It does not read the authoritative readiness SQL into TypeScript. It does not transition a case, create a task, create an evidence request, send a message, issue a customer action, create a quote, collect a payment, change a permission, publish a pack, submit to Google or close a case. It is read-only in the strictest sense: given the same facts and the same `now`, it returns the same object and leaves nothing behind.

## Tests

Five test files, 150 tests. The scenario matrix in `lib/case-flow/scenarios.test.ts` carries 92 named scenarios spanning every phase, both service tracks, the evidence states, the commercial ladder, the prerequisite groups, the pack ladder, the submission boundary, the decision cycle, closure and reopening, the capability-disabled cases and the truncated-read cases. Its transition fixtures mirror `admin_private.case_transitions` and a test asserts the mirror covers every stage.

Alongside the named scenarios, cross-cutting assertions run over the whole matrix: exactly one primary action on every open case, never the fallback, exactly one `waitingOn` always equal to the primary action's owner, `CUSTOMER` only on a genuine waiting state, every blocker carrying a title, an explanation and an owner, no duplicate blocker or attention codes, every destination an internal path, no date that was not recorded somewhere, identical output across repeated resolution of identical facts, and no wording anywhere that claims delivery, payment or submission the facts do not support.

Verification at the final head: the complete Admin suite, Admin typecheck, Admin build, the Admin protected-route smoke check and root lint.

Next: UX-2 renders this model. See ux-redesign-roadmap.md.
