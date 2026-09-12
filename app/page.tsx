import type { Metadata } from "next"
import {
  HomeConversion,
  HomeFaq,
  HomeGuard,
  HomeHero,
  Homepage,
  HomePricing,
  HomeProcess,
  HomeServices,
  HomeSituations,
  HomeTrustStrip,
  HomeWhy,
} from "@/components/homepage"
import { FaqStructuredData } from "@/components/structured-data"
import { homepageFaqs, homepageSeo } from "@/lib/homepage-content"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

const title = pageTitle(homepageSeo.titlePage)
const description = homepageSeo.description

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
      <FaqStructuredData questions={homepageFaqs.map(({ q, a }) => ({ q, a }))} />
      <HomeHero />
      <HomeTrustStrip />
      <HomeSituations />
      <HomeServices />
      <HomeProcess />
      <HomePricing />
      <HomeGuard />
      <HomeWhy />
      <HomeFaq />
      <HomeConversion />
    </Homepage>
  )
}
