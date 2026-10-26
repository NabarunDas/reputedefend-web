import { loadCustomerPayments } from "@/lib/portal/payments/queries"
import { paymentReturnView, requestedOrderRef } from "@/lib/portal/payments/return-view"
import { PaymentReturnRefresh } from "./refresh"

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
  return <section>
    <h1>{view.heading}</h1>
    {view.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    {view.links.length ? <p>{view.links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</p> : null}
    {view.refresh ? <PaymentReturnRefresh /> : null}
  </section>
}
