/** @vitest-environment jsdom */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { sitemapPaths } from "@/lib/site-nav"
import { metadata, GuardSalesView } from "./page"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("./guard.module.css", () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

const pageSource = readFileSync(join(process.cwd(), "app/relaunch-guard/page.tsx"), "utf8")

function hrefsNamed(name: string) {
  return screen.getAllByRole("link", { name }).map((link) => link.getAttribute("href"))
}

describe("/relaunch-guard page", () => {
  afterEach(() => {
    cleanup()
  })

  it("evaluates the server-only flag dynamically and keeps the canonical private from the sitemap", () => {
    expect(pageSource).toContain("isMonitoringPersistenceEnabled")
    expect(pageSource).toContain('export const dynamic = "force-dynamic"')
    expect(pageSource).not.toContain("NEXT_PUBLIC_")
    expect(pageSource).not.toContain("Google Connect")
    expect(metadata.alternates?.canonical).toBe("/relaunch-guard")
    expect(metadata.title).toEqual({
      absolute: "Relaunch Guard | Google Business Profile Monitoring | ProfileRelaunch",
    })
    expect(sitemapPaths).not.toContain("/relaunch-guard")
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
  })
})
