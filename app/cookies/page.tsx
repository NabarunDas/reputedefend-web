import type { Metadata } from "next"
import Link from "next/link"
import { pageTitle } from "@/lib/brand"
import { LegalPage, type LegalSection } from "@/components/legal-page"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  cookiesAnalytics,
  cookiesChoice,
  cookiesHero,
  cookiesIntro,
  cookiesNecessary,
  cookiesPrivacyHref,
  cookiesSeo,
} from "./content"

const title = pageTitle(cookiesSeo.titlePage)
const description = cookiesSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/cookies" },
  openGraph: socialOpenGraph({ title, description, path: "/cookies" }),
  twitter: socialTwitter({ title, description }),
}

const sections: LegalSection[] = [
  {
    id: "what-this-notice-covers",
    title: "What this notice covers",
    content: (
      <>
        {cookiesIntro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </>
    ),
  },
  {
    id: "necessary-storage",
    title: cookiesNecessary.title,
    content: (
      <>
        {cookiesNecessary.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </>
    ),
  },
  {
    id: "optional-analytics",
    title: cookiesAnalytics.title,
    content: (
      <>
        {cookiesAnalytics.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </>
    ),
  },
  {
    id: "your-choice",
    title: cookiesChoice.title,
    content: (
      <>
        {cookiesChoice.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <p>The <Link href={cookiesPrivacyHref}>privacy notice</Link> explains how enquiry and case information is handled separately from optional analytics.</p>
      </>
    ),
  },
]

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow={cookiesHero.eyebrow}
      title={cookiesHero.title}
      lead={cookiesHero.lead}
      currentPath="/cookies"
      sections={sections}
    />
  )
}
