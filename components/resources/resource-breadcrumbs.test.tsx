/** @vitest-environment jsdom */

import { readFileSync } from "node:fs"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import {
  RESOURCE_METHODOLOGY_HREF,
  RESOURCE_METHODOLOGY_LABEL,
  ResourceBreadcrumbs,
} from "./resource-breadcrumbs"
import { resourceArticleJsonLd } from "@/lib/resource-schema"
import { getPublishedResources, resourceAuthor } from "@/lib/resources"
import { publishedResourceFixture, publishedReviewFixture } from "@/lib/resource-test-fixtures"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

/** jsdom gives import.meta.url an http URL, so read sources from the repo root. */
function source(relative: string) {
  return readFileSync(`${process.cwd()}/${relative}`, "utf8")
}

afterEach(() => {
  cleanup()
})

const everyPublished = getPublishedResources()

describe("Resource editorial attribution", () => {
  it("names ProfileRelaunch as the author and links to /about", () => {
    render(<ResourceBreadcrumbs resource={publishedResourceFixture} />)
    const author = screen.getByRole("link", { name: resourceAuthor })
    expect(author).toHaveAttribute("href", "/about")
    expect(resourceAuthor).toBe("ProfileRelaunch")
  })

  it("links the editorial method to the Resources methodology anchor", () => {
    render(<ResourceBreadcrumbs resource={publishedResourceFixture} />)
    expect(screen.getByRole("link", { name: RESOURCE_METHODOLOGY_LABEL })).toHaveAttribute(
      "href",
      "/resources#how-these-guides-are-produced",
    )
    expect(RESOURCE_METHODOLOGY_HREF).toBe("/resources#how-these-guides-are-produced")
    expect(RESOURCE_METHODOLOGY_LABEL).toBe("How these guides are produced")
  })

  it("reads as one editorial line without claiming credentials or Google affiliation", () => {
    const { container } = render(<ResourceBreadcrumbs resource={publishedResourceFixture} />)
    const line = container.querySelector("p")
    expect(line?.textContent).toBe(
      `Prepared by ${resourceAuthor} · ${RESOURCE_METHODOLOGY_LABEL}`,
    )
    expect(line?.textContent).not.toMatch(/certified|accredited|partner|expert|specialist in/i)
  })

  it.each(
    [publishedResourceFixture, publishedReviewFixture, ...everyPublished].map(
      (resource) => [resource.slug, resource] as const,
    ),
  )("%s exposes the attribution alongside its breadcrumb", (_slug, resource) => {
    render(<ResourceBreadcrumbs resource={resource} />)
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: resourceAuthor })).toHaveAttribute("href", "/about")
    expect(screen.getByRole("link", { name: RESOURCE_METHODOLOGY_LABEL })).toHaveAttribute(
      "href",
      RESOURCE_METHODOLOGY_HREF,
    )
  })

  it("keeps Article JSON-LD authorship organisational, never a Person", () => {
    for (const resource of everyPublished) {
      const jsonLd = resourceArticleJsonLd(resource)
      expect(jsonLd.author["@type"], resource.slug).toBe("Organization")
      expect(jsonLd.author.name, resource.slug).toBe(resourceAuthor)
      expect(JSON.stringify(jsonLd), resource.slug).not.toContain('"Person"')
    }
  })

  it("no longer duplicates a plain-text Author row, but keeps Last reviewed", () => {
    const view = source("components/resources/resource-article-view.tsx")
    expect(view).not.toContain("<dt>Author</dt>")
    expect(view).toContain("Last reviewed:")
  })

  it("anchors the Resources methodology section that the link targets", () => {
    expect(source("app/resources/resources-hub.tsx")).toContain(
      'id="how-these-guides-are-produced"',
    )
  })
})
