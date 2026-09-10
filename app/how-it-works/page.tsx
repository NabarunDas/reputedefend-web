import type { Metadata } from "next"
import { FaqStructuredData, HowToStructuredData } from "@/components/structured-data"
import { howDescription, howFaqs, journeySteps } from "./content"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  HowAssessment,
  HowClosing,
  HowCommunication,
  HowFaq,
  HowHero,
  HowJourney,
  HowLimits,
  HowNeed,
  HowPaths,
  HowReceive,
} from "./how-sections"
import styles from "./how.module.css"

const title = "How ReputeDefend Works | Google Reputation Support Process"

export const metadata: Metadata = {
  title: { absolute: title },
  description: howDescription,
  alternates: { canonical: "/how-it-works" },
  openGraph: socialOpenGraph({ title, description: howDescription, path: "/how-it-works" }),
  twitter: socialTwitter({ title, description: howDescription }),
}

export default function HowItWorksPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <HowToStructuredData
        name="How ReputeDefend works"
        description={howDescription}
        steps={journeySteps.map((step) => ({ name: step.title, text: step.body }))}
      />
      <FaqStructuredData questions={howFaqs} />
      <HowHero />
      <HowJourney />
      <HowNeed />
      <HowAssessment />
      <HowReceive />
      <HowPaths />
      <HowLimits />
      <HowCommunication />
      <HowFaq />
      <HowClosing />
    </div>
  )
}
