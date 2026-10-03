import Link from "next/link"
import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { resolveCaseFlow } from "@/lib/case-flow/resolve"
import { getEvidenceCase } from "@/lib/evidence/queries"
import { buildEvidenceWorkspaceModel } from "@/lib/evidence/workspace"
import { getPreparedPackCase } from "@/lib/packs/queries"
import { PageHeader } from "../../../ui"
import { EvidenceWorkspace } from "./workspace-view"

export const metadata = { title: "Evidence" }

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const now = new Date()
  const [caseDetail, evidence, packs, facts] = await Promise.all([
    getCase(id),
    getEvidenceCase(id),
    getPreparedPackCase(id),
    loadCaseFlowFacts(id),
  ])
  if (!caseDetail || !evidence || !packs) notFound()
  const flow = resolveCaseFlow(facts, now.toISOString())
  const model = buildEvidenceWorkspaceModel({
    evidence,
    evidenceFacts: facts.evidence,
    communications: facts.communications,
    primaryAction: flow.primaryAction,
    now: now.toISOString(),
    hasPack: packs.packs.length > 0 || packs.eligible.length > 0,
  })
  return <section className="page case-workspace evidence-workspace">
    <Link className="back-link" href={`/cases/${caseDetail.id}`}>Back to case {caseDetail.reference}</Link>
    <PageHeader
      title="Evidence"
      description={<>{caseDetail.reference} · {caseDetail.client} — {caseDetail.business}. Files are stored privately. A clean scan is required before view, download or review.</>}
    />
    <EvidenceWorkspace caseDetail={caseDetail} evidence={evidence} packs={packs} model={model} />
  </section>
}
