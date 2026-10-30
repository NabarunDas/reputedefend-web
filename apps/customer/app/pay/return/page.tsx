import { loadCustomerPayments } from "@/lib/portal/payments/queries"
import { paymentReturnView, requestedOrderRef } from "@/lib/portal/payments/return-view"
import { PaymentReturnScreen } from "./return-screen"

export const metadata = { title: "Payment confirmation" }

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  const query = searchParams ? await searchParams : {}
  const loaded = await loadCustomerPayments()
  const view = paymentReturnView(
    loaded.status === "ready" ? { status: "ready", payments: loaded.payments } : { status: loaded.status },
    requestedOrderRef(query),
  )
  return <PaymentReturnScreen view={view} />
}
