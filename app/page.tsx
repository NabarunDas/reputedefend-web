import type { Metadata } from "next"
import {
  HomeConversion,
  HomeExpertise,
  HomeFaq,
  HomeHero,
  Homepage,
  HomeProcess,
  HomeServices,
  HomeSituations,
  HomeTrust,
  HomeTrustStrip,
} from "@/components/homepage"
import { FaqStructuredData } from "@/components/structured-data"
import { homepageFaqs } from "@/lib/homepage-content"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

const title = pageTitle("Google Business Profile Recovery & Review Protection")
const description =
  "Human, evidence-led support for Google Business Profile suspensions, access and verification problems, and suspicious or damaging Google reviews."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: socialOpenGraph({ title, description, path: "/" }),
  twitter: socialTwitter({ title, description }),
}

export default function Home() {
  return (
    <Homepage>
      <FaqStructuredData questions={homepageFaqs} />
      <HomeHero />
      <HomeTrustStrip />
      <HomeSituations />
      <HomeServices />
      <HomeExpertise />
      <HomeProcess />
      <HomeTrust />
      <HomeFaq />
      <HomeConversion />
    </Homepage>
  )
}
