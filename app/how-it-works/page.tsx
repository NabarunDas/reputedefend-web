import type { Metadata } from "next"
import { FaqStructuredData, HowToStructuredData } from "@/components/structured-data"
import { howDescription, howFaqs, journeySteps } from "./content"
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
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title,
    description: howDescription,
    url: "/how-it-works",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ReputeDefend practical reputation support" }],
  },
  twitter: { card: "summary_large_image", title, description: howDescription, images: ["/og-image.png"] },
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
