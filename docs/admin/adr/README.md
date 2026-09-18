# Admin architecture decision records

This folder is the Admin ADR register. No ADR convention existed in the repository before Step 8A; new decisions use numbered Markdown files in this directory.

| ID | Title | Status |
| --- | --- | --- |
| [0001](0001-s3-guardduty-evidence-storage.md) | Use private AWS S3 + GuardDuty Malware Protection for evidence bytes, with Supabase PostgreSQL storing metadata/workflow | Accepted |
| [0003](0003-prepared-packs-immutable-manifests.md) | Prepared packs are immutable manifests of exact accepted evidence versions rather than generated ZIP/PDF bundles | Accepted |
