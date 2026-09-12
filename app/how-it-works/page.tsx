import type { Metadata } from "next"
import { FaqStructuredData, HowToStructuredData } from "@/components/structured-data"
import { howFaqs, howSeo, howTimeline } from "./content"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  HowAssess,
  HowAuth,
  HowChoice,
  HowClose,
  HowFaq,
  HowGuard,
  HowHero,
  HowOutcomes,
  HowPaths,
  HowPricing,
  HowSend,
  HowStart,
  HowTimeline,
  HowTrustStrip,
  HowValue,
} from "./how-sections"
import styles from "./how.module.css"

const title = pageTitle(howSeo.titlePage)
const description = howSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/how-it-works" },
  openGraph: socialOpenGraph({ title, description, path: "/how-it-works" }),
  twitter: socialTwitter({ title, description }),
}

export default function HowItWorksPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <HowToStructuredData
        name={howSeo.titlePage}
        description={description}
        steps={howTimeline.steps.map((step) => ({ name: step.title, text: step.body }))}
      />
      <FaqStructuredData questions={howFaqs.map(({ q, a }) => ({ q, a }))} />
      <HowHero />
      <HowTrustStrip />
      <HowStart />
      <HowSend />
      <HowAssess />
      <HowOutcomes />
      <HowValue />
      <HowChoice />
      <HowAuth />
      <HowPaths />
      <HowPricing />
      <HowGuard />
      <HowTimeline />
      <HowFaq />
      <HowClose />
    </div>
  )
}
