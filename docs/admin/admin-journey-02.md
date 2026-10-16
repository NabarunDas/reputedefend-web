# ADMIN-JOURNEY-02 — Case intake review and business screening

DEV/develop preview only. The case cockpit is unchanged. Steps 3–11 are unchanged. This does not send email, call Google, or take a payment.

## What was already stored

The case message, reference, customer, business, location, website, profile URL, email-control record and business-membership record are already available through `admin_case_detail_v1`, `admin_record_detail_v1` and `admin_membership_get_v1`. The original intake snapshot is already on `cases.intake_snapshot`. A confirmation email is a communication, not a review.

## What this adds

Two proposed functions, in `proposed-admin-journey-02.sql`. They are not in `supabase/migrations` and they are not applied to DEV or Production.

- `admin_case_journey_decision_v1` appends an `INTAKE_REVIEW` or `BUSINESS_VERIFICATION` row to `case_work_events`, with the session’s staff id, and writes the existing `CASE_CHANGED` audit action. The same idempotency receipt table as the case command covers a retry. It does not change `work_stage`, email verification, or membership.
- `admin_case_journey_intake_v1` reads the snapshot and the decision events. Until it is applied, the page uses the case message and the current records and says so.

A step is complete only when the latest matching event is a current `REVIEWED` intake or a current `PRELIMINARY_COMPLETE` screening. Incomplete, further information, an unavailable listing, a duplicate, a material discrepancy, a reopen, and a revoked membership do not complete it. A saved URL is not a verified listing. Email control and business authority stay on their own records.

Applying the SQL to DEV needs a separate review.
