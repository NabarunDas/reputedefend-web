import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadReceiptDocument } from "@/lib/portal/billing/load"
import { BillingDocumentScreen, BillingUnavailable } from "@/lib/portal/billing/view"

export const metadata = { title: "Receipt" }

const SELECTOR = /^rc-[a-f0-9]{64}$/

export default async function ReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!portalAvailable()) redirect("/")
  const query = await searchParams
  const selector = typeof query.selector === "string" ? query.selector : ""
  if (Object.keys(query).length !== 1 || !SELECTOR.test(selector)) notFound()
  const loaded = await loadReceiptDocument(selector)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <BillingUnavailable title="We couldn't load this receipt" />
  if (loaded.status !== "ready") notFound()
  return (
    <BillingDocumentScreen
      document={loaded.document}
      downloadHref={`/api/portal/payments/receipt?selector=${selector}`}
      downloadLabel={`Download ${loaded.document.reference} PDF`}
      backHref="/portal/payments"
      backLabel="Back to payments"
    />
  )
}
