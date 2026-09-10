import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms",
  description: "Read the terms that apply to using the ReputeDefend website and enquiry route.",
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title: "Terms | ReputeDefend",
    description: "Read the terms that apply to using the ReputeDefend website and enquiry route.",
    url: "/terms",
  },
}

export default function TermsPage() {
  return (
    <article className="legal">
      <p className="eyebrow">Terms</p>
      <h1>Terms of use</h1>
      <p>This site provides general information and an enquiry route. It does not create a client relationship or promise a particular platform decision.</p>
    </article>
  )
}
