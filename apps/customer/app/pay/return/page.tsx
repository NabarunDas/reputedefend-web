export const metadata = { title: "Payment confirmation" }

export default function PaymentReturnPage() {
  return <section>
    <h1>We’re confirming your payment</h1>
    <p>This page does not mark a payment as paid and does not start Guard billing. ProfileRelaunch confirms collection from the signed Stripe webhook. A Guard subscription becomes current only after a confirmed recurring invoice payment.</p>
  </section>
}
