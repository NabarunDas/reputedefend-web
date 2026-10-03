import Link from "next/link"
import { getCase } from "@/lib/cases/queries"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { resolveCaseFlow, summariseCommercial } from "@/lib/case-flow/resolve"
import { buildCommercialWorkspaceModel } from "@/lib/commercial-workspace/model"
import { loadCatalogue, loadOrder, loadQuote } from "@/lib/commerce/queries"
import { loadMoney } from "@/lib/payments/queries"
import { PageHeader } from "../../../ui"
import { CommercialWorkspace } from "./workspace-view"

export const metadata = { title: "Commercial and money" }

/**
 * Quote and order detail are loaded by the identifiers CaseFlow already
 * named. The global quote and order queues stay on `/commercial`; this page
 * does not depend on a case still being inside their first page.
 */
export default async function CaseCommercialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const now = new Date().toISOString()
  const [caseDetail, facts, catalogue, money] = await Promise.all([
    getCase(id),
    loadCaseFlowFacts(id),
    loadCatalogue(),
    loadMoney(),
  ])
  const flow = resolveCaseFlow(facts, now)
  const commercial = summariseCommercial(facts, now)
  const quoteId = commercial.quote?.id ?? null
  const orderId = commercial.quote?.orderId ?? null
  const [quote, order] = await Promise.all([
    quoteId ? loadQuote(quoteId) : Promise.resolve(null),
    orderId ? loadOrder(orderId) : Promise.resolve(null),
  ])
  const quoteDetailMissing = !!quoteId && quote?.id !== quoteId
  const orderDetailMissing = !!orderId && order?.id !== orderId
  const model = buildCommercialWorkspaceModel({
    facts,
    primaryAction: flow.primaryAction,
    now,
    quote: quoteDetailMissing ? null : quote,
    quoteDetailMissing,
    order: orderDetailMissing ? null : order,
    orderDetailMissing,
    money: orderId ? money.orders.filter(row => row.orderId === orderId) : [],
    prices: catalogue.prices,
  })
  return <section className="page case-workspace commercial-workspace">
    <Link className="back-link" href={`/cases/${caseDetail.id}`}>Back to case {caseDetail.reference}</Link>
    <PageHeader
      title="Commercial and money"
      description={<>{caseDetail.reference} · {caseDetail.client} — {caseDetail.business}. Quote, acceptance, service order and payment or setup for this case.</>}
    />
    <CommercialWorkspace caseDetail={caseDetail} model={model} />
  </section>
}
