import type { Metadata } from "next"
import { FaqStructuredData, ServiceStructuredData } from "@/components/structured-data"
import { reviewDescription, reviewFaqs } from "./content"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  ReviewAssessment,
  ReviewClosing,
  ReviewEvidence,
  ReviewExpertise,
  ReviewFaq,
  ReviewHero,
  ReviewProcess,
  ReviewRoutes,
  ReviewSituations,
  ReviewSupport,
  ReviewTrust,
  ReviewTrustStrip,
} from "./review-sections"
import styles from "./review.module.css"

const title = "Google Review Protection & Review Challenge Support | ReputeDefend"
export const metadata: Metadata = {
  title: { absolute: title },
  description: reviewDescription,
  alternates: { canonical: "/review-protection" },
  openGraph: socialOpenGraph({ title, description: reviewDescription, path: "/review-protection" }),
  twitter: socialTwitter({ title, description: reviewDescription }),
}

export default function ReviewProtectionPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <ServiceStructuredData
        name="Google Review Protection"
        description={reviewDescription}
        path="/review-protection"
      />
      <FaqStructuredData questions={reviewFaqs} />
      <ReviewHero />
      <ReviewTrustStrip />
      <ReviewSituations />
      <ReviewRoutes />
      <ReviewExpertise />
      <ReviewAssessment />
      <ReviewSupport />
      <ReviewEvidence />
      <ReviewProcess />
      <ReviewTrust />
      <ReviewFaq />
      <ReviewClosing />
    </div>
  )
}
