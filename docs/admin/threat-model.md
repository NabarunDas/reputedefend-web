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
| One session ending another session's attempt | Actor, session binding, exact redirect and expiry are verified before anything is written. A mismatched cancellation is refused with the row untouched; only a mismatched code callback is burnt, because a mismatched exchange attempt should not survive |
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

Related controls from earlier steps remain in force: exact-origin CSRF, opaque Admin session cookies, hashed token RPCs, revoked anon/authenticated table grants, append-only Admin audit, no localStorage/sessionStorage for evidence, action secrets or auth state.
