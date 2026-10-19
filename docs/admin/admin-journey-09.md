# ADMIN-JOURNEY-09 — Submission and tracking

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check.

This step does not submit anything to Google. It records an attempt that was already completed outside the portal, then a decision or a withdrawal. It does not change payment, email, scanning or the pack commands. No database migration is added.

## What this reuses

- The case submission rows already returned by `getCase`
- `SubmissionForm` and `ResolveSubmission`, which post to the existing case command
- The case-flow submission projection for whether the step is complete

The comparison runs only when Step 9 is open. A locked step does not show the forms. The case command still decides whether the stage, the track and an open attempt allow another recording.

## Completion

Step 9 is complete only when at least one attempt is recorded and every attempt has a decision or a withdrawal. An open attempt stays waiting. A Guided attempt is the customer's. A Managed attempt is ProfileRelaunch's. A party that does not match the track, a result that is neither a decision nor a withdrawal, or a case row that does not match the projection keeps the step unfinished and hides the commands.

Recording an attempt does not submit it to Google. The confirmation on the existing form stays required. Outcome review, billing and closure stay on later steps.

## Customer and operator access

The forms use the same staff command as the case cockpit. They do not create a customer link or a public file.
