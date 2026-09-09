import {
  Homepage,
  HomeHero,
  HomeServices,
  HomeSituations,
  HomeSupport,
  HomeTrust,
  HomeProcess,
  HomeExpectations,
  HomeFaq,
  HomeConversion,
} from "@/components/homepage"
import { FaqStructuredData } from "@/components/structured-data"
import { homepageFaqs } from "@/lib/homepage-content"

export default function Home() {
  return (
    <Homepage>
      <FaqStructuredData questions={homepageFaqs} />
      <HomeHero />
      <HomeServices />
      <HomeSituations />
      <HomeSupport />
      <HomeTrust />
      <HomeProcess />
      <HomeExpectations />
      <HomeFaq />
      <HomeConversion />
    </Homepage>
  )
}
