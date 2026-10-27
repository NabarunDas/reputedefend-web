import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadQuotationDocument } from "@/lib/portal/billing/load"
import { BillingDocumentScreen, BillingUnavailable } from "@/lib/portal/billing/view"

export const metadata = { title: "Quotation" }

export default async function QuotationPage({ params }: { params: Promise<{ reference: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { reference } = await params
  if (!isPublicCaseReference(reference)) notFound()
  const loaded = await loadQuotationDocument(reference)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <BillingUnavailable title="We couldn't load this quotation" />
  if (loaded.status !== "ready") notFound()
  return (
    <BillingDocumentScreen
      document={loaded.document}
      downloadHref={`/api/portal/service/quotation?reference=${reference}`}
      downloadLabel={`Download ${loaded.document.reference} PDF`}
      backHref={`/portal/cases/${reference}/service`}
      backLabel="Back to your service"
    />
  )
}
