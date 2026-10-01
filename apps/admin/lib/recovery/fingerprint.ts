/**
 * Safe data fingerprint for recovery validation.
 *
 * A fingerprint answers "is the restored database the same shape as the one we
 * lost" without reproducing anything that was in it. It records counts,
 * relationships, states and digests. It never records a name, an email
 * address, a telephone number, a storage key, a token or any other field
 * value: only an irreversible digest of an explicitly approved column set.
 *
 * Fingerprints are compared before and after a rehearsal. A difference is a
 * finding, not a warning to be waved through.
 */

import { createHash } from "node:crypto"

export type QueryTarget = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

/**
 * Columns approved for digesting. Each is a stable structural field, not
 * personal data: digesting them proves the rows survived a rebuild byte for
 * byte without the fingerprint carrying their contents.
 */
export const digestedColumns: readonly { table: string; columns: readonly string[]; order: string }[] = [
  { table: "public.cases", columns: ["id", "public_ref", "case_type", "status", "work_stage", "service_track"], order: "id" },
  { table: "public.case_document_versions", columns: ["id", "document_id", "version_number", "declared_content_type", "declared_size_bytes", "upload_status", "scan_status", "validation_status", "review_status"], order: "id" },
  { table: "public.case_prepared_pack_items", columns: ["id", "pack_id", "document_id", "version_id", "position", "content_type", "size_bytes"], order: "id" },
  { table: "public.service_orders", columns: ["id", "public_ref", "service_code", "amount_minor", "currency", "payment_model", "state"], order: "id" },
  { table: "public.guard_coverages", columns: ["id", "coverage_basis", "coverage_origin", "state"], order: "id" },
  { table: "admin_private.jobs", columns: ["id", "job_type", "idempotency_key", "status", "attempts", "max_attempts"], order: "id" },
  { table: "admin_private.job_outbox", columns: ["id", "event_key", "topic", "aggregate_type"], order: "id" },
]

/** Relationship counts that must survive any rebuild intact. */
const relationshipQueries: readonly { key: string; sql: string }[] = [
  { key: "case_to_customer", sql: "select count(*)::int as n from public.cases c join public.customers x on x.id = c.customer_id" },
  { key: "case_to_location", sql: "select count(*)::int as n from public.cases c join public.locations l on l.id = c.location_id" },
  { key: "verified_memberships", sql: "select count(*)::int as n from public.business_memberships m where m.status = 'verified'" },
  { key: "document_to_case", sql: "select count(*)::int as n from public.case_documents d join public.cases c on c.id = d.case_id" },
  { key: "version_to_document", sql: "select count(*)::int as n from public.case_document_versions v join public.case_documents d on d.id = v.document_id" },
  { key: "pack_item_to_version", sql: "select count(*)::int as n from public.case_prepared_pack_items i join public.case_document_versions v on v.id = i.version_id" },
  { key: "order_to_acceptance", sql: "select count(*)::int as n from public.service_orders o join public.quote_acceptances a on a.id = o.quote_acceptance_id" },
  { key: "coverage_to_order", sql: "select count(*)::int as n from public.guard_coverages g join public.service_orders o on o.id = g.service_order_id" },
  { key: "job_to_outbox", sql: "select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id" },
]

/**
 * Orphan probes. Every one of these must be zero: a non-zero result means the
 * restore produced a row whose parent did not come back with it.
 */
const orphanQueries: readonly { key: string; sql: string }[] = [
  { key: "versions_without_document", sql: "select count(*)::int as n from public.case_document_versions v left join public.case_documents d on d.id = v.document_id where d.id is null" },
  { key: "documents_without_case", sql: "select count(*)::int as n from public.case_documents d left join public.cases c on c.id = d.case_id where c.id is null" },
  { key: "pack_items_without_version", sql: "select count(*)::int as n from public.case_prepared_pack_items i left join public.case_document_versions v on v.id = i.version_id where v.id is null" },
  { key: "pack_items_without_pack", sql: "select count(*)::int as n from public.case_prepared_pack_items i left join public.case_prepared_packs p on p.id = i.pack_id where p.id is null" },
  { key: "cases_without_customer", sql: "select count(*)::int as n from public.cases c left join public.customers x on x.id = c.customer_id where x.id is null" },
  { key: "memberships_without_business", sql: "select count(*)::int as n from public.business_memberships m left join public.businesses b on b.id = m.business_id where b.id is null" },
  { key: "promoted_outbox_without_job", sql: "select count(*)::int as n from admin_private.job_outbox o left join admin_private.jobs j on j.outbox_id = o.id where o.promoted_at is not null and j.id is null" },
  { key: "coverages_without_location", sql: "select count(*)::int as n from public.guard_coverages g left join public.locations l on l.id = g.location_id where l.id is null" },
]

/** Lifecycle states whose distribution must be identical after a restore. */
const statusQueries: readonly { key: string; sql: string }[] = [
  { key: "cases.status", sql: "select status as k, count(*)::int as n from public.cases group by status" },
  { key: "evidence_requests.status", sql: "select status as k, count(*)::int as n from public.evidence_requests group by status" },
  { key: "case_document_versions.upload_status", sql: "select upload_status as k, count(*)::int as n from public.case_document_versions group by upload_status" },
  { key: "case_document_versions.scan_status", sql: "select scan_status as k, count(*)::int as n from public.case_document_versions group by scan_status" },
  { key: "case_document_versions.review_status", sql: "select review_status as k, count(*)::int as n from public.case_document_versions group by review_status" },
  { key: "case_prepared_packs.status", sql: "select status as k, count(*)::int as n from public.case_prepared_packs group by status" },
  { key: "customer_actions.status", sql: "select status as k, count(*)::int as n from public.customer_actions group by status" },
  { key: "guard_coverages.state", sql: "select state as k, count(*)::int as n from public.guard_coverages group by state" },
  { key: "guard_alerts.state", sql: "select state as k, count(*)::int as n from public.guard_alerts group by state" },
  { key: "privacy_requests.status", sql: "select status as k, count(*)::int as n from public.privacy_requests group by status" },
]

export type Fingerprint = {
  marker: string
  /** Migration versions in applied order, as the rehearsal observed them. */
  migrationSequence: readonly string[]
  schemaHead: string | null
  tableRowCounts: Record<string, number>
  relationshipCounts: Record<string, number>
  orphanCounts: Record<string, number>
  statusCounts: Record<string, number>
  jobStateCounts: Record<string, number>
  outboxCounts: Record<string, number>
  /** Synthetic identifiers only. A real identifier must never reach this list. */
  syntheticIdentifiers: readonly string[]
  /** sha256 of the approved column set per table. Irreversible by construction. */
  columnDigests: Record<string, string>
}

async function scalar(db: QueryTarget, sql: string): Promise<number> {
  const result = await db.query<{ n: number }>(sql)
  return Number(result.rows[0]?.n ?? 0)
}

async function tableRowCounts(db: QueryTarget): Promise<Record<string, number>> {
  const tables = await db.query<{ table_schema: string; table_name: string }>(
    `select table_schema, table_name from information_schema.tables
     where table_schema in ('public','admin_private') and table_type = 'BASE TABLE'
     order by table_schema, table_name`,
  )
  const counts: Record<string, number> = {}
  for (const row of tables.rows) {
    const name = `${row.table_schema}.${row.table_name}`
    counts[name] = await scalar(db, `select count(*)::int as n from ${name}`)
  }
  return counts
}

async function columnDigests(db: QueryTarget): Promise<Record<string, string>> {
  const digests: Record<string, string> = {}
  for (const target of digestedColumns) {
    const projection = target.columns.map(column => `coalesce(${column}::text,'')`).join(" || '|' || ")
    const rows = await db.query<{ line: string }>(
      `select ${projection} as line from ${target.table} order by ${target.order}`,
    )
    digests[target.table] = createHash("sha256").update(rows.rows.map(row => row.line).join("\n")).digest("hex")
  }
  return digests
}

async function keyedCounts(db: QueryTarget, prefix: string, sql: string): Promise<Record<string, number>> {
  const rows = await db.query<{ k: string; n: number }>(sql)
  const counts: Record<string, number> = {}
  for (const row of rows.rows) counts[`${prefix}=${row.k}`] = Number(row.n)
  return counts
}

export type FingerprintOptions = {
  marker: string
  migrationSequence: readonly string[]
  /** Prefix that marks a row as synthetic rehearsal data. */
  syntheticIdPrefix: string
}

export async function captureFingerprint(db: QueryTarget, options: FingerprintOptions): Promise<Fingerprint> {
  const relationshipCounts: Record<string, number> = {}
  for (const probe of relationshipQueries) relationshipCounts[probe.key] = await scalar(db, probe.sql)

  const orphanCounts: Record<string, number> = {}
  for (const probe of orphanQueries) orphanCounts[probe.key] = await scalar(db, probe.sql)

  let statusCounts: Record<string, number> = {}
  for (const probe of statusQueries) statusCounts = { ...statusCounts, ...(await keyedCounts(db, probe.key, probe.sql)) }

  const jobStateCounts = await keyedCounts(db, "jobs.status", "select status as k, count(*)::int as n from admin_private.jobs group by status")
  const outboxCounts = {
    promoted: await scalar(db, "select count(*)::int as n from admin_private.job_outbox where promoted_at is not null"),
    unpromoted: await scalar(db, "select count(*)::int as n from admin_private.job_outbox where promoted_at is null"),
  }

  const identifiers = await db.query<{ id: string }>(
    `select id::text as id from public.cases where id::text like $1
     union all select id::text from public.case_document_versions where id::text like $1
     union all select id::text from public.service_orders where id::text like $1
     union all select id::text from public.guard_coverages where id::text like $1
     order by 1`,
    [`${options.syntheticIdPrefix}%`],
  )

  return {
    marker: options.marker,
    migrationSequence: [...options.migrationSequence],
    schemaHead: options.migrationSequence.at(-1) ?? null,
    tableRowCounts: await tableRowCounts(db),
    relationshipCounts,
    orphanCounts,
    statusCounts,
    jobStateCounts,
    outboxCounts,
    syntheticIdentifiers: identifiers.rows.map(row => row.id),
    columnDigests: await columnDigests(db),
  }
}

export type FingerprintDifference = { area: string; key: string; before: string; after: string }

function diffRecords(area: string, before: Record<string, number>, after: Record<string, number>): FingerprintDifference[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys
    .filter(key => before[key] !== after[key])
    .map(key => ({ area, key, before: String(before[key] ?? "absent"), after: String(after[key] ?? "absent") }))
}

export type FingerprintComparison = { matched: boolean; differences: readonly FingerprintDifference[] }

export function compareFingerprints(before: Fingerprint, after: Fingerprint): FingerprintComparison {
  const differences: FingerprintDifference[] = [
    ...diffRecords("tableRowCounts", before.tableRowCounts, after.tableRowCounts),
    ...diffRecords("relationshipCounts", before.relationshipCounts, after.relationshipCounts),
    ...diffRecords("orphanCounts", before.orphanCounts, after.orphanCounts),
    ...diffRecords("statusCounts", before.statusCounts, after.statusCounts),
    ...diffRecords("jobStateCounts", before.jobStateCounts, after.jobStateCounts),
    ...diffRecords("outboxCounts", before.outboxCounts, after.outboxCounts),
  ]
  if (before.marker !== after.marker) {
    differences.push({ area: "marker", key: "marker", before: before.marker, after: after.marker })
  }
  if (before.migrationSequence.join(",") !== after.migrationSequence.join(",")) {
    differences.push({
      area: "migrationSequence",
      key: "sequence",
      before: before.migrationSequence.join(" "),
      after: after.migrationSequence.join(" "),
    })
  }
  if (before.syntheticIdentifiers.join(",") !== after.syntheticIdentifiers.join(",")) {
    differences.push({
      area: "syntheticIdentifiers",
      key: "identifiers",
      before: String(before.syntheticIdentifiers.length),
      after: String(after.syntheticIdentifiers.length),
    })
  }
  for (const table of Object.keys({ ...before.columnDigests, ...after.columnDigests }).sort()) {
    if (before.columnDigests[table] !== after.columnDigests[table]) {
      differences.push({
        area: "columnDigests",
        key: table,
        before: before.columnDigests[table] ?? "absent",
        after: after.columnDigests[table] ?? "absent",
      })
    }
  }
  return { matched: differences.length === 0, differences }
}

/** Every orphan probe must be zero for a restore to be considered consistent. */
export function fingerprintHasOrphans(fingerprint: Fingerprint): boolean {
  return Object.values(fingerprint.orphanCounts).some(count => count > 0)
}
