import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadCustomerCase } from "@/lib/portal/cases/queries"
import { loadCustomerCaseDocuments } from "@/lib/portal/documents/queries"
import { presentCaseCommerce } from "@/lib/portal/payments/model"
import { loadCustomerCasePayments } from "@/lib/portal/payments/queries"
import { CaseUnavailable, CaseWorkspace } from "./case-workspace"
import type { GuidedHandoverState } from "./documents/handover-form"

export const metadata = { title: "Case" }

export default async function CustomerCasePage({ params }: { params: Promise<{ reference: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { reference } = await params
  if (!isPublicCaseReference(reference)) notFound()
  const loaded = await loadCustomerCase(reference)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <CaseUnavailable />
  const payments = await loadCustomerCasePayments(reference)
  if (payments.status === "unauthenticated") redirect("/login")
  const commerce = payments.status === "ready" ? presentCaseCommerce(payments.payments.case) : null
  const item = loaded.detail.case
  const guidedCase = item.serviceTrack === "GUIDED" && item.status !== "CANCELLED"
  let packHref: string | null = null
  let packHandover: GuidedHandoverState | null = null
  if (guidedCase) {
    const documents = await loadCustomerCaseDocuments(reference)
    if (documents.status === "unauthenticated") redirect("/login")
    if (documents.status === "ready" && documents.documents.pack) {
      packHref = `/portal/cases/${reference}/documents`
      const pack = documents.documents.pack
      packHandover = {
        submitted: pack.customerSubmitted,
        correctionRequested: pack.correctionRequested,
        outcomeReported: pack.outcomeReported,
        outcomeReviewed: pack.outcomeReviewed,
        evidenceOptions: documents.documents.requests.filter(request => request.filename).map(request => ({
          selector: request.selector,
          label: request.filename ?? request.title,
        })),
      }
    }
  }
  return <CaseWorkspace detail={loaded.detail} commerce={commerce} packHref={packHref} packPublished={guidedCase ? packHref !== null : undefined} handover={packHandover} />
}
