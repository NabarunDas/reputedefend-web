/** @vitest-environment jsdom */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { pricingFaqs } from "./content"
import PricingPage from "./page"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("./pricing.module.css", () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

const pageSource = readFileSync(join(process.cwd(), "app/pricing/page.tsx"), "utf8")

afterEach(() => {
  cleanup()
})

function renderedCopy() {
  const root = document.querySelector(".page") ?? document.body
  const scripts = [...root.querySelectorAll("script")].map((node) => node.textContent ?? "")
  const visible = (root.textContent ?? "").replace(scripts.join(""), "")
  return visible
}

function faqSchema() {
  const script = document.querySelector('script[type="application/ld+json"]')
  expect(script?.textContent).toBeTruthy()
  return JSON.parse(script!.textContent!) as {
    mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>
  }
}

describe("/pricing page", () => {
  it("keeps visible FAQs and structured data driven by pricingFaqs", () => {
    expect(pageSource).toContain("questions={pricingFaqs.map(({ q, a }) => ({ q, a }))}")
    render(<PricingPage />)
    const visible = [...document.querySelectorAll("details")].map((item) => ({
      q: item.querySelector("summary")?.textContent?.replace(/\s+/g, " ").trim(),
      a: item.querySelector("p")?.textContent,
    }))
    expect(visible).toEqual(pricingFaqs.map(({ q, a }) => ({ q, a })))
    expect(faqSchema().mainEntity).toEqual(
      pricingFaqs.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    )
  })

  it("sends Guard journeys to /relaunch-guard and keeps case-service prices and links", () => {
    render(<PricingPage />)
    expect(screen.getByRole("link", { name: "Explore monitoring" })).toHaveAttribute("href", "/relaunch-guard")
    expect(screen.getByRole("link", { name: "Explore Relaunch Guard" })).toHaveAttribute("href", "/relaunch-guard")
    expect(screen.getByRole("link", { name: "Get help with an existing problem" })).toHaveAttribute("href", "/get-help")
    expect(document.querySelectorAll('a[href="/relaunch-guard"]')).toHaveLength(2)
    expect(screen.getAllByRole("link", { name: "Start Recovery assessment" })[0]).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getAllByRole("link", { name: "Start Review assessment" })[0]).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
    const copy = renderedCopy()
    expect(copy).toContain("£99")
    expect(copy).toContain("£299")
    expect(copy).toContain("£59")
    expect(copy).toContain("£149")
    expect(copy).toContain("£9.99")
    expect(copy).toContain("per month, per location")
    expect(copy).not.toMatch(/Early Access/i)
    expect(copy).not.toMatch(/introductory/i)
    expect(copy).not.toContain("/month/location")
  })
})
