import { cookies } from "next/headers"
import { portalSessionCookieName } from "@/lib/portal/config"
import { loadCustomerPayments } from "@/lib/portal/payments/queries"
import {
  paymentReturnResumeHref,
  paymentReturnResumed,
  paymentReturnView,
  requestedOrderRef,
  type PaymentReturnView,
} from "@/lib/portal/payments/return-view"
import { PaymentReturnResumeNavigate } from "./resume"
import { PaymentReturnScreen } from "./return-screen"

export const metadata = { title: "Payment confirmation" }

function resumeView(href: string): PaymentReturnView {
  return {
    tone: "pending",
    heading: "Payment is being confirmed",
    paragraphs: ["Continuing to your payment status."],
    links: [{ href, label: "Continue" }],
    refresh: false,
  }
}

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  const query = searchParams ? await searchParams : {}
  const orderRef = requestedOrderRef(query)
  const jar = await cookies()
  const hasSession = Boolean(jar.get(portalSessionCookieName())?.value)
  // Stripe Checkout is a cross-site navigation, so the Strict portal cookie is
  // absent on the first request. A second same-origin navigation sends it.
  // The hop shows no payment details and carries no session token.
  if (!hasSession && !paymentReturnResumed(query)) {
    const href = paymentReturnResumeHref(orderRef)
    return (
      <>
        <PaymentReturnResumeNavigate href={href} />
        <PaymentReturnScreen view={resumeView(href)} />
      </>
    )
  }
  const loaded = await loadCustomerPayments()
  const view = paymentReturnView(
    loaded.status === "ready" ? { status: "ready", payments: loaded.payments } : { status: loaded.status },
    orderRef,
  )
  return <PaymentReturnScreen view={view} />
}
