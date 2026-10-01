# Recovery incident communication templates (Step 22A)

Status: **TEMPLATES WRITTEN / NOT AUTOMATED / NOT SENT**

These are internal operational templates for a recovery incident. They are written here as
documentation, not stored in `admin_private.communication_templates`, and nothing in the
application selects, renders, queues or sends them. Step 11 outgoing mail remains disabled
and no code path reaches these.

They attach to the Step 20 operational incident record rather than introducing a parallel
concept. `public.operational_incidents` already classifies `WORKER_OUTAGE`,
`PROVIDER_FAILURE`, `MONITORING_GAP`, `EMAIL`, `BILLING`, `SECURITY`, `PRIVACY` and
`OTHER`, and each template below names the classification it belongs to.

## Rules for every template

- **No recovery time commitment.** No RPO or RTO has been approved, so no template may
  state or imply one. Write what is known and what the next checkpoint is, not when it
  will be finished.
- **No customer-facing version here.** These are internal. Anything a customer receives is
  a separate Owner decision made with the facts in hand, not a form letter prepared in
  advance.
- **No secrets.** No token, session identifier, presigned URL, storage key, provider
  payload or customer personal data. Reference a case, enquiry or document by identifier.
- **Counts, not content.** "Nine evidence objects unaccounted for" is operationally
  useful. The filenames are not.
- **Nothing is sent automatically.** A person writes, reviews and sends each one.
- **An unknown is written as unknown.** `Unknown` and `Not yet established` are valid and
  preferable to a reassuring guess.

Square-bracketed fields are filled in by the person sending the message.

---

## 1. Incident opened

Classification: matches the fault — `WORKER_OUTAGE`, `PROVIDER_FAILURE`, `SECURITY` or
`OTHER`.

> **Incident [REF] opened — [one-line description]**
>
> Detected: [timestamp, Europe/London] by [how it was detected].
> Classification: [incident type].
> Current effect: [what is and is not working].
> Customer-visible: [yes / no / not yet established].
> Immediate actions taken: [freeze, workers stopped, Cron disabled, as applicable].
> Not yet established: [list].
> Next checkpoint: [timestamp], when the recovery scenario will be decided.
>
> No recovery time has been committed. Provider gates are unchanged.

## 2. Restore commenced, service frozen

Classification: `OTHER`, or the originating classification if one is already open.

> **Incident [REF] — restore in progress**
>
> Scenario: [A schema rebuild / B logical restore / C Supabase backup or PITR / D forward
> fix / E project loss].
> Recovery target: [point in time, or not applicable].
> Frozen at: [timestamp]. Writes, workers and Cron are stopped.
> Pre-restore state recorded: queue counts, outbox counts, gate states, migration history,
> fingerprint.
> Restore target: [new project / throwaway project]. The live project is not being
> restored over.
> Expected data-loss window: [everything written after [timestamp] / none / not yet
> established].
> Next checkpoint: [timestamp].
>
> Reconciliation of evidence storage and the job queue follows the restore. The service
> will not be unfrozen before that is complete.

## 3. Evidence objects unaccounted for

Classification: `OTHER`, escalating to `SECURITY` if loss was not accidental.

> **Incident [REF] — evidence storage reconciliation**
>
> Database metadata restored: [n] document versions.
> Objects confirmed present: [n]. Unaccounted for: [n]. Unexpected objects found: [n].
> Metadata mismatches: [n]. Checksum mismatches: [n].
> Affected cases: [n] ([case references]).
> Prepared packs currently non-recoverable: [n].
>
> Byte-level integrity cannot be proved: the schema stores no content hash, so a match on
> size and content type is structural only. No object has been deleted, overwritten or
> rebound as part of this recovery, and no prepared pack item has been repointed at a
> different version.
>
> Next step: [object restore from versioning / escalate to Owner / manual review].

## 4. Guard monitoring gap

Classification: `MONITORING_GAP`.

> **Incident [REF] — Guard monitoring gap**
>
> Gap period: [start] to [end], Europe/London.
> Coverages affected: [n]. Checks not performed: [n].
> Obligations affected: [n].
>
> Missed checks have not been fabricated and no observation has been backdated. Whether
> any missed check is performed late, and what a customer is told, is an Owner decision.
> Guard alerting and notification gates remain unchanged.

## 5. Possible duplicate or missed provider effect

Classification: `EMAIL`, `BILLING` or `PROVIDER_FAILURE`.

> **Incident [REF] — provider effect reconciliation**
>
> Jobs requiring review: [n]. Promoted outbox entries without a job: [n]. Dead letters:
> [n] (unchanged, retained with their history).
> Provider effects confirmed as having occurred: [n]. Confirmed as not having occurred:
> [n]. Still unknown: [n].
> Potential duplicates: [n]. Potentially missed: [n].
>
> No job has been bulk-replayed. Each item is being reconciled against provider records
> individually. Provider gates remain as the restore left them and will be re-opened one
> at a time after reconciliation.
>
> Customer impact: [none identified / under assessment / [description]].

## 6. Privacy or security assessment

Classification: `PRIVACY` or `SECURITY`.

> **Incident [REF] — privacy and security assessment**
>
> Personal data involved: [yes / no / under assessment].
> Categories: [customer contact details / case content / evidence documents / none].
> Unauthorised access: [none identified / under assessment / confirmed].
> Data lost rather than disclosed: [description].
> Legal holds affected: [n].
> Privacy requests in flight at the time of the incident: [n].
>
> Whether this is notifiable, and to whom, is an Owner decision taken with the full facts.
> This record is not a notification. No personal data has been reproduced in this message.

## 7. Incident closed

Classification: as originally opened.

> **Incident [REF] closed**
>
> Opened: [timestamp]. Service restored: [timestamp]. Frozen for: [duration].
> Scenario used: [A / B / C / D / E].
> Data loss: [none / everything written between [timestamp] and [timestamp] / description].
> Evidence objects: [n] recovered, [n] unrecovered.
> Prepared packs non-recoverable: [n].
> Provider effects reconciled: [n] duplicates prevented, [n] duplicates occurred, [n]
> missed effects re-queued.
> Provider gates: re-opened [list with timestamps] / still closed [list].
> Recovery evidence report: [run id].
> Unresolved gaps: [list].
> Follow-up actions: [list with owners].
>
> The duration above is what this incident took. It is not a recovery target and does not
> become one. Signoff is pending Owner approval.
