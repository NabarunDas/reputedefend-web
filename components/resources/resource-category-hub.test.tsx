/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceCategoryHubView } from "./resource-category-hub"
import {
  resourceCategoryHubContent,
  type ResourceCategoryHub,
} from "@/app/resources/category-hub-content"
import { brandSiteUrl } from "@/lib/brand"
import { getPublishedResources, getResourceCategory, resourcePath } from "@/lib/resources"
import { unpublishedRelatedFixture } from "@/lib/resource-test-fixtures"

type BreadcrumbListJsonLd = {
  "@type": string
  itemListElement: Array<{ position: number; name: string; item: string }>
}

function breadcrumbJsonLd(container: HTMLElement): BreadcrumbListJsonLd {
  const blocks = Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    .map((node) => JSON.parse(node.textContent ?? "{}") as BreadcrumbListJsonLd)
    .filter((schema) => schema["@type"] === "BreadcrumbList")
  expect(blocks).toHaveLength(1)
  return blocks[0]
}

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const hubs = Object.values(resourceCategoryHubContent) as ResourceCategoryHub[]

function publishedFor(hub: ResourceCategoryHub) {
  return getPublishedResources().filter((resource) => resource.category === hub.category)
}

describe("Resource category hub", () => {
  it.each(hubs.map((hub) => [hub.path, hub] as const))(
    "%s renders one H1, a breadcrumb back to Resources and the commercial CTA",
    (_path, hub) => {
      const { container } = render(
        <ResourceCategoryHubView hub={hub} resources={publishedFor(hub)} />,
      )

      expect(container.querySelectorAll("h1")).toHaveLength(1)
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(hub.heading)
      expect(screen.getByText(hub.intro)).toBeInTheDocument()

      const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" })
      expect(breadcrumb.querySelector("a")).toHaveAttribute("href", "/resources")

      expect(screen.getByRole("link", { name: new RegExp(hub.commercialCta, "i") })).toHaveAttribute(
        "href",
        hub.commercialHref,
      )
    },
  )

  it.each(hubs.map((hub) => [hub.path, hub] as const))(
    "%s links only published guides from its own category",
    (_path, hub) => {
      const published = publishedFor(hub)
      expect(published.length).toBeGreaterThan(0)

      render(<ResourceCategoryHubView hub={hub} resources={published} />)

      const guideHrefs = screen
        .getAllByRole("link", { name: /read guide/i })
        .map((link) => link.getAttribute("href"))
      expect(guideHrefs).toEqual(published.map((resource) => resourcePath(resource.slug)))
      expect(guideHrefs).not.toContain(resourcePath(unpublishedRelatedFixture.slug))
      expect(guideHrefs).toHaveLength(new Set(guideHrefs).size)
    },
  )

  it.each(hubs.map((hub) => [hub.path, hub] as const))(
    "%s emits BreadcrumbList JSON-LD matching its visible breadcrumb",
    (_path, hub) => {
      const { container } = render(
        <ResourceCategoryHubView hub={hub} resources={publishedFor(hub)} />,
      )

      const schema = breadcrumbJsonLd(container)
      const visible = Array.from(
        screen.getByRole("navigation", { name: "Breadcrumb" }).querySelectorAll("li"),
      )
      const categoryTitle = getResourceCategory(hub.category).title

      expect(schema.itemListElement).toHaveLength(2)
      expect(schema.itemListElement[0]).toEqual({
        "@type": "ListItem",
        position: 1,
        name: "Resources",
        item: `${brandSiteUrl}/resources`,
      })
      expect(schema.itemListElement[1]).toEqual({
        "@type": "ListItem",
        position: 2,
        name: categoryTitle,
        item: `${brandSiteUrl}${hub.path}`,
      })

      // The visible trail and the structured data must describe the same two
      // steps, in the same order, pointing at the same URLs.
      expect(visible).toHaveLength(2)
      expect(visible[0].querySelector("a")).toHaveAttribute("href", "/resources")
      expect(visible[0]).toHaveTextContent("Resources")
      expect(visible[1]).toHaveTextContent(categoryTitle)
      expect(schema.itemListElement.map((item) => item.item.replace(brandSiteUrl, ""))).toEqual([
        "/resources",
        hub.path,
      ])
    },
  )

  it("keeps the hub usable when a category has nothing published yet", () => {
    render(<ResourceCategoryHubView hub={hubs[0]} resources={[]} />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(hubs[0].heading)
    expect(screen.queryByRole("link", { name: /read guide/i })).not.toBeInTheDocument()
    expect(screen.getByText(/No guides are published in this category yet/)).toBeInTheDocument()
  })
})
