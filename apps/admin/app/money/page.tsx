import { ukDate } from "@/lib/admin/activity"
import { formatGbp, paymentModelLabel } from "@/lib/commerce/model"
import { loadMoney } from "@/lib/payments/queries"
import { obligationLabel } from "@/lib/payments/model"
import { Badge, EmptyState, PageHeader } from "../ui"
import { ApproveSuccessFeeForm, IssuePaymentActionForm } from "./forms"

export const metadata = { title: "Money" }

export default async function MoneyPage() {
  const money = await loadMoney()
  return <section className="page">
    <PageHeader title="Money" description="Payment obligations, payment-method setup, success-fee approval, and TEST-MODE hosted invoice fallback. Stripe remains disabled until a later Finance launch gate. This workspace has no Mark paid, Force success, or Change amount controls." />
    <section className="panel">
      <h2>Service orders</h2>
      {!money.orders.length ? <EmptyState>No accepted service orders.</EmptyState> : <div className="table-scroll" role="region" aria-label="Money" tabIndex={0}>
        <table>
          <thead><tr><th>Order</th><th>Amount</th><th>Model</th><th>Obligation</th><th>Setup</th><th>Next action</th></tr></thead>
          <tbody>{money.orders.map(row => <tr key={row.orderId}>
            <td>{row.orderRef}<br /><span className="muted">{row.serviceCode} · {row.orderId}</span></td>
            <td>{formatGbp(row.amountMinor)} {row.currency}</td>
            <td>{paymentModelLabel(row.paymentModel)}</td>
            <td><Badge tone={row.obligationState === "PAID" ? "success" : row.obligationState === "AUTHENTICATION_REQUIRED" ? "warning" : "neutral"}>{obligationLabel(row.obligationState)}</Badge></td>
            <td>{row.setupReady ? "Payment method saved" : row.consentId ? "Consent recorded" : "Not set up"}</td>
            <td>
              {row.paymentModel === "UPFRONT" && row.obligationState !== "PAID" && <IssuePaymentActionForm serviceOrderId={row.orderId} version={row.version} operation="issue_guided_payment_action" label="Issue upfront payment action" />}
              {row.paymentModel === "SUCCESS_FEE" && !row.setupReady && <IssuePaymentActionForm serviceOrderId={row.orderId} version={row.version} operation="issue_managed_setup_action" label="Issue payment-method setup action" />}
              {row.paymentModel === "SUCCESS_FEE" && row.obligationState === "AUTHENTICATION_REQUIRED" && row.obligationId && <IssuePaymentActionForm serviceOrderId={row.orderId} version={row.version} operation="issue_recovery_action" label="Issue recovery action" obligationId={row.obligationId} />}
              {row.paymentModel === "SUCCESS_FEE" && !row.approvalId && <ApproveSuccessFeeForm serviceOrderId={row.orderId} version={row.version} evidence={row.acceptedEvidence} />}
              {row.obligationId && row.obligationState && !["PAID", "VOID"].includes(row.obligationState) && row.invoiceStatus !== "ISSUED" && row.invoiceStatus !== "PAID" && !row.receiptId && <IssuePaymentActionForm serviceOrderId={row.orderId} version={row.version} operation="issue_invoice_fallback" label="Issue TEST-MODE hosted invoice fallback" obligationId={row.obligationId} />}
              {row.invoiceStatus === "ISSUED" && <p>TEST-MODE hosted invoice issued. Payment is confirmed only from the Stripe webhook.</p>}
              {row.receiptId && <p>Receipt recorded {ukDate(new Date().toISOString())}.</p>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </section>
}
