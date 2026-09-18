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

## Customer actions (Step 9A)

| Threat | Mitigation |
| --- | --- |
| Capability secret in access logs | Secret is placed in the URL fragment, exchanged immediately, then removed with `history.replaceState`. Database stores SHA-256 only |
| Guessed action ID | Exchange, OTP and commands return the same unavailable message; no enumeration of existence, owner or membership |
| Stolen or forwarded link | OTP is still required and is sent only to the current verified email bound to the action |
| Stale membership or email | OPEN actions are revoked when membership leaves `verified` or the customer email changes; eligibility is re-checked at exchange, OTP and acceptance. Changing the email back does not revive the link |
| Another customer accepting | Finish-OTP requires the Auth user email to match the action snapshot; Admin identity cannot finish a customer action |
| Admin fabricating consent | No Admin “customer accepted” command. Acceptance source is `CUSTOMER_OTP` and those fields are immutable |
| Marketing/setup consent treated as Managed authorisation | Readiness uses `authorization_records` only. Case `privacy_accepted_at` / `information_accurate_at` cannot set `caseManagementPermissionActive` |
| Session reuse across apps or actions | Distinct host-only cookies (`__Host-pr-admin` vs `__Host-pr-action`); session row bound to one action; Admin cookie ignored by Customer and the reverse |
| Lost copy-link response | Raw secret cannot be reconstructed. Admin revokes and issues a new action |
| Workflow gates enabled early | `authorizationReady` is display-only. `admin_case_command_v1` still returns `prerequisite` for `PREPARATION` and `READY_TO_SUBMIT` |
| Direct table access | RLS enabled; grants revoked from PUBLIC/anon/authenticated/service_role; privileged RPCs are `SECURITY DEFINER` with empty `search_path` and `EXECUTE` for `service_role` only |

Related controls from earlier steps remain in force: exact-origin CSRF, opaque Admin session cookies, hashed token RPCs, revoked anon/authenticated table grants, append-only Admin audit, no localStorage/sessionStorage for evidence, action secrets or auth state.
