/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { TelloyaAnalyticsRoot } from "./analytics-root"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
}))

vi.mock("next/script", () => ({
  default: function MockScript() {
    return <div data-testid="ga-external-script" />
  },
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("TelloyaAnalyticsRoot", () => {
  it.each([undefined, "", "preview", "development", "staging", "Production"])(
    "does not mount consent or Google Analytics when the environment is %s",
    (deploymentEnvironment) => {
      const { container } = render(
        <TelloyaAnalyticsRoot measurementId="G-TESTONLY123" deploymentEnvironment={deploymentEnvironment} />,
      )
      expect(container).toBeEmptyDOMElement()
      expect(document.querySelector("[data-testid='ga-external-script']")).toBeNull()
    },
  )

  it("shows the consent choice in production and still waits for acceptance", () => {
    render(<TelloyaAnalyticsRoot measurementId="G-TESTONLY123" deploymentEnvironment="production" />)
    expect(screen.getByRole("region", { name: "Analytics is optional" })).toBeInTheDocument()
    expect(document.querySelector("[data-testid='ga-external-script']")).toBeNull()
  })

  it("stays quiet when the measurement id is missing", () => {
    const { container } = render(
      <TelloyaAnalyticsRoot measurementId={undefined} deploymentEnvironment="production" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
