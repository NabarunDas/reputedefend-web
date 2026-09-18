# ADR 0002: Short-lived S3 presigned GET for Admin evidence View/Download

Status: Accepted  
Date: 2026-09-18  
Step: 8B

## Decision

Issue short-lived, server-minted S3 presigned GET URLs for Admin evidence preview and download. Do not proxy evidence bytes through Vercel.

## Context

Step 8A stores bytes in a private S3 bucket and metadata in PostgreSQL. Step 8B needs Admin View (PDF/images, inline) and Download (including DOCX, attachment) after a clean GuardDuty scan and valid content. Vercel serverless request/response limits, cost and the existing clean-only IAM condition make an application-layer byte proxy the wrong default. Direct S3 GET already works for post-scan validation on the server; the Admin browser can use the same object with a tightly scoped URL.

## Alternatives considered

1. **Proxy GetObject through the Admin Next.js route.**  
   Rejected: a 10 MB file would transit Vercel on every preview/download, increasing cost, latency and timeout risk, and would concentrate malware-adjacent bytes on the application runtime after the scan. The existing architecture already forbids upload proxying.

2. **Permanent or long-lived signed URLs stored on the version row.**  
   Rejected: a persisted URL is a durable secret. Logs, audit JSON, support exports and database backups would retain download capability after review changes or session expiry.

3. **Third-party preview (Google Docs Viewer, Microsoft Office Viewer, other).**  
   Rejected: evidence would leave the private bucket and the Admin origin. DOCX preview is therefore download-only in this step.

## Consequences — security

- The browser never chooses bucket, key, role, OIDC token or S3 action. The server reads those from the authorised version row.
- A URL is minted only after: live Admin session, case/version relationship, configured-bucket match, `UPLOADED` + `NO_THREATS_FOUND` + `VALID` in the database, **and** a live GuardDuty tag re-check of `NO_THREATS_FOUND`.
- Expiry is at most 60 seconds (`X-Amz-Expires`). That bounds the window if a URL leaks via Referer, history, screenshot or shoulder-surfing.
- URLs are returned in the HTTP response only. They are not written to `case_document_events`, `admin_audit_events`, command receipts or application logs. Events record `ACCESS_VIEWED` / `ACCESS_DOWNLOADED` with content type only.
- Content-Disposition is built with an RFC-safe helper that refuses CR/LF/control characters, so original filenames cannot inject headers.
- DOCX View is rejected in SQL and in the command layer even if a caller posts `operation: "view"` manually.
- URL leakage risk remains for up to 60 seconds with the object key in the signed query. Mitigation: opaque UUID keys, private bucket, short expiry, no persistence, `noopener` new-tab open, no third-party viewers.

## Consequences — cost and traffic

- Preview/download traffic is billed as S3 GET from the client, not as Vercel bandwidth or serverless duration for 10 MB payloads.
- Each View/Download still performs GetObjectTagging (live re-check) plus `getSignedUrl` (no data plane GetObject on Vercel).

## Why DOCX is download-only

There is no first-party in-browser Word renderer in this app. Sending DOCX to an external viewer would disclose private evidence. Download with attachment disposition is the supported path when the file is clean and valid.

## Reversibility

The command can later switch `createReadUrl` to a same-origin streaming proxy without changing metadata tables, provided the same session, bucket, scan and live-tag gates remain. Presigned GET can also be shortened further or bound with additional response headers. Persisting URLs would not be a compatible rollback; it is forbidden. Step 8C pack assembly can keep using server-side GetObject after the same gates if a pack must be built inside the runtime.

## Related

- [ADR 0001](0001-s3-guardduty-evidence-storage.md) — private S3 + GuardDuty for bytes.
