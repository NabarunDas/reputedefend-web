/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { guardPrice } from "@/lib/guard-offer"

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})
const isMonitoringPersistenceEnabled = vi.fn()

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}))

vi.mock("@/lib/monitoring/persistence-config", () => ({
  isMonitoringPersistenceEnabled: () => isMonitoringPersistenceEnabled(),
}))

vi.mock("@/components/start-monitoring-form", () => ({
  StartMonitoringForm: () => <div>setup-form</div>,
}))

vi.mock("./start-monitoring.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}))

import StartMonitoringPage from "./page"

describe("/start-monitoring rendering", () => {
  afterEach(() => {
    cleanup()
    notFound.mockClear()
  })

  it("is unavailable when the persistence flag is off", () => {
    isMonitoringPersistenceEnabled.mockReturnValue(false)
    expect(() => render(<StartMonitoringPage />)).toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalled()
    expect(screen.queryByRole("heading", { name: "Start your monitoring setup" })).not.toBeInTheDocument()
  })

  it("shows the shared monthly price and setup copy when the flag is on", () => {
    isMonitoringPersistenceEnabled.mockReturnValue(true)
    render(<StartMonitoringPage />)
    expect(screen.getByRole("heading", { name: "Start your monitoring setup" })).toBeInTheDocument()
    expect(screen.getByText(`${guardPrice} per month, per location`)).toBeInTheDocument()
    expect(screen.getByText(/does not take payment or start monitoring/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Early Access/i)
    expect(notFound).not.toHaveBeenCalled()
  })
})
