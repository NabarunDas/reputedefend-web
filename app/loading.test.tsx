/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import Loading from "./loading"

afterEach(() => {
  cleanup()
})

describe("shared loading skeleton", () => {
  it("adds no heading to the page it is streaming into", () => {
    const { container } = render(<Loading />)
    expect(container.querySelectorAll("h1")).toHaveLength(0)
    expect(container.querySelectorAll("h1, h2, h3, h4, h5, h6")).toHaveLength(0)
  })

  it("keeps the same text, class and live-region behaviour", () => {
    const { container } = render(<Loading />)
    const line = screen.getByText("Preparing the next step")
    expect(line.tagName).toBe("P")
    expect(line).toHaveClass("section-title")

    const region = container.querySelector(".status-page")
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region).toHaveAttribute("aria-busy", "true")
    expect(screen.getByText("Loading")).toHaveClass("eyebrow")
    expect(screen.getByText("This should only take a moment.")).toBeInTheDocument()
  })
})
