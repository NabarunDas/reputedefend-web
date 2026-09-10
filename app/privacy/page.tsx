import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy",
  description: "Learn how ReputeDefend handles information shared through this website.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title: "Privacy | ReputeDefend",
    description: "Learn how ReputeDefend handles information shared through this website.",
    url: "/privacy",
  },
}

export default function PrivacyPage() {
  return (
    <article className="legal">
      <p className="eyebrow">Privacy</p>
      <h1>Privacy information</h1>
      <p>This website is designed to keep data collection minimal. Enquiry details are only used to respond to your message and are not sold.</p>
    </article>
  )
}
