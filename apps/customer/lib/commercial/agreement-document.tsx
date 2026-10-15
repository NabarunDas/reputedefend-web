"use client"

type Heading = "h2" | "h3"

export function downloadPaidServiceAgreement(version: string, body: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${version}-paid-service-agreement.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function PaidServiceAgreementDocument({
  version,
  hash,
  body,
  heading = "h2",
}: {
  version: string
  hash: string
  body: string
  heading?: Heading
}) {
  const HeadingTag = heading
  return (
    <article aria-labelledby="paid-service-agreement-heading">
      <HeadingTag id="paid-service-agreement-heading">Paid-service agreement</HeadingTag>
      <p>Read this agreement before accepting the quotation. Version {version}. SHA-256 {hash}.</p>
      <p className="preserve-lines">{body}</p>
      <button type="button" onClick={() => downloadPaidServiceAgreement(version, body)}>
        Download the paid-service agreement
      </button>
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
