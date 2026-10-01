# Migration rehearsal and disaster-recovery foundation (Step 22A)

Status: **STEP 22A REHEARSAL TOOLING COMPLETE / LIVE RECOVERY REHEARSAL PENDING**

Step 22A builds the tooling, the rehearsals and the written procedure for recovering this
system. It does not recover anything. No live Supabase restore, point-in-time recovery,
project reset or AWS S3 operation was performed, and no code added here can perform one.
Step 22B is the live operator rehearsal; the gaps it has to close are listed at the end of
this document.

No migration was created by Step 22A. The applied chain is unchanged and ends at
`20261001175315_google_integration_readiness_v1.sql`. Guard, Stripe, mail, Google and
privacy deletion gates are unchanged and Cron remains `0 4 * * *`.

Supporting documents: database-restore-runbook.md for the restore procedure, RPO/RTO
position and decision matrix; recovery-incident-communications.md for the internal
templates.

## What exists

Everything lives in `apps/admin/lib/recovery/`, is pure TypeScript, and is exercised by
`npm run rehearse:recovery` from the repository root. The suite is 175 tests across 7
files and runs in roughly five seconds, so a rehearsal is cheap enough to run on every
change rather than once before launch.

| Module | Responsibility |
| --- | --- |
| `manifest.ts` | The applied migration chain as data: order, kind, verification probe |
| `history.ts` | Report-only validator comparing repository, manifest and remote history |
| `harness.ts` | Applies the chain to in-process PostgreSQL (PGlite), whole or partial |
| `dataset.ts` | The deterministic synthetic rehearsal dataset |
| `fingerprint.ts` | Safe before/after data fingerprint and comparison |
| `storage.ts` | Evidence object reconciliation model (no AWS client) |
| `packs.ts` | Prepared pack recovery validation |
| `jobs.ts` | Job, outbox, lease and idempotency reconciliation |
| `report.ts` | The recovery evidence report, machine- and human-readable |

## Migration chain manifest

`manifest.ts` records the 26 applied migrations in exact application order, which is
lexical filename order. Each entry carries its version, filename, the logical step it
belongs to, whether it is a `foundation` migration (one that creates tables from nothing)
or an `additive` one, whether it is applied to `profilerelaunch-dev`, whether it contains
backfill or other DML, and a verification probe — a category and a named database object
whose presence proves that migration actually took effect.

The manifest does not restate migration SQL. It describes the chain; the SQL files remain
the only definition of it.

`safeToReplay` is typed as the literal `false` for every entry. It is not a field anyone
can set to `true` for an applied migration: the type system refuses. Five entries are
`foundation` — `core_data_foundation_v1`, `relaunch_guard_data_foundation_v1`,
`single_admin_auth_v1`, `admin_evidence_foundation_v1` and
`jobs_outbox_operational_health_v1` — and those are the migrations that would destroy a
live database if replayed. Nine entries contain data changes and are flagged, because a
backfill that runs twice is a different kind of hazard from a `CREATE TABLE` that runs
twice.

## Migration history validator

`validateMigrationHistory` compares three independent views of the chain: the `.sql` files
actually present in `supabase/migrations/`, the manifest, and remote migration-history
rows supplied by an operator. It returns findings. It never applies, repairs, reorders or
renames anything, and it holds no database connection.

It detects a missing remote migration, a duplicate logical migration, the same logical
name recorded under a different version, a remote migration with no file in the
repository, an applied migration whose file has gone, a repository file the manifest does
not know about, order divergence between repository and remote, the rename of an applied
migration, an attempt to replay an applied migration, and a foundation migration being
treated as new work.

It fails closed. When remote history is absent or malformed the status is `blocked`, never
`clean`, and `mayApplyMigrations` returns true only for `clean`. Not knowing the remote
state is treated as a reason to stop, which is the opposite of the usual default.

A single candidate can produce more than one finding. Offering to re-run
`core_data_foundation_v1` is both `replay_of_applied_migration` and
`foundation_treated_as_new`, and the validator reports both rather than stopping at the
first.

## Clean-schema rehearsal

`rehearsal.database.test.ts` builds the entire schema from zero in an in-process
PostgreSQL instance, applying all 26 migrations in exact manifest order with no
cherry-picking, then seeds the synthetic dataset and checks that the rebuilt database
still behaves like the real one. A full rebuild takes roughly two seconds.

Two pieces of Supabase platform state are not supplied by the migrations and have to exist
first: the `anon`, `authenticated` and `service_role` roles, and the `auth` schema with
`auth.users`. The harness creates them, and `pgcrypto` is stubbed with equivalent
`extensions.*` functions. That prelude is itself a recovery fact: rebuilding this schema
into an empty PostgreSQL database requires those objects, and the runbook says so.

The rehearsal verifies invariants across Admin identity singleton behaviour, enquiry,
client and case records, evidence requests, versions and prepared packs, customer actions,
jobs and the outbox, communications and conversations, catalogue, quotes and orders,
Stripe payment structures, Guard onboarding, subscriptions, checks and alerts, dashboard
and reporting objects, Step 20 settings and privacy, and Step 21 integration readiness.
These are recovery checks. They do not duplicate the feature test suites, which continue
to own the behaviour of their own steps.

The rebuild closed a real gap. `20260915193000_case_intake_transaction_v1.sql` was
executed by no existing test, so its `create_case_intake_v1` function had never been built
from source in CI. A dedicated test now asserts it exists after a clean rebuild.

## Existing-database upgrade rehearsal

`upgrade.database.test.ts` represents a running database rather than an empty one. It
builds the schema up to the Step 10 checkpoint `20260929183214`, seeds the six synthetic
domains that exist at that point, and then applies the remaining eleven additive
migrations in sequence, exactly as an upgrade of the live database would.

It then proves the pre-existing data came through intact: customer, business, verified
membership and location references still resolve; the enquiry and case survive with their
relationships; evidence metadata and the prepared pack still point at the same version;
job and outbox rows keep their state; communication records survive. An intake idempotency
record is exercised both before and after the upgrade, so a retry that was a no-op
beforehand is still a no-op afterwards rather than becoming a duplicate creation.

Making the dataset work at two different schema heads forced one useful change. The
`admin_identity_protect` trigger only exists from Step 20, so the seed guards its
disable/enable in a conditional block and the dataset is now checkpoint-portable.

## Additive and backfill safety standard

The standard for any future schema change that touches existing rows, demonstrated against
a scratch schema in `upgrade.database.test.ts`:

1. Inspect the existing data before writing the migration. Count the rows that will not
   satisfy the intended rule.
2. Add the new structure nullable and unenforced. A new column arrives without `NOT NULL`
   and without a validated constraint.
3. Backfill in bounded, idempotent batches. Re-running a batch must not change a row that
   is already correct.
4. Validate. Count the rows that still violate the rule and stop if any remain.
5. Add the constraint `NOT VALID`, so it applies to new and changed rows without scanning
   or locking the whole table.
6. `VALIDATE CONSTRAINT` as a separate statement, which takes a weaker lock.
7. Enforce — `SET NOT NULL` or equivalent — only once validation has passed.

No existing migration uses `NOT VALID` plus `VALIDATE CONSTRAINT`, so this is new guidance
rather than a description of current practice. Fixtures cover the three cases that matter:
valid historical data survives the sequence, invalid historical data is detected at step 4
before anything is enforced, and re-running an idempotent backfill neither duplicates rows
nor alters rows that were already correct. A further test interrupts the sequence between
stages and resumes it, because a migration that dies halfway is the realistic failure.

Step 22A deliberately produced no migration. The standard is documentation and test
fixtures, which is what the step needed; adding schema to prove we can add schema safely
would have been the wrong trade.

## Anonymised rehearsal dataset

`dataset.ts` builds a deterministic synthetic dataset across eleven domains: Admin
identity, core records, intake, evidence and packs, customer actions, jobs and outbox,
communications and conversations, commerce, Guard commerce, Guard coverage and alerts, and
settings, privacy and incidents.

It contains no real data of any kind. Identifiers are generated from a fixed
`5e5e5e5e-0000-4000-8000-...` slot pattern, so every row is recognisable as synthetic at a
glance and two runs produce byte-identical values. Email addresses use the reserved
`@rehearsal.invalid` domain, telephone numbers come from the Ofcom drama range, the bucket
is `synthetic-rehearsal-evidence`, and references are marked `RHRSL`. There are no real
customer details, Stripe identifiers, Google identifiers, customer storage keys or
secrets, and the whole dataset carries the marker `SYNTHETIC_REHEARSAL_DATASET_V1`.

Seeding it is a genuine test of the schema. Every trigger the real application passes
through had to be satisfied: an evidence request must be OPEN when its document is
created, a pack item can only be added to a DRAFT pack, a customer action must match the
case and quote version it references, a quote acceptance can only pin an OFFERED version,
a Guard obligation's UTC window must match what the schedule function derives, and a
settings version must start as DRAFT version 1 with a valid payload. The dataset is built
the way the application builds data, not by bypassing the rules.

## Data fingerprint

`captureFingerprint` takes a comparable summary of a database: table row counts, counts of
key relationships, orphan counts, status and job-state counts, outbox counts, the sorted
list of synthetic identifiers present, the migration-history sequence, and SHA-256 digests
of an allowlisted set of deterministic fixture columns.

It contains no plaintext customer data. Only counts, synthetic identifiers and digests are
recorded, so a fingerprint can be attached to a report and compared across runs safely.

`compareFingerprints` reports every difference by area and key. Rebuilding a second
database from scratch and fingerprinting it produces an identical result, which is what
makes the comparison meaningful: a difference means something actually changed, not that
the capture is non-deterministic.

Probes that reference tables which do not exist at a given checkpoint are skipped, and the
skips are recorded in `skippedProbes`, which is itself part of the comparison. A check that
silently did not run would be worse than one that failed.

## Evidence object recovery

A database backup restores `case_document_versions`. It does not restore the bytes, which
live in a private AWS S3 bucket on a separate recovery path. Either side can come back
without the other, so the two must be reconciled.

`storage.ts` holds no AWS client and cannot list, read, presign or delete an object. An
operator collects an inventory out of band and passes it in. Live recovery is therefore an
operator action that the Admin application has no code path to perform, which is a
stronger guarantee than a policy saying it must not.

Each expected object resolves to `MATCHED`, `DATABASE_ONLY`, `OBJECT_ONLY`,
`METADATA_MISMATCH`, `CHECKSUM_MISMATCH` or `NOT_CHECKED`. The rehearsal covers a missing
object, a wrong key, a size mismatch, a checksum mismatch and an orphan object, and a
mismatched object is never silently marked recovered: the four blocking outcomes make
`storageRecoveryBlocked` true. So does an absent inventory — every row becomes
`NOT_CHECKED`, `inventorySupplied` is false and the report is blocked, because an
unreconciled bucket must never read as a safe one.

Reports carry a 16-character digest of bucket and key, never the key itself, so a report
can be shared without disclosing object paths.

Four states are kept apart, because collapsing them is how an unproven recovery gets
declared successful. `structurallyMatched` means bucket, key, size and content type agree.
`byteIntegrityProven` additionally requires a hash on both sides that agrees.
`fullyVerified` requires both, with nothing left incomplete. `blocked` means something
concrete is wrong — or that nothing was checked at all, because an absent inventory is a
blocker rather than a clean result.

**There is no content hash in the schema.** `case_document_versions` stores declared size
and content type but no checksum, so a `MATCHED` row means size and content type agree,
not that the bytes agree. Those rows carry a `checksum_unavailable` reason,
`byteIntegrityProven` and `fullyVerified` stay false, and both the human and machine
forms of the report say byte-level integrity is unproven. This is a real limitation
recorded as a Step 22B gap rather than smoothed over.

A version whose upload never finished is a fourth thing again. The database never claimed
an object existed, so inventing a missing-object failure for it would be wrong. It stays
`NOT_CHECKED` with an `upload_not_finished` reason and is counted as an incomplete upload,
which keeps the recovery out of `VERIFIED` without fabricating a failure. An operator
decides per row whether to abandon the transaction, retry it later or leave it for manual
reconciliation; nothing in this tooling uploads or retries anything.

## Prepared pack recovery

An approved pack is a promise about exactly which document versions were included.
`validatePackRecovery` checks that each item still resolves to the same pinned version,
that the version metadata matches the snapshot taken when the item was added, and that the
version's object was confirmed recovered.

A missing version makes the pack non-recoverable, and that is the reported outcome. There
is no path that repoints an item at the latest version of its document: `DOCUMENT_REBOUND`
is a failure, not a repair. Pack reports contain no presigned URL and no storage key.

## Job, outbox and idempotency recovery

A restored queue is not a safe queue. Leases belong to workers that no longer exist, jobs
that already produced a provider effect can look runnable again, and dead letters waiting
for a human decision must not be swept away by a bulk retry.

`reconcileJobRecovery` classifies what the restore produced and states the review a person
has to perform. Completed work is protected by its idempotency key and marked `no_action`.
Expired leases are flagged for release so nothing sits stuck. A job leased to a vanished
worker whose lease has not yet expired needs human review, because a restore cannot know
whether the original attempt reached the provider. Dead letters stay visible with their
history. A promoted outbox entry with no job needs provider reconciliation; an unpromoted
entry can be promoted because its unique event key prevents a duplicate. Provider gates are
reported as the restore left them and never adjusted.

`blindReplayPermitted` is typed as the literal `false`. There is no bulk replay path in
this module by construction. `jobReconciliationSequence` gives the eight-step order a
person works through instead, beginning with workers and Cron stopped and ending with
provider gates re-opened one at a time.

Intake idempotency is covered separately: the marketing enquiry submission key, the
monitoring request submission key and the Admin command receipt tables are each exercised
after a rebuild to prove a retry is still a retry. Where a point-in-time recovery could
legitimately lose a command receipt, the consequence is a reconciliation step in the
runbook rather than a silent duplicate.

## Auth and session recovery

The Admin identity survives when auth data is inside the restore scope: `admin_identity` is
a singleton bound to one `auth.users` row, and a rebuild produces exactly one Admin. A
second Admin identity cannot be created — the singleton architecture remains authoritative
and the protection trigger rejects deletion, disabling and rebinding.

Sessions are a different matter. Opaque session rows may be older or newer than the
restored auth state, and the correct outcome after a restore is reauthentication through
the existing email OTP flow rather than any attempt to revive a session. Session tokens
and token hashes never appear in a rehearsal report; `assertReportIsSafe` rejects a
`token_hash` field outright.

No staff accounts are added and no backup Owner is implemented. The single-Admin model is
unchanged by Step 22A, and the operational consequence — that recovery depends on one
person's access — is recorded in the risk register as an Owner decision rather than
engineered around here.

## Recovery evidence report

`report.ts` produces one structure rendered two ways: ordered JSON that diffs cleanly
between runs, and readable text for a ticket or a signoff record. A report carries the run
id, source revision, migration head, rehearsal type, a permanent synthetic-data marker,
start and finish timestamps, every check with its pass or fail state, the fingerprint
comparison, storage, pack and job reconciliation summaries, unresolved gaps, RPO and RTO
observations, and a signoff placeholder.

### Two questions, two answers

"Did the rehearsal execute correctly?" and "is the restored state actually recovered?" are
different questions, and one boolean cannot carry both honestly. A failure-injection
rehearsal that correctly detects a missing evidence object executed perfectly *and* proved
the restore is unusable. The report says exactly that:

```
Rehearsal execution: PASSED
Recovery verification: BLOCKED
```

`rehearsalStatus` is `PASSED` or `FAILED` and derives from the rehearsal's own checks.
`recoveryVerification` is `VERIFIED`, `PARTIALLY_VERIFIED`, `BLOCKED` or
`NOT_APPLICABLE`, and carries the blockers and limitations behind it. Both appear
explicitly in the JSON; neither has to be inferred from prose.

| Status | Meaning |
| --- | --- |
| `VERIFIED` | Every recovery domain in scope was exercised and came back clean, including proven byte integrity where storage is involved |
| `PARTIALLY_VERIFIED` | Structurally correct, but a verification dimension was unavailable — no content hash, or a domain this rehearsal did not exercise. Never full recovery |
| `BLOCKED` | A concrete unresolved blocker: a blocking storage outcome, a missing inventory, a non-recoverable pack, a queue needing reconciliation, a fingerprint difference or a failed check |
| `NOT_APPLICABLE` | The rehearsal does not attempt to verify a restored state at all, such as an isolated history-parser exercise. Not a way to avoid reporting a blocker |

`deriveRecoveryVerification` is the only place this decision is made. Domain modules report
facts — `blocked`, `byteIntegrityProven`, `requiresHumanReview` — and the report layer
combines them, so there is no second, slightly different opinion about whether a recovery
succeeded living in a test or a renderer.

Gaps are typed rather than uniformly alarming. `INFO` is context, `LIMITATION` is
something this rehearsal could not establish, and `BLOCKER` is a reason the restored state
is not recovered. An unapproved production RTO is an Owner decision, not a failed
rehearsal; an evidence inventory that could not be collected during a real recovery is a
blocker.

### Serialisation

JSON is produced by a deep stable transform: object keys are sorted at every depth, arrays
keep their order, primitives and nulls pass through, and the source report is never
mutated. A `JSON.stringify` replacer array cannot do this — it is applied at every depth,
so a nested key survives only if it happens to appear in the top-level key list, which
silently drops nested evidence. Tests parse the output back and assert that check fields,
fingerprint differences, storage counts and rows, pack findings, job findings and signoff
all survive the round trip.

The report is safe by construction. `assertReportIsSafe` runs over both final rendered
strings and throws on presigned URL signatures, AWS access key ids, evidence storage keys,
Google access tokens, refresh tokens and client secrets, Stripe secret keys, bearer
tokens, session token hash fields, email addresses and UK telephone numbers. It throws
rather than redacting, because a report that tried to carry a secret is a defect to fix,
not output to clean up. A test buries an unsafe value several levels deep in a pack
finding to prove the check still catches it.

Signoff is always `approvedBy: null, approvedAt: null`. An Owner signs a rehearsal off; a
script does not.

## Failure injection

Each of these is injected deliberately and must be visible and fail closed:

| Injected failure | Expected result |
| --- | --- |
| Migration interrupted between additive stages | Resumable; the sequence completes correctly on resume |
| Invalid historical row during a backfill | Detected at validation, before any constraint is enforced |
| Missing evidence object | `DATABASE_ONLY`; storage recovery blocked |
| Checksum mismatch | `CHECKSUM_MISMATCH`; never reported as recovered |
| Duplicate idempotency retry | No duplicate record created |
| Stale job lease | `release_stale_lease`; the job does not sit stuck |
| Orphan storage metadata or object | `DATABASE_ONLY` / `OBJECT_ONLY`; both block |
| No object inventory collected | Storage blocked; recovery verification cannot reach `VERIFIED` |
| Migration-history mismatch | Validator reports divergence; status is not `clean` |
| Missing applied migration file | `applied_file_missing` |
| Replay attempt on an applied migration | `replay_of_applied_migration`, plus `foundation_treated_as_new` for a foundation migration |

## Step 22A acceptance

- The applied migration chain is described exactly once, in order, as data.
- Divergence between repository, manifest and remote history is detected and fails closed.
- The whole schema rebuilds from zero and still enforces its invariants.
- An existing database upgrades through the additive tail with its data intact.
- Intake retries remain retries across a rebuild and an upgrade.
- The additive and backfill standard is documented and demonstrated, including
  `NOT VALID` plus `VALIDATE CONSTRAINT`.
- The rehearsal dataset is synthetic, deterministic and free of real data.
- Fingerprints are reproducible and contain no plaintext customer data.
- Evidence objects, prepared packs and the job queue each have a reconciliation model that
  cannot declare an unproven recovery successful.
- Rehearsal execution and recovered-state verification are separate, explicitly typed
  statuses, derived in one place and carried in both the human and machine forms.
- The machine-readable form preserves nested evidence, sorts keys at every depth and does
  not mutate the report it was given.
- Recovery reports cannot carry a secret, a token, a presigned URL, a storage key or
  personal data, enforced by a test rather than by review.
- No live restore, no live S3 operation, no migration, no gate change, no Cron change.
- The limits of this work are written down rather than implied.

## What Step 22B still requires

These need a real operator and real cloud resources, and none of them can be closed from
this repository:

- A live Supabase restore and a point-in-time recovery against a throwaway project, timed.
- A real S3 inventory reconciled against restored database metadata.
- An evidence content hash. Until `case_document_versions` stores one, byte-level
  integrity cannot be proved from the database alone and `fullyVerified` can never be
  true for a real restore. Adding it is a schema change for a later step, with a backfill
  for existing objects.
- Owner-approved RPO and RTO targets. Everything measured here is in-process PostgreSQL on
  synthetic data and is not a production commitment.
- A decision on recovery access depending on a single Admin identity.
- Confirmation of the Supabase backup and PITR retention actually configured for the
  production project.
