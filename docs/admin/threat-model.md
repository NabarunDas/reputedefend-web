# Admin threat model — evidence foundation

This extends the Admin security model for Step 8A uploads. Mitigations listed here are implemented unless marked as later work.

| Threat | Mitigation |
| --- | --- |
| Malicious upload | Private bucket, Block Public Access, GuardDuty Malware Protection, clean-only GetObject IAM, no customer visibility by default |
| Extension / MIME spoofing | Allowlist on last extension and declared MIME at begin; post-scan magic-byte / DOCX structure checks; mismatch → `INVALID` |
| Malware before scan | GetObject/HeadObject are not used at finalize; only GetObjectTagging; bytes are read only after `NO_THREATS_FOUND` |
| Cross-case IDOR | Version lookup requires the live Admin session and matching `case_id`; wrong case or guessed UUID returns `missing` without metadata |
| Forged scan status | Application never writes GuardDuty tags; IAM prevents the Admin role from modifying malware tags; unknown tags map to `FAILED`; `VALID` is constrained to a clean scan |
| Leaked presigned upload | Exact key, exact Content-Type, 1..10 MB range, ≤5 minute expiry; object key is an unguessable UUID path; finalize still requires the Admin session |
| Oversized upload | JSON size rejected above 10 MB; presigned POST `content-length-range` max 10,485,760; DB check on `declared_size_bytes` |
| Malicious DOCX / ZIP | `.zip` and other archives rejected as uploads; DOCX must be a ZIP that contains `[Content_Types].xml` and `word/document.xml`; decompression is bounded and uses `fflate`, not a hand-rolled parser |
| AWS credential leakage | No static keys; fail closed if `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are set; OIDC short-lived credentials stay on the server; OIDC tokens are not returned to the browser |
| Arbitrary object-key selection | Browser cannot choose bucket, key, role, RPC or S3 action; key is generated in PostgreSQL from server UUIDs and re-checked before presigning |
| Customer visibility leakage | `customer_visible` defaults false; SQL forbids true unless clean + valid + `ACCEPTED`; Step 8A commands never set visibility or review; no customer evidence pages |

Related controls from earlier steps remain in force: exact-origin CSRF, opaque Admin session cookies, hashed token RPCs, revoked anon/authenticated table grants, and append-only Admin audit.
