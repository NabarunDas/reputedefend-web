# Dashboard, search, reports and customer-visible preview

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED**

Additive migration: `20261001092213_admin_dashboard_search_reports_v1.sql`

Do not apply this migration from the Step 19 PR. Do not request Supabase credentials. Do not modify applied Steps 10–18. Do not enable Guard, Stripe, live mail or Google. Cron remains `0 4 * * *`.

Step 19 is reporting and read-mostly. The only intended new mutations are saved filters and export receipts.

## Authoritative reuse

Dashboard, reports, search, exports and preview all read existing customer, enquiry, case, task, evidence, quote, order, payment, Guard, job, communication and audit tables. There is no dashboard-owned financial ledger and no browser cache of business truth.

Shared predicate: `admin_private.report_rows_v1`. Summary, paginated drill-down and CSV export all use that function for a given allowlisted report key.

## Date periods

Timezone: `Europe/London`.

Model: `[start inclusive, end exclusive)`.

Presets:

- `today` — current London calendar day
- `last_7_days` — today minus 6 days through tomorrow
- `current_month` — first of the current London month through first of next month
- `custom` — supplied London dates, inclusive start day, exclusive next midnight; start <= end; maximum 366 days; fail closed

Local calendar dates are converted with `timestamp AT TIME ZONE 'Europe/London'`. UTC truncation is not used.

## Currency

Totals are grouped by ISO currency. There is no FX conversion. Reports and exports show the ISO code. Guard recurring commitment is projected per currency; the Today card is labelled GBP/month and still lists any unexpected non-GBP row separately instead of converting it.

## Needs attention

Exact `COUNT(*)` of the same predicate as the drill-down. No `50+` cards. No invented SLA.

| Card | Predicate |
| --- | --- |
| Overdue work | Open `case_tasks` with `due_at < now` |
| Unassigned enquiries | Enquiry status `new` / `open` / `waiting` and `assigned is not true` |
| Failed or missed Guard checks | Obligations not `COMPLETED`/`CANCELLED` with `missed_at` or `window_end_utc < now` |
| Unreviewed Guard alerts | `guard_alerts.state = NEW` |
| Guard alerts needing evidence re-review | `needs_review` and state `NEW` or `ACKNOWLEDGED` |
| Failed customer email | Step 11 communications with delivery `BOUNCED` / `COMPLAINED` / `SUPPRESSED` / `FAILED` |
| Access recovery | Open or acknowledged `ACCESS_RECOVERY` service actions |
| Contact recovery | Open or acknowledged `CONTACT_RECOVERY` service actions |
| Payment exceptions | Upfront obligations in `FAILED` / `AUTHENTICATION_REQUIRED`, plus open/acknowledged Guard disputes |
| Guard billing exceptions | Reconciliation issues, billing `PAST_DUE`, failed Guard refunds |
| Failed or dead-lettered jobs | `admin_private.jobs.status = DEAD_LETTER` |

## Today core metrics

| Metric | Definition |
| --- | --- |
| Client records | Every `customers` row. There is no merge/redirect model to exclude. |
| Active service clients | Customer with an open case, `ACTIVE` Guard coverage, or accepted service order |
| Enquiry-only contacts | Enquiries that are not converted and not spam (`case_id` and `monitoring_request_id` null) |
| Open enquiries | Status `new` / `open` / `waiting` (plan NEW / TRIAGED / AWAITING_CUSTOMER / READY_TO_CONVERT) |
| Open cases | Status not `CLOSED` or `CANCELLED` |
| Gross collections | Confirmed `payment_receipts.paid_at` plus Guard subscription invoices `PAID` on `created_at` |
| Refunds | Guard refunds `SUCCEEDED` on `succeeded_at`. Step 14 has no separate refund table. |
| Net collections | Gross minus refunds, grouped by currency |
| Outstanding money | Upfront obligations in `DUE` / `COLLECTING` / `AUTHENTICATION_REQUIRED` / `FAILED`. Success fees are excluded. Issued invoices are not added again. |
| Guard locations | Mutually exclusive: `REQUESTED`; onboarding (`AWAITING_AUTHORIZATION`, `VERIFYING_ACCESS`, `BASELINE_REQUIRED`, `AWAITING_PAYMENT`, `READY_TO_ACTIVATE`); `ACTIVE`+`DIRECT_GUARD`; `ACTIVE`+`INCLUDED`; `PAUSED`; `ENDING`; `ENDED` |
| Guard recurring | `ACTIVE` + `DIRECT_GUARD` + billing `CURRENT` + entitlement `PROVIDER` + subscription `ACTIVE`/`PAST_DUE`. Included, paused, ending and ended are excluded. This is commitment, not cash collected. |
| Check coverage | Numerator: due obligations in period that completed with observation `HEALTHY` / `CHANGE_DETECTED` / `PROFILE_UNAVAILABLE`. Denominator: obligations whose `window_start_utc` is in period and state is not `CANCELLED`. `INCOMPLETE` is not successful. Zero denominator displays **Not applicable**. |

Secondary sections: open case mix, upcoming task due dates, open-task workload, recent confirmed receipts, today's obligations only when an `APPROVED` schedule exists, otherwise `Monitoring schedule not configured`. Freshness uses the existing Step 10 heartbeat / `late_after_seconds` (default 93600).

## Search

Route: `/search`.

Allowlisted fields only:

- case `public_ref` prefix
- customer `full_name` contains
- current verified email only (`customer_contact_verifications.verified_value = lower(customers.email)`)
- business `display_name` contains
- location `location_name` contains
- invoice `provider_invoice_id` prefix

Not searched: OTP, raw phone, notes, audit JSON, evidence body, card metadata, secrets, tokens, sessions.

Query is trimmed, length 2–100, `%` `_` `\` escaped. Pagination is server-side with cursor `rank|id`. Invalid cursor returns `invalid_cursor`. Maximum page size 50.

## Saved filters

Table `public.admin_saved_filters`. RPC-only. Actor is taken from `admin_session_v1`, never from the caller body.

Modules: `ENQUIRIES`, `CASES`, `TASKS`, `GUARD_CHECKS`, `GUARD_ALERTS`, `MONEY`, `REPORTS`.

Filter JSON must be an object, ≤4096 bytes, with allowlisted keys only. Name 1–80 characters. Unique name per actor/module. Mutations require expected `record_version`. Identity and created_at are immutable. Version must advance by one.

## Reports

Route: `/reports`.

| Key | Denominator / population | Timestamp | Notes |
| --- | --- | --- | --- |
| `enquiry_to_case` | Non-spam, non-monitoring enquiries received in period | `enquiries.created_at` | Numerator: those with `case_id`. Recent cohorts may convert later. |
| `quote_conversion` | Quotes whose first `quote_versions.offered_at` is in period | first offered_at | Accepted / declined-cancelled-superseded-expired / still offered |
| `service_mix` | Accepted service orders | `accepted_at` | Grouped by `payment_model` + `service_code` |
| `first_response` | Non-spam enquiries plus cases received in period | created/submitted | Elapsed to first enquiry `triaged` event or first `case_work_events` row. Missing events are excluded, not zero. No SLA. |
| `case_age` | Open cases | now − `submitted_at` | Buckets: `<1d`, `1–3d`, `4–7d`, `8–14d`, `15–30d`, `>30d` with `[start, next)` day boundaries. No SLA colour. |
| `outcomes` | Closed cases with a decided outcome in period | `closed_at` | Success = `RESTORED` or `REMOVED`. Open cases are excluded, not failures. |
| `evidence_turnaround` | Evidence requests created in period | request `created_at` → first `ACCEPTED` `reviewed_at` | Missing accepted review is excluded. Contents are not exposed. |
| `overdue_invoices` | Issued upfront invoices without a receipt | invoice `created_at` | There is no separate invoice due column; issued unpaid is treated as due. |
| `guard_activation` | Coverage events `ACTIVATED` | event `created_at` | Not request date. |
| `guard_churn` | First transition into `ENDING` or `ENDED` | event `created_at` | `PAUSED` is not churn. No ambiguous churn %. |
| `guard_coverage_failures` | Due non-cancelled obligations that missed, did not complete, or have `INCOMPLETE` | `window_start_utc` | Late completion remains historically late. |
| `handling_time` | Completed obligations with `handling_seconds` | `completed_at` | Claim/start → completion seconds from Step 17. Not created→closed case duration. |

## Exports

- POST `/api/operations/reports/export`
- Active Admin session, exact Origin, JSON, UUID idempotency key, allowlisted report key, validated period
- Maximum **5000** rows. Over limit fails with `export_limit`; no silent truncation
- Receipts in `admin_private.report_export_receipts` (immutable). Duplicate request + fingerprint returns the same receipt. Conflicting replay returns `conflict`
- Audit action `REPORT_CHANGED` stores report key and row count only, never the CSV
- CSV text cells whose first meaningful character is `= + - @` tab CR LF, including leading whitespace then a formula, are prefixed with `'`
- Headers: `text/csv; charset=utf-8`, `Content-Disposition` from the allowlisted key + UTC date, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`
- Columns: `id`, `occurredAt`, `label`, `amountMinor`, `currency`, `elapsedSeconds`

## Customer-visible preview

Route: `/records/client/[id]/preview`

RPC `admin_customer_preview_v1` uses a dedicated customer-safe projection. It does not issue OTP or a customer session and has no mutation controls.

Shown when already customer-visible: name, current verified email, verified business memberships and their locations, case references/status, customer-visible notes, open evidence requests, customer-visible document titles/filenames, accepted order references and amounts.

Explicitly excluded: Admin notes, audit, staff/session data, internal task notes, Stripe/provider IDs, idempotency keys, Guard severity/disposition, discount reasoning, recovery internals, suppression internals, jobs/outbox, security events, raw evidence metadata that is not already customer-visible, unverified memberships, other customers.

## Security

- New public table `admin_saved_filters`: RLS on, PUBLIC/anon/authenticated/service_role direct CRUD denied
- Private receipt tables: no PUBLIC grants
- Public RPCs: `SECURITY DEFINER`, `search_path=''`, PUBLIC/anon/authenticated execute revoked, `service_role` execute only, Admin session required
- Internal helpers: no `service_role` execute
- No analytics, GA4, GTM or advertising pixels in Admin or Customer
- Marketing GA4 is unchanged and remains outside this step
