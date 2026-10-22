"use client"

import { useState } from "react"
import { agreementBlocks } from "../../../../lib/commercial/agreement-render"
import { AGREEMENT_PDF_UNAVAILABLE, AgreementPdfError, buildAgreementPdf } from "../../../../lib/commercial/agreement-pdf"

type Heading = "h2" | "h3"

const DOWNLOAD_NAME = "ProfileRelaunch-paid-service-agreement.pdf"

export function downloadPaidServiceAgreement(body: string) {
  const bytes = buildAgreementPdf(body)
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = DOWNLOAD_NAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function PaidServiceAgreementDocument({
  body,
  heading = "h2",
}: {
  version: string
  hash: string
  body: string
  heading?: Heading
}) {
  const HeadingTag = heading
  const SectionTag = heading === "h2" ? "h3" : "h4"
  const blocks = agreementBlocks(body)
  const [pdfError, setPdfError] = useState<string | null>(null)
  return (
    <article className="agreement-document" aria-labelledby="paid-service-agreement-heading">
      <HeadingTag id="paid-service-agreement-heading">Paid-service agreement</HeadingTag>
      <p>Read this agreement before accepting the quotation. The text below is the exact agreement bound to this quotation.</p>
      {blocks.map((block, index) => block.kind === "heading"
        ? <SectionTag key={index}>{block.text}</SectionTag>
        : <p key={index}>{block.text}</p>)}
      <button type="button" onClick={() => {
        try {
          downloadPaidServiceAgreement(body)
          setPdfError(null)
        } catch (error) {
          if (error instanceof AgreementPdfError) {
            console.error("Agreement PDF was not created.", error.codePoint)
            setPdfError(AGREEMENT_PDF_UNAVAILABLE)
            return
          }
          throw error
        }
      }}>Download the agreement as a PDF</button>
      {pdfError ? <p role="alert">{pdfError}</p> : null}
    </article>
  )
}

export function AgreementAcceptanceClosed() {
  return (
    <p role="status">
      This quotation cannot be accepted because the commercial agreement bound to it is not available.
    </p>
  )
}
