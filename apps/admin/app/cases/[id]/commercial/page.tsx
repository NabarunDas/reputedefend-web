import Link from "next/link"
import { getCase } from "@/lib/cases/queries"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { resolveCaseFlow } from "@/lib/case-flow/resolve"
import { buildCommercialWorkspaceModel } from "@/lib/commercial-workspace/model"
import { loadCatalogue, loadOrders, loadQuotes } from "@/lib/commerce/queries"
import { loadMoney } from "@/lib/payments/queries"
import { PageHeader } from "../../../ui"
import { CommercialWorkspace } from "./workspace-view"

export const metadata = { title: "Commercial and money" }

export default async function CaseCommercialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const now = new Date()
  const [caseDetail, facts, catalogue, quotes, orders, money] = await Promise.all([
    getCase(id),
    loadCaseFlowFacts(id),
    loadCatalogue(),
    loadQuotes(),
    loadOrders(),
    loadMoney(),
  ])
  const flow = resolveCaseFlow(facts, now.toISOString())
  const model = buildCommercialWorkspaceModel({
    facts,
    primaryAction: flow.primaryAction,
    now: now.toISOString(),
    quotes: quotes.quotes,
    orders: orders.orders,
    money: money.orders,
    prices: catalogue.prices,
  })
  return <section className="page commercial-workspace">
    <Link className="back-link" href={`/cases/${caseDetail.id}`}>Back to case {caseDetail.reference}</Link>
    <PageHeader
      title="Commercial and money"
      description={<>{caseDetail.reference} · {caseDetail.client} — {caseDetail.business}. Quote, acceptance, service order and payment or setup for this case.</>}
    />
    <CommercialWorkspace caseDetail={caseDetail} model={model} />
  </section>
}
