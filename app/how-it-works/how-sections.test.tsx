/** @vitest-environment jsdom */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { howFaqs } from "./content"
import HowItWorksPage from "./page"
import { HowGuard, HowStart } from "./how-sections"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("./how.module.css", () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

const pageSource = readFileSync(join(process.cwd(), "app/how-it-works/page.tsx"), "utf8")
const sectionSource = readFileSync(join(process.cwd(), "app/how-it-works/how-sections.tsx"), "utf8")

afterEach(() => {
  cleanup()
})

function faqSchema() {
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
    (node) => JSON.parse(node.textContent || "{}"),
  )
  return schemas.find((item) => item["@type"] === "FAQPage") as {
    mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>
  }
}

describe("How It Works Google connection and Guard action", () => {
  it("keeps FAQ structured data matching the visible Google-connection answer", () => {
    expect(pageSource).toContain("questions={howFaqs.map(({ q, a }) => ({ q, a }))}")
    render(<HowItWorksPage />)
    const connect = howFaqs.find((item) => item.q === "Can I connect my Google account?")
    expect(connect?.a).toContain("There is no confirmed date for Google connection")
    const visible = [...document.querySelectorAll("details")].find((item) =>
      item.querySelector("summary")?.textContent?.includes("Can I connect my Google account?"),
    )
    expect(visible?.querySelector("p")?.textContent).toBe(connect?.a)
    expect(faqSchema().mainEntity.find((item) => item.name === "Can I connect my Google account?")?.acceptedAnswer.text).toBe(
      connect?.a,
    )
  })

  it("renders a genuinely disabled Google connection control", () => {
    render(<HowStart />)
    const button = screen.getByRole("button", { name: "Connect Google" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveAttribute("aria-describedby", "google-connection-note")
    expect(button.closest("a")).toBeNull()
    expect(sectionSource).not.toMatch(/onClick|oauth|window\.location|fetch\(/i)
    expect(sectionSource).not.toContain('role="status"')
    expect(screen.getByRole("link", { name: "Start your assessment" })).toHaveAttribute("href", "/get-help")
  })

  it("sends the Guard action to the sales page rather than setup or the case form", () => {
    render(<HowGuard />)
    expect(screen.getByRole("link", { name: "Explore Relaunch Guard" })).toHaveAttribute("href", "/relaunch-guard")
    expect(document.querySelectorAll('a[href="/start-monitoring"]')).toHaveLength(0)
    expect(document.querySelectorAll('a[href="/get-help"]')).toHaveLength(0)
  })
})
