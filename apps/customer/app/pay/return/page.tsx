export const metadata = { title: "Payment confirmation" }

export default function PaymentReturnPage() {
  return <section>
    <h1>We’re confirming your payment</h1>
    <p>This page does not mark a payment as paid. ProfileRelaunch confirms collection from the signed Stripe webhook.</p>
  </section>
}
