/** @vitest-environment jsdom */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
import HomePage from "@/app/page"
import FeaturesPage from "@/app/features/page"
import HowItWorksPage from "@/app/how-it-works/page"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import {
  featureStageLabels,
  featureStatusPresentation,
  featuresContent,
  homepageContent,
  howItWorksContent,
  industriesContent,
  pricingContent,
} from "@/lib/content"
import { telloyaPlans } from "@/lib/pricing"

afterEach(() => {
  cleanup()
})

describe("approved homepage headline", () => {
  it("renders the owner-approved lines and keeps the existing calls to action", () => {
    render(<HomePage />)
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading).toHaveTextContent("Don't Let Missed Calls")
    expect(heading).toHaveTextContent("Cost You Customers.")
    expect(screen.queryByText("Never Misses a Call")).not.toBeInTheDocument()
    expect(screen.queryByText("You focus on the job. Telloya helps answer your missed calls.")).not.toBeInTheDocument()
    expect(screen.getByText(homepageContent.hero.supporting)).toBeInTheDocument()
    expect(screen.getByText(homepageContent.hero.eyebrow)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /See how Telloya works/i })).toHaveAttribute("href", "/how-it-works")
    expect(screen.getAllByRole("link", { name: "Enquire about Telloya" }).every((link) => link.getAttribute("href") === "/enquire")).toBe(true)
    expect(homepageContent.hero.primaryCta).toBe("See how Telloya works")
    expect(homepageContent.hero.primaryHref).toBe("/how-it-works")
    expect(homepageContent.hero.secondaryHref).toBe("/enquire")
  })

  it("keeps the rendered hero and the content source on the same lines", () => {
    const source = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8")
    expect(source).toContain("{hero.headlineLead}")
    expect(source).toContain("{hero.headlineEmphasis}")
    expect(source).toContain("{hero.supporting}")
    expect(source).not.toContain("Never Misses a Call")
    expect(homepageContent.hero.headlineLead).toBe("Don't Let Missed Calls")
    expect(homepageContent.hero.headlineEmphasis).toBe("Cost You Customers.")
  })
})

describe("how Telloya works section", () => {
  it("keeps the heading, places the supporting line underneath, and limits the note", () => {
    render(<HomePage />)
    const heading = screen.getByRole("heading", { name: /A smarter way to stay in touch/i })
    expect(heading).toHaveAttribute("id", "how-title")
    expect(screen.getByText("How Telloya works")).toBeInTheDocument()
    expect(screen.getByText("Built around your working day.")).toBeInTheDocument()
    expect(screen.queryByText(/designed to fit around your working day/i)).not.toBeInTheDocument()
    expect(screen.getByText("Telloya helps capture missed-call enquiries. Your team stays in control of appointments and follow-ups.")).toBeInTheDocument()
    expect(screen.queryByText(/does not automatically confirm appointments or guarantee callbacks/i)).not.toBeInTheDocument()
    for (const title of [
      "Customer calls your business",
      "Missed call forwarded to Telloya",
      "Telloya speaks with the caller",
      "You receive the details",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
    }
    expect(homepageContent.howItWorks.lead).toBe("Built around your working day.")
    expect(homepageContent.howItWorks.note).toMatch(/stays in control of appointments and follow-ups/i)
    expect(homepageContent.howItWorks.note).not.toMatch(/guarantee callbacks|automatically confirm/i)
  })
})

describe("benefit-first feature status", () => {
  it("labels demonstrated capabilities separately from planned work", () => {
    expect(featureStatusPresentation("demonstrated")).toEqual({
      stage: "demonstrated",
      label: "Tested in demonstration",
    })
    expect(featureStatusPresentation("planned")).toEqual({
      stage: "planned",
      label: "Planned",
    })
    expect(featureStageLabels).toEqual({
      demonstrated: "Tested in demonstration",
      planned: "Planned",
    })

    const source = readFileSync(resolve(process.cwd(), "app/features/page.tsx"), "utf8")
    expect(source).not.toContain('includes("available")')
    expect(source).toContain("featureStatusPresentation(feature.stage)")

    render(<FeaturesPage />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Every Missed Call Could Be a New Opportunity.")
    expect(screen.getAllByText("Tested in demonstration")).toHaveLength(featuresContent.features.length)
    expect(screen.queryByText("Available now")).not.toBeInTheDocument()
    expect(screen.queryByText("Demonstrated in proof of concept")).not.toBeInTheDocument()
    expect(screen.queryByText(/Preliminary testing/i)).not.toBeInTheDocument()
    expect(screen.getByText("Telloya asks useful questions and records the details the caller shares.")).toBeInTheDocument()
    expect(screen.getByText(/A customer dashboard is planned and is not live/i)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Usage visibility" })).not.toBeInTheDocument()
  })
})

describe("personalised enquiry questions", () => {
  it("explains that questions are agreed during setup and are not a self-service editor", () => {
    render(<HomePage />)
    expect(screen.getByRole("heading", { name: "Questions tailored to your business" })).toBeInTheDocument()
    expect(screen.getByText(/We'll agree the questions and information during setup/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Built for busy service businesses" })).toBeInTheDocument()
    expect(screen.getByText("Can I choose what Telloya asks my customers?")).toBeInTheDocument()
    const collected = homepageContent.faq.questions.find((item) => item.q === "What information does Telloya collect?")
    const choice = homepageContent.faq.questions.find((item) => item.q === "Can I choose what Telloya asks my customers?")
    expect(collected?.a).toMatch(/You decide which enquiry details matter/)
    expect(collected?.a).toMatch(/preferred callback time/)
    expect(collected?.a).not.toMatch(/separate quotation/)
    expect(screen.getByText(collected!.a)).toBeInTheDocument()
    expect(choice?.a).toMatch(/questions you'd like asked/)
    expect(choice?.a).toMatch(/relevant details you want captured/)
    expect(choice?.a).toMatch(/Basic, Growth and Pro/)
    expect(choice?.a).toMatch(/separate quotation/)
    expect(screen.getByText(choice!.a)).toBeInTheDocument()
    expect(`${collected?.a} ${choice?.a}`).not.toMatch(/unlimited|workflow editor|live dashboard|sensitive personal/i)
    cleanup()

    render(<FeaturesPage />)
    expect(screen.getByRole("heading", { name: "Your receptionist, personalised for your business" })).toBeInTheDocument()
    const feature = featuresContent.features.find((item) => item.kicker === "Feature 05")
    expect(feature?.points).toEqual([
      "Business greeting and service information",
      "Questions relevant to the services offered",
      "Details you want collected, such as job type, location, problem description and callback preferences",
      "How the information is presented in the enquiry summary",
    ])
    expect(feature?.description).toMatch(/We'll agree the configuration with you during setup/)
    expect(feature?.description).toMatch(/Basic, Growth and Pro/)
    expect(feature?.description).toMatch(/separate quotation/)
    expect(feature?.description).not.toMatch(/unlimited|only on Custom|Custom tier/i)
    cleanup()

    render(<HowItWorksPage />)
    const collection = howItWorksContent.journey.steps.find((step) => step.title === "Information collection")
    expect(collection?.description).toMatch(/agreed with you during setup/)
    expect(collection?.description).toMatch(/differ between businesses/)
    expect(screen.getByText(collection!.description)).toBeInTheDocument()
    expect(`${collection?.description} ${collection?.detail}`).not.toMatch(/workflow editor|live dashboard|unlimited/i)

    for (const plan of pricingContent.plans) {
      if (plan.tier === "custom") continue
      expect(plan.features).toContain("Business-specific configuration")
    }
  })
})

describe("industry examples and commercial facts", () => {
  it("records what callers report and leaves the decision with the business", () => {
    const help = (industry: string, scenario: string) => {
      const match = industriesContent.industries.find((entry) => entry.name === industry)
      return match?.scenarios.find((entry) => entry.title === scenario)?.telletoyaHelps
    }
    expect(help("Plumbing", "Quote requests")).toBe(
      "Asks about the proposed work, records the scope the caller describes and notes when they would prefer to discuss a quote.",
    )
    expect(help("Heating Engineers", "Radiator issues")).toBe(
      "Asks which radiator is affected and records the symptoms and information the caller provides.",
    )
    expect(help("Electricians", "New installation")).toBe(
      "Records the work requested, the rooms involved and when the caller would prefer to discuss an assessment.",
    )
    expect(help("Electricians", "Faulty appliance")).toBe(
      "Records which appliance the caller mentioned, the symptoms described and whether the caller reports any circuit tripping.",
    )
    expect(help("Property Maintenance", "Planned maintenance")).toMatch(/planned inspection/i)
    expect(help("Property Maintenance", "Cosmetic work")).toBe(
      "Collects the proposed work, approximate scope and preferred time for the business to discuss an assessment.",
    )
    expect(howItWorksContent.limitations.headingEmphasis).toBe("before you begin.")
    expect(howItWorksContent.limitations.points.join(" ")).toMatch(/book an appointment/i)
    expect(howItWorksContent.limitations.points.join(" ")).not.toMatch(/every call is answered/i)
  })

  it("keeps published prices and leaves enquiry submission off", () => {
    expect(telloyaPlans.map((plan) => [plan.tier, plan.monthlyPriceGbp, plan.minutesPerMonth])).toEqual([
      ["basic", 49, 120],
      ["growth", 79, 300],
      ["pro", 120, 500],
      ["custom", null, null],
    ])
    expect(pricingContent.plans.map((plan) => [plan.tier, plan.monthlyPriceGbp, plan.minutesPerMonth, plan.href])).toEqual([
      ["basic", 49, 120, "/enquire?plan=basic"],
      ["growth", 79, 300, "/enquire?plan=growth"],
      ["pro", 120, 500, "/enquire?plan=pro"],
      ["custom", null, null, "/enquire?plan=custom"],
    ])
    for (const plan of pricingContent.plans) {
      expect(plan.features.join(" ")).not.toMatch(/customer dashboard/i)
    }
    expect(pricingContent.comparison.table.rows).toContainEqual(["Usage visibility", "Planned", "Planned", "Planned", "Planned"])
    expect(getEnquiryCapabilities({})).toEqual({ submissionEnabled: false })
  })
})
