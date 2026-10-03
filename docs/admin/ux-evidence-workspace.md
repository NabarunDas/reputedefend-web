# UX-6 — Evidence workspace

The case Evidence page, `/cases/[id]/evidence`, is the place an operator answers what was requested, what arrived, and how far that file has got. UX-1 through UX-5 are complete. UX-6 is in progress. UX-7 is not started.

No migration. The page reads `getCase`, `getEvidenceCase`, `getPreparedPackCase` and one `loadCaseFlowFacts` call, together, then resolves the case flow once with a single `now`.

## What was wrong with the previous layout

The previous page listed requests as OPEN, FULFILLED or CANCELLED, then a generic upload panel, then the prepared pack, then every document version at the same visual weight. Each version led with the four stored columns — upload, scan, validation and review — so an operator had to translate `UPLOADED` / `NO_THREATS_FOUND` / `VALID` / `UNREVIEWED` into “ready for review”. Fulfil and cancel sat inside a disclosure on every open request, including the case where accepted evidence had already arrived and the request was still open. Nothing on the page said whether the customer had actually been contacted, and nothing stopped a provider-accepted email being read as delivery.

## Evidence request lifecycle

Request state comes from `evidenceRequestViews` in `apps/admin/lib/case-flow/evidence.ts`. The page does not name the raw states. It says:

| Canonical state | What the operator sees |
| --- | --- |
| `OPEN_NOT_STARTED` | Waiting for evidence |
| `OPEN_IN_PROGRESS` | Evidence received — checks or review still in progress |
| `OPEN_SATISFIED` | Accepted evidence received — request still open |
| `FULFILLED` | Fulfilled |
| `CANCELLED` | Cancelled |

An open request with no live evidence says that nothing has been received against it. A recorded `dueAt` that is already past is labelled Overdue, with the UK date. There is no evidence SLA.

Open requests that need Admin attention come first, then other open requests, then fulfilled, then cancelled. Inside a class, a recorded due date orders the requests; otherwise the evidence-case order is kept. Fulfilled and cancelled requests stay on the page, quieter, with their documents.

Creating a request records what is needed. It does not contact the customer. The command reply remains “The evidence request has been recorded. No email was sent.”

## Version lifecycle

Version state comes from `evidenceVersionState`, which delegates to `evidenceActions`. The page leads with that human state: upload incomplete, upload failed, waiting for malware scan, threat detected, scan needs refreshing, file validation failed, scan needs checking, ready for Admin review, accepted, rejected, superseded.

The four stored columns are shown secondarily, under Processing stages: Upload, Security scan, File validation, Admin review. That list is presentation. It does not decide buttons. Button availability is only `evidenceActions`.

The latest version of a document is shown in full. Older versions stay under Version history. Every version has a stable anchor `evidence-version-<version id>`. The global Documents queue links to that anchor. Queue SQL, filters, ordering and pagination are unchanged.

A threat-blocked file says “Threat detected — file blocked.” View, Download, Accept and Reject are not offered. A pending, failed, unsupported or unreadable scan offers Refresh scan status when `evidenceActions` allows it. Nothing polls GuardDuty.

File validation is a different check from the security scan. An invalid file shows the stored validation error and says it is not a malware result.

An accepted version shows the review note, the reviewed date and whether it is marked for future customer visibility. That mark does not mean a current customer portal exposes the file. No current customer portal exposes it. Acceptance does not fulfil the request and does not add the file to a pack.

A rejected version shows the note. Once a newer version exists, the rejected one is history. A superseded version stays readable where View or Download is still permitted, without review controls.

DOCX can be downloaded when the file is safe. Preview stays unavailable. There is no online document viewer.

Customer-submitted evidence is labelled as such and follows the same scan, validation and review rules as an Admin upload.

## Request and document association

A document belongs to a request only when `EvidenceDocument.evidenceRequestId` stores that request’s id. Filename, title, date and email subject are not used. Documents with a null request id, and documents whose stored id is not a request on the case, stay in “Evidence not linked to a request”.

The upload form can associate a new document with an open request, or leave it as “Not linked to a request”. A new version stays on its existing document. The upload protocol, MIME allow-list and 10 MB limit are unchanged.

If the evidence case and the case-flow evidence facts disagree on request ids, version ids or that association, the page says so and does not repair the link by guessing.

## Fulfilment

`OPEN_SATISFIED` means accepted evidence has arrived and the request is still open. The page says that in the request card and puts Mark fulfilled next to it. The command is still `fulfill_request`. Accepting a file does not call it. Nothing else on the page fulfils a request.

## Customer contact

Contact state comes from `evidenceContactState`: the newest `EVIDENCE_REQUEST` communication on the case. The communications projection does not store an evidence-request id, so the page cannot say which request an email belongs to. It says “Latest evidence-request email for this case” and “Email delivery is currently tracked at case level, not per evidence request.”

Provider acceptance is “Accepted by email provider — delivery not confirmed.” Only `DELIVERED` is called delivered, and even then not for a named request. A failed delivery is a case-level warning with a link to `/communications?case=<caseId>`. The page does not draft, send, resend or edit recipients. If a request exists and no evidence-request email has been prepared, the page says the requirement is recorded and does not say the customer is waiting.

## Case next action

The singular next action is `resolveCaseFlow`. When its destination is already the Evidence workspace, the page shows the action’s wording and does not add an Open Evidence button. When the action belongs somewhere else, the page says so and links to that destination. It does not invent an evidence action to fill the space. Summary counts (files to review, threats, requests that can be marked fulfilled) are not the case’s next action.

## Prepared pack

The pack panel is unchanged in its rules and sits below collection and review. `PreparedPackCase.eligible` remains what the UI may offer to add. A stale pack keeps the existing warning. Approval still confirms the selected evidence only: not payment, customer authority, permission, or submission to Google. Publication is customer case access, not an external submission. Accepting evidence does not add it to a pack. Nothing in this workspace submits to Google.

## What this workspace does not do

- No automatic fulfilment.
- No automatic email, and no direct call to the mail provider.
- No automatic pack membership.
- No automatic Google submission. The live Google stack stays disabled.
- No scan polling, timer or background refresh.
- No new closed-case policy. Commands keep the checks they already have.
- No second evidence state machine. The workspace model is a pure arrangement of the loaded facts and is not persisted.
- No database migration.

## Accessibility and responsive layout

The page has one h1, Evidence, then h2 sections and h3 requests. Documents under a request are h4. Status, threats and overdue are written out, not conveyed by colour alone. Version history and processing stages are `details`/`summary`. Action buttons are named with the document and version when several files share an action. Command results stay in a status message. Version anchors are unique. Focus outlines are the existing Admin focus style.

The layout wraps buttons, filenames and validation notes, and does not depend on a horizontal page scroll at a phone width. Latest evidence is outside the version-history disclosure.

## Known projection gap

Communications are not linked to an individual evidence request. UX-6 documents that and keeps the contact panel case-level. It does not add a column or a migration to close it. UX-8 owns the communications workspace.
