/**
 * Today: the operator's workbench.
 *
 * This page used to open with nineteen metric cards, a date-range control and
 * two paragraphs about temporal modes. Those are good answers to "how is the
 * business doing", which is not the question somebody has at nine in the
 * morning. The question is what to do, and the page now answers that first:
 * the open cases that need ProfileRelaunch, the ones that are stuck, the ones
 * somebody else owes us, the non-case queues that need clearing, and the
 * Guard checks today's schedule obliges us to do.
 *
 * It is not a second analysis surface. Reports still owns periods, history
 * and the full set of figures, and nothing has been removed from it. What is
 * left here of the old dashboard is a quiet snapshot at the bottom.
 *
 * There is no period control, because operational work is always current.
 * An old bookmarked range in the querystring simply has no effect rather than
 * producing an error page.
 */

import Link from "next/link"
import { ukDay } from "@/lib/admin/activity"
import { requireStaff } from "@/lib/require-staff"
import { loadTodayWork } from "@/lib/today/load"
import type { TodayWorkModel } from "@/lib/today/model"
import { TodayBlocked, TodayDoNext, TodayScanNotice, TodayWaiting } from "./today/case-work"
import {
  TodayClear,
  TodayGuardWork,
  TodayHealthStrip,
  TodayManagementSnapshot,
  TodayOperationalQueues,
  TodaySummary,
  TodayUpcoming,
} from "./today/panels"
import { PageHeader } from "./ui"

export const metadata = { title: "Today" }

/** The workbench itself, given a model. The loader stays in the page. */
export function TodayPage({ model, now }: { model: TodayWorkModel; now: Date }) {
  return <section className="page today-page">
    <PageHeader title="Today" description={ukDay(now)} />
    <TodaySummary summary={model.summary} complete={model.caseWork.complete} />
    <TodayHealthStrip health={model.health} />

    {model.summary.clear ? <TodayClear guard={model.guard} /> : <>
      <TodayScanNotice caseWork={model.caseWork} />
      {model.caseWork.complete && <>
        <TodayDoNext caseWork={model.caseWork} />
        <TodayBlocked caseWork={model.caseWork} />
        <TodayWaiting caseWork={model.caseWork} />
      </>}
      <TodayOperationalQueues groups={model.operational} />
      <TodayGuardWork guard={model.guard} />
    </>}

    <TodayUpcoming upcoming={model.upcoming} />
    <TodayManagementSnapshot management={model.management} />
    <p className="today-footer muted">
      <Link href="/cases">Open the full Cases queue</Link> · <Link href="/reports">Open reports</Link>
    </p>
  </section>
}

export default async function AdminHome() {
  await requireStaff()
  const now = new Date()
  return <TodayPage model={await loadTodayWork(now)} now={now} />
}
