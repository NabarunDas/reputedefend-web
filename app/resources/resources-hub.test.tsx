/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourcesHub } from "./resources-hub"
import { createResourceIndex, getPublishedResources } from "@/lib/resources"
import {
  fixtureBodyLookup,
  publishedResourceFixture,
  publishedReviewFixture,
  publishedWithoutBodyFixture,
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

describe("Resources hub", () => {
  it("renders one H1, the five categories and hides drafts when nothing is published", () => {
    const { container } = render(<ResourcesHub published={[]} />)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Understand the policy before you make the next move.",
    )
    expect(screen.getByText("Profile Recovery")).toBeInTheDocument()
    expect(screen.getByText("Verification & Access")).toBeInTheDocument()
    expect(screen.getByText("Reviews & Reputation")).toBeInTheDocument()
    expect(screen.getByText("Review Abuse & Scams")).toBeInTheDocument()
    expect(screen.getByText("Google Policy Updates")).toBeInTheDocument()
    expect(screen.getAllByText("Guides in preparation").length).toBeGreaterThanOrEqual(5)
    expect(screen.queryByText("0 articles")).not.toBeInTheDocument()
    expect(screen.queryByText("Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews")).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bBlog\b/)
    expect(screen.queryByRole("link", { name: /profile recovery/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Planned guides remain hidden until they have been researched/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /published guide/i })).not.toBeInTheDocument()
  })

  it("uses a published fixture in the featured slot without inventing production articles", () => {
    render(<ResourcesHub published={[publishedResourceFixture]} />)
    expect(screen.getByRole("heading", { level: 2, name: publishedResourceFixture.title })).toBeInTheDocument()
    const guideLinks = screen.getAllByRole("link", { name: /read guide/i })
    expect(guideLinks.length).toBeGreaterThan(0)
    expect(guideLinks[0]).toHaveAttribute("href", "/resources/test-published-guide")
  })

  /**
   * Synthetic records own this regression so it never depends on a real
   * Resource staying unpublished.
   */
  it("never presents an unpublished or incomplete record as a public guide", () => {
    const index = createResourceIndex(
      [
        publishedResourceFixture,
        unpublishedRelatedFixture,
        publishedWithoutBodyFixture,
      ],
      fixtureBodyLookup,
    )
    const published = getPublishedResources(index)
    render(<ResourcesHub published={published} />)

    expect(published.map((item) => item.slug)).toEqual(["test-published-guide"])
    expect(screen.getByRole("heading", { level: 2, name: publishedResourceFixture.title })).toBeInTheDocument()
    expect(screen.queryByText(unpublishedRelatedFixture.title)).not.toBeInTheDocument()
    expect(screen.queryByText(publishedWithoutBodyFixture.title)).not.toBeInTheDocument()
    for (const link of screen.getAllByRole("link", { name: /read guide/i })) {
      expect(link).toHaveAttribute("href", "/resources/test-published-guide")
    }
  })

  it("keeps empty categories static and filters the library from populated categories", () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<ResourcesHub published={[publishedResourceFixture, publishedReviewFixture]} />)

    expect(screen.queryByRole("button", { name: /Verification & Access/i })).not.toBeInTheDocument()
    expect(screen.getAllByText("Guides in preparation").length).toBeGreaterThanOrEqual(3)

    const profileFilter = screen.getByRole("button", { name: /1 published guide in Profile Recovery/i })
    expect(profileFilter).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(profileFilter)

    expect(screen.getByRole("button", { name: /1 published guide in Profile Recovery/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Profile Recovery" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("link", { name: /Test published review guide/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /Test published guide for template checks/i }).length).toBeGreaterThan(0)
    expect(scrollIntoView).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "All published guides" }))
    expect(screen.getByRole("link", { name: /Test published review guide/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "All published guides" })).toHaveAttribute("aria-pressed", "true")
  })
})
