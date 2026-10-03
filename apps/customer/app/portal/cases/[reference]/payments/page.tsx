import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadCustomerCasePayments } from "@/lib/portal/payments/queries"
import { PaymentsUnavailable, PaymentsView } from "../../../payments/payments-view"

export const metadata = { title: "Payments" }

export default async function CustomerCasePaymentsPage({ params }: { params: Promise<{ reference: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { reference } = await params
  if (!isPublicCaseReference(reference)) notFound()
  const loaded = await loadCustomerCasePayments(reference)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <PaymentsUnavailable />
  return <PaymentsView cases={[loaded.payments.case]} focused />
}
