# Database and storage restore runbook (Step 22A)

Status: **PROCEDURE WRITTEN / NOT YET REHEARSED LIVE**

This is the written procedure for recovering ProfileRelaunch. It has not been executed
against a live Supabase project or a real AWS bucket. Step 22A produced the procedure and
the local rehearsal evidence behind it; Step 22B executes it for real. See
migration-recovery-rehearsal.md for the tooling and recovery-incident-communications.md
for the internal messages.

## The one thing to understand first

**A Supabase backup does not restore evidence files.** The database holds metadata in
`case_document_versions`: bucket, storage key, declared size, content type, upload, scan
and validation status. The bytes live in a private AWS S3 bucket that Supabase has no
knowledge of and no access to.

Database and object storage are two separate recovery streams with separate tooling,
separate retention and separate failure modes. A restored database can reference objects
that no longer exist, and surviving objects can have no database row pointing at them.
Every restore therefore ends in reconciliation, never in "the backup came back, we are
done".

## Three things a report can mean, and only one of them is "recovered"

Keep these apart when reading any recovery evidence report, and when writing one.

- **Rehearsal execution** is whether the exercise itself ran correctly. A failure-injection
  rehearsal that correctly detects a missing object executed perfectly.
- **Recovered-state verification** is whether the restored data is actually usable:
  `VERIFIED`, `PARTIALLY_VERIFIED`, `BLOCKED` or `NOT_APPLICABLE`. A rehearsal can execute
  perfectly and report `BLOCKED`; that is a correct result, not a contradiction.
- **Structural object match** means bucket, key, size and content type agree. It is not
  byte-level verification. The schema stores no content hash, so today every real restore
  tops out at a structural match and cannot reach `VERIFIED` where byte integrity matters.

An unresolved recovery blocker — a blocking object outcome, an inventory that could not be
collected, a non-recoverable prepared pack, a queue awaiting provider reconciliation — is
a different thing again from a documented future Owner decision such as an unapproved RTO.
The first stops the recovery; the second does not.

## Never

- Never replay a baseline `CREATE TABLE` migration against a database that already has
  data. The five foundation migrations are flagged in the manifest for exactly this
  reason, and `safeToReplay` cannot be set true for any applied migration.
- Never modify, rename or renumber an already-applied migration file. Remote history
  records a version and a name; changing either makes the chain unverifiable.
- Never restore over a live project to "see if it works". Restore to a new or throwaway
  project and compare.
- Never resume workers or Cron before the queue has been reconciled. Resuming first is
  what turns a recoverable incident into a duplicated one.
- Never re-open a provider gate as part of a restore. Gates are re-opened deliberately,
  one at a time, after reconciliation.
- Never bulk-replay jobs after a restore. There is no such path in the tooling.
- Never clear dead letters as part of recovery. They are history and a pending decision.
- Never repoint a prepared pack item at a newer version because its pinned version is
  missing. A pack whose evidence is gone is non-recoverable, and that is the correct
  answer.
- Never copy a session token, a token hash, a presigned URL, a storage key or customer
  personal data into a recovery report or an incident ticket.
- Never delete S3 objects during recovery. No role used for recovery should carry
  `DeleteObject`.
- Never treat a size-and-content-type match as proof the bytes are intact. The schema
  stores no content hash.
- Never treat an inventory you could not collect as a clean result. Not knowing whether
  the objects are there is a blocker, not a pass.
- Never let an upload that never finished count towards a recovered total, and never
  retry one automatically. Each needs an operator decision.

## Before any restore

Complete all of these and record the answers. A restore started without them cannot be
verified afterwards.

1. **Freeze writes.** Stop Admin and Customer write traffic. Record the freeze time; it is
   the boundary for any data-loss assessment.
2. **Stop the workers.** Confirm no worker is running and no job holds a live lease.
3. **Disable Cron.** The daily `0 4 * * *` schedule must not fire into a half-recovered
   system.
4. **Record the outbox and queue state.** Capture counts of pending, running, retrying,
   succeeded and dead-lettered jobs, and promoted versus unpromoted outbox entries,
   before anything changes. This is the baseline for reconciliation.
5. **Record provider gate state.** Write down every gate exactly as it stands. The restore
   must not change any of them, and you need the original values to prove it did not.
6. **Record auth state.** Confirm whether the restore scope includes `auth.users`. If it
   does not, the Admin identity's `auth_user_id` will point at a user that does not exist
   in the restored project.
7. **Capture the migration history.** Export the remote migration-history rows and run
   them through `validateMigrationHistory` against the repository and the manifest. Do not
   proceed with a status other than `clean` unless the divergence is the incident itself
   and is understood.
8. **Fingerprint what you have.** Capture a fingerprint of the current database, however
   damaged. You cannot show what a restore recovered without knowing what preceded it.
9. **Confirm the S3 position separately.** Establish whether evidence objects are intact,
   partially lost or unknown. This is a different question from the database state and has
   a different answer.
10. **Decide the scenario.** Pick A, B, C, D or E below before touching anything. Changing
    scenario mid-restore is how two incidents become three.

## Scenario A — Schema rebuild for an empty environment

Use when there is no data to preserve: a new project, a preview environment, a local
instance or a throwaway restore target.

Create the Supabase platform objects the migrations assume but do not create: the `anon`,
`authenticated` and `service_role` roles, the `auth` schema and `auth.users`, and the
`pgcrypto` extension in `extensions`. Then apply all 26 migrations in exact manifest
order, with no cherry-picking and no reordering. Verify each migration's manifest probe,
confirm the migration head is `20261001175315`, and confirm RLS is enabled on public
tables with direct grants revoked.

This is the only scenario in which foundation migrations are ever applied. It is rehearsed
continuously by `rehearsal.database.test.ts`.

## Scenario B — Logical backup restore

Use when a logical dump of the database is the source of truth and the target is empty.

Restore into a new project built by Scenario A, or let the dump create the schema — but
not both. For a managed-Supabase-to-managed-Supabase restore, preserve the fresh target
project's Supabase-managed database roles instead of replaying protected platform role
settings from `roles.sql`. Before doing that, confirm the application defines no custom
database roles; if it does, stop and restore those roles explicitly rather than silently
dropping them.

Also apply the production Data API default-privilege hardening **before** recreating
application tables, functions and sequences. A fresh Supabase project can otherwise grant
`anon` and `authenticated` direct privileges while the restored migration history still
looks correct. The restore must fail closed unless no public base table grants direct CRUD
to those roles and no unexpected `SECURITY DEFINER` RPC is executable by them.
A green structural restore is not accepted as recovered until these privilege-parity checks pass.

Then confirm the migration history matches the manifest, reconcile evidence objects against
the restored metadata, validate prepared packs, reconcile the job queue, and compare the
restored fingerprint against the pre-incident one if you have it.

A logical restore is a point in time. Everything written after the dump is gone, and the
gap has to be stated explicitly rather than assumed small.

## Scenario C — Supabase scheduled backup or point-in-time recovery

Use when the Supabase project itself is intact and the platform's own backup or PITR can
reach the moment you need.

Choose the recovery target time deliberately: after the last known-good state and before
the damaging change. Restore to a new project, never over the live one, and compare before
cutting over. Confirm whether auth data is inside the restore scope.

Everything written between the recovery point and the incident is lost, including command
receipts, idempotency records and audit rows. That loss is the reason step 14 of the
recovery order exists: a lost receipt can turn a customer's retry into a duplicate.

The retention actually configured for the production project is **not confirmed** and is
an Owner item before launch. Do not assume a PITR window exists.

## Scenario D — Forward fix after a faulty deployed migration

Usually correct, and usually better than a restore. Use when the schema is wrong but the
data is intact or repairable in place.

Write a new additive migration that corrects the fault, following the additive and
backfill safety standard: inspect, add unenforced structure, backfill idempotently in
bounded batches, validate, add the constraint `NOT VALID`, `VALIDATE CONSTRAINT`, then
enforce. Never edit the faulty migration — it is already recorded in remote history, and
changing it makes the chain unverifiable without fixing anything.

Prefer a forward fix whenever the damage is bounded and describable. A restore throws away
every good write since the recovery point; a forward fix throws away nothing.

## Scenario E — Catastrophic project loss, restore to a new project

Use when the Supabase project is gone or unusable.

Create a new project, build the schema with Scenario A, restore data with Scenario B or C,
then re-establish everything that lives outside the database: the Admin `auth.users` entry
and its binding to the singleton `admin_identity`, environment variables and secrets in
Vercel, the AWS evidence bucket configuration and IAM roles, and the Cron schedule. None
of that is in a database backup.

Evidence objects are recovered separately and in parallel. The database is not the
constraint on how long this takes; re-establishing external configuration and reconciling
storage is.

## Recovery order

The sequence for any scenario that involves real data. It starts frozen and ends with
gates re-opened one at a time.

1. **Freeze.** Stop write traffic, workers and Cron. Record the freeze time.
2. **Assess.** Establish what is damaged, what is intact, and whether the database, the
   objects or both are affected. Decide the scenario.
3. **Preserve.** Do not overwrite the damaged state. Snapshot or export it first; it is
   the evidence for what happened.
4. **Restore the database** into a new or throwaway target, never over the live project.
5. **Verify the schema.** Migration history matches the manifest, the head is correct,
   every probe resolves, RLS and grants are as expected.
6. **Fingerprint the restored database** and compare it with the pre-incident fingerprint.
   Report every difference; do not explain any of them away yet.
7. **Reconcile evidence storage.** Collect an object inventory out of band and reconcile
   it against restored metadata. Resolve every `DATABASE_ONLY`, `OBJECT_ONLY`,
   `METADATA_MISMATCH` and `CHECKSUM_MISMATCH` before continuing. Not being able to
   collect an inventory is itself a blocker, not a clean result. Decide what to do with
   each incomplete upload: abandon the transaction, retry it later, or leave it pending
   for manual reconciliation. Nothing retries an upload automatically.
8. **Validate prepared packs.** Every approved pack item must resolve to the same pinned
   version with the same metadata and a recovered object. Record non-recoverable packs as
   non-recoverable.
9. **Reconcile the job queue and outbox** following `jobReconciliationSequence`: record
   dead letters, reconcile promoted entries with no job, release expired leases, decide
   per job whether a provider effect already occurred, then promote unpromoted entries.
10. **Reconcile intake idempotency.** Identify command receipts, submission keys and
    idempotency records lost to the recovery point, and decide what each means for the
    customer who retried.
11. **Re-establish auth.** Confirm exactly one Admin identity bound to a live `auth.users`
    row. Expect to reauthenticate through email OTP. Never mint a second Admin.
12. **Resume workers with every provider gate still closed** and confirm a clean pass.
13. **Re-open provider gates one at a time**, confirming expected behaviour after each.
    Never open several together: if something repeats a provider effect, you need to know
    which gate did it.
14. **Unfreeze and record.** Resume write traffic, restore Cron, and write the recovery
    evidence report with its unresolved gaps. Leave the signoff for an Owner.

## RPO and RTO position

Approved for launch on 5 October 2026:

- **Database RPO: <= 4 hours**
- **Core-service RTO: <= 4 hours**

The production design uses two independent recovery paths:

1. Supabase Pro's managed daily backup retained for seven days.
2. A ProfileRelaunch logical database export every three hours, retained for
   seven days in a separate private AWS S3 bucket.

The three-hour cadence leaves one hour of margin inside the RPO target. The
source-controlled implementation is in
`.github/workflows/prod-db-backup.yml` and
`infra/aws/prod-db-backup.yaml`. It does not count as demonstrated recovery
until the AWS stack is deployed, a real backup succeeds, and Step 22B restores
one of those backups into a throwaway project.

| Scenario | Demonstrated in rehearsal | External dependency | Data-loss exposure | Current limitation | Launch target |
| --- | --- | --- | --- | --- | --- |
| Schema rebuild, empty environment | Local only | None | None — no data involved | In-process PostgreSQL, not a provisioned Supabase project | Supports RTO evidence only |
| Existing database upgrade | Local only | None | None — additive only | Synthetic dataset; real volumes untested | Supports RTO evidence only |
| Three-hour logical backup restore | Not yet live-demonstrated | GitHub Actions, Supabase connection, AWS S3 | Up to three hours normally; policy alarm if prior successful object is >4h old | AWS bootstrap and first live backup still required | RPO <=4h / RTO <=4h |
| Supabase scheduled backup | Platform-managed | Supabase | Up to the daily backup interval | Daily cadence does not meet the four-hour RPO by itself | Secondary recovery path |
| Point-in-time recovery | Not enabled | Supabase PITR | Minutes if enabled | Cost intentionally deferred at launch | Not required for launch |
| Forward fix after a faulty migration | Rehearsed locally | Deployment pipeline | None if the fix is additive | Real volumes untested | Prefer over restore where safe |
| Catastrophic project loss | Not yet live-demonstrated | Supabase, GitHub, AWS, Vercel, DNS | Since last recoverable backup | External reconfiguration and storage reconciliation are unmeasured | RTO <=4h |
| Evidence object recovery | Reconciliation logic rehearsed synthetically | AWS S3 | Separate from database RPO | Production bucket inventory and byte-integrity gap still need Step 22B evidence | Must not push overall recovery beyond RTO |
| Job queue reconciliation | Rehearsed synthetically | None | None directly; duplicate provider effects are the risk | Provider reconciliation untested live | Included within RTO |

Database and evidence storage are separate recovery streams. Overall recovery is
bounded by whichever finishes last.

## Forward fix or restore

Not automated, and deliberately so. These are judgements with customer and financial
consequences, and the tooling reports facts rather than choosing.

| Incident | Starting position |
| --- | --- |
| Faulty migration deployed, schema wrong, data intact | Forward fix. A restore would discard good writes to solve a schema problem. |
| Migration backfill wrote incorrect values | Forward fix with a corrective idempotent backfill, if the correct value is derivable. If it is not, PITR to just before the backfill, then reconciliation for everything written since. |
| Accidental bulk delete or destructive DML | PITR to immediately before the statement, then reconciliation. Combine with a forward fix if the restore reintroduces a known defect. |
| A baseline migration replayed against the live database | PITR. Treat the project as compromised, restore to a new project, and re-run the history validator before anything else. |
| Evidence objects deleted or lost in S3 | Object restore from bucket versioning or backup. The database is not involved. Packs referencing unrecovered versions are non-recoverable until the objects return. |
| Evidence object bytes do not match metadata | Manual review. With no stored content hash the mismatch cannot be adjudicated automatically; the object is quarantined, not overwritten. |
| Duplicate provider effect from a replayed job | Reconciliation and manual review against provider records. Never a restore — a restore cannot un-send an email or un-charge a card. |
| Supabase project lost entirely | Combination: Scenario E for the database, independent object restore for evidence, then full reconciliation. |
| Privacy deletion executed in error | Manual review first. Restoring deleted personal data has its own legal consequences and is an Owner decision, not an engineering one. |

## Open items for Step 22B

- Deploy the production logical-backup AWS stack and accept the first live three-hour backup.
- Execute Scenario B with that logical backup against a throwaway project and time it.
- Reconcile a real S3 evidence inventory against restored metadata.
- Confirm the native Supabase daily-backup retention observed in production.
- Add an evidence content hash so byte-level integrity can be proved.
- Decide whether recovery access may continue to depend on a single Admin identity.
