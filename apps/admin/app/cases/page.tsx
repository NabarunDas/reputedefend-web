import Link from "next/link"
import { notFound } from "next/navigation"
import { filters } from "@/lib/cases/model"
import { listCases } from "@/lib/cases/queries"
import { loadCaseFlows, requiredCase } from "@/lib/case-flow/load"
import { EmptyState, PageHeader } from "../ui"
import { CaseQueue, type CaseQueueEntry } from "./queue"

export const metadata = { title: "Cases" }

/**
 * The case queue.
 *
 * The page used to put the database in front of the operator: a technical
 * work stage, a next action somebody had typed in by hand, and a date that
 * belonged to that note rather than to the work. Now it renders the UX-1 case
 * flow model, so a case says which human phase it is in, what the next step
 * actually is, whether that step is ours or somebody else's, and whether
 * anything is holding it up.
 *
 * It costs two reads. The paginated case list is the first; one call to
 * `admin_case_flow_facts_v1` for the identifiers on this page is the second.
 * The single-case loader is never called in a loop — that would be eight
 * reads per row — and flows are never requested for rows beyond the page the
 * operator is looking at.
 *
 * Ordering, filtering and pagination are exactly what they were. The queue
 * does not re-rank anything: no urgency score, no sort by blocker, no sort by
 * phase. If a projection cannot be built the page fails rather than falling
 * back to the stage and the recorded note, because a queue that quietly
 * reverts to the thing it replaced is worse than one that stops.
 */
export default async function Cases({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = filters(await searchParams)
  if (!f) notFound()
  const all = await listCases(f), rows = all.slice(0, 50), last = rows.at(-1)
  const flows = rows.length > 0 ? await loadCaseFlows(rows.map(row => row.id)) : new Map()
  // Paired by identifier rather than by position: the projection is not
  // obliged to answer in the order it was asked, and a row with no flow is an
  // error rather than a row rendered without one.
  const entries: CaseQueueEntry[] = rows.map(row => ({ row, flow: requiredCase(flows, row.id) }))

  return <section className="page">
    <PageHeader title="Cases" description="Review new requests, plan the next action and keep track of work already underway." />
    <section className="panel">
      <form className="filters">
        <label>Search reference, client or business<input name="q" defaultValue={f.q} maxLength={100} /></label>
        <label>Show<select name="filter" defaultValue={f.filter}>
          {Object.entries({
            open: "Open cases",
            all: "All cases",
            closed: "Closed and cancelled",
            unassigned: "Unassigned",
            overdue: "Overdue",
            GUIDED: "Guided",
            MANAGED: "Managed",
          }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button>Search</button>
      </form>
      <p className="muted">{rows.length} cases on this page.</p>
      {entries.length === 0
        ? <EmptyState>No cases match these filters.</EmptyState>
        : <CaseQueue entries={entries} />}
      {all.length > 50 && last && <div className="pagination">
        <Link href={`/cases?${new URLSearchParams({ q: f.q, filter: f.filter, time: last.createdAt, before: last.id })}`}>Next page</Link>
      </div>}
    </section>
  </section>
}
