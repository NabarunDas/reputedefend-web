/** @vitest-environment jsdom */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { brandSiteUrl } from "@/lib/brand"
import { sitemapPaths } from "@/lib/site-nav"
import { guardFaqs, guardSeo } from "./content"
import { metadata, GuardSalesView } from "./page"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("./guard.module.css", () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

const pageSource = readFileSync(join(process.cwd(), "app/relaunch-guard/page.tsx"), "utf8")
const serviceDescription =
  "Our team checks your Google Business Profile and reviews each morning and evening, UK time, including weekends and bank holidays. We review concerning changes and email you with the details."

function hrefsNamed(name: string) {
  return screen.getAllByRole("link", { name }).map((link) => link.getAttribute("href"))
}

function jsonLd() {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) =>
    JSON.parse(node.textContent || "{}"),
  )
}

function normalise(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function assertGuardStructuredData() {
  const schemas = jsonLd()
  const services = schemas.filter((item) => item["@type"] === "Service")
  const faqs = schemas.filter((item) => item["@type"] === "FAQPage")
  expect(services).toHaveLength(1)
  expect(faqs).toHaveLength(1)
  expect(services[0]).toMatchObject({
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Relaunch Guard",
    description: serviceDescription,
    url: `${brandSiteUrl}/relaunch-guard`,
  })
  expect(JSON.stringify(schemas)).not.toMatch(/Offer|"@type":"Product"|aggregateRating|ratingValue/)

  const faqEntities = faqs[0].mainEntity as Array<{
    "@type": string
    name: string
    acceptedAnswer: { "@type": string; text: string }
  }>
  expect(faqEntities).toEqual(
    guardFaqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a.join(" ") },
    })),
  )

  const visibleFaqs = [...document.querySelectorAll(".faqList details")].map((item) => ({
    q: normalise(item.querySelector("summary")?.textContent ?? ""),
    a: normalise([...item.querySelectorAll("p")].map((paragraph) => paragraph.textContent ?? "").join(" ")),
  }))
  expect(visibleFaqs).toEqual(guardFaqs.map((item) => ({ q: item.q, a: normalise(item.a.join(" ")) })))
  expect(faqEntities.map((item) => ({ q: item.name, a: normalise(item.acceptedAnswer.text) }))).toEqual(visibleFaqs)
  expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact")
}

describe("/relaunch-guard page", () => {
  afterEach(() => {
    cleanup()
  })

  it("evaluates the server-only flag dynamically and includes the canonical in the sitemap", () => {
    expect(pageSource).toContain("isMonitoringPersistenceEnabled")
    expect(pageSource).toContain('export const dynamic = "force-dynamic"')
    expect(pageSource).not.toContain("NEXT_PUBLIC_")
    expect(pageSource).not.toContain("Google Connect")
    expect(metadata.alternates?.canonical).toBe("/relaunch-guard")
    expect(new URL(String(metadata.alternates?.canonical), brandSiteUrl).href).toBe(
      "https://profilerelaunch.com/relaunch-guard",
    )
    expect(metadata.title).toEqual({
      absolute: "Relaunch Guard | Google Business Profile Monitoring | ProfileRelaunch",
    })
    expect(metadata.description).toBe(guardSeo.description)
    expect(metadata.openGraph).toMatchObject({
      title: "Relaunch Guard | Google Business Profile Monitoring | ProfileRelaunch",
      description: guardSeo.description,
      url: "/relaunch-guard",
    })
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Relaunch Guard | Google Business Profile Monitoring | ProfileRelaunch",
      description: guardSeo.description,
    })
    expect(sitemapPaths).toContain("/relaunch-guard")
    expect(sitemapPaths.filter((path) => path === "/relaunch-guard")).toHaveLength(1)
    expect(pageSource).toContain("<ServiceStructuredData")
    expect(pageSource).toContain('name="Relaunch Guard"')
    expect(pageSource).toContain('path="/relaunch-guard"')
    expect(pageSource).toContain('questions={guardFaqs.map((item) => ({ q: item.q, a: item.a.join(" ") }))}')
  })

  it("sends both primary CTAs to setup when monitoring persistence is enabled", () => {
    render(<GuardSalesView setupEnabled />)
    expect(hrefsNamed("Start monitoring setup")).toEqual(["/start-monitoring", "/start-monitoring"])
    expect(screen.getByRole("link", { name: "How monitoring works" })).toHaveAttribute(
      "href",
      "#how-monitoring-works",
    )
    expect(screen.getByText("Requesting setup does not start monitoring or take payment.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Ask about monitoring" })).not.toBeInTheDocument()
    assertGuardStructuredData()
  })

  it("routes both primary CTAs to contact and hides setup links when persistence is disabled", () => {
    render(<GuardSalesView setupEnabled={false} />)
    expect(hrefsNamed("Ask about monitoring")).toEqual(["/contact", "/contact"])
    expect(
      screen.getByText("Online setup is currently unavailable. Contact us to discuss monitoring."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Start monitoring setup" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "How monitoring works" })?.getAttribute("href")).toBe(
      "#how-monitoring-works",
    )
    expect(document.querySelectorAll('a[href="/start-monitoring"]')).toHaveLength(0)
    expect(document.querySelectorAll('a[href*="start-monitoring"]')).toHaveLength(0)
    assertGuardStructuredData()
  })
})
