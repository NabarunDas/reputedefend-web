# UX-4 — Today as the operator workbench

## What this phase is for

Today used to open with nineteen metric cards, a date-range control and two paragraphs explaining which cards were snapshots and which were periods. That answers "how is the business doing". It is the wrong first answer at the start of a working day. The first screen now answers what ProfileRelaunch has to do, which cases are stuck, which cases are with somebody else, which non-case queues still need clearing, and which Guard checks today's schedule obliges us to do.

Reports remains the place for history, periods and the full set of figures. Nothing was removed from it. Today is not a second analysis surface, and it is not trying to be both.

No migration was required. Every fact Today shows already existed: the open-case list, the UX-3 batch projection, and the dashboard projection.

## What it does not invent

There is no second workflow engine. Today does not calculate another next action, persist a priority, add a status, or read a technical stage and decide what it means. The recommendation on each case is the one `resolveCaseFlow` already made, and the order between cases is the band that recommendation already carries.

`priorityBand` on `CaseNextAction` is that band, exposed. The type lives with the case-flow model and the numeric ordering stays in the action catalogue, which is still the only place that decides which band an action belongs to. Adding the field changes no decision: the scenario matrix asserts the band equals the catalogue's own answer on every scenario, and that the chosen action, its state, its owner, the blockers and the phases are unchanged.

There is no urgency score, and no weighting by track, case type, customer, revenue or age. The case record's own `LOW` / `NORMAL` / `HIGH` / `URGENT` stays metadata. It is not consulted when ordering the day.

There is no service level. A wait becomes overdue only when a date the case actually records has passed. Three days of waiting on a customer is not a chase, and there is no agreed Google response time to have exceeded.

## How the cases are read

Today has to see every open case before it can say which one matters most. Reading the first page of fifty and calling it the day's work would hide a Safety case sitting further down the list.

It walks the existing Cases cursor. `admin_case_list_v1` orders by `(created_at, id)` descending and returns fifty-one rows; the fifty-first is evidence of another page and is never shown, and the cursor is the fiftieth row. That rule now lives in one place, `lib/cases/pagination.ts`, and both `/cases` and Today read it. The Cases page behaves exactly as it did.

The scan stops at 250 open cases. A finished scan is five list reads and, because the UX-3 projection accepts at most fifty cases per call, five projection reads. The projection was not widened and its migration was not touched. There is no per-case read anywhere, and the eleven exception queues are counts from the one dashboard read rather than eleven report-detail reads.

One `now` is created for the page and passed into every projection batch, so "overdue" means the same instant on every case.

### When 250 is not enough

If more than 250 cases are open, Today does not rank the ones it managed to read and present them as the work. A Safety case could be among the ones it never saw. It also does not project them: the five CaseFlow reads would answer a question the page has refused to ask, and they are the expensive reads, so an incomplete scan makes none. The case sections are replaced by an explicit statement that the page cannot prioritise, with a link to the full Cases queue, and the statement still records that the scan stopped at 250. Operational exceptions, Guard checks, coming up and the management snapshot still render, because those come from the dashboard read and do not depend on the scan. The summary does not quote a count of case work it did not finish counting.

A repeated case identifier during the scan is treated as a broken pagination contract and stops the page, rather than producing a work list with one case counted twice.

## How a case is placed

Each open case appears exactly once, at the position of its primary action.

| Position | Rule |
| --- | --- |
| Do next | The action is `ACTION_REQUIRED` or `READY`, and ProfileRelaunch owns it. |
| Blocked | The action is `BLOCKED`. Kept apart from the work, and not styled as a step somebody can finish. A blocked case is not the same thing as a Safety case; the band still decides how urgent it is. |
| Waiting | The action is `WAITING`, grouped by who the next move belongs to: customers, Google, the payment provider, or systems. No row offers a primary action. |

A finished case has no action and appears in none of the three. Supporting trouble — blockers, attention items, an overdue date — is a count on the row, not a reason to show the case a second time.

Within a position the order is the band (`SAFETY`, then `ADMIN_ACTION`, then `JOURNEY`, then `PROGRESSION`), then an overdue recorded date, then the earliest recorded date, then a dated action before an undated one, then the order the Cases list already had. A future deadline never outranks an actionable Safety case merely because it has a date.

The home page shows the first 10 of Do next, the first 5 blocked, and the first 5 of each waiting group, with the real total beside them (`10 of 18 shown`) and a link to the full queue. The limit is on what is drawn. The ordering ran over every case the scan read.

The action label is the link, and it reuses the destination the model already computed. Where the cockpit maps a same-case action onto a section of the case page, Today uses that same map, so the link lands on the control rather than the top of the document. The map is presentation: it never decides whether the action is valid. The case reference is a second link, to the case. Nothing else in the row is clickable.

## The rest of the page, in the order it appears

**The day.** One heading, the current Europe/London calendar date, and one sentence of real counts: how many cases need ProfileRelaunch, how many are blocked, how many are waiting externally, how many other queues need attention, and how many Guard checks are still due. Zero counts are left out. Guard checks are not folded into the exception-queue count: a check the schedule requires and a check that already failed are different facts. A day with none of that work says so once — that no case, queue or outstanding Guard check needs attention — rather than rendering an empty panel for every section, and rather than claiming that nothing at all is wrong. A late worker is a separate sentence and can sit above a quiet work day without either contradicting the other. The date is formatted on the server in `Europe/London`, so the calendar day is correct across GMT and BST and does not depend on the browser's timezone.

**The platform.** A healthy background worker is one quiet line. A late one is a warning, using the existing Step 10 threshold the dashboard already reports. No new timeout was invented. An unreported status is described as unknown.

**Other operational work.** The dashboard's eleven exception counts, unchanged and not re-implemented in TypeScript, grouped as intake, Guard exceptions, contact, money, platform and overdue case work. Only queues with something in them are shown. Each row is the human label, the exact count, and a link to the existing report drill-down. The records are not fetched again to reproduce the report inside Today. When every queue is empty the section says so in one line.

Overdue case work stays available here as a cross-check. It does not replace the case list above it.

**Today's Guard checks.** The monitoring obligations for the current London date that are still outstanding, kept apart from Guard exceptions: one is work the schedule requires, the other is work that already went wrong. The dashboard returns every obligation for the date. Today keeps `PENDING` and `CLAIMED`, and drops `COMPLETED` and `CANCELLED`, which are finished and would otherwise keep a clear day looking busy. A state the workbench does not recognise stays visible, because dropping it would be guessing that it was not work. The underlying Guard and report surfaces still hold the completed history. If no schedule is configured the page says so, and an unconfigured schedule is not itself turned into a task. Each remaining window links to the existing check. The check page itself is unchanged.

**Coming up.** Recorded future task due dates, after the current work. No date is manufactured.

**Management snapshot.** Collapsed by default and last. A small set of existing dashboard figures: open cases, open enquiries, active service clients, net collections today, outstanding money, paid active Guard, included active Guard, the recurring Guard commitment, and today's check coverage. Paid and included Guard are listed separately, because they are different commercial arrangements and one number standing for both would not be actionable. Money stays grouped by its own currency, with no conversion. Every figure links to the report that still owns it, and the section links to Reports for history and the full set.

## What was taken off the primary page

The period control is gone. Operational work is always the current state, and the dashboard is always read with the `today` preset. An old bookmarked range on this URL no longer changes anything and no longer produces an error page; Reports still honours periods.

The case-mix table, the workload breakdown and the recent-payments list are no longer on Today. The underlying report data is untouched. Payment exceptions remain in the operational queues, which is where a payment problem belongs.

## What this phase does not change

Navigation is unchanged. That is UX-5, which is not started. Report pages, the evidence workspace, commercial and money surfaces, and communications are unchanged beyond the action-to-section map moving to the shared case presentation module so Today and the cockpit describe one action the same way. That map decides nothing.

Nothing was activated. Outgoing and incoming mail stay disabled, Stripe stays disabled, the Google live stack stays off, Guard live automation stays disabled, privacy deletion stays disabled, Cron is unchanged and Step 22B stays deferred.

The page is server-rendered current state. There is no polling, no websocket and no timer. Refreshing the page is how it updates.

## Accessibility and layout

Exactly one `h1`. Section headings follow it, and waiting-group headings sit under the Waiting heading. Case work is a list. Action links name the action. Waiting, blocked and overdue are words, not colours. Operational counts sit next to their labels, and the "open queue" links name which queue. Nothing is a clickable card built from a plain element, and no link contains another control. The management snapshot is a native disclosure. Focus states are the existing ones. The current date is text.

The page does not scroll horizontally at a phone width, a tablet width, a laptop width or a wide desktop. Long business names and long action labels wrap. The summary is a sentence, not a row of tiles. The management figures stay secondary.

## Tests

The scan is tested without a database: an empty list, one page, exactly fifty, a second page, several pages, no duplicate and no skipped case, cursor progression identical to the Cases queue, chunks of at most fifty, the same instant on every batch, exactly 250 still complete, and 251 reporting an incomplete scan that stops reading. A repeated identifier aborts the scan.

The work model is tested as a pure function: band order regardless of created date, record priority and track; the due-date tie-break; waiting actions absent from Do next; a blocked action absent from Do next; a completed case absent everywhere; one case in one position; the fail-closed summary; exception queues shown only when non-zero and counted from the dashboard; Guard configured, unconfigured and empty; a completed or cancelled check dropped and a pending, claimed or unrecognised one kept; health states including an unknown one; multi-currency figures; paid and included Guard kept apart.

The page is tested against flows the resolver actually produced: a busy day led by a Safety case, a day of waiting, a blocked case, overdue and undated rows, operational exceptions present and absent, Guard obligations apart from Guard exceptions, a Guard-only day, a day whose checks are already finished, a late worker beside a quiet work day, upcoming deadlines below the work, the management snapshot collapsed, a quiet day said once, and the fail-closed state. The read pattern is counted: one dashboard read, one list read and one projection read per fifty cases while the scan is complete, and no projection read once it is not.

The CaseFlow suite still passes with the band exposed, and the Cases queue tests still pass with the shared pagination helper.
