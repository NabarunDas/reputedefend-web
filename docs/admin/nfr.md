# Admin non-functional requirements — evidence (Step 8A)

Recorded from the implemented foundation. These are not customer-facing promises.

| Requirement | Implemented value |
| --- | --- |
| Maximum file size | 10 MB = 10,485,760 bytes |
| Allowed types | PDF, JPEG (`.jpg`/`.jpeg`), PNG, WebP, DOCX |
| Allowed MIME types | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Upload URL lifetime | Presigned POST expiry ≤ 5 minutes (300 seconds) |
| Storage visibility | Private S3; Block Public Access; no public ACL/policy in application code |
| Malware scan prerequisite | Content validation and later byte retrieval require `GuardDutyMalwareScanStatus = NO_THREATS_FOUND` |
| Encryption | Existing bucket SSE-S3; application does not disable or replace it |
| Data region | `AWS_REGION` (configured `eu-west-2`); not hardcoded in application logic |
| AWS credentials | Vercel OIDC short-lived credentials via `@vercel/oidc-aws-credentials-provider`; no permanent access keys |
| Browser transit | Direct browser → S3 POST; Admin runtime does not proxy the file |
