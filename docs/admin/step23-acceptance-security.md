# End-to-end acceptance and security hardening review (Step 23)

Status: **STEP 23 COMPLETE**

Step 23 exercises the Admin workspace as a whole rather than one feature at a time, looks
for the defects that only appear where two features meet, and fixes the ones it finds. It
does not add a feature. It does not activate anything.

Nothing in this step was taken on trust from an earlier implementation report. Every claim
below comes from reading the current code or from running the behaviour against the
current schema.

## Scope and what stayed off

No live effect was produced. Stripe, outgoing mail, inbound mail, the Google API and Guard
automation remain disabled, `PRIVACY_DELETION_ENABLED` remains off, Cron remains
`0 4 * * *`, no environment variable changed, no secret was rotated and no second Admin
account exists. No Supabase restore, branch, project or point-in-time recovery was
performed, and no AWS object was touched.

**Step 22A is complete. Step 22B is deferred: a cloud recovery rehearsal is required before
final production sign-off.** Step 24 must still carry it as an unresolved operational item.

One migration was created, independently reviewed and applied once to
`profilerelaunch-dev`. It is described under [The one migration](#the-one-migration)
below. Supabase recorded it as `20261001220255 quote_surface_fixes_v1`; the repository
filename is aligned to that applied version.

## Acceptance matrix

The matrix is machine-readable and lives at `apps/admin/lib/acceptance/matrix.ts`. It is
not prose that someone has to remember to update: `matrix.test.ts` reads the App Router
tree and the test files off disk, so a page added without a row, a row naming a route that
does not exist, a row naming a test file that does not exist, or a row missing its
expected result, authorization rule, persistence expectation, negative case or evidence all
fail the suite.

Each row records the area, its routes and non-page surfaces, the operator's primary
action, the expected result, the authorization requirement, what must persist including
the audit record, the negative case that matters most, the tests that prove both, and a
status. A row is `PASS` only when both the expected behaviour and the refusal are
exercised. Rendering a component is not acceptance and was not accepted as such.

| Area | Routes | Status |
| --- | --- | --- |
| Authentication and session | `/login` | PASS |
| Today dashboard | `/` | PASS |
| Global search | `/search` | PASS |
| Activity log | `/activity` | PASS |
| Tasks | `/tasks` | PASS |
| Enquiries queue | `/enquiries` | PASS |
| Enquiry triage and conversion | `/enquiries/[id]`, `/enquiries/new` | PASS |
| Cases list | `/cases` | PASS |
| Case workflow | `/cases/[id]` | PASS |
| Case authorization and manager access | `/records/client/[id]/link` | PASS |
| Case evidence | `/cases/[id]/evidence` | PASS |
| Prepared packs | — | PASS |
| Evidence queue | `/documents` | PASS |
| Client, business and location records | `/records/[entity]`, `/records/[entity]/[id]` | PASS |
| Duplicate review | `/records/duplicates` | PASS |
| Customer preview | `/records/client/[id]/preview` | PASS |
| Commercial catalogue, quotes and orders | `/commercial` | PASS |
| Money, payments and invoices | `/money` | DEFERRED_EXTERNAL |
| Outgoing communications | `/communications` | DEFERRED_EXTERNAL |
| Inbound mail and conversations | `/conversations` | PASS |
| Guard subscriptions and billing | `/guard` | DEFERRED_EXTERNAL |
| Guard manual checks | `/guard/checks`, `/guard/checks/[obligationId]` | PASS |
| Guard alerts | `/guard/alerts`, `/guard/alerts/[alertId]` | PASS |
| Jobs and outbox | `/operations/jobs` | PASS |
| Reports | `/reports`, `/reports/[key]` | PASS |
| Settings and operational policy | `/settings` | PASS |
| Message templates | `/settings/templates` | PASS |
| Privacy requests | `/privacy` | PASS |
| Incidents | `/incidents` | PASS |
| Complaints | `/complaints` | PASS |
| Security and sessions | `/security` | PASS |
| Google Business Profile integration | — | DEFERRED_EXTERNAL |
| Customer-facing action tokens | — | PASS |
| Route parameter and request boundary | — | PASS |
| Database permission surface | — | PASS |
| Migration and recovery rehearsal | — | DEFERRED_EXTERNAL |

No area is `FAIL`. A failing area would be a blocker, not a matrix entry, and the matrix
test asserts that too. The five `DEFERRED_EXTERNAL` rows are the four live gates that are
deliberately off and the Step 22B rehearsal; each carries a note saying why, and the test
asserts that list so none of them can be quietly promoted.

## Simulated Admin workday

`apps/admin/lib/workday.database.test.ts` is one test that walks a single synthetic
enquiry through a working day, against the whole migration chain applied in order to an
in-memory PostgreSQL instance. It is the only test in the repository that builds every
migration together, which is how it found the quote-list defect below.

The sequence: the Admin signs in through the real one-time-code functions rather than an
inserted session row; opens Today on an empty desk; receives a general enquiry from the
marketing intake function and sees it in the active queue and in the Today count; triages
it with an assignment and a dated next action; creates the customer, business and location
records, verifies the email contact and the business relationship; converts the enquiry
into a profile recovery case; plans the case onto the guided track and moves it into
evidence collection, which opens the customer task; requests a utility bill; takes the
upload through begin, finalize and a clean scan; accepts the version on review and
fulfils the request; assembles a prepared pack from the accepted evidence; is refused an
approval without the explicit confirmation and then approves it; evaluates
customer-action readiness and sees it correctly report "not ready" with no action created;
drafts, taxes and offers a quote and sees it in the offered list with an empty order list;
reads job health and confirms the read claimed and ran nothing; sees no communications and
no conversations; confirms Guard has no check queue, no obligations, no attempts and no
alerts because nothing is scheduled and nothing is automatic; reads the audit trail and
confirms every mutation is there, every outcome is `success` and no session token appears;
sees the closing Today, global search and report figures reflect the day's work; and
returns to the case to find one coherent history.

Provider-facing steps stayed simulated. No mail was composed, no payment was prepared, no
Google call exists to make and no job was executed.

## Defects found and fixed

Each one was reproduced first, given a regression test, fixed at the smallest correct
layer, and then re-run.

### 1. A quote acceptance action could be revoked through the wrong quote

The quote command's `revoke_action` branch loaded the target customer action by its
identifier alone. It checked the action's kind and status but never checked that the action
belonged to the quote named in the same request. Supplying quote A's identifier with an
open acceptance action belonging to quote B revoked quote B's action, deleted quote B's
customer-action challenges and sessions, and wrote the audit row against quote A. That is
a cross-record mutation with a mis-attributed audit entry.

The payments branch already verified the equivalent link. The fix brings the quote branch
to the same standard, accepting any version of the loaded quote so an action issued against
a previously offered version stays revocable.

The fix is applied to `admin_private.admin_quote_command_core_v1`, not to
`public.admin_quote_command_v1`. See "Which function actually holds the quote command"
below: the public name is a Step 15 wrapper, and the branch carrying this defect lives in
the private core behind it. Regression test in
`apps/admin/lib/commerce/quote-surface-fixes.database.test.ts`, which runs the whole chain.

### 2. The quotes list raised instead of returning

`public.admin_quote_list_v1` ordered its aggregate by `row.quote.created_at`. PostgreSQL
reads a three-part qualified name as `schema.table.column`, so it looked for a table called
`quote` and raised `missing FROM-clause entry for table "quote"`. The plan is built the
first time the statement runs, so every call failed regardless of how many quotes existed,
and `/commercial` returned an error page rather than the quote list.

Nothing had ever called this function: the page test mocks `loadQuotes`, and no SQL suite
reached it. The simulated workday is what exercised it. The fix parenthesises the composite
reference; ordering, filtering and the returned shape are unchanged. Regression test in
`apps/admin/lib/workday.database.test.ts`.

### 3. The evidence upload response repeated the storage key

`begin` returned the object key at the top level of its JSON as well as inside the signed
POST fields. The browser needs the key inside the signed fields to perform the upload;
nothing read the second copy. Removing it narrows what an operator's browser, browser
history and any logging proxy ever see. `apps/admin/lib/evidence/command.test.ts` now
asserts the whole response envelope by key, so a field added later has to be deliberate.

### 4. A malformed Guard check identifier produced a failure page

`loadGuardCheck` passed the route parameter straight to a `uuid` parameter. A mistyped or
guessed identifier therefore raised a database error and the operator got the error
boundary instead of a "not found" page. Every other dynamic-route loader already guarded
this. `apps/admin/lib/route-params.test.ts` is new and tests all eight loaders against
eleven malformed values, so the next loader cannot be added without the guard.

### 5. A mistyped case reference read as a database fault

The conversations and communications commands forwarded `caseId`, `conversationId`,
`attachmentId`, `communicationId` and `evidenceRequestId` to SQL without checking they were
identifiers. The case reference on the conversations form is typed by hand, so a plausible
typo such as a case reference instead of an identifier produced a 503 rather than "check
the fields". Fixed in the two command modules, which is the input-validation layer.

### 6. The conversations form never announced its outcome

Every other Admin form keeps an empty `role="status"` region in the document. The
conversations form inserted the region together with its text, which is not reliably
announced, so a screen-reader operator got no confirmation that linking a conversation to a
case had worked or been refused.

### 7. Repeated row actions had identical accessible names

On incidents, complaints and templates the acknowledge, resolve, cancel, approve and retire
controls are rendered once per row with the same visible label and no other context. A
screen-reader user listing the buttons could not tell which record each one would change,
on pages whose actions include cancelling an incident and retiring a template. Each control
now carries the record in its accessible name.

### 8. Two dependency advisories

`npm audit` reported a critical remote-code-execution advisory against the installed
Next.js (`GHSA-vcvr-r3jv-pc5j`, `next/og` `ImageResponse`, affecting 16.2.0–16.3.5) and a
high-severity denial-of-service advisory against a transitive development dependency. The
marketing site does use `next/og` for its OpenGraph image. Both are closed by a
lockfile-only update to Next.js 16.3.8, inside the existing `^16.3.4` ranges, with no
change to any `package.json`. `npm audit` now reports no vulnerabilities.

### 9. The Admin content policy was weaker than the customer app's

The Admin workspace served `Content-Security-Policy: frame-ancestors 'none'; base-uri
'self'; object-src 'none'; form-action 'self'` — no `default-src`, no `script-src`, no
`connect-src`, no `img-src`. The customer app, on the same Next.js version, already served
the strict policy. The higher-value workspace had the weaker policy.

Admin now serves the same policy as the customer app. It loads no third-party script,
style, font or image, and the only cross-origin request it makes from the browser is the
presigned evidence upload to S3, which `connect-src 'self' https://*.amazonaws.com`
allows. Verified in a real browser against a production build: the login page renders
fully, styling and the logo load, and the console reports no policy violation at desktop
width and at 400px. `apps/admin/next.config.test.ts` asserts both apps serve the same
policy, and `scripts/smoke-admin.mjs` asserts the served header on every route it visits.

### 10. One scrollable table could not be reached from the keyboard

The matching-records table on `/reports/[key]` sat in a `table-scroll` container that
scrolls horizontally when the content is wider than the viewport, but unlike the other
nineteen scrollable tables in the workspace it was not a focusable region — it had no
`role="region"` and no `tabIndex={0}`, and the label was on the `<table>` rather than the
container. On a narrow viewport the overflowing columns were therefore readable with a
mouse and unreachable with a keyboard alone.

It now matches every other table in the workspace: a labelled region with a tab stop.
`apps/admin/lib/accessibility.test.ts` sweeps the whole `app/` tree and fails if any
`table-scroll` container is missing either, so the next one cannot be added without it.

## Claims checked and rejected

Three apparent findings were investigated and are not defects. They are recorded so the
same ground is not covered again.

- **`/api/enquiries/options` forwarding raw rows.** The SQL selects an explicit column list;
  there is no `to_jsonb(row)` on a table.
- **"Cannot refund more than collected" missing from payments.** The payments module has no
  refund path at all. The only refund path is Guard billing, and it is capped by
  `exceeds_refundable`.
- **`role="status"` elements missing `aria-live`.** `role="status"` carries an implicit
  `aria-live="polite"` in the ARIA specification.

## Security summary

**Authentication and session.** One enabled identity. The session token exists server-side
only as a SHA-256 hash. The cookie is `__Host-`, `httpOnly`, `secure`, `sameSite=strict`,
path `/`, twelve hours. A session is valid only while unrevoked, inside its expiry and seen
in the last thirty minutes. Revocation takes effect on the next request. Sensitive
operations — contact verification, settings approval, job replay, privacy export, revoking
all sessions — additionally require a sign-in from the last five minutes, enforced in SQL
rather than in TypeScript.

**Authorization.** `requireStaff()` is called by every protected page and every command,
independently of the proxy, so the proxy is a second line rather than the only one.
Cross-record access was tested adversarially at both the HTTP boundary and the underlying
RPC boundary: an evidence version, authorization record, customer action, pack item,
conversation or quote belonging to another case or quote conflicts rather than applying,
and the refusal does not disclose the other record's contents.

**Database permissions.** `apps/admin/lib/database-hardening.database.test.ts` builds the
whole chain and holds every object to one rule. Every function in `public` and
`admin_private` pins its `search_path`. Every table has row-level security enabled. No
table is granted to `anon` or `authenticated`. Nothing in `public` is executable by `anon`
or `authenticated` — not even the marketing intake functions, because every caller reaches
the database with the service key from a server route and the browser never speaks to
PostgREST. The test does not stop at privilege bits: it sets the role and makes the call,
and an Admin RPC, an `admin_private` helper and a direct table read are all refused. Every
`public.admin_*` function is executable by `service_role` with one deliberate exception,
`admin_identity_id_v1`, which is revoked from `service_role` too because it is only ever
called from inside another definer function.

**`set_case_public_ref` and `rls_auto_enable`.** Both are flagged by the Supabase advisors
on `profilerelaunch-dev` and both were inspected rather than dismissed. Neither is created
by any migration in this repository: they predate the repository holding the schema. Step 1
created its own correctly hardened replacement, `public.cases_assign_public_ref`, which
pins `search_path = public, pg_temp`, is revoked from `PUBLIC`, `anon` and `authenticated`,
and is granted only to `service_role`; the `cases_assign_public_ref` trigger uses it. A
project built from this chain therefore does not contain either legacy function, and the
hardening test asserts their absence from a freshly built schema. Removing them from the
development project is a cutover task and is recorded in the risk register for Step 24, not
a repository defect and not grounds for a migration. For `rls_auto_enable` specifically,
an event-trigger function returns `event_trigger`, so it cannot be invoked directly or
exposed through PostgREST in any case.

**Leaked-password protection.** This is a Supabase Auth project setting, not a schema
object, so no migration can enable it. The Admin sign-in path does not use passwords at
all — it is one-time code only — so the setting has no effect on the Admin account. It is
recorded as a Step 24 project-configuration item.

**Cross-site request forgery and origin.** Every one of the eighteen mutation command
modules compares `request.headers.get("origin")` and `request.nextUrl.origin` against the
configured origin and refuses with 403 on a mismatch. `apps/admin/lib/mutation-boundary.test.ts`
walks `app/api` on disk and fails if any POST route is neither a documented
signature-verified webhook nor a delegate of a module that performs that comparison, so a
route added later cannot miss it. Behind that, `sameSite=strict` means a cross-site request
never carries the cookie, the JSON content type and the custom idempotency header force a
preflight that is never answered, and `form-action 'self'` blocks a cross-origin form post.
The one unauthenticated GET the proxy permits is the cron entry point, which authenticates
with a bearer secret compared in constant time.

**Sensitive data exposure.** `apps/admin/lib/client-boundary.test.ts` asserts that no client
component imports `auth/backend`, `auth/config`, `require-staff` or anything marked
`server-only`; that no client component reads `process.env`, which Next.js would inline
into the bundle; that no `NEXT_PUBLIC_` variable exists anywhere in the workspace; and that
every module able to reach Supabase is marked `server-only`. Alongside that, the per-domain
tests assert that storage keys, signed URLs, session tokens, internal notes and provider
credentials do not appear in the payloads the browser receives, and the customer preview
contains exactly four keys.

**Response headers.** Every response carries `X-Robots-Tag: noindex, nofollow, noarchive`,
`Cache-Control: private, no-store, max-age=0`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS, a `Permissions-Policy`
denying camera, microphone and geolocation, and the content policy described above. The
framework version header is off. `robots.txt` disallows everything and no Admin URL appears
in the marketing sitemap. These are asserted both in `next.config.test.ts` and against the
real served responses in `scripts/smoke-admin.mjs`.

**Secrets and environment.** No value was rotated, printed or committed. No environment
variable was added, removed or changed. The only dependency change is the lockfile update
described above.

## Accessibility summary

Three real defects were found and fixed: the conversations form's live region, the
identical accessible names on repeated row actions, and the one scrollable table that had
no keyboard tab stop. Each now has a regression test that asserts the accessible name or
the structure rather than the visible text, so none can silently regress.

The remaining invariants are enforced across the whole tree rather than page by page.
`apps/admin/lib/accessibility.test.ts` walks every page and component on disk and fails if
a page carries no `h1`, a visible control carries no programmatic label, a client form that
reports an outcome in place carries no `role="status"` region, the navigation landmark
stops marking the current page, or a scrollable table is not a labelled region with a tab
stop. Writing it is what surfaced the third defect; the first two were found by exercising
the components.

Everything else held. Every form control has a programmatic label; every page has one `h1`;
navigation is a labelled landmark and marks the current page with `aria-current="page"`;
every form that reports in place keeps a persistent `role="status"` region; destructive and irreversible
actions — pack approval, job replay, settings approval, privacy export — require a typed
reason and an explicit confirmation rather than a single click; disabled controls carry a
`title` and an `aria-describedby` hint explaining why. No large accessibility dependency
was added; none was needed to fix either defect.

`<th>` elements inside a `<thead>` without an explicit `scope="col"` were considered and
left alone. HTML assigns the column scope implicitly in that position, and changing it
everywhere would be a stylistic edit to working markup.

## Browser and runtime summary

The Admin production build was run and checked in a real browser. The login page renders
fully under the tightened content policy, with styling and the logo loading and no console
error or policy violation, at desktop width and at 400px, where the content stays readable
with no horizontal overflow and no horizontal scrollbar.

The authenticated pages were not driven through a browser in this step because doing so
needs live Supabase credentials, which this environment does not hold. They are covered by
the page tests, the command tests, the SQL suites and the HTTP smoke script, which starts a
production server and asserts status and headers across every route and API path.

Failure behaviour was checked as well. The error boundary deliberately ignores the error it
is given, so no message, digest or parameter value reaches the screen or the DOM, and
`apps/admin/app/error.test.tsx` now pins that. An unknown or guessed address gives a
"page not found" page with a way back rather than a dead end, and an unauthenticated
request to a page redirects to `/login` while an unauthenticated request to an API path
returns 401 JSON.

## Which function actually holds the quote command

The first version of this migration replaced `public.admin_quote_command_v1` with the
Step 13 body plus the revoke guard. That was wrong, and independent review caught it before
anything was applied. The correction is worth recording in full, because the mistake was
not a typo — it came from reading the Step 13 migration and assuming the public name still
meant what it meant then.

Step 13 (`20260929233953_catalogue_quotes_orders_v1.sql`) created the quote command as
`public.admin_quote_command_v1`. Step 15 (`20260930164529_guard_onboarding_activation_v1.sql`)
then rearranged it:

1. renamed that function to `admin_quote_command_core_v1`;
2. moved it into `admin_private` and revoked it from PUBLIC, `anon`, `authenticated` **and**
   `service_role`, so no role can call it directly;
3. created a new `public.admin_quote_command_v1` wrapper, granted to `service_role`, which
   delegates every operation except `record_qualification` to the private core and routes
   `record_qualification` to `admin_private.record_guard_linked_qualification_v1`.

That Guard-linked path is the point of the rearrangement. The Step 13 branch decided
whether a 20% paid-Guard discount applied by reading `coverageBasis`, `coverageStatus`,
`coverageType`, `paidVsIncluded` and `issuePredatesPaidCoverage` straight out of the request
payload. The Step 15 path ignores those strings and asks the database instead, through
`admin_private.paid_guard_discount_ready_v1`, which requires an ACTIVE `DIRECT_GUARD`
coverage at that location, activated before the issue was observed, with provider billing
in `CURRENT` state and paid into the future.

Replacing the public wrapper with the Step 13 body would therefore have put the
payload-trusting branch back in front of the database-checking one. Step 15 also added a
`BEFORE INSERT` trigger on `quote_discount_snapshots` that runs the same coverage check, so
a spoofed qualification would still not have been stored — the regression would not have
produced a fraudulent discount. What it would have produced is the loss of the
request-level control, the loss of the `coverageId` handling, and a raw
`Qualified Guard discount requires an authoritative coverage` database exception reaching
the operator in place of a clean `denied`. That is a real regression in a money-adjacent
control and it must not be applied, but the data-integrity backstop is worth stating
accurately rather than overstating the exposure.

The corrected migration replaces `admin_private.admin_quote_command_core_v1`, carries over
every other line of the core body unchanged — including the now-unreachable Step 13
`record_qualification` branch, which the wrapper intercepts before the core is reached —
restates the revoke of the core from PUBLIC, `anon`, `authenticated` and `service_role`,
and does not mention `public.admin_quote_command_v1` at all.

### Why the existing tests did not catch it

`apps/admin/lib/commerce/database.test.ts` applies the chain only as far as the Step 13
catalogue and quote migration, which is the schema the rest of its assertions were written
against, and then applied the Step 23 file directly on top. On that truncated chain Step 15
never runs, so `public.admin_quote_command_v1` really is the Step 13 function and replacing
it looks correct. The suite passed on an arrangement that exists nowhere.

That is fixed in two parts. The Step 23 migration is no longer appended to the Step 13
list, with a comment in the file saying why a later migration must not be added there. And
`apps/admin/lib/commerce/quote-surface-fixes.database.test.ts` runs the complete chain
through Step 23 using the Step 22A recovery harness and proves, against the real schema:

- `public.admin_quote_command_v1` and `admin_private.admin_quote_command_core_v1` both
  exist, both are `SECURITY DEFINER` with a pinned empty `search_path`, and the wrapper's
  body still names both the core and the Guard-linked qualification function;
- the core is executable by no role at all, including `service_role`, and the wrapper is
  executable by `service_role` only;
- a `record_qualification` carrying `coverageBasis=PAID`, `coverageStatus=ACTIVE`,
  `coverageType=PAID_GUARD`, `paidVsIncluded=PAID` and `issuePredatesPaidCoverage=false`
  with no real coverage behind it returns `denied` and stores no qualified snapshot;
- the same call against a genuine coverage — built through the actual acceptance flow into
  an `ACCEPTED_RECURRING` Guard order, an ACTIVE `DIRECT_GUARD` coverage and `CURRENT`
  provider billing — succeeds with the 20% `PAID_GUARD_MANAGED_20` policy, and is refused
  again when the location does not match;
- the cross-quote revoke returns `conflict` and leaves the action `OPEN` with its
  challenges, its events and the other quote's audit trail untouched;
- the own-quote revoke still succeeds and writes exactly one audit row;
- `admin_quote_list_v1` returns rather than raising, and filters by status.

The suite was verified against the defect it exists for: with the migration temporarily
pointed back at the public wrapper, three of its tests fail, including both behavioural
Guard ones.

## The one migration

`supabase/migrations/20261001220255_quote_surface_fixes_v1.sql` is the only migration
created by Step 23. It is forward-only, replaces two function bodies with
`CREATE OR REPLACE` — `admin_private.admin_quote_command_core_v1` and
`public.admin_quote_list_v1` — edits no applied migration, and contains no data change. It
carries both quote defects described above, because both are in the same feature and
applying one file at cutover is simpler to review and safer to sequence than applying two.

It was independently reviewed and applied exactly once to `profilerelaunch-dev`.
Supabase recorded the migration as `20261001220255 quote_surface_fixes_v1`, and the
recovery manifest now records `appliedToDev: true` with that exact version. The applied
SQL content is frozen. The upgrade rehearsal proves the migration applies cleanly onto the
real chain.

## Remaining blockers for Step 24

1. **Step 22B is not done.** A recovery rehearsal against a genuinely restored project is
   still required before final production sign-off. Step 22A built and proved the tooling;
   it did not restore anything.
2. **Legacy database objects on the development project.** `public.set_case_public_ref` and
   `public.rls_auto_enable` exist on `profilerelaunch-dev` from before this repository held
   the schema. A production project built from these migrations will not have them. If
   production is created by promoting the development project rather than by rebuilding,
   they must be removed as a cutover task.
3. **Leaked-password protection** is a Supabase Auth project setting and must be enabled
   there. It does not affect the Admin account, which has no password.
4. **The repository chain and the remote migration ledger do not start in the same place.**
   Supabase's migration history on `profilerelaunch-dev` begins at
   `20260917080553_single_admin_auth_v1`. The three foundation migrations before it —
   `20260915120000_core_data_foundation_v1.sql`, `20260915193000_case_intake_transaction_v1.sql`
   and `20260916000000_relaunch_guard_data_foundation_v1.sql` — are present in the live
   schema but are not recorded as applied in the remote ledger. Nothing is wrong with the
   database; the ledger simply does not describe how it was built.

   This was **not** repaired in Step 23 and must not be. Those migrations must not be
   replayed or reapplied, their history rows must not be fabricated, they must not be
   renamed, and they must not be marked pending. The consequence to carry forward is that
   the Step 22A history validator cannot be assumed to read `clean` against the live
   project: it compares the repository, the manifest and the remote ledger, and the ledger
   is missing its first three entries. Before final production sign-off a decision is
   required on how the canonical repository chain and the historical development ledger are
   reconciled — whether production is rebuilt from the full chain, or the existing ledger is
   adopted with its origin documented. That decision belongs to Step 22B and Step 24.
5. **The live gates are still closed by design.** Stripe, outgoing mail, inbound mail, the
   Google API, Guard automation and privacy deletion are all off, and the five
   `DEFERRED_EXTERNAL` matrix rows record what each one would still need.

## Verification

During development only the impacted suites were run. One repository-level regression was
run once at the final head, and all of it passed:

| Workspace | Checks |
| --- | --- |
| Marketing | `eslint .` clean; `tsc --noEmit` clean; 685 tests in 103 files; production build |
| Admin | 1220 tests in 122 files, including the full migration chain on PGlite; `tsc --noEmit` clean; production build; HTTP smoke across every route and API path |
| Customer | 63 tests in 10 files; `tsc --noEmit` clean; production build; HTTP smoke |

`npm audit` reports no vulnerabilities and `git diff --check` is clean. `validation.md` is
the Step 1–2 foundation handover and is left as the historical record it is; the regression
for this step is the table above.

Of the 1220 Admin tests, the ones this step added are the twenty-step simulated workday,
six full-chain quote surface checks, nine schema-wide hardening checks, nine
acceptance-matrix checks, five mutation-boundary checks, five client-boundary checks, six
accessibility sweeps, four header checks, three conversations-form checks and two
error-boundary checks, plus the regression tests attached to each of the ten defects.
