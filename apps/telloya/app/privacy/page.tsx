import type { Metadata } from "next"
import { pageSocialMetadata } from "@/lib/brand"
import { LegalDocument } from "@/components/legal-document"
import { privacyNotice } from "@/lib/legal-notices"

const description = "How the Telloya marketing website handles an enquiry, where that enquiry is stored, and what is not yet confirmed about demonstration calls."

export const metadata: Metadata = {
  title: "Privacy notice",
  description,
  alternates: { canonical: "/privacy" },
  ...pageSocialMetadata({ title: "Privacy notice", description, path: "/privacy" }),
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow={privacyNotice.eyebrow}
      title={privacyNotice.title}
      lead={privacyNotice.lead}
      sections={privacyNotice.sections}
    />
  )
}
