import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { enquiryFilters } from "@/lib/enquiries/model"
import { listEnquiries } from "@/lib/enquiries/queries"
import { filters } from "@/lib/cases/model"
import { listCases, listTasks } from "@/lib/cases/queries"
import { ukDate } from "@/lib/admin/activity"
import { Badge, EmptyState, PageHeader, queueCountLabel } from "./ui"

export const metadata = { title: "Today" }

export default async function AdminHome() {
  await requireStaff()
  const enquiryFilter = enquiryFilters({})
  const caseFilter = filters({})
  const taskFilter = filters({}, true)
  const overdueFilter = filters({ filter: "overdue" }, true)
  if (!enquiryFilter || !caseFilter || !taskFilter || !overdueFilter) {
    return <section className="page"><PageHeader title="Today" /><section className="panel"><EmptyState>Queue filters are unavailable. Open the existing lists from the sidebar.</EmptyState></section></section>
  }
  const [enquiries, cases, tasks, overdueTasks] = await Promise.all([
    listEnquiries(enquiryFilter),
    listCases(caseFilter),
    listTasks(taskFilter),
    listTasks(overdueFilter),
  ])
  const overduePreview = overdueTasks.slice(0, 5)
  return <section className="page">
    <PageHeader title="Today" description="Queues that already exist in this workspace. Counts are taken from the current list page, so a value of 50+ means there is at least one further page." />
    <div className="summary-grid">
      <Link className="panel summary-card" href="/enquiries">
        <p className="label">Open enquiries</p>
        <p className="count">{queueCountLabel(enquiries)}</p>
        <p className="hint">Active enquiry queue</p>
        <p className="action">View enquiries</p>
      </Link>
      <Link className="panel summary-card" href="/cases">
        <p className="label">Open cases</p>
        <p className="count">{queueCountLabel(cases)}</p>
        <p className="hint">Open case queue</p>
        <p className="action">View cases</p>
      </Link>
      <Link className="panel summary-card" href="/tasks">
        <p className="label">Open tasks</p>
        <p className="count">{queueCountLabel(tasks)}</p>
        <p className="hint">Open task queue</p>
        <p className="action">View tasks</p>
      </Link>
      <Link className="panel summary-card" href="/tasks?filter=overdue">
        <p className="label">Overdue tasks</p>
        <p className="count">{queueCountLabel(overdueTasks)}</p>
        <p className="hint">Overdue task queue</p>
        <p className="action">View overdue tasks</p>
      </Link>
    </div>
    <section className="panel">
      <h2>Needs attention</h2>
      {!overduePreview.length ? <EmptyState>No overdue tasks in the current queue. Review enquiries and cases from the cards above.</EmptyState> : <>
        <p className="muted">Earliest overdue tasks from the existing task queue.</p>
        <ul className="attention-list">{overduePreview.map(task => <li key={task.id}>
          <div>
            <Link href={`/cases/${task.caseId}`}>{task.reference}: {task.title}</Link>
            <p className="muted">{task.owner === "ADMIN" ? "Admin" : "Customer"} · {ukDate(task.due)}</p>
          </div>
          <Badge tone="danger">{task.status}</Badge>
        </li>)}</ul>
      </>}
    </section>
  </section>
}
