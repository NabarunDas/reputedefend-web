import Link from "next/link"
import { ukDate } from "@/lib/admin/activity"
import { loadCatalogue, loadOrders, loadQuotes } from "@/lib/commerce/queries"
import { formatGbp, orderStateLabel, paymentModelLabel, taxLabel } from "@/lib/commerce/model"
import { Badge, EmptyState, PageHeader } from "../ui"
import {
  ApprovePriceForm, CreatePriceForm, CreateQuoteForm, CreateVersionForm, OfferQuoteActionForm, QuoteActionForm,
  RecordQualificationForm, RetirePriceForm, RevokeQuoteActionForm, SetDraftTaxForm,
} from "./forms"

export const metadata = { title: "Commercial" }

export default async function CommercialPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; status?: string | string[]; q?: string | string[] }> }) {
  const params = await searchParams
  const tab = typeof params.tab === "string" ? params.tab : "catalogue"
  const status = typeof params.status === "string" ? params.status : null
  const q = typeof params.q === "string" ? params.q : null
  const catalogue = await loadCatalogue()
  const quotes = tab === "quotes" || tab === "catalogue" ? await loadQuotes(status, q) : { quotes: [] }
  const orders = tab === "orders" ? await loadOrders() : { orders: [] }
  return <section className="page">
    <PageHeader title="Commercial" description="Catalogue, quotes and accepted service orders. This workspace does not take payment, create Stripe objects, or activate monitoring. Seeded prices remain tax-unconfirmed until Finance configuration." />
    <p>
      <Link href="/commercial?tab=catalogue" aria-current={tab === "catalogue" ? "page" : undefined}>Catalogue</Link>
      {" · "}
      <Link href="/commercial?tab=quotes" aria-current={tab === "quotes" ? "page" : undefined}>Quotes</Link>
      {" · "}
      <Link href="/commercial?tab=orders" aria-current={tab === "orders" ? "page" : undefined}>Orders</Link>
    </p>
    {tab === "catalogue" && <>
      <section className="panel">
        <h2>Create future price version</h2>
        <p className="muted">New versions must take effect in the future. Approval requires a fresh sign-in and does not rewrite the effective date. Approved amounts cannot be edited in place. Quotes use only the current approved price.</p>
        <CreatePriceForm />
      </section>
      <section className="panel">
        <h2>Price versions</h2>
        {!catalogue.prices.length ? <EmptyState>No price versions recorded.</EmptyState> : <div className="table-scroll" role="region" aria-label="Catalogue" tabIndex={0}>
          <table>
            <thead><tr><th>Service</th><th>Amount</th><th>Payment</th><th>Tax</th><th>Effective</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{catalogue.prices.map(row => <tr key={row.id}>
              <td>{row.displayName}<br /><span className="muted">{row.serviceCode} · {row.id}</span></td>
              <td>{formatGbp(row.amountMinor)} {row.currency}<br /><span className="muted">{row.amountMinor} pence</span></td>
              <td>{paymentModelLabel(row.paymentModel)}</td>
              <td><Badge>{taxLabel(row.taxBehaviour)}</Badge></td>
              <td>From {ukDate(row.effectiveFrom)}{row.effectiveTo ? <><br />To {ukDate(row.effectiveTo)}</> : null}</td>
              <td><Badge tone={row.status === "APPROVED" ? "success" : row.status === "RETIRED" ? "neutral" : "warning"}>{row.status}</Badge></td>
              <td>
                {row.status === "DRAFT" && <ApprovePriceForm priceVersionId={row.id} version={row.version} />}
                {row.status === "APPROVED" && <RetirePriceForm priceVersionId={row.id} version={row.version} />}
              </td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </>}
    {tab === "quotes" && <>
      <section className="panel">
        <h2>Create quote</h2>
        <CreateQuoteForm />
        <h3>Guard qualification snapshot</h3>
        <RecordQualificationForm />
      </section>
      <section className="panel">
        <h2>Quotes</h2>
        <form className="filters" action="/commercial" method="get">
          <input type="hidden" name="tab" value="quotes" />
          <label>Status
            <select name="status" defaultValue={status || ""}>
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="OFFERED">Offered</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DECLINED">Declined</option>
              <option value="SUPERSEDED">Superseded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label>Search<input name="q" defaultValue={q || ""} maxLength={80} /></label>
          <button type="submit">Filter</button>
        </form>
        {!quotes.quotes.length ? <EmptyState>No quotes recorded yet.</EmptyState> : <div className="table-scroll" role="region" aria-label="Quotes" tabIndex={0}>
          <table>
            <thead><tr><th>Quote</th><th>Service</th><th>Amounts</th><th>Tax</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{quotes.quotes.map(row => <tr key={row.id}>
              <td>
                {row.publicRef}<br />
                <span className="muted">{row.customerName} · {row.businessName}</span><br />
                <span className="muted">{row.caseReference || row.monitoringRequestId || "No case"}</span>
              </td>
              <td>
                {row.currentVersion.serviceName} v{row.currentVersion.versionNumber}<br />
                <span className="muted">{paymentModelLabel(row.currentVersion.paymentModel)}</span>
              </td>
              <td>
                Standard {formatGbp(row.currentVersion.standardAmountMinor)}<br />
                Discount {formatGbp(row.currentVersion.discountAmountMinor)} {row.currentVersion.discountPolicyId !== "NONE" ? `(${row.currentVersion.discountPolicyId})` : ""}<br />
                Total {formatGbp(row.currentVersion.totalAmountMinor)}
              </td>
              <td><Badge tone={row.currentVersion.taxBehaviour === "UNCONFIRMED" ? "warning" : "neutral"}>{taxLabel(row.currentVersion.taxBehaviour)}</Badge></td>
              <td>
                <Badge>{row.status}</Badge>
                {row.acceptedAt && <><br /><span className="muted">Accepted {ukDate(row.acceptedAt)}</span></>}
                {row.orderRef && <><br /><span className="muted">{row.orderRef}</span></>}
              </td>
              <td>
                {row.currentVersion.status === "DRAFT" && <>
                  <SetDraftTaxForm quoteId={row.id} version={row.version} quoteVersionId={row.currentVersion.id} />
                  <QuoteActionForm operation="offer" quoteId={row.id} version={row.version} quoteVersionId={row.currentVersion.id} label="Offer" />
                  <QuoteActionForm operation="cancel" quoteId={row.id} version={row.version} label="Cancel" />
                </>}
                {row.status === "OFFERED" && <>
                  <CreateVersionForm quoteId={row.id} version={row.version} />
                  <OfferQuoteActionForm quoteId={row.id} />
                  <QuoteActionForm operation="supersede" quoteId={row.id} version={row.version} label="Supersede" />
                  <QuoteActionForm operation="cancel" quoteId={row.id} version={row.version} label="Cancel" />
                  {row.action?.status === "OPEN" && <RevokeQuoteActionForm quoteId={row.id} actionId={row.action.id} />}
                </>}
                {row.action && <p className="muted">Action {row.action.status}</p>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </>}
    {tab === "orders" && <section className="panel">
      <h2>Service orders</h2>
      <p className="muted">Read-only. There is no Mark paid or Charge control. Step 14 owns payment collection.</p>
      {!orders.orders.length ? <EmptyState>No accepted service orders yet.</EmptyState> : <div className="table-scroll" role="region" aria-label="Orders" tabIndex={0}>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Amount</th><th>State</th></tr></thead>
          <tbody>{orders.orders.map(row => <tr key={row.id}>
            <td>{row.publicRef}<br /><span className="muted">{row.quoteRef}</span></td>
            <td>{row.customerName}<br /><span className="muted">{row.businessName}{row.caseReference ? ` · ${row.caseReference}` : ""}</span></td>
            <td>{row.serviceCode}<br /><span className="muted">{paymentModelLabel(row.paymentModel)}</span></td>
            <td>{formatGbp(row.amountMinor)} {row.currency}<br /><span className="muted">{taxLabel(row.taxBehaviour)} tax {formatGbp(row.taxAmountMinor)}</span></td>
            <td><Badge>{orderStateLabel(row.state)}</Badge><br /><span className="muted">{ukDate(row.acceptedAt)}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}
  </section>
}
