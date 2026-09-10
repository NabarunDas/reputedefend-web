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

export const metadata: Metadata = {
  alternates: { canonical: "/" },
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
