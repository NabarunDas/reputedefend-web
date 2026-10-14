# Evidence SHA-256 integrity

SEC-08 lets a trusted server compare evidence bytes in private S3 with SHA-256 metadata in `public.case_document_versions`. Phase 1 `20261014170000_evidence_content_sha256_v1` is applied to DEV (`rmzozuiamjcclvtgutgd`) and Production (`cxwwekdzkkjjbiyofrov`). AWS `ApprovedMigrationHead` is updated to the same head. Genuine scheduled new-head backup `20261014T213909Z` passed migration-alignment, S3 manifest, completed marker and archive SHA-256 validation. The SQL file header still says the migration is source-only because an applied migration file is not edited.

## What is trusted

The Admin server computes SHA-256 from the bytes returned by `GetObject`, and only after the live GuardDuty tag is `NO_THREATS_FOUND`, the byte length equals `declared_size_bytes`, and the existing magic-byte check passes. The read stops at 10,485,760 bytes. A larger object is not hashed. `public.evidence_content_sha256_v1` then stores that digest if the row has none.

A browser digest is rejected. An S3 entity tag is not a SHA-256 of the object. Customer upload and Customer finalize do not hash the file. Admin finalize only checks that the object tag can be read.

A refresh that is no longer clean, valid and accepted clears `customer_visible` in the same update that records the new scan and validation. That keeps the customer-visibility check from aborting the invalidation. The existing pack triggers then unpublish an approved pack that includes the version and mark it `STALE`. A repeated clean `VALID` refresh of an accepted visible file leaves visibility as it is.

## Two-phase rollout

This pull request is phase 1 only. Phase 1 is applied canonically to DEV and Production; AWS `ApprovedMigrationHead` was updated after verifying a prior-head scheduled backup. A genuine scheduled new-head backup has also passed, permitting the reviewed Admin application release.

Phase 1 adds the digest columns, the record and page functions, the immutable-digest trigger, and the visibility withdrawal inside `admin_evidence_refresh_scan_v1`. It does not reject `VALID` when `content_sha256` is null. The Admin build that was already on DEV can still refresh a clean uploaded file to `VALID` without writing a digest. An accepted visible file stays visible across that refresh. A failed scan or an `INVALID` or `ERROR` result still clears customer visibility in the same update.

The new Admin application computes SHA-256 from the scanned bytes and records it before it asks for `VALID`. Deploy it only to a database that already has this migration. Both DEV and Production have the migration before the new Admin deploys; the database RPC is now present in both. A mismatch is `INVALID` and does not replace the stored digest. A legacy `VALID` row with a null digest stays valid, so packs and downloads do not become stale only because the hash is missing.

The DEV apply did not mutate evidence rows. DEV still has 4 uploaded versions, 2 of them customer-visible, and 0 trusted hashes. Fingerprint `0667159d6c6f80af4cc00d36ca306389` was unchanged. Do not treat those existing files as byte-proven, and do not rewrite them to create a hash.

Phase 2 is a later reviewed migration. It may reject a new `VALID` refresh when the digest is null. Write it only after DEV and Production are both running the new Admin, the backfill has been reviewed, and the overlap between the old Admin and the new database is finished. Do not add that enforcement migration now.

The three digest columns are all null or all present. A digest with a null byte length is rejected. The byte length must equal `declared_size_bytes`. The migration adds nullable columns and does not update existing rows. Rollback of an applied phase 1 is a later reviewed migration. Do not edit the applied SQL file.

Production SEC-08 migration followed accepted prior-head backup `20261014T153911Z`. CloudFormation subsequently aligned `ApprovedMigrationHead` to `20261014170000_evidence_content_sha256_v1` without replacing backup resources, preserving the ENABLED three-hour scheduler. Genuine scheduled new-head backup `20261014T213909Z` was accepted after manifest, source/migration alignment, completed marker and archive SHA-256 verification. Phase 2 mandatory digest enforcement is not included.

## Backfill

`scripts/evidence-sha256.mjs` is run by an operator. It is not a cron and it is not part of CI.

```
node --experimental-strip-types scripts/evidence-sha256.mjs --mode check
node --experimental-strip-types scripts/evidence-sha256.mjs --mode apply --limit 50
node --experimental-strip-types scripts/evidence-sha256.mjs --mode apply --after <version-id>
```

`check` is the default. It writes nothing and lists every `UPLOADED` version. `apply` records a digest only where none is stored, only for a clean scan, and only when `AWS_EVIDENCE_BUCKET` is the DEV bucket, `VERCEL_ENV` is not `production`, and `SUPABASE_URL` is not the Production project. A second apply reports `already_trusted` and does not change `content_sha256_verified_at`. `apply` cannot name a recovery bucket.

`--after` is the last completed version id. Use it to resume an interrupted run. Exit 1 means a failed object. Exit 3 means the run was limited, resumed, or did not cover every uploaded row, and there was no harder failure. Exit 2 means the command was refused. Exit 0 for `check` can include `would_record`: that is a preview, not a failure. Exit 0 for `apply` means the clean rows that still had no digest were recorded or already trusted. It is not a restore proof.

## Restore verification

After metadata is restored, run the same script in `restore` mode. `restore` is read-only, including for Production. It lists every `UPLOADED` version. `PENDING_UPLOAD` and `FAILED` are counted and omitted, because they have no accepted object. A stored scan other than `NO_THREATS_FOUND` is `not_clean` and is not fetched. A clean row is fetched only when the live tag is also `NO_THREATS_FOUND`.

```
node --experimental-strip-types scripts/evidence-sha256.mjs --mode restore
node --experimental-strip-types scripts/evidence-sha256.mjs --mode restore --recovery-bucket profilerelaunch-evidence-prod-recovery-example
```

| Outcome | Meaning |
| --- | --- |
| `match` | Recovered bytes match the recorded SHA-256 and the declared size |
| `mismatch` | The object is present and its bytes differ from the recorded digest |
| `missing` | The object is not in the bucket |
| `size_mismatch` | The object length differs from `declared_size_bytes` |
| `unverified` | The object is present and clean, and no digest has been recorded yet |
| `unreadable` | The object could not be read, including an access denial |
| `not_clean` | The stored scan or the live GuardDuty tag is not `NO_THREATS_FOUND`, so the bytes were not read |
| `bucket_mismatch` | The row names a bucket other than the metadata bucket, so the object was not read |
| `oversize` | The object is larger than 10,485,760 bytes, so it was not hashed |
| `would_record` | `check` found clean bytes and a null digest. Nothing was written |

`restore` exits 0 only when the walk started at the beginning, finished, and every uploaded row is `match`, or when there are no uploaded rows. `unverified` exits 1. A `--limit` or `--after` run exits 3 when it has no harder failure, so a tail cannot look like a full restore. `byteIntegrityProven` is true only when every finding in that run is `match`, `already_trusted` or `recorded`. An empty run is exit 0 and `byteIntegrityProven: false`: there was nothing to prove.

The summary includes `expectedUploaded`, `covered`, `coverageComplete`, and the excluded pending and failed counts. The output is version id, outcome and sizes. It does not include filenames, object keys, digests or file bytes. The existing recovery report treats a null checksum the same way: `checksum_unavailable` and `byteIntegrityProven: false`.

### Recovery bucket

`--recovery-bucket` is a read target for `check` and `restore`. `AWS_EVIDENCE_BUCKET` stays the canonical metadata bucket. Rows whose `storage_bucket` is not that metadata bucket stay `bucket_mismatch` and are not read.

The recovery name has to be a separate bucket for the same environment:

- DEV metadata `profilerelaunch-evidence-dev-01` allows `profilerelaunch-evidence-dev-recovery-` plus 1–24 lowercase letters, digits or hyphens.
- Production metadata `profilerelaunch-evidence-prod-euw2-337909767363` allows `profilerelaunch-evidence-prod-recovery-` plus the same suffix.
- The live DEV and Production bucket names are rejected.

S3 `GetObject` and `GetObjectTagging` use the recovery bucket, never the row’s bucket, when the flag is set.

This role cannot read that bucket yet. `infra/aws/prod-evidence.yaml` grants the Admin evidence role `s3:GetObject` and `s3:GetObjectTagging` only on `${EvidenceBucket.Arn}/cases/*`. A distinct recovery bucket returns `AccessDenied` until a reviewed IAM change grants exactly those two actions on `arn:aws:s3:::<recovery-bucket>/cases/*`. Do not add `PutObject`, `DeleteObject`, `ListBucket`, or a broader prefix. Do not change the trust policy, versioning, Object Lock, CORS, or retention. This pull request does not apply that change.

## Credentials

The script refuses `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`.

By default it assumes `AWS_EVIDENCE_ROLE_ARN` with Vercel OIDC. The Production role `ProfileRelaunchProdAdminEvidence` trusts `oidc.vercel.com/clientcove:sub` equal to `owner:clientcove:project:<Admin project>:environment:production`. A local Vercel OIDC token is `environment:development` and cannot assume that role. This pull request does not change that trust.

The alternative is a web-identity token file. Set `AWS_WEB_IDENTITY_TOKEN_FILE` and `AWS_ROLE_ARN`, and `AWS_ROLE_ARN` must equal `AWS_EVIDENCE_ROLE_ARN`. The script then uses `fromWebToken`. A token for any other role is refused.

## What this does not guarantee

A presigned POST does not deny overwrite and does not bind a checksum. Until it expires, it can replace the object. After that, any principal with `s3:PutObject` on `cases/*` can replace the latest object. Production versioning may keep older versions, but this application does not store an S3 VersionId and reads the latest object. Verification detects a replacement on the next hash comparison. It does not prevent one.

View and Download still use a short-lived presigned GET. They do not download the object through Vercel to hash it again. A replacement made after the digest was stored remains downloadable until a refresh or a restore check marks it invalid.

The `service_role` key can call the record function. That is the existing server trust boundary. The browser cannot.

## Cost and AWS

Each clean candidate costs one `GetObjectTagging` and, when the live tag is clean, one `GetObject` of at most 10 MB. A stored scan that is not clean costs no S3 call. `apply` reads only clean rows with no digest. `check` and `restore` account for every uploaded row. There is no new bucket, index, background worker, or stored copy of the file.

No IAM change is required for the canonical evidence bucket when the Admin evidence role used for validation already allows `s3:GetObject` and `s3:GetObjectTagging` on `cases/*`. A separate recovery bucket needs the grant described above, and this change does not apply it. The Customer role is not used.
