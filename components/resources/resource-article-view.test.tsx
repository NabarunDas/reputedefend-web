/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "./resource-article-view"
import type { ResourceArticleBody } from "@/lib/resource-content"
import { reviewExtortionUrgentCallout } from "@/lib/resources"
import {
  fixtureOfficialSource,
  publishedRelatedFixture,
  publishedResourceFixture,
  publishedReviewFixture,
  unpublishedRelatedFixture,
} from "@/lib/resource-test-fixtures"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const body: ResourceArticleBody = {
  intro: "A short introduction for the test article.",
  quickAnswer: <p>Preserve evidence first, then decide the next step.</p>,
  main: <p>Main editorial content for template tests.</p>,
  googleSays: {
    paraphrase: <p>Google publishes review and profile policies on its Help pages.</p>,
    sources: [fixtureOfficialSource],
  },
  interpretation: <p>ProfileRelaunch interpretation stays separate from official wording.</p>,
  beforeYouAct: <p>Do not send passwords or verification codes.</p>,
  urgentCallout: reviewExtortionUrgentCallout,
  checklist: { items: ["Save the review URLs.", "Keep the messages."] },
  commonMistakes: { items: ["Treating every dispute as a crime."] },
  scenarios: [
    {
      heading: "What if several reviews appear at once?",
      body: <p>Document what arrived and when.</p>,
    },
  ],
  closing: (
    <>
      <h2>Before you appeal</h2>
      <p>Closing copy for template tests.</p>
    </>
  ),
  sourcesUsed: [fixtureOfficialSource],
}

describe("resource article template", () => {
  it("renders the editorial sections, published related guides and Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView
        resource={publishedResourceFixture}
        body={body}
        related={[publishedRelatedFixture]}
      />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(container.querySelector("article")).not.toBeNull()
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What this means for your business" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Before you act" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Practical checklist" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Where businesses commonly go wrong" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What if several reviews appear at once?" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Before you appeal" })).toBeInTheDocument()
    expect(screen.getByText("Closing copy for template tests.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Continue understanding your situation" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
    expect(screen.getByText(/Last reviewed: 13 September 2026/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getByRole("link", { name: /Explore Profile Recovery/ })).toHaveAttribute(
      "href",
      "/business-profile-recovery",
    )
    expect(screen.getByText("Related published guide")).toBeInTheDocument()
    expect(screen.queryByText("Draft related guide")).not.toBeInTheDocument()
    expect(screen.queryByText("Should never appear")).not.toBeInTheDocument()
    expect(screen.getByText(reviewExtortionUrgentCallout)).toBeInTheDocument()

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? "",
    )
    expect(jsonLd.some((item) => item.includes("\"Article\""))).toBe(true)
    expect(jsonLd.some((item) => item.includes("BreadcrumbList"))).toBe(true)
    expect(jsonLd.join("")).not.toMatch(/FAQPage/)
    expect(jsonLd.join("")).not.toContain(unpublishedRelatedFixture.slug)
  })

  it("routes review content to the Review Protection assessment", () => {
    const { container } = render(
      <ResourceArticleView
        resource={publishedReviewFixture}
        body={{ ...body, sourcesUsed: [], googleSays: undefined, urgentCallout: reviewExtortionUrgentCallout }}
        related={[]}
      />,
    )
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
    expect(screen.queryByText("Fake bibliography")).not.toBeInTheDocument()
    expect(screen.getByText(/Urgent situations/)).toBeInTheDocument()
    expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0)
  })
})
