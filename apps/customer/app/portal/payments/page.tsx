import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadCustomerPayments } from "@/lib/portal/payments/queries"
import { PaymentsUnavailable, PaymentsView } from "./payments-view"

export const metadata = { title: "Payments" }

export default async function CustomerPaymentsPage() {
  if (!portalAvailable()) redirect("/")
  const loaded = await loadCustomerPayments()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <PaymentsUnavailable />
  return <PaymentsView cases={loaded.payments.cases} focused={false} />
}
