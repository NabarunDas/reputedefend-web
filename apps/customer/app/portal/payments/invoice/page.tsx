import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadInvoiceDocument } from "@/lib/portal/billing/load"
import { BillingDocumentScreen, BillingUnavailable } from "@/lib/portal/billing/view"
import { PAUSED_INVOICE_MESSAGE } from "@/lib/portal/payments/paused-invoice"

export const metadata = { title: "Invoice" }

const SELECTOR = /^ca-[a-f0-9]{64}$/

export default async function InvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!portalAvailable()) redirect("/")
  const query = await searchParams
  const reference = typeof query.reference === "string" ? query.reference : ""
  const selector = typeof query.selector === "string" ? query.selector : ""
  const names = Object.keys(query)
  if (names.length !== 2 || !names.includes("reference") || !names.includes("selector")) notFound()
  if (!isPublicCaseReference(reference) || !SELECTOR.test(selector)) notFound()
  const loaded = await loadInvoiceDocument(reference, selector)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "paused") {
    return (
      <div className="billing-page">
        <h1>Payment collection is paused</h1>
        <p>{PAUSED_INVOICE_MESSAGE}</p>
        <p className="case-back"><a href={`/portal/cases/${reference}/payments`}>Back to payments</a></p>
      </div>
    )
  }
  if (loaded.status === "unavailable") return <BillingUnavailable title="We couldn't load this invoice" />
  if (loaded.status !== "ready") notFound()
  return (
    <BillingDocumentScreen
      document={loaded.document}
      downloadHref={`/api/portal/payments/invoice-document?reference=${reference}&selector=${selector}`}
      downloadLabel={`Download ${loaded.document.reference} PDF`}
      backHref={`/portal/cases/${reference}/payments`}
      backLabel="Back to payments"
    />
  )
}
