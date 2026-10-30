import type { BillingDocument } from "../../../../../lib/billing/document"

export function BillingUnavailable({ title }: { title: string }) {
  return (
    <div className="billing-page state-panel">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>{title}</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal/payments">Back to payments</a></p>
    </div>
  )
}

/** On-screen copy of a billing document. The download link sits outside the document. */
export function BillingDocumentScreen({
  document,
  downloadHref,
  downloadLabel,
  backHref,
  backLabel,
}: {
  document: BillingDocument
  downloadHref: string
  downloadLabel: string
  backHref: string
  backLabel: string
}) {
  return (
    <div className="billing-page">
      <p className="billing-page-tools">
        <a href={backHref}>{backLabel}</a>
        <a href={downloadHref}>{downloadLabel}</a>
      </p>
      <BillingDocumentView document={document} />
    </div>
  )
}

/** On-screen copy of a billing document. Downloads are a separate PDF of the same figures. */
export function BillingDocumentView({ document }: { document: BillingDocument }) {
  return (
    <article className="billing-document">
      <header className="billing-document-header">
        {/* The same static brand file is embedded in the PDF. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/profile-relaunch-logo.png" alt="ProfileRelaunch" />
        <div>
          <p className="billing-document-status">{document.status}</p>
          <h1>{document.title}</h1>
          <p>{document.reference}</p>
          <p>{document.issuedOnLabel}</p>
        </div>
      </header>
      <div className="billing-document-parties">
        <section>
          <h2>From</h2>
          <p>{document.seller.name}</p>
          {document.seller.lines.map(line => <p key={line}>{line}</p>)}
          {document.sellerMeta.map(line => <p key={line}>{line}</p>)}
          {document.seller.email ? <p>{document.seller.email}</p> : null}
        </section>
        <section>
          <h2>Bill to</h2>
          <p>{document.billTo.name}</p>
          {document.billTo.lines.map(line => <p key={line}>{line}</p>)}
          {document.billTo.email ? <p>{document.billTo.email}</p> : null}
        </section>
      </div>
      <table className="billing-document-lines">
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col">Qty</th>
            <th scope="col">Unit price</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map(line => (
            <tr key={`${line.description}-${line.amount}`}>
              <td>
                {line.description}
                {line.detail ? <span>{line.detail}</span> : null}
              </td>
              <td>{line.quantity}</td>
              <td>{line.unitAmount}</td>
              <td>{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="billing-document-totals">
        <tbody>
          {document.totals.map(row => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {document.details.length > 0 ? (
        <section className="billing-document-meta">
          <h2>{document.detailHeading}</h2>
          <dl className="billing-document-details">
            {document.details.map(row => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {document.notes.map(note => <p className="billing-document-note" key={note}>{note}</p>)}
    </article>
  )
}
