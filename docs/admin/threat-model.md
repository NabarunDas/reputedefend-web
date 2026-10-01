# Admin threat model — evidence workspace and customer actions

This extends the Admin security model for Step 8A uploads, Step 8B review/access, Step 8C prepared packs and Step 9A customer actions. Mitigations listed here are implemented unless marked as later work.

| Threat | Mitigation |
| --- | --- |
| Malicious upload | Private bucket, Block Public Access, GuardDuty Malware Protection, clean-only GetObject IAM, no customer visibility by default |
| Extension / MIME spoofing | Allowlist on last extension and declared MIME at begin; post-scan magic-byte / DOCX structure checks; mismatch → `INVALID` |
| Malware before scan | GetObject/HeadObject are not used at finalize; only GetObjectTagging; bytes are read only after `NO_THREATS_FOUND` |
| Cross-case IDOR | Version/request lookup requires the live Admin session and matching `case_id`; wrong case or guessed UUID returns missing/conflict without metadata |
| Forged scan status | Application never writes GuardDuty tags; IAM prevents the Admin role from modifying malware tags; unknown tags map to `FAILED`; `VALID` is constrained to a clean scan; View/Download re-check the live tag |
| Stale clean DB vs live malware | Access refuses to mint a URL if the live GuardDuty tag is missing or not `NO_THREATS_FOUND`, even when the database still says clean |
| Bucket confusion | Stored `storage_bucket` must match `AWS_EVIDENCE_BUCKET`; mismatch fails closed with no S3 call and no URL |
| Leaked presigned upload | Exact key, exact Content-Type, 1..10 MB range, ≤5 minute expiry; object key is an unguessable UUID path; finalize still requires the Admin session |
| Leaked presigned read URL | Expiry ≤60 seconds; URL never persisted in DB/audit/events/logs; opaque keys; no third-party viewers; `noopener` new tab |
| Header injection via filename | Content-Disposition helper rejects CR/LF/control characters rather than copying `original_filename` into headers |
| DOCX preview exfiltration | No Google/Microsoft/other viewer; DOCX View disabled in UI and rejected by SQL + command layer; download remains gated on clean+valid |
| Oversized upload | JSON size rejected above 10 MB; presigned POST `content-length-range` max 10,485,760; DB check on `declared_size_bytes` |
| Malicious DOCX / ZIP | `.zip` and other archives rejected as uploads; DOCX must be a ZIP that contains `[Content_Types].xml` and `word/document.xml`; decompression is bounded and uses `fflate`, not a hand-rolled parser |
| AWS credential leakage | No static keys; fail closed if `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are set; OIDC short-lived credentials stay on the server; OIDC tokens are not returned to the browser |
| Arbitrary object-key selection | Browser cannot choose bucket, key, role, RPC or S3 action; key is generated in PostgreSQL from server UUIDs and re-checked before presigning |
| Customer visibility leakage | `customer_visible` defaults false; SQL forbids true unless clean + valid + `ACCEPTED`; accept does not set visibility; at most one visible version per document; no customer evidence pages or download endpoint |
| Review replay / lost update | `record_version` on versions with a bump trigger; commands require the expected version |
| Direct table access | Grants revoked; RLS enabled with no browser policies; SECURITY DEFINER RPCs only |
| Replay of a finalised upload | After `admin_evidence_begin_v1`, the command reloads the version; a presigned POST is minted only while `PENDING_UPLOAD`. Finalised/failed versions return a conflict and do not reveal bucket, key or role |
| Ineligible evidence in a pack | Pack-item trigger requires draft pack + same case + `UPLOADED` + `NO_THREATS_FOUND` + `VALID` + `ACCEPTED`; snapshots are overwritten from the version row |
| Stale approved pack used as current | Included evidence changes mark that APPROVED pack `STALE`; STALE/SUPERSEDED packs cannot be edited or re-approved |
| Pack approval treated as submission authority | Approval copy and command success text state that payment, permission and Google submission are not confirmed; `PREPARATION` / `READY_TO_SUBMIT` remain `prerequisite` |

## Settings and privacy (Step 20)

| Threat | Mitigation |
| --- | --- |
| Extra staff accounts or role escalation | No staff tables, invitations or capability UI; singleton `admin_identity` cannot be deleted, disabled or rebound |
| Retroactive policy rewrite | Approve rejects `effective_from` before the current Europe/London day; current lookup is `[effective_from, effective_to)` |
| Secret material in settings or audit | Payload key/value secret check; audit stores operation name only |
| Privacy deletion of financial/audit evidence | Preview states retention; completion never deletes receipts, obligations or audit; holds refuse deletion |
| Unverified privacy requester | Verify requires current email already verified |
| Direct table or browser RPC access | RLS on, grants revoked, public RPCs service-role-only |

## Customer actions (Step 9A)

| Threat | Mitigation |
| --- | --- |
| Capability secret in access logs | Secret is placed in the URL fragment, exchanged immediately, then removed with `history.replaceState`. Database stores SHA-256 only |
| Guessed action ID | Exchange, OTP and commands return the same unavailable message; no enumeration of existence, owner or membership |
| Stolen or forwarded link | OTP is still required and is sent only to the current verified email bound to the action |
| Stale membership or email | OPEN actions are revoked when membership leaves `verified` or the customer email changes; ACTIVE authorisations become `REVIEW_REQUIRED` and never auto-reactivate. Eligibility is re-checked at exchange, OTP, session projection and acceptance. Changing the email back does not revive the link |
| Another customer accepting | Finish-OTP requires the Auth user email to match the action snapshot; Admin identity cannot finish a customer action |
| Admin fabricating consent | No Admin “customer accepted” command. Acceptance source is `CUSTOMER_OTP` and those fields are immutable |
| Marketing/setup consent treated as Managed authorisation | Readiness uses `authorization_records` only. Case `privacy_accepted_at` / `information_accurate_at` cannot set `caseManagementPermissionActive` |
| Session reuse across apps or actions | Distinct host-only cookies (`__Host-pr-admin` vs `__Host-pr-action`); session row bound to one action; Admin cookie ignored by Customer and the reverse |
| Lost copy-link response | Raw secret cannot be reconstructed. Admin revokes and issues a new action |
| Missing customer origin | Link issuance fails closed with 503 and does not generate a secret or write an action |
| Unattributed audit events | Customer-action and authorisation events store `actor_type`; `ADMIN`/`CUSTOMER` require `actor_id`, and `PRE_AUTH`/`SYSTEM` require a null `actor_id` |
| OTP send recorded before the provider succeeds | `OTP_REQUESTED` is written at begin; `OTP_SENT` is written only after `customer_action_confirm_otp_sent_v1` following a successful provider send. Verify requires `sent_at` |
| Silent Manager-access overwrite | Current-state evidence may change; append-only events keep the evidence actually verified at that time |
| Guided case treated as Managed | `CASE_MANAGEMENT_PERMISSION` and Manager-access commands are denied unless `service_track = MANAGED`; `authorizationReady` requires the Managed track. Leaving Managed revokes OPEN permission actions and moves ACTIVE permission to `REVIEW_REQUIRED`; those rows never auto-reactivate |
| Workflow gates enabled early | `authorizationReady` is display-only. `admin_case_command_v1` still returns `prerequisite` for `PREPARATION` and `READY_TO_SUBMIT` |
| Direct table access | RLS enabled; grants revoked from PUBLIC/anon/authenticated/service_role; privileged RPCs are `SECURITY DEFINER` with empty `search_path` and `EXECUTE` for `service_role` only |

## Google Business Profile integration readiness (Step 21)

Live Google API access is disabled, so these controls guard a boundary that is built but
inactive. More than that, the connection flow is not executable in this build at all: there
is no token exchange and no live transport, and that is a property of the code rather than
of configuration. See google-integration-readiness.md.

| Threat | Mitigation |
| --- | --- |
| Mock data reaching production or preview | `mock` is absent from the configurable mode list, the resolver has no branch that constructs it, the factory throws outside a test runtime, and an injected mock is rejected even with every gate open. All fixtures carry a `SYNTHETIC-TEST-` prefix |
| A Google request escaping the gate | Six independent conditions must all pass: provider mode `google`, API gate exactly `true`, complete https OAuth client, server-side token key, an injected live transport, and an implemented live stack in the running build. The last two have no production implementation |
| Configuration alone enabling an unfinished flow | `googleConnectionExecutionAvailable()` is a code fact, not a setting. `googleLiveStack` is `null` in this build and no environment variable, header or request field can change it, so a direct POST with every Google variable set returns 403 with `connection_not_implemented`, no authorization URL and no database call |
| Forged, replayed or expired OAuth state | 32 random bytes compared by constant-time hash; only the SHA-256 hash is stored; single use enforced by `consumed_at` and a trigger that refuses to rewrite a consumed row; ten-minute expiry |
| An abandoned attempt staying live until expiry | Every callback carrying a valid state goes through the same single-use operation, including a denial, a provider error and a redirect with no code. A missing or malformed state is refused without a database call because it names no attempt |
| Callback completed by a different session | State is bound to the initiating actor and to a one-way hash of the initiating session; a mismatch is `context_mismatch` |
| One session ending another session's attempt | Actor, session binding and exact redirect are verified before any terminal mutation, and that binding is authoritative whatever the callback carried. A failed check sets no `consumed_at`, no outcome, no rejection reason and no event, so neither a code callback nor a cancellation from the wrong context can consume, cancel or burn the attempt, and the rightful session can still finish it. Expiry is evaluated only after binding passes |
| Redirect substitution | The stored redirect URI must match exactly; the URI is read from server configuration, never from the request |
| OAuth code or token leaking | The callback never echoes the code; a thrown transport error's message is discarded; audit details carry only operation, provider and a reason from the fixed vocabulary; responses are scrubbed against both a forbidden-field list and credential-shaped value patterns before being returned |
| Arbitrary browser or provider text reaching events and audit | Cancellations are classified into four fixed values in TypeScript; PostgreSQL independently refuses anything else with `reason_not_normalised`; CHECK constraints close `rejection_reason` and `provider_connection_events.detail`; the audit writer drops an unrecognised reason; the browser cancel payload carries no reason at all |
| A grant attached across customers | `customer_id` is `NOT NULL` on both tables and a location requires a business. `provider_scope_fault_v1` proves any business has a `verified` `business_memberships` row for that customer and any location belongs to that business, at both OAuth begin and connection storage |
| Plaintext tokens at rest | AES-256-GCM in the server process; only ciphertext, IV, auth tag and key version are stored; a CHECK constraint rejects a ciphertext that still looks like an OAuth token |
| Encryption key exposure | The key is server-side only, is never written to the connection tables and is never returned by an RPC |
| Token material in an RPC response | `provider_connection_public_json_v1` omits ciphertext, IV, auth tag and key version, and the Admin command handler refuses to forward a response containing token field names |
| Token material swapped in place | A trigger makes token columns write-once and refuses to reopen a revoked connection; connection history is append-only |
| Connection identity rewritten by direct UPDATE | The same trigger covers `account_ref`, `granted_scopes`, `token_expires_at` and the customer/business/location scope. Only status, revocation, the last normalised error and `record_version` may move; a refresh gets an explicit controlled operation at live activation rather than an arbitrary UPDATE |
| A provider failure read as a healthy profile | Every normalised failure sets `manualFallback`; only `AVAILABLE` permits automation; a provider snapshot can propose only the conservative classification its availability permits and must satisfy the same rule a manual observation does |
| Automated observation bypassing Guard review | `guard_check_observations.capture_method` still accepts only `MANUAL`; no automated result can be persisted in this step |
| Live acceptance running unintentionally | Requires `GOOGLE_LIVE_ACCEPTANCE_ENABLED` exactly `true` *and* every ordinary live condition; otherwise it skips without a provider call |
| Secrets rendered in Admin | The integration surface shows fixed labels, classifications and timestamps only; no client secret, token, encrypted payload, raw provider body or environment value |
| Direct table access | RLS enabled on all three new tables with grants revoked from PUBLIC/anon/authenticated/service_role; both public RPCs are `SECURITY DEFINER` with empty `search_path`, service-role-only, and require a fresh re-authentication |

## Migration rehearsal and recovery tooling (Step 22A)

Recovery tooling is attractive to misuse precisely because it exists to touch everything.
These controls make the dangerous operations unreachable from the application rather than
merely discouraged. See migration-recovery-rehearsal.md.

| Threat | Mitigation |
| --- | --- |
| Recovery code reaching real evidence objects | The reconciliation module holds no AWS client and has no list, read, presign or delete path. An operator collects an inventory out of band and passes it in, so the application cannot be induced to touch a real object |
| A baseline migration replayed against live data | Foundation migrations are flagged in the manifest, `safeToReplay` is the literal `false` for every applied entry and cannot be set true, and the validator reports both `replay_of_applied_migration` and `foundation_treated_as_new` for such a candidate |
| An applied migration silently renamed or renumbered | The validator compares repository filenames, the manifest and remote history independently; a rename is `applied_migration_renamed` and a changed version is `version_drift` |
| Unknown remote state treated as safe | The validator fails closed: absent or malformed remote history yields `blocked`, never `clean`, and `mayApplyMigrations` returns true only for `clean` |
| Tooling repairing the chain on its own | The validator reports findings and holds no database connection. It never applies, repairs, reorders or renames |
| A secret, token or presigned URL leaking through a recovery report | `assertReportIsSafe` runs over both rendered forms and throws on presigned-URL signatures, AWS access key ids, evidence storage keys, Google tokens and client secrets, Stripe secret keys, bearer tokens, session token hash fields, email addresses and UK telephone numbers. It throws rather than redacting, so a leak is a test failure |
| Storage keys disclosed by reconciliation output | Rows carry a 16-character irreversible digest of bucket and key. The key itself never enters a report |
| Customer data entering a rehearsal | The dataset is deterministic and synthetic, marked `SYNTHETIC_REHEARSAL_DATASET_V1`, using reserved `@rehearsal.invalid` addresses, the Ofcom drama number range and a synthetic bucket. Reports carry a permanent `syntheticData` marker |
| Fingerprints disclosing customer data | A fingerprint holds counts, synthetic identifiers and SHA-256 digests of an allowlisted column set only; no plaintext value is recorded |
| An unproven recovery reported as successful | `DATABASE_ONLY`, `OBJECT_ONLY`, `METADATA_MISMATCH` and `CHECKSUM_MISMATCH` all block, and so does an inventory that could not be collected: not knowing is never a pass. A size and content-type match is reported as `checksum_unavailable` and `byteIntegrityProven: false`, not as proven integrity. A version whose upload never finished is counted separately and cannot contribute to a recovered total |
| A correctly executed rehearsal mistaken for a verified recovery | Execution and verification are separate typed statuses. `recoveryVerification` is derived once in `deriveRecoveryVerification` from facts the domain modules expose, appears explicitly in both rendered forms, and reaches `VERIFIED` only when every in-scope domain came back clean |
| Nested evidence silently dropped from the machine-readable report | JSON is produced by a deep stable transform rather than a `JSON.stringify` replacer array, which applies at every depth and would omit nested keys. Round-trip tests assert that check, fingerprint, storage, pack, job and signoff fields all survive |
| A prepared pack quietly rebound to newer evidence | Pack validation compares the pinned version and its metadata snapshot. `DOCUMENT_REBOUND` and `VERSION_MISSING` are failures; there is no repair path that repoints an item |
| A restored queue repeating a provider effect | Completed work is protected by its idempotency key, dead letters are retained, gates are reported rather than changed, and `blindReplayPermitted` is the literal `false`, so no bulk replay path exists |
| A second Admin identity created during recovery | `admin_identity` remains a singleton with the Step 20 protection trigger. Recovery adds no staff account, no invitation and no backup Owner |
| Session material surviving into a report | Sessions are expected to require reauthentication after a restore; a `token_hash` field in a rendered report is rejected outright |
| A rehearsal timing becoming a production promise | Reports state that measurements are synthetic and not an approved target, and signoff is always `approvedBy: null` |

Related controls from earlier steps remain in force: exact-origin CSRF, opaque Admin session cookies, hashed token RPCs, revoked anon/authenticated table grants, append-only Admin audit, no localStorage/sessionStorage for evidence, action secrets or auth state.

## End-to-end acceptance and security review (Step 23)

Step 23 added no new attack surface. It tested the surface the earlier steps built, which
means the entries below are controls that were asserted rather than assumed — each one now
fails a test if it regresses — together with the defects the testing actually found. See
step23-acceptance-security.md.

| Threat | Mitigation |
| --- | --- |
| An action taken on one record applied to another | Found and fixed: a quote acceptance action could be revoked through the wrong quote. The action is now scoped to its own quote in SQL, and the full-chain regression asserts the scoping. Every other command was exercised with a second actor's identifier and refused |
| A forward fix reinstating a control a later migration replaced | Step 15 moved the Step 13 quote command into `admin_private.admin_quote_command_core_v1` and put a Guard-aware wrapper at the old public name, so `record_qualification` is proved against real coverage instead of the request payload. The Step 23 migration patches the private core and does not mention the public wrapper. `quote-surface-fixes.database.test.ts` runs the complete chain and fails if the wrapper stops naming the core or the Guard-linked path, if the core becomes callable by any role, or if a spoofed `PAID`/`ACTIVE` payload stops returning `denied` |
| A discount qualified by caller-supplied strings | Two independent layers. `admin_private.record_guard_linked_qualification_v1` denies the request unless `admin_private.paid_guard_discount_ready_v1` finds an ACTIVE `DIRECT_GUARD` coverage at that location, activated before the issue was observed, with `CURRENT` provider billing paid into the future. Independently, a `BEFORE INSERT` trigger on `quote_discount_snapshots` runs the same check, so a qualified snapshot cannot be written even if a future change weakens the command path |
| A privileged routine reachable without the service role | Asserted across the whole schema rather than per migration: every public admin RPC is granted to `service_role` and no other, `admin_private` denies USAGE to `anon` and `authenticated`, and a real call from either role is refused with `permission denied`. The one function granted to nobody, `public.admin_identity_id_v1()`, is called only from inside other definer functions |
| A function resolving an object through an attacker-controlled schema | Every function in the chain pins `search_path`, asserted as a whole-schema check rather than a per-function review. The legacy `public.set_case_public_ref` is created by no migration here; Step 1 created the hardened `public.cases_assign_public_ref` in its place, and a test asserts a rebuilt project inherits neither legacy helper |
| A table added later without row-level security | Every table the chain creates has RLS enabled, asserted after the whole chain applies, so a table added without it fails rather than waiting for an advisor to notice |
| A mutation accepted from another origin | Every POST route either delegates to a module performing the exact-origin comparison or is a signature-verified provider webhook, proved by a sweep over the route files on disk. A new POST route added without either fails the sweep. The cron path is authorised by a constant-time secret comparison |
| A server secret reaching the browser bundle | No client component imports an auth, config or `server-only` module or reads `process.env`, and no `NEXT_PUBLIC_` variable exists anywhere in the workspace. Every module that reaches Supabase is `server-only`. All three are proved by a sweep over the component files rather than by review |
| An internal identifier disclosed by a response | Found and fixed: the evidence upload response repeated the storage key the client had already been given no reason to hold. Responses now carry the identifier the caller needs and nothing more |
| A database fault surfaced to the operator as a failure page | Found and fixed in two places: a mistyped case reference and a malformed Guard check identifier both reached SQL as invalid input and produced a failure page carrying a database message. Both are now field-level refusals, so a typo no longer looks like an outage or leaks a database string |
| An error page disclosing the error | The error boundary deliberately ignores the error it is given, so no message, digest or parameter value reaches the screen or the DOM, and a test pins that it stays that way |
| Script or style injected into the higher-value workspace | Found and fixed: Admin served a weaker content policy than the customer app — no `default-src`, `script-src`, `connect-src` or `img-src`. Both apps now serve the same strict policy, the only cross-origin destination being the presigned evidence upload to S3. A test asserts the two policies are identical and the smoke script asserts the served header on every route |
| A known vulnerability shipped in a dependency | Found and fixed: a critical remote-code-execution advisory against the installed Next.js affecting `next/og`, which the marketing site does use, and a high-severity denial-of-service advisory in a transitive development dependency. Both closed by a lockfile-only update inside the existing ranges, with no `package.json` change |
| An operator misreading a recovery or job state as healthy | The jobs surface reports `PARTIALLY_VERIFIED` and `BLOCKED` as the states they are rather than as success, and offers no blind replay. Asserted as part of the acceptance matrix |
| A refusal that only a sighted operator can perceive | Found and fixed: the conversations form never announced its outcome. Every client form that reports in place now keeps a persistent `role="status"` region, proved by a sweep rather than page by page |
| An action whose accessible name does not say what it would change | Found and fixed: repeated row actions on the incidents, complaints and template pages all announced the same name, so a screen-reader user could approve the wrong record. Each is now qualified by the record it acts on, and the page tests assert the accessible name rather than the visible text |
| A control reachable by mouse but not by keyboard | Found and fixed: one scrollable table had no tab stop, so its overflowing columns were unreachable without a mouse. Every `table-scroll` container is now a labelled region with a tab stop, proved by a sweep over the whole tree |
| A page added later without its security and accessibility properties | The acceptance matrix is checked against the routes present on disk, and the heading, label, live-region, landmark and keyboard sweeps walk the tree. A page added without a matrix row, a heading, a labelled control or a keyboard-reachable table fails rather than shipping |
| A provider effect enabled by supplying its credentials | Every live capability needs an explicit enable flag in addition to its credentials, and `apps/admin/lib/release/gates.test.ts` drives an environment carrying every credential with no flag set and asserts nothing turns on. Credentials alone are never sufficient |
| A near-miss value read as consent | The gates accept exactly `true`. `1`, `yes`, `on`, `TRUE`, `True` and `true ` are all driven through every enable flag and all leave every gate closed, so a typo in a Vercel setting cannot start sending mail or taking payments |
| A preview deployment producing a customer-facing effect | Outgoing mail, inbound mail, evidence storage, the job worker and marketing indexing all additionally require `VERCEL_ENV` to be exactly `production`, asserted with every flag set on a preview deployment |
| A capability activated as a side effect of another | Each capability is activated in its own change with its own prerequisite, test, verification and rollback. Outgoing mail activation does not enable inbound mail, and the three Guard automation flags are three switches; both are asserted |
| A live provider key used because it was configured | `stripeSecret()` accepts only `sk_test_` and `rk_test_` prefixes and no provider-mode value selects live Stripe, so a live key disables payments rather than moving money. Activating live Stripe is a reviewed code change, not a setting |
| A configuration change standing in for a code review | `googleLiveStack` is `null`, so a deployment with every Google variable set still cannot begin an OAuth flow. The same shape protects Stripe. Where a capability could reach customers or money, opening it requires code someone has to write and review |
| A new configuration read shipping unclassified | The environment contract is re-derived from the repository on every test run, across dotted access, bracket access, destructuring and the injectable `EnvMap` the gates use. A `process.env` read with no contract entry fails, and a contract entry nothing reads fails too |
| A credential pasted into a release artifact | The readiness model has no field a value could live in, and a credential-shape scan runs over the release modules, the cutover document and the operator SQL. Findings report the pattern and the line and never the matched text, so the scanner cannot leak what it caught |
| An operator-run script changing the database it was meant to inspect | SQL under `docs/admin/operator-sql` returns rows and nothing else. It is imported by no application code, wired into no build, start, test or deploy path, and the removal statement it prints carries no `CASCADE`, so a dependency fails the drop instead of being swept away |
| Losing the one Admin identity | There is exactly one Admin identity and the database refuses to delete, disable or rebind it, so recovery is recovery of the `admin@profilerelaunch.com` mailbox. That is recorded as a readiness item and an Owner decision rather than engineered around, because a second identity created under incident pressure is the larger risk |
