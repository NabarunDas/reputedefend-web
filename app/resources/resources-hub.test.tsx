/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourcesHub } from "./resources-hub"
import { publishedResourceFixture } from "@/lib/resource-test-fixtures"

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
  })

  it("uses a published fixture in the featured slot without inventing production articles", () => {
    render(<ResourcesHub published={[publishedResourceFixture]} />)
    expect(screen.getByRole("heading", { level: 2, name: publishedResourceFixture.title })).toBeInTheDocument()
    const guideLinks = screen.getAllByRole("link", { name: /read guide/i })
    expect(guideLinks.length).toBeGreaterThan(0)
    expect(guideLinks[0]).toHaveAttribute("href", "/resources/test-published-guide")
  })
})
