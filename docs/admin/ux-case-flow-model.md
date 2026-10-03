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

The model answers in a fixed order of concern: the safety and integrity of the case first, then the earliest unresolved step in the journey, then a progression the case has earned. That ordering is expressed as a documented table in `lib/case-flow/actions.ts`, not an `if` chain and not array ordering spread across the per-phase rules. Four bands, highest first:

| Band | Meaning |
| --- | --- |
| 1 `SAFETY` | The integrity of the case: a threat in an upload, evidence that can no longer be validated, a permission that has been invalidated, a payment that needs reconciling, a message that failed to reach the customer it was blocking. |
| 2 `ADMIN_ACTION` | Work ProfileRelaunch owes the case right now: review the evidence, complete the assessment, approve the pack, rebuild a pack that is not fit to send, record the Google decision. |
| 3 `JOURNEY` | The earliest unresolved step in the case journey, whether that step is issuing something to the customer or waiting for what was already issued. |
| 4 `PROGRESSION` | A step the case has earned: advance a stage, close. |

Issuing and waiting share one band on purpose. An earlier version of this table put every outbound action above every waiting action, and the consequence was wrong in exactly the place it mattered: a Managed case with the service agreement already out with the customer was told to send the payment-setup link, because the waiting was already happening and the issuing was not. That is a worse instruction than waiting. Journey position decides between issuing and waiting now, and a later customer-facing request is never recommended while an earlier customer prerequisite is still outstanding.

Inside a band, the earlier entry in the action catalogue wins, and the catalogue is declared in journey order, so the earliest unfinished step is the one recommended. Declaration order is therefore load-bearing and the catalogue must not be sorted; a test asserts the bands are declared in order and that every action has a distinct priority key. That tie-break settles conflicts between phases. Sequencing *within* a phase is the per-phase rule's job, and the Managed prerequisite ladder in particular returns a single candidate rather than relying on this table to order its own steps.

`waitingOn` is a single value of `ADMIN`, `CUSTOMER`, `GOOGLE`, `PAYMENT_PROVIDER`, `SYSTEM` or `NONE`, taken from the owner of the action actually being shown, so the two can never disagree. It is `CUSTOMER` only when the recommendation is genuinely a waiting state owned by the customer, never merely because a customer exists on the case.

The chosen action carries the band it was chosen by, as `priorityBand` on `CaseNextAction`. The type lives with the model and the numeric ordering stays in the catalogue, so a caller holding many cases can order them the same way the resolver orders candidates within one case, without keeping a second copy of the action-to-band table. UX-4 is that caller: Today sorts open cases by the band of the action the resolver already chose. The field changes no decision. It is a projection of the action identifier, the scenario matrix asserts it equals the catalogue's own answer on every scenario, and the bands themselves are exactly the four in the table above.

## Phase by phase

**Received.** A new case has one recommendation: read what the customer reported and triage it.

**Evidence.** This is where most of the confusion lives, and the model separates eight things that are routinely conflated. Raising an evidence request is a record of what is needed and contacts nobody. Drafting the message, having it reviewed, and queueing it are three further steps. A message the provider accepted is not a message that arrived. The upload, the malware scan, the content validation and the review decision are four more. Finally, accepting a document does not close its request: somebody has to mark the request fulfilled and nothing in the database does it for them, so `OPEN_SATISFIED` is its own state and gets its own recommendation rather than reading as the customer being unresponsive.

Each uploaded version resolves to one of eleven states, with the per-version precedence consumed from `evidenceActions` in `lib/evidence/model.ts` rather than reimplemented, so the flow model and the evidence workspace cannot disagree about what a file is doing. A test asserts agreement across the exhaustive cross-product of the four status axes. Contact resolves to one of nine states from the newest `EVIDENCE_REQUEST` message, and requests to one of five. A version somebody has already rejected or superseded stops counting as an outstanding problem, because nagging about resolved history would hide the thing that actually needs doing.

### What "the customer has been asked" actually means

The Step 11 communications contract is authoritative here, and it keeps apart three things an operator would otherwise read as one. `contactReachedCustomer()` returns true for `DELIVERED` and for nothing else.

| Delivery outcome | Recommendation | Owner | State |
| --- | --- | --- | --- |
| Queued, nothing back | `WAIT_FOR_EMAIL_DELIVERY` | `SYSTEM` | `WAITING` |
| `PROVIDER_ACCEPTED` | `WAIT_FOR_EMAIL_DELIVERY` | `SYSTEM` | `WAITING` |
| `ACCEPTANCE_UNKNOWN` | `RECONCILE_EMAIL_DELIVERY` | `ADMIN` | `ACTION_REQUIRED` |
| `DELIVERED` | `WAIT_FOR_CUSTOMER_EVIDENCE` | `CUSTOMER` | `WAITING` |
| Bounced, complained, suppressed or failed | `RECOVER_CUSTOMER_CONTACT` | `ADMIN` | `ACTION_REQUIRED` |

A queued message is a wait on the email provider, not on the customer, and the wording says so. Accepted by the provider is not the same as delivered, and the explanation of `WAIT_FOR_EMAIL_DELIVERY` preserves that sentence rather than paraphrasing it away: a message the provider accepted may still be sitting in a queue, so the customer can neither be treated as having been reached nor as unresponsive. `ACCEPTANCE_UNKNOWN` is weaker still — the provider was called and the outcome was never established — so the only honest instruction is to reconcile it against the provider. Waiting on the customer would blame somebody who may never have been written to, and sending again blind risks either a duplicate or a second silent failure.

A delivery failure is named `RECOVER_CUSTOMER_CONTACT` rather than anything resembling a resend. The address bounced, complained or is suppressed; sending the same message to the same address again will not work, nothing here resends automatically, and there is no SMS or telephone route in this system. The instruction is to re-establish a usable contact route before anything further is expected of the customer.

A cross-cutting test sweeps all ten delivery outcomes and asserts that exactly one of them — `DELIVERED` — makes the case say it is waiting on the customer because of that evidence request.

**Assessment.** With no accepted evidence the case is blocked and falls back to the evidence rules; with accepted evidence it is told to complete the assessment, subject to the transition being allowed.

**Service.** An undecided track blocks everything commercial, because the two tracks have different prerequisites, different pricing and different submitters. Once a track is chosen the commercial ladder runs: no quote, draft with unconfirmed tax, draft ready to offer, offered with no acceptance link, offered and awaiting the customer, accepted, declined, expired. A declined or expired quote is an attention item and a blocker rather than a silent dead end.

Creating, configuring and offering a quote are not gated on anything about the customer. Putting an acceptance link in front of them is. `create_quote_acceptance_action` refuses unless the customer's email address is verified and a verified membership links them to the business, so the model applies the same two conditions before it recommends `ISSUE_QUOTE_ACCEPTANCE`: an unverified email produces `VERIFY_CUSTOMER_CONTACT`, a verified email with unverified authority produces `VERIFY_BUSINESS_AUTHORITY`, and both recorded produce the link. The two facts are read from the authorisation readiness projection, which computes them from exactly the conditions the command checks and does so independently of the service track, so this applies to Guided and Managed cases alike — the customer-action trust boundary is the same on both. The database rule is unchanged; the model simply stops sending operators to a button it will deny.

**Guided prerequisites.** Two items: an accepted quote, because payment is collected against an order and an order only exists once a quote has been accepted, and the upfront payment itself. Payment means the authoritative obligation state, and nothing else. A returned checkout page, a completed Checkout session and the existence of a provider object are explicitly not interpreted as payment; the case moves when the obligation reads `PAID`. Where payment collection is switched off in the deployment, the model says the capability is blocked rather than fabricating a payment step that cannot be performed.

**Managed prerequisites.** The six prerequisites are resolved one rung at a time, in the order an operator actually walks them: verify the customer's email, verify their authority over the business, get the service agreement accepted, get the case-management permission accepted, record Google Manager access, then set payment up and advance to preparation. Each rung returns, so a request already out with the customer produces a wait rather than the next request — an agreement sitting `OPEN` gives `WAIT_FOR_SERVICE_AGREEMENT`, and an accepted agreement with the permission still `OPEN` gives `WAIT_FOR_CASE_PERMISSION`. Some of this could technically happen in parallel and deliberately does not: one clear next step is worth more to an operator than a list of things they could be doing, and a customer holding two outstanding requests at once is worse than holding one.

The sequence is a presentation of the journey, not a restatement of the rule. `authorizationReady` from `case_authorization_readiness_v1` remains the authority on whether the case may actually move, and it is checked again before preparation is offered.

The group itself reports six separate items, never one `authorised = true` flag. Five are the component facts the database checks — the customer's email verified, their authority over the business verified, the service agreement accepted, the case-management permission active, Google Manager access verified — so an operator sees which one is missing instead of being told the case is not authorised. The sixth is the authoritative aggregate itself, consumed from the existing readiness projection rather than recomputed, and the group's `satisfied` is that aggregate and not this model's reading of the five. If the two ever disagreed, the database is right and the disagreement is visible on the same screen. A permission moved to `REVIEW_REQUIRED` is treated as absent authority, raises a critical attention item, and is never auto-revived here; it has to be issued and accepted again. Managed payment setup is its own three-item group covering the success-fee order, consent to a later charge and a usable saved method, with consent recorded but no usable method treated as a failed setup rather than progress.

**Preparation.** Prerequisites are re-checked, because they can be undone after the case has moved past them. Then the pack ladder: no pack, empty draft, draft with items to approve, approved but unpublished, published and usable. Approval and publication are separate and approval alone is never enough. A stale pack takes priority over everything else in the phase. Where an invalidated permission and a stale pack are both present before submission, the permission wins: authority to act at all comes before the quality of what would be sent. The stale pack stays visible as a critical attention item rather than being swallowed.

**Submission.** `READY_TO_SUBMIT` means ProfileRelaunch is internally ready and nothing more. It does not mean Google has received anything, and the model never automates or fabricates a submission: the recommendation is to submit through the agreed external channel and then record the submission with its reference, channel, time and evidence, because recording it is what moves the case on. The absence of automated Google submission is stated as a capability blocker so the boundary is explicit rather than implied.

Being at the stage is not the same as still being ready. A pack can go stale or be withdrawn after the case was marked ready, so the pack is checked again here, with the same ladder preparation uses rather than a second interpretation of pack state:

| Pack state at `READY_TO_SUBMIT` | Recommendation |
| --- | --- |
| No pack | `CREATE_PREPARED_PACK` |
| Draft, empty | `ADD_PREPARED_PACK_ITEMS` |
| Draft with evidence in it | `APPROVE_PREPARED_PACK` |
| Approved, not published | `PUBLISH_PREPARED_PACK` |
| Stale | `FIX_PREPARED_PACK` |
| Approved, published, non-empty | `RECORD_EXTERNAL_SUBMISSION` |

Naming the exact step matters more here than anywhere else, because the whole point of the model is that an operator who does not know this system is told what to do. "Rebuild the evidence pack" is the right instruction for a stale pack and the wrong one for a pack that merely needs publishing, and UX-2 should not have to read a description to work out which is meant.

`RECORD_EXTERNAL_SUBMISSION` is proposed on the last row and nowhere else. A cross-cutting test asserts that no scenario in the matrix recommends recording a submission without an approved, published, non-empty pack behind it, and a second walks the ladder rung by rung at this stage. The repair is genuinely available from here: `admin_prepared_pack_command_v1` gates only on the case being closed or cancelled, not on its work stage, so an open case can start, fill, approve, publish or rebuild a pack wherever its stage happens to be. The technical stage stays exactly where the database put it and the current phase stays `SUBMISSION`; the `PREPARATION` phase reads as `NEEDS_ATTENTION` instead.

After a submission is recorded, an unresolved evidence threat remains the primary recommendation. It is not demoted merely because a submission exists: the facts this model sees cannot prove whether the affected file was or was not part of the submitted pack, and the safe reading of an unprovable question about a blocked file is the cautious one.

**Decision.** Waiting for Google produces a waiting recommendation with no invented date, and becomes a follow-up recommendation only when a follow-up somebody actually recorded falls due. `OWNER_ACTION` waits on a recorded customer task, or recommends recording one. `FURTHER_REVIEW` resolves any open submission first. `OUTCOME_REVIEW` resolves any open submission, then any open tasks, then recommends closure.

**Complete and reopened.** A finished, closed or cancelled case produces no recommendation at all and `waitingOn` of `NONE`, and its phases all read as complete. The ordinary workflow expectations stop applying with it: an old pack that went stale, a prerequisite that lapsed, a permission that was invalidated are all history, and resurrecting them on a closed case would be noise.

One exception survives closure. An open complaint about the case stays in `attentionItems`, because the case rules already say a complaint cannot disappear because the case it concerns was closed. It is never a case-progression action — there is no case progression left — and it does not reopen a phase. It is simply still visible. A case reopened after closure is different again: it carries an informational notice saying the earlier history is intact, and is otherwise resolved as the open case it now is.

Where no rule matches at all, an open case still gets an answer: a fallback that says plainly that the combination of states is not recognised and should be looked at by hand. It sits last in its band so it can never shadow a real recommendation, and a test asserts that no scenario in the matrix reaches it.

## Blockers and wording

Every blocker answers three questions: what is missing, why progress cannot continue, and who must resolve it. Each carries a human-safe title and explanation alongside a stable code and a category of `SAFETY`, `EVIDENCE`, `AUTHORITY`, `PAYMENT`, `COMMERCIAL_CONFIGURATION`, `CAPABILITY` or `DATA`, so a later UI can group them without parsing prose.

All wording lives in one module, for the same reason the priority table does: there is a single place to check that nothing claims more than the facts support. Three claims in particular are made nowhere. An email is never described as delivered when the provider has only accepted it — provider acceptance gets an informational notice saying exactly that. Payment is never described as received without an authoritative payment record. A submission is never described as having happened without a submission record. Cross-cutting tests assert the absence of that language across every scenario.

No date is ever manufactured. `dueAt` is only ever a date somebody recorded — an evidence request's due date, a task's deadline, a customer action's expiry, a planned next action's date — and `overdue` is that date compared against the `now` passed in. There is no invented service level anywhere in the model.

## Shape and purity

`resolveCaseFlow(facts, now)` in `lib/case-flow/resolve.ts` is pure. It imports no React, touches no component state, reads no cookie and reads no clock: `now` is a parameter, so a fixture is reproducible and an overdue test does not depend on the day it runs. `loadCaseFlow(caseId, now)` in `lib/case-flow/load.ts` is the server-only side that gathers the facts and calls it. The split means the entire rule set is testable without a database, which is what makes a matrix of this size practical.

Destinations are a closed set of eleven internal surfaces resolved by builders in `lib/case-flow/destinations.ts`. A destination is never a string from the database or the browser, case-scoped paths are built only from an identifier that passes a UUID check, and a test asserts every destination the model can emit is an internal path. There is no way for an arbitrary URL to become a destination and therefore no open redirect.

Nothing in the output is a secret. Every fact comes from an existing Admin projection behind `requireStaff()` and a `SECURITY DEFINER` RPC; those projections already mask email addresses and have never carried a customer action secret, a storage bucket or key, an OAuth token, a Stripe secret or the service-role key. No public endpoint is introduced.

## Query cost, and what UX-3 needed

> **Superseded by UX-3.** The batch projection described at the end of this section has been built and is the active CaseFlow data path. The loader below no longer exists: `loadCaseFlowFacts(caseId)` delegates to `loadCaseFlows([caseId])`, so single-case CaseFlow loading reads through the same batch projection as the queue, with a batch of one. The section is kept because it is the reasoning that produced the projection and the record of what the eight reads could and could not establish; the eight-read composition itself survives only as a reference implementation inside the parity test. The migration `20261002194215_admin_case_flow_batch_v1.sql` was applied to `profilerelaunch-dev` on 2026-10-02 after independent review, so the live version is `20261002194215`. That is the development project; nothing has been deployed or cut over to production. See ux-case-queue.md.

`loadCaseFlowFacts` performed one sequential read of `admin_case_detail_v1` followed by six parallel reads: `admin_case_authorization_v1`, `admin_evidence_case_v1`, `admin_prepared_pack_case_v1`, `admin_communication_list_v1`, `admin_quote_list_v1`, `admin_payment_list_v1` and `admin_complaint_list_v1`. That is eight round trips for one case, two sequential waves deep.

Four of those are case-scoped and `admin_communication_list_v1` takes a case parameter, capped at 50 rows. Three are not case-filterable and are filtered client-side: `admin_quote_list_v1` is capped at 100 rows, `admin_complaint_list_v1` at 100, and `admin_payment_list_v1` is unpaginated. Because a capped list that came back full cannot prove a case has no quote, the facts carry a `complete` flag per source and the resolver treats an incomplete read as unknown rather than as nothing existing — hence the `CONFIRM_COMMERCIAL_STATE` and `CONFIRM_PAYMENT_STATE` recommendations and the two `DATA` blockers behind them. Silence is never read as absence.

This was acceptable for a single case page and must not be called in a loop. Resolving N cases that way would be 8N round trips including three whole-table scans each, which is an N+1 design by any other name. A list or dashboard that wants the next action for many cases needs a single case-scoped batch projection instead — something of the shape `admin_case_flow_facts_v1(p_token text, p_case_ids uuid[])` returning the same fact tree per case in one call, with the three unfiltered lists restricted to the requested cases. That projection was identified here and deliberately not built, because UX-1 required zero migrations and the resolver is already a pure function of the fact tree, so swapping the loader for a batch one later changes no rule.

UX-3 built exactly that, and the prediction held: the resolver is unchanged, and a parity test runs both readings against the same database and compares the resolved models. Two of the `complete` flags above are now authoritative rather than cautious, because a case-scoped projection that finds no quote has proved there is none, and `reopened` is now exact. The three `DATA_PROJECTION_GAP` entries that were artefacts of the capped lists and the bounded event window are annotated below.

## Gaps report

Classified as required. None of these were introduced by UX-1 and none are fixed by it.

### ACTUAL_FUNCTIONAL_GAP

None.

Two items were classified here in the first draft and both were wrong. Each described a stage the case cannot move back to, and in each case the business capability behind it turned out not to be blocked at all. They are restated as workflow and state-alignment gaps below.

### WORKFLOW_STATE_ALIGNMENT_GAP

`READY_TO_SUBMIT` has no outgoing transition in `admin_private.case_transitions`, so a case marked ready cannot be sent back to `PREPARATION`. That is a stage-machine limitation and not a blocked capability: `admin_prepared_pack_command_v1` gates only on `status IN ('CLOSED','CANCELLED')`, so an open case can create, fill, approve and publish a pack at any work stage. A pack discovered to be stale after the case was marked ready can therefore be rebuilt and republished in place. What is missing is alignment, not ability — the technical stage continues to read `READY_TO_SUBMIT` while preparation work is genuinely outstanding. The model closes the operator-facing half of that gap by refusing to recommend a submission and showing the `PREPARATION` phase as `NEEDS_ATTENTION`, and UX-2 renders it the same way. Adding the transition is a separate decision and a separate migration, and neither belongs to UX-1.

`PAYMENT_REQUIRED` and `AUTHORIZATION_REQUIRED` have no reverse edge to `SERVICE_SELECTION`, and the `plan` operation refuses a service track change outside `INITIAL_REVIEW`, `EVIDENCE_COLLECTION`, `ASSESSMENT_READY` and `SERVICE_SELECTION`. Here too the commercial capability is intact: Commercial is not stage-gated, so a quote declined at a prerequisite stage can be re-quoted, re-offered and re-accepted without the stage moving. Only the service track itself is frozen. The gap is that the stage describes something that is no longer true while the commercial position moves on underneath it.

### BUSINESS_RULE_DECISION_REQUIRED

None outstanding.

Seven questions were raised in the first draft and all seven have been decided. For the record:

- **No SLA is currently defined for CaseFlow. UX-1 and UX-2 use recorded dates only.** `dueAt` is only ever a task deadline, an evidence request's due date, a follow-up date or a customer action's expiry where the expiry is explicitly represented as one. No response or completion target is invented anywhere.
- An invalidated permission outranks a stale pack before submission; the stale pack remains a critical attention item.
- Managed prerequisites are sequential, and an earlier outstanding customer request is never overtaken by a later one.
- Quote work may be prepared, configured and offered before Managed authorisation completes, but the acceptance link itself respects the verified-email and verified-authority conditions the database enforces, on both tracks.
- A Managed case at `AUTHORIZATION_REQUIRED` with no accepted order keeps the commercial recovery path, because commercial commands are not stage-gated and fabricating an order would be worse.
- `ACCEPTANCE_UNKNOWN` is not reached and not delivered; it is reconciled.
- An unresolved evidence threat remains the primary recommendation after a submission is recorded.

### DATA_PROJECTION_GAP

The authoritative readiness helpers — `guided_payment_ready_v1`, `managed_setup_ready_v1`, `published_pack_ready_v1` and `case_stage_ready_v1` — live in `admin_private` and are unreachable from TypeScript. `CaseDetail.transitions` is the raw matrix and does not apply them, so the model composes the already-projected component fields to decide whether a stage looks reachable. The database remains the enforcing authority at transition time, which is why an optimistic recommendation is safe, but the two can disagree and a projection of the composite answer would remove the disagreement.

`admin_communication_list_v1` carries no evidence request identifier, so contact state is a case-level answer derived from the newest `EVIDENCE_REQUEST` message rather than a per-request one. A case with two concurrent evidence requests shares one contact state between them. UX-6 keeps this limitation visible on the Evidence workspace and does not infer which request an email belongs to. The per-request communications linkage gap remains open.

`admin_quote_list_v1` is capped at 100 rows with no case filter, and `admin_complaint_list_v1` is capped at 100 rows and loosely typed on the TypeScript side; rows that do not narrow cleanly are dropped so an unreadable row cannot become a phantom blocker. **Closed by UX-3** for the case flow: `admin_case_flow_facts_v1` restricts both to the requested case, so `commercial.complete` and `complaints.complete` are unconditionally true and the `CONFIRM_COMMERCIAL_STATE` recommendation no longer appears for a case that simply has no quote. The two list projections themselves are unchanged and still capped where they are used directly.

`admin_case_detail_v1` returns a bounded window of recent events, so the `reopened` fact is window-limited: a case reopened long ago with much activity since may no longer report it. **Closed by UX-3**: the projection answers `reopened` with an existence check over the whole event history rather than a scan of the returned window.

`pack_publishable_v1` additionally requires every item in the pack to be clean, valid and accepted, which the pack projection does not expose. The model's published-and-usable test checks approval, publication and a non-empty item list, which is a weaker condition than the database's.

`MoneyOrder` does not say whether an attempt against a saved method failed, so a Managed payment problem is inferred from consent recorded without a usable method rather than read directly. `ServiceOrder` from `admin_order_list_v1` carries no case identifier, which is why order facts come from the payment projection.

### UX_ORCHESTRATION_GAP

There is no per-case communications route; case communications are reached through the Communications workspace filtered by case. There is no resend or alternate-contact flow, so the recommendation when a message bounces is to reach the customer another way rather than to press a button, and there is no reconciliation screen for a message whose provider acceptance was never established. Issuing agreements, permissions and payment links is spread across three surfaces. Accepting evidence still does not fulfil its request: fulfilment stays the manual `fulfill_request` command, and the domain does not auto-fulfil. UX-6 closes the operator orchestration gap by surfacing Mark fulfilled when accepted evidence satisfies an open request. Nothing refreshes a scan result on its own; the Evidence workspace surfaces the existing manual refresh. Communications are still not linked to an individual evidence request, so contact state stays case-level. A case marked ready to submit whose pack needs rebuilding has no stage that says so, which is the operator-facing half of the first state-alignment gap above.

### CAPABILITY_NOT_LIVE

Outgoing customer email is switched off, so any step that depends on a message reaching the customer cannot start on its own. `googleLiveStack` is `null`, so there is no automated Google submission and the submission step is external by construction. Stripe is disabled, so no payment link or setup link can be issued. Inbound mail and Guard exist but are not consumed by this model at all; a Guard-created case resolves like any other case.

## What UX-1 deliberately does not do

It does not redesign the case page, the Today page or the navigation, and it adds no CSS. It does not persist a status, a next action, a phase or a checklist anywhere, and it creates no table, enum, function, RPC or trigger. It does not read the authoritative readiness SQL into TypeScript. It does not transition a case, create a task, create an evidence request, send a message, issue a customer action, create a quote, collect a payment, change a permission, publish a pack, submit to Google or close a case. It is read-only in the strictest sense: given the same facts and the same `now`, it returns the same object and leaves nothing behind.

## Tests

Five test files, 185 tests. The scenario matrix in `lib/case-flow/scenarios.test.ts` carries 111 named scenarios spanning every phase, both service tracks, the evidence states, every email delivery outcome, the commercial ladder and its trust conditions, the sequential Managed prerequisite ladder, the pack ladder at both preparation and ready-to-submit, the submission boundary, the decision cycle, closure and reopening, the capability-disabled cases and the truncated-read cases. Its transition fixtures mirror `admin_private.case_transitions` and a test asserts the mirror covers every stage.

Alongside the named scenarios, cross-cutting assertions run over the whole matrix: exactly one primary action on every open case, never the fallback, exactly one `waitingOn` always equal to the primary action's owner, `CUSTOMER` only on a genuine waiting state, never a recorded submission without a usable pack behind it, every blocker carrying a title, an explanation and an owner, no duplicate blocker or attention codes, every destination an internal path, no date that was not recorded somewhere, identical output across repeated resolution of identical facts, and no wording anywhere that claims delivery, payment or submission the facts do not support. Two separate sweeps run beside the matrix: one resolves the same evidence request at all ten delivery outcomes and asserts that only `DELIVERED` makes the case wait on the customer, and one walks a case marked ready to submit through every pack state, asserting the exact next action, that a submission is never offered until the pack is usable, and that preparation rather than the technical stage is what moves.

Verification at the final head: the complete Admin suite, Admin typecheck, Admin build, the Admin protected-route smoke check and root lint.

Next: UX-2 renders this model. See ux-redesign-roadmap.md.
