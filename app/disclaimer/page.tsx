import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Understand the independent nature and limitations of ReputeDefend reputation support.",
  alternates: { canonical: "/disclaimer" },
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title: "Disclaimer | ReputeDefend",
    description: "Understand the independent nature and limitations of ReputeDefend reputation support.",
    url: "/disclaimer",
  },
}

export default function DisclaimerPage() {
  return (
    <article className="legal">
      <p className="eyebrow">Disclaimer</p>
      <h1>Independent support, not Google.</h1>
      <p>ReputeDefend is independent of Google. We cannot guarantee reinstatement, review removal, ranking changes or any other platform outcome. Information shared here is practical guidance, not legal advice.</p>
    </article>
  )
}
