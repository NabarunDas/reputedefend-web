# ADMIN-JOURNEY-02 — Case intake review and business screening

DEV/develop preview only. The case cockpit is unchanged. Steps 3–11 are unchanged. This does not send email, call Google, or take a payment.

## What was already stored

The case message, reference, customer, business, location, website, profile URL, email-control record and business-membership record are already available through `admin_case_detail_v1`, `admin_record_detail_v1` and `admin_membership_get_v1`. The original intake snapshot is already on `cases.intake_snapshot`. A confirmation email is a communication, not a review.

## What this adds

Two proposed functions, in `proposed-admin-journey-02.sql`. They are not in `supabase/migrations` and they are not applied to DEV or Production.

- `admin_case_journey_decision_v1` appends an `INTAKE_REVIEW` or `BUSINESS_VERIFICATION` row to `case_work_events`, with the session’s staff id, and writes the existing `CASE_CHANGED` audit action. The same idempotency receipt table as the case command covers a retry. It does not change `work_stage`, email verification, or membership.
- `admin_case_journey_intake_v1` reads the snapshot and the decision events. Until it is applied, the page uses the case message and the current records and says so.

A step is complete only when the latest matching event is a current `REVIEWED` intake, or a current `PRELIMINARY_COMPLETE` screening that follows that review. Incomplete, further information, an unavailable listing, a duplicate, a material discrepancy, a reopen, a revoked membership, and a disagreement between the email, authority or submitted records do not complete it. `GB`, `UK`, `U.K.` and `United Kingdom` compare as the same country. A website or profile URL the customer left blank is missing information, not a contradiction. A saved URL is not a verified listing. Nothing in this change rewrites the customer, business, location or case. Email control and business authority stay on their own records.

The screening form starts from the website on the business record and the Google profile URL on the location. A saved profile URL does not select “Accessible” or “Not supplied”; the operator chooses accessible, or suspended, missing or inaccessible. “No website” or “Not supplied” against a value already recorded is stored only when the operator marks the discrepancy and escalates, with a reason. The page shows the original submission time in UK local time from `openedAt` on `admin_case_journey_intake_v1` (`cases.created_at`). Until that read is applied, the same column already returned as the case `createdAt` is shown. The original enquiry and submitted contact stay separate from the current business record. No new database column is added.

Applying the SQL to DEV needs a separate review.
