import type { Metadata } from "next"
import { pageSocialMetadata } from "@/lib/brand"
import { LegalDocument } from "@/components/legal-document"
import { websiteTerms } from "@/lib/legal-notices"

export const metadata: Metadata = {
  title: "Website terms",
  description: "Terms for using the Telloya marketing website and sending an enquiry. They do not start a subscription or confirm a demonstration.",
  alternates: { canonical: "/terms" },
  ...pageSocialMetadata({
    title: "Website terms",
    description: "Terms for using the Telloya marketing website and sending an enquiry. They do not start a subscription or confirm a demonstration.",
    path: "/terms",
  }),
}

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow={websiteTerms.eyebrow}
      title={websiteTerms.title}
      lead={websiteTerms.lead}
      sections={websiteTerms.sections}
    />
  )
}
