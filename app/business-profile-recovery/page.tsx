import type { Metadata } from "next"
import { FaqStructuredData, ServiceStructuredData } from "@/components/structured-data"
import { recoveryFaqs, recoverySeo } from "./content"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  RecoveryAppealed,
  RecoveryAssessment,
  RecoveryClosing,
  RecoveryExpertise,
  RecoveryFaq,
  RecoveryHero,
  RecoveryModels,
  RecoveryPricing,
  RecoveryProcess,
  RecoverySituations,
  RecoveryTrustStrip,
  RecoveryWork,
} from "./recovery-sections"
import styles from "./recovery.module.css"

const title = pageTitle(recoverySeo.titlePage)
const description = recoverySeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/business-profile-recovery" },
  openGraph: socialOpenGraph({ title, description, path: "/business-profile-recovery" }),
  twitter: socialTwitter({ title, description }),
}

export default function BusinessProfileRecoveryPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <ServiceStructuredData
        name="Google Business Profile Recovery & Suspension Help"
        description={description}
        path="/business-profile-recovery"
      />
      <FaqStructuredData questions={recoveryFaqs.map(({ q, a }) => ({ q, a }))} />
      <RecoveryHero />
      <RecoveryTrustStrip />
      <RecoverySituations />
      <RecoveryExpertise />
      <RecoveryAssessment />
      <RecoveryWork />
      <RecoveryModels />
      <RecoveryPricing />
      <RecoveryProcess />
      <RecoveryAppealed />
      <RecoveryFaq />
      <RecoveryClosing />
    </div>
  )
}
