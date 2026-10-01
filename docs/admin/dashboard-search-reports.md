# Dashboard, search, reports and customer-visible preview

Status: **DATABASE APPLIED**

Additive migration: `20261001092213_admin_dashboard_search_reports_v1.sql`

The additive migration `20261001092213_admin_dashboard_search_reports_v1.sql` is applied to `profilerelaunch-dev` exactly once after Step 18 as `20261001092213 admin_dashboard_search_reports_v1`. Do not replay or modify it. Do not enable Guard, Stripe, live mail or Google. Cron remains `0 4 * * *`.

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

Totals are grouped by ISO currency. There is no FX conversion. Reports and exports show the ISO code. Guard recurring is a commitment, labelled **Guard recurring commitment / month**, grouped by currency. Unexpected non-GBP rows are shown separately and are never labelled GBP.

Reports are either `CURRENT` snapshots or `PERIOD` populations. Current-snapshot cards and report pages do not claim the selected period produced the population. Period reports use the explicit Europe/London range. Today explains the mix.

## Needs attention

Exact `COUNT(*)` of the same predicate as the drill-down. No `50+` cards. No invented SLA.

| Card | Predicate |
| --- | --- |
| Overdue work | Open `case_tasks` with `due_at < now` |
| Unassigned enquiries | Enquiry status `new` / `open` / `waiting` and `assigned is not true` |
| Failed or missed Guard checks | Unresolved obligations only: missed/expired window or `PENDING` with `retry_count > 0`. Completed/cancelled work is not live queue. |
| Unreviewed Guard alerts | `guard_alerts.state = NEW` |
| Guard alerts needing evidence re-review | `needs_review` and state `NEW` or `ACKNOWLEDGED` |
| Failed customer email | Step 11 communications with delivery `BOUNCED` / `COMPLAINED` / `SUPPRESSED` / `FAILED` |
| Access recovery | Open or acknowledged `ACCESS_RECOVERY` service actions |
| Contact recovery | Open or acknowledged `CONTACT_RECOVERY` service actions |
| Payment exceptions | `UPFRONT` and earned `SUCCESS_FEE` obligations in `FAILED` / `AUTHENTICATION_REQUIRED`, plus open/acknowledged Guard disputes. Guard recurring stays in the Guard billing queue. |
| Guard billing exceptions | Current unresolved work only: latest reconciliation target per subscription with `mismatch_count > 0`, billing `PAST_DUE`, failed Guard refunds. Historical `guard_reconciliation_issues` remain evidence and are not a permanent queue. |
| Failed or dead-lettered jobs | `admin_private.jobs.status = DEAD_LETTER` |

## Today core metrics

| Metric | Definition |
| --- | --- |
| Client records | Every `customers` row. There is no merge/redirect model to exclude. |
| Active service clients | Current operational relationship: open case, or Guard `ACTIVE` / `PAUSED` / `ENDING`. An accepted order alone is not permanent active-service evidence. `ENDED` is historical. |
| Enquiry-only contacts | Distinct contact identity: normalized email, else normalized phone, else the enquiry id as a bounded anonymous fallback. Converted identities and matching customer emails are excluded. Spam is excluded. |
| Open enquiries | Status `new` / `open` / `waiting` (plan NEW / TRIAGED / AWAITING_CUSTOMER / READY_TO_CONVERT) |
| Open cases | Status not `CLOSED` or `CANCELLED` |
| Gross collections | Confirmed `payment_receipts.paid_at` plus Guard subscription invoices `PAID` on `created_at` |
| Refunds | Guard refunds `SUCCEEDED` on `succeeded_at`. Step 14 has no separate refund table. |
| Net collections | Dedicated `collected_net` report: confirmed collections positive, confirmed refunds negative, grouped by currency. Empty set is a neutral no-collections display, not invented `0.00 GBP`. |
| Outstanding money | Unpaid `UPFRONT` and earned `SUCCESS_FEE` obligations in `DUE` / `COLLECTING` / `AUTHENTICATION_REQUIRED` / `FAILED`. A `SUCCESS_FEE` obligation exists only after the Step 14 approval/evidence gate. VOID/PAID and hypothetical Managed fees are excluded. |
| Guard locations | Mutually exclusive current states. Paid active Guard requires `ACTIVE` + `DIRECT_GUARD` + billing `CURRENT` + entitlement `PROVIDER` + `paid_through_at > now`. Direct Guard coverage alone is not paid entitlement. |
| Guard recurring | `ACTIVE` + `DIRECT_GUARD` + billing `CURRENT` + entitlement `PROVIDER` + subscription `ACTIVE`/`PAST_DUE`. Included, paused, ending and ended are excluded. This is commitment, not cash collected. |
| Check coverage | Numerator: due obligations in period that completed with observation `HEALTHY` / `CHANGE_DETECTED` / `PROFILE_UNAVAILABLE`. Denominator: obligations whose `window_start_utc` is in period and state is not `CANCELLED`. `INCOMPLETE` is not successful. Zero denominator displays **Not applicable**. |

Secondary sections: open case mix, upcoming task due dates, open-task workload, recent confirmed financial events (service receipts, paid Guard invoices, successful refunds; signed type Collection / Guard collection / Refund), today's obligations only when an `APPROVED` schedule exists using Step 17 end-exclusive `effective_to` (`service_date < effective_to`), otherwise `Monitoring schedule not configured`. Freshness uses the existing Step 10 heartbeat / `late_after_seconds` (default 93600).

## Search

Route: `/search`.

Allowlisted fields only:

- case `public_ref` prefix
- customer `full_name` prefix on `lower(btrim(name))`
- current verified email prefix
- business `display_name` prefix
- location `location_name` prefix
- service invoice `provider_invoice_id` prefix
- Guard invoice `stripe_invoice_id` prefix (`guard_invoice`)

Contains-search (`%q%`) is not used. Ordinary btree indexes on the normalized lower-trimmed value serve prefix matches. No extra database extension is added.

Not searched: OTP, raw phone, notes, audit JSON, evidence body, card metadata, secrets, tokens, sessions.

Query is trimmed, length 2–100, `%` `_` `\` escaped. Cursors are `rank|id|md5(normalized query)` and are valid only for that query and an existing hit. Invalid cursor returns `invalid_cursor`. Maximum page size 50.

## Saved filters

Table `public.admin_saved_filters`. RPC-only. Actor is taken from `admin_session_v1`, never from the caller body.

Step 19 implements **REPORTS only**. Other modules are not wired in Admin UI and are not exposed as dead backend capability. Step 20 can widen the module CHECK.

REPORTS filter keys: `reportKey`, `preset`, `startDate`, `endDate` with allowlisted values. A Reports filter cannot contain a Guard queue key.

Actor must be the current Admin identity (`admin_identity.auth_user_id`). `saved_filter_actor_is_staff_v1` is a false stub for Step 20 staff extension. Inserts must start at `record_version = 1`. Duplicate create returns `conflict / duplicate_name`. Malformed UUIDs return `invalid`.

UI: Apply (navigates to the normalized filters, never an arbitrary URL), Rename, Replace from current, Delete.

## Reports

Route: `/reports`.

| Key | Denominator / population | Timestamp | Notes |
| --- | --- | --- | --- |
| `enquiry_to_case` | Case-service allowlist only: `profile-recovery`, `profile-access`, `review-protection` | `enquiries.created_at` | Excludes spam, monitoring, `general`, and non-case contact. Excluded counts are shown. Recent cohorts may convert later. |
| `quote_conversion` | Quotes whose first `quote_versions.offered_at` is in period | first offered_at | Accepted / declined-cancelled-superseded-expired / still offered |
| `service_mix` | Accepted service orders | `accepted_at` | Grouped counts: Guided/Managed Relaunch and Review, Relaunch Guard, plus Guided/Managed/Guard rollups. Amounts stay separate. |
| `first_response` | Non-spam enquiries plus cases received in period | created/submitted | Enquiry and case breakdowns. These are two operational populations; a converted enquiry can appear in both. Missing events are excluded, never zero. No SLA. |
| `case_age` | Open cases (CURRENT) | now − `submitted_at` | Buckets: `<1d`, `1–3d`, `4–7d`, `8–14d`, `15–30d`, `>30d` with `[start, next)` day boundaries. No SLA colour. |
| `outcomes` | Decided outcomes whose `closed_at` is in period | `closed_at` | Strict success = `RESTORED` + `REMOVED`. Denominator = decided non-withdrawn. Partial/recommendation, unsuccessful, withdrawn and same-period open intake are shown separately. Open is not failure. |
| `evidence_turnaround` | Evidence requests created in period | request `created_at` → first `ACCEPTED` `reviewed_at` | Missing accepted review is excluded. Contents are not exposed. |
| `overdue_invoices` | CURRENT: `ISSUED` + unpaid + authoritative `due_at < now` | `due_at` | `due_at` is nullable and populated only from confirmed Stripe `due_date`. No invented due period. Issued invoices without `due_at` increment `unknownDueDateCount` and are not overdue. |
| `guard_activation` | Coverage events `ACTIVATED` | event `created_at` | Not request date. |
| `guard_churn` | First transition into `ENDING` or `ENDED` | event `created_at` | `PAUSED` is not churn. No ambiguous churn %. |
| `guard_coverage_failures` | Due non-cancelled obligations that missed, did not complete, or have `INCOMPLETE` | `window_start_utc` | Label is a failure category (`MISSED`, `INCOMPLETE`, `RETRY_REQUIRED`, `TECHNICAL_FAILURE`, `UNCOMPLETED_AFTER_WINDOW`), not the raw obligation state. Late completion remains historically late. |
| `collected_net` | Confirmed collections and refunds in period | paid/created/succeeded | Signed rows. Summary groups signed amount by currency. |
| `handling_time` | Completed obligations with `handling_seconds` | `completed_at` | Claim/start → completion seconds from Step 17. Not created→closed case duration. |

## Exports

- POST `/api/operations/reports/export`
- Active Admin session, exact Origin, JSON, UUID idempotency key, allowlisted report key, validated period
- Maximum **5000** rows. Over limit fails with `export_limit`; no silent truncation
- Receipts in `admin_private.report_export_receipts` (immutable, RLS, no grants). Receipts store bounded metadata only: request, actor, report key, period/filter fingerprint, row count, outcome, requested_at. They do **not** store CSV bytes, export rows, or customer labels/emails.
- Replay reconstructs rows from the live shared predicate. Same request + fingerprint: one receipt, one audit event. Same request + different fingerprint: `conflict`. `pg_advisory_xact_lock` serializes the request before lookup.
- `filters` stores the normalized non-PII fingerprint (`reportKey`, `preset`, `timezone`, `temporalMode`).
- Audit action `REPORT_CHANGED` stores report key and row count only, never the CSV
- CSV leading metadata records `temporalMode` (`CURRENT` snapshot vs `PERIOD`)
- CSV text cells whose first meaningful character is `= + - @` tab CR LF, including leading whitespace then a formula, are prefixed with `'`
- Headers: `text/csv; charset=utf-8`, `Content-Disposition` from the allowlisted key + UTC date, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`
- Columns: `id`, `occurredAt`, `label`, `amountMinor`, `currency`, `elapsedSeconds`

## Customer-visible preview

Route: `/records/client/[id]/preview`

RPC `admin_customer_preview_v1` uses a dedicated customer-safe projection. It does not issue OTP or a customer session and has no mutation controls.

Reuses Step 9/9B visibility: `contact_verified_v1` / current verified email, `customer_business_projection_v1` (verified membership + verified email), `visibility = CUSTOMER` notes, `customer_visible` documents. Business-scoped cases, evidence, documents and orders require the customer + exact business + current verified membership. Historical `customer_id` alone is not enough. Pending/revoked memberships omit scoped data.

Each list is bounded (`preview_limit_v1` = 50). This is a diagnostic projection, not a bulk export. No OTP or customer session.

## Security

- New public table `admin_saved_filters`: RLS on, PUBLIC/anon/authenticated/service_role direct CRUD denied
- Private receipt tables: RLS on, no PUBLIC/anon/authenticated/service_role grants
- Additive `payment_invoices.due_at` is set-once from confirmed Stripe `due_date` via an optional 6-argument `payment_record_invoice_v1` overload. The 5-argument function remains.
- Public RPCs: `SECURITY DEFINER`, `search_path=''`, PUBLIC/anon/authenticated execute revoked, `service_role` execute only, Admin session required
- Internal helpers: no `service_role` execute
- No analytics, GA4, GTM or advertising pixels in Admin or Customer
- Marketing GA4 is unchanged and remains outside this step
