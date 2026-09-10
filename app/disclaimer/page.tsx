import type { Metadata } from "next"
import Link from "next/link"
import { LegalCallout, LegalPage, type LegalSection } from "@/components/legal-page"
import { hasLegalValue, legalIdentity } from "@/lib/legal"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

const title = "Disclaimer | ReputeDefend"
const description = "ReputeDefend is independent of Google. Profile reinstatement, review removal and platform timeframes are not guaranteed. Website information is not legal advice."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/disclaimer" },
  openGraph: socialOpenGraph({ title, description, path: "/disclaimer" }),
  twitter: socialTwitter({ title, description }),
}

const sections: LegalSection[] = [
  {
    id: "independence",
    title: "Independent of Google",
    content: (
      <>
        <p>{legalIdentity.tradingName} is independent of Google. We are not Google, we do not speak for Google, and we do not claim official representation or special access to Google’s systems or decisions.</p>
        {hasLegalValue(legalIdentity.legalName) ? (
          <p>{legalIdentity.tradingName} is a trading name of {legalIdentity.legalName}.</p>
        ) : null}
        <p>Google controls its own platform processes, including Business Profile status, verification, access, reviews and related decisions. Using this website does not change that.</p>
        <LegalCallout>ReputeDefend is an independent support service. It is not an official Google partner page and should not be read as one.</LegalCallout>
      </>
    ),
  },
  {
    id: "no-guaranteed-outcomes",
    title: "No guaranteed outcomes",
    content: (
      <>
        <p>We cannot guarantee:</p>
        <ul>
          <li>Business Profile reinstatement</li>
          <li>review removal</li>
          <li>verification or access being restored</li>
          <li>ranking or visibility changes</li>
          <li>a particular platform response time</li>
        </ul>
        <p>A clearer case file is not the same as a promised result. Timing and outcomes depend on the facts, the available process and Google’s review.</p>
      </>
    ),
  },
  {
    id: "reviews-and-policy",
    title: "Reviews and policy issues",
    content: (
      <>
        <p>Whether a review potentially raises a policy issue depends on the content, the context and the relevant published rules. Legitimate negative feedback is not automatically a policy violation. Uncomfortable criticism may remain even where a business disagrees with it.</p>
        <p>We do not encourage false reviews, fabricated evidence or hostile replies as a way to manage reputation.</p>
      </>
    ),
  },
  {
    id: "nature-of-information",
    title: "Nature of the information",
    content: (
      <>
        <p>Information on this website is general information and practical service guidance. It is not legal advice, it is not a substitute for advice about your specific circumstances, and it is not a Google decision.</p>
        <p>Examples, process descriptions and frequently asked questions are illustrative. They do not mean that every situation has the same route or the same result.</p>
      </>
    ),
  },
  {
    id: "how-to-get-help",
    title: "If you need support",
    content: (
      <>
        <p>If you have an active Business Profile or review issue, use <Link href="/get-help">Get Help</Link>. For a general question, use <Link href="/contact">Contact</Link>. How we handle information you send is described in the <Link href="/privacy">privacy notice</Link>. Website and enquiry use is described in the <Link href="/terms">terms of use</Link>.</p>
      </>
    ),
  },
]

export default function DisclaimerPage() {
  return (
    <LegalPage
      eyebrow="Disclaimer"
      title="Independent support, not Google."
      lead="ReputeDefend is independent of Google. We cannot guarantee reinstatement, review removal, ranking changes or any other platform outcome. Information on this website is practical guidance, not legal advice."
      currentPath="/disclaimer"
      sections={sections}
    />
  )
}
