import type { Metadata } from "next"
import { FaqStructuredData, ServiceStructuredData } from "@/components/structured-data"
import { recoveryDescription, recoveryFaqs } from "./content"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import { BeforeSubmitting, CommonSituations, FirstAssessment, PrepareEvidence, RecoveryClosing, RecoveryFaq, RecoveryHero, RecoveryProcess, RecoverySupport, RecoveryTransparency } from "./recovery-sections"
import styles from "./recovery.module.css"

const title = "Google Business Profile Recovery & Suspension Help | ReputeDefend"
export const metadata: Metadata = {
  title: { absolute: title },
  description: recoveryDescription,
  alternates: { canonical: "/business-profile-recovery" },
  openGraph: socialOpenGraph({ title, description: recoveryDescription, path: "/business-profile-recovery" }),
  twitter: socialTwitter({ title, description: recoveryDescription }),
}

export default function BusinessProfileRecoveryPage() {
  return <div className={`${styles.page} font-sans`}>
    <ServiceStructuredData name="Google Business Profile Recovery & Suspension Help" description={recoveryDescription} path="/business-profile-recovery" />
    <FaqStructuredData questions={recoveryFaqs} />
    <RecoveryHero />
    <CommonSituations />
    <FirstAssessment />
    <PrepareEvidence />
    <RecoverySupport />
    <BeforeSubmitting />
    <RecoveryProcess />
    <RecoveryTransparency />
    <RecoveryFaq />
    <RecoveryClosing />
  </div>
}
