import type { Metadata } from "next"
import { FaqStructuredData, ServiceStructuredData } from "@/components/structured-data"
import { reviewFaqs, reviewSeo } from "./content"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  ReviewAssessment,
  ReviewClosing,
  ReviewEvidence,
  ReviewFaq,
  ReviewHero,
  ReviewJudgement,
  ReviewModels,
  ReviewPricing,
  ReviewProcess,
  ReviewReported,
  ReviewRoutes,
  ReviewSituations,
  ReviewTrustStrip,
  ReviewWork,
} from "./review-sections"
import styles from "./review.module.css"

const title = pageTitle(reviewSeo.titlePage)
const description = reviewSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/review-protection" },
  openGraph: socialOpenGraph({ title, description, path: "/review-protection" }),
  twitter: socialTwitter({ title, description }),
}

export default function ReviewProtectionPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <ServiceStructuredData
        name="Google Review Protection"
        description={description}
        path="/review-protection"
      />
      <FaqStructuredData questions={reviewFaqs.map(({ q, a }) => ({ q, a }))} />
      <ReviewHero />
      <ReviewTrustStrip />
      <ReviewSituations />
      <ReviewJudgement />
      <ReviewAssessment />
      <ReviewEvidence />
      <ReviewWork />
      <ReviewModels />
      <ReviewRoutes />
      <ReviewReported />
      <ReviewProcess />
      <ReviewPricing />
      <ReviewFaq />
      <ReviewClosing />
    </div>
  )
}
