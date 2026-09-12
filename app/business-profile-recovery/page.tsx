import type { Metadata } from "next"
import { FaqStructuredData, ServiceStructuredData } from "@/components/structured-data"
import { recoveryDescription, recoveryFaqs } from "./content"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  RecoveryAssessment,
  RecoveryClosing,
  RecoveryEvidence,
  RecoveryExpertise,
  RecoveryFaq,
  RecoveryHero,
  RecoveryProcess,
  RecoverySituations,
  RecoverySupport,
  RecoveryTrust,
  RecoveryTrustStrip,
} from "./recovery-sections"
import styles from "./recovery.module.css"

const title = pageTitle("Google Business Profile Recovery & Suspension Help")
export const metadata: Metadata = {
  title: { absolute: title },
  description: recoveryDescription,
  alternates: { canonical: "/business-profile-recovery" },
  openGraph: socialOpenGraph({ title, description: recoveryDescription, path: "/business-profile-recovery" }),
  twitter: socialTwitter({ title, description: recoveryDescription }),
}

export default function BusinessProfileRecoveryPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <ServiceStructuredData name="Google Business Profile Recovery & Suspension Help" description={recoveryDescription} path="/business-profile-recovery" />
      <FaqStructuredData questions={recoveryFaqs} />
      <RecoveryHero />
      <RecoveryTrustStrip />
      <RecoverySituations />
      <RecoveryExpertise />
      <RecoveryAssessment />
      <RecoverySupport />
      <RecoveryProcess />
      <RecoveryEvidence />
      <RecoveryTrust />
      <RecoveryFaq />
      <RecoveryClosing />
    </div>
  )
}
