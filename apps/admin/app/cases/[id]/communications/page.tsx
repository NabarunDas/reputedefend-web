import Link from "next/link"
import { getCase } from "@/lib/cases/queries"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { resolveCaseFlow } from "@/lib/case-flow/resolve"
import { evidenceRequestViews } from "@/lib/case-flow/evidence"
import { buildCommunicationsWorkspaceModel } from "@/lib/communications-workspace/model"
import { loadCaseCommunications } from "@/lib/communications/queries"
import { communicationsSendEnabled } from "@/lib/communications/gate"
import { loadCaseConversations, loadConversation } from "@/lib/conversations/queries"
import { getEvidenceCase } from "@/lib/evidence/queries"
import { isUuid } from "@/lib/records/model"
import { PageHeader } from "../../../ui"
import { CommunicationsWorkspace } from "./workspace-view"

export const metadata = { title: "Communications" }

/**
 * Case communications. Outbound history and linked conversations come from
 * case-scoped reads. The next action comes from CaseFlow. A conversation id
 * in the query is shown only when that conversation belongs to this case.
 */
export default async function CaseCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ conversation?: string | string[] }>
}) {
  const { id } = await params
  const query = await searchParams
  const selectedId = typeof query.conversation === "string" && isUuid(query.conversation) ? query.conversation : null
  const [caseDetail, facts, evidence, history, conversations] = await Promise.all([
    getCase(id),
    loadCaseFlowFacts(id),
    getEvidenceCase(id),
    loadCaseCommunications(id),
    loadCaseConversations(id),
  ])
  const flow = resolveCaseFlow(facts, new Date().toISOString())
  const selectedConversation = selectedId ? await loadConversation(selectedId) : null
  const titles = new Map(evidence.requests.map(request => [request.id, request.title]))
  const model = buildCommunicationsWorkspaceModel({
    caseId: caseDetail.id,
    caseStatus: caseDetail.status,
    customerId: caseDetail.customerId,
    primaryAction: flow.primaryAction,
    flowCommunications: facts.communications,
    history,
    conversations,
    evidenceRequests: evidenceRequestViews(facts.evidence).flatMap(request => {
      const title = titles.get(request.id)
      return title ? [{ id: request.id, title, state: request.state }] : []
    }),
    selectedConversationId: selectedId,
    selectedConversation,
    liveMailEnabled: communicationsSendEnabled() && facts.capabilities.liveMailEnabled,
  })
  return <section className="page case-workspace">
    <Link className="back-link" href={`/cases/${caseDetail.id}`}>Back to case {caseDetail.reference}</Link>
    <PageHeader
      title="Communications"
      description={<>{caseDetail.reference} · {caseDetail.client} — {caseDetail.business}. Outbound messages, delivery and conversations for this case.</>}
    />
    <CommunicationsWorkspace caseDetail={caseDetail} model={model} />
  </section>
}
