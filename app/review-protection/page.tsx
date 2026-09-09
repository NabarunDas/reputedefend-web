import type { Metadata } from "next"
import { FaqStructuredData, ServiceStructuredData } from "@/components/structured-data"
import { reviewFaqs } from "./content"
import { ReviewAssessment, ReviewClosing, ReviewDistinction, ReviewEvidence, ReviewExpectations, ReviewFaq, ReviewHero, ReviewPathways, ReviewPrecautions, ReviewProcess, ReviewScenarios, ReviewSupport } from "./review-sections"
import styles from "./review.module.css"

const title = "Google Review Protection & Review Challenge Support | ReputeDefend"
const description = "Independent support for suspicious or potentially policy-violating Google reviews. Assess the facts, organise evidence and prepare an appropriate reporting or challenge route."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/review-protection" },
  openGraph: { type: "website", siteName: "ReputeDefend", title, description, url: "/review-protection", images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ReputeDefend practical reputation support" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
}

export default function ReviewProtectionPage() {
  return <>
    <ServiceStructuredData name="Google Review Protection" description="Independent, evidence-led support to assess suspicious or potentially policy-violating Google reviews, organise relevant evidence and prepare an appropriate reporting, challenge or response route. Review removal is not guaranteed." path="/review-protection" />
    <FaqStructuredData questions={reviewFaqs} />
    <div className={`${styles.page} font-sans`}>
      <ReviewHero />
      <ReviewDistinction />
      <ReviewScenarios />
      <ReviewAssessment />
      <ReviewEvidence />
      <ReviewSupport />
      <ReviewPathways />
      <ReviewPrecautions />
      <ReviewProcess />
      <ReviewExpectations />
      <ReviewFaq />
      <ReviewClosing />
    </div>
  </>
}
