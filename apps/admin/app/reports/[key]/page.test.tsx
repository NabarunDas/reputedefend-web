// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadReport = vi.fn()
const loadSavedFilters = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/reports/queries", () => ({
  loadReport: (...args: unknown[]) => loadReport(...args),
  loadSavedFilters: (...args: unknown[]) => loadSavedFilters(...args),
}))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found") } }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import ReportDetailPage from "./page"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => {
  loadReport.mockReset()
  loadSavedFilters.mockReset()
  loadSavedFilters.mockResolvedValue({ filters: [] })
})

describe("report detail temporal semantics", () => {
  it("labels current-snapshot reports and hides period controls", async () => {
    loadReport.mockResolvedValue({
      status: "success",
      temporalMode: "CURRENT",
      period: { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", timezone: "Europe/London" },
      summary: { count: 2, temporalMode: "CURRENT" },
      page: { rows: [], hasMore: false },
    })
    render(await ReportDetailPage({ params: Promise.resolve({ key: "open_cases" }), searchParams: Promise.resolve({ preset: "custom", start: "2026-01-01", end: "2026-01-02" }) }))
    expect(screen.getByText(/Current snapshot/)).toBeTruthy()
    expect(screen.queryByLabelText("Report period")).toBeNull()
    expect(document.body.textContent).not.toMatch(/The selected period produced/)
  })

  it("shows Europe/London boundaries on period reports", async () => {
    loadReport.mockResolvedValue({
      status: "success",
      temporalMode: "PERIOD",
      period: { start: "2026-03-29T00:00:00+01:00", end: "2026-03-30T00:00:00+01:00", timezone: "Europe/London" },
      summary: { count: 0, temporalMode: "PERIOD", amounts: [] },
      page: { rows: [], hasMore: false },
    })
    render(await ReportDetailPage({ params: Promise.resolve({ key: "collected_net" }), searchParams: Promise.resolve({ preset: "today" }) }))
    expect(screen.getByLabelText("Report period")).toBeTruthy()
    expect(screen.getByText(/Europe\/London period/)).toBeTruthy()
    expect(screen.getByText("No confirmed collections")).toBeTruthy()
  })
})
