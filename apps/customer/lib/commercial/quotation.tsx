"use client"

import { presentCustomerQuotation, type CustomerQuotationInput } from "../../../../lib/commercial/quotation-presentation"

type SectionHeading = "h2" | "h3"

export function CustomerQuotation({
  businessName,
  locationName,
  caseReference,
  quoteReference,
  orderReference,
  validUntilLabel,
  validUntilIso,
  sectionHeading = "h2",
  ...input
}: CustomerQuotationInput & {
  businessName?: string | null
  locationName?: string | null
  caseReference?: string | null
  quoteReference?: string | null
  orderReference?: string | null
  validUntilLabel: string
  validUntilIso?: string
  sectionHeading?: SectionHeading
}) {
  const quotation = presentCustomerQuotation(input)
  const HeadingTag = sectionHeading
  return (
    <div className="quotation">
      <div className="quotation-summary">
        <dl className="quotation-facts">
          {businessName ? <div><dt>Business</dt><dd>{businessName}</dd></div> : null}
          {locationName ? <div><dt>Location</dt><dd>{locationName}</dd></div> : null}
          {caseReference ? <div><dt>Case reference</dt><dd>{caseReference}</dd></div> : null}
          {quoteReference ? <div><dt>Quotation</dt><dd>{quoteReference}</dd></div> : null}
          <div><dt>Service</dt><dd>{input.serviceName}</dd></div>
          {orderReference ? <div><dt>Service order</dt><dd>{orderReference}</dd></div> : null}
          <div><dt>Valid until</dt><dd>{validUntilIso ? <time dateTime={validUntilIso}>{validUntilLabel}</time> : validUntilLabel}</dd></div>
        </dl>
        {quotation.priceRows.length > 0 ? (
          <dl className="quotation-facts">
            {quotation.priceRows.map(row => (
              <div key={row.label}><dt>{row.label}</dt><dd>{row.amount}</dd></div>
            ))}
          </dl>
        ) : null}
        <p className="quotation-price">{quotation.total}</p>
        <p>{quotation.taxNote}</p>
        <HeadingTag>What we will do</HeadingTag>
        <p className="quotation-prose">{quotation.deliverables}</p>
        <HeadingTag>Your part</HeadingTag>
        <p className="quotation-prose">{quotation.responsibilities}</p>
        <HeadingTag>What is not included</HeadingTag>
        <p className="quotation-prose">{quotation.exclusions}</p>
        {quotation.successDefinition ? (
          <>
            <HeadingTag>What counts as success</HeadingTag>
            <p className="quotation-prose">{quotation.successDefinition}</p>
          </>
        ) : null}
        <HeadingTag>When you pay</HeadingTag>
        <p className="quotation-prose">{quotation.paymentTiming}</p>
        {quotation.assurance ? <p>{quotation.assurance}</p> : null}
        {quotation.terms ? (
          <>
            <HeadingTag>Terms</HeadingTag>
            <p className="quotation-prose">{quotation.terms}</p>
          </>
        ) : null}
      </div>
    </div>
  )
}
