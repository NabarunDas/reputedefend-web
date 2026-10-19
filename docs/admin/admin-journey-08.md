# ADMIN-JOURNEY-08 — Case preparation and approval

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check.

This step does not add a pack state machine or a second pack command. It does not change scanning, storage, payment, email or Google submission. No database migration is added.

## What this reuses

- `getPreparedPackCase` for the prepared-pack record, and only when Step 8 is open and not locked
- `PreparedPackPanel` for create, add, remove, reorder, approve, publish and unpublish
- The case-flow pack projection for whether the step is complete

The evidence step still does not load or show pack commands.

## Completion

Step 8 is complete only when the current pack is approved, published and non-empty, no other approved pack is still published, and no live pack is stale. The current pack is the latest one that has not been superseded. The step and the panel use the same readiness check.

A draft is not approval. Approval does not publish the pack. Publication does not submit anything to Google and does not create an open document link. A superseded pack stays read-only history. If included evidence changes after approval, the pack is stale and has to be rebuilt with the existing draft, approve and publish commands.

The detailed pack record has to match the case projection. A missing record, a different status, a different item count or a different eligible count withholds the commands. An extra published pack, or disagreeing customer, business or authority records, also withholds those commands. The extra published pack is resolved on the evidence workspace. An ordinary stale pack can still be rebuilt from this step. An eligible row is offered only when the evidence projection shows that version as uploaded, scanned clean, validated, accepted and linked to a request.

## Customer access

Publishing uses the existing customer case-access rule. This step does not add a public file link.
