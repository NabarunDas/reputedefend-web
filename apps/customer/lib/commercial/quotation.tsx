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
  const DetailTag = sectionHeading === "h2" ? "h3" : "h4"
  return (
    <div className="quotation">
      <div className="quotation-summary">
        <dl className="quotation-facts">
          {businessName ? <div><dt>Business</dt><dd>{businessName}</dd></div> : null}
          {locationName ? <div><dt>Location</dt><dd>{locationName}</dd></div> : null}
          {caseReference ? <div><dt>Case reference</dt><dd>{caseReference}</dd></div> : null}
          {quoteReference ? <div><dt>Quotation number</dt><dd>{quoteReference}</dd></div> : null}
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
        {quotation.paymentBasis ? <p className="quotation-note">Payment basis: {quotation.paymentBasis}</p> : null}
        <HeadingTag>What ProfileRelaunch will do</HeadingTag>
        <p className="quotation-prose">{quotation.providerWork}</p>
        <HeadingTag>What you need to do</HeadingTag>
        <p className="quotation-prose">{quotation.customerWork}</p>
        <HeadingTag>What is not included</HeadingTag>
        <p className="quotation-prose quotation-record">{quotation.exclusions || "No exclusions are recorded on this quotation."}</p>
        <HeadingTag>Quotation wording</HeadingTag>
        <p className="quotation-prose">The scope and payment wording below are the terms recorded on this quotation.</p>
        <DetailTag>Scope</DetailTag>
        <p className="quotation-prose quotation-record">{quotation.scope || "No scope is recorded on this quotation."}</p>
        <DetailTag>When you pay</DetailTag>
        <p className="quotation-prose quotation-record">{quotation.paymentWording || "No payment wording is recorded on this quotation."}</p>
        {quotation.successDefinition ? (
          <>
            <DetailTag>What counts as success</DetailTag>
            <p className="quotation-prose quotation-record">{quotation.successDefinition}</p>
          </>
        ) : null}
        {quotation.assurance ? <p>{quotation.assurance}</p> : null}
        {quotation.terms ? (
          <>
            <DetailTag>Terms</DetailTag>
            <p className="quotation-prose">{quotation.terms}</p>
          </>
        ) : null}
      </div>
    </div>
  )
}
