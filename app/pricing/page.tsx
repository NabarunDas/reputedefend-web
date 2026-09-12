import type { Metadata } from "next"
import { FaqStructuredData } from "@/components/structured-data"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import { pricingFaqs, pricingSeo } from "./content"
import {
  PricingClarity,
  PricingClose,
  PricingCompare,
  PricingFaq,
  PricingGuard,
  PricingHero,
  PricingRecovery,
  PricingReviewPlans,
  PricingStart,
  PricingSuccess,
  PricingTiming,
  PricingTrustStrip,
} from "./pricing-sections"
import styles from "./pricing.module.css"

const title = pageTitle(pricingSeo.titlePage)
const description = pricingSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/pricing" },
  openGraph: socialOpenGraph({ title, description, path: "/pricing" }),
  twitter: socialTwitter({ title, description }),
}

export default function PricingPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <FaqStructuredData questions={pricingFaqs.map(({ q, a }) => ({ q, a }))} />
      <PricingHero />
      <PricingTrustStrip />
      <PricingStart />
      <PricingRecovery />
      <PricingReviewPlans />
      <PricingCompare />
      <PricingSuccess />
      <PricingTiming />
      <PricingGuard />
      <PricingClarity />
      <PricingFaq />
      <PricingClose />
    </div>
  )
}
