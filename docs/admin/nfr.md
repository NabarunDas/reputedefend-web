# Admin non-functional requirements — evidence (Steps 8A, 8B and 8C)

Recorded from the implemented foundation and workspace. These are not customer-facing promises.

| Requirement | Implemented value |
| --- | --- |
| Maximum file size | 10 MB = 10,485,760 bytes |
| Allowed types | PDF, JPEG (`.jpg`/`.jpeg`), PNG, WebP, DOCX |
| Allowed MIME types | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Previewable types | PDF, JPEG, PNG, WebP. DOCX View disabled; DOCX Download allowed when clean + valid |
| Upload URL lifetime | Presigned POST expiry ≤ 5 minutes (300 seconds) |
| Read URL lifetime | Presigned GET expiry ≤ 60 seconds |
| Read transport | Direct browser → S3 GET; Admin runtime does not proxy file bytes |
| Storage visibility | Private S3; Block Public Access; no public ACL/policy in application code |
| Malware scan prerequisite | Content validation and View/Download require `GuardDutyMalwareScanStatus = NO_THREATS_FOUND` in the database **and** a live tag re-check |
| Encryption | Existing bucket SSE-S3; application does not disable or replace it |
| Data region | `AWS_REGION` (configured `eu-west-2`); not hardcoded in application logic |
| AWS credentials | Vercel OIDC short-lived credentials via `@vercel/oidc-aws-credentials-provider`; no permanent access keys |
| Browser transit (upload) | Direct browser → S3 POST; Admin runtime does not proxy the file |
| Queue page size | Maximum 50 rows plus one look-ahead row for pagination |
| Customer publication | Visibility flag only; no customer portal or download route in this step |
| Prepared pack | Metadata manifest of exact version IDs; no ZIP/PDF bundle or extra S3 object |
| Historical packs returned | Latest 20 packs per case |
| Pack approval meaning | Selected evidence versions only; not payment, permission or Google submission |
