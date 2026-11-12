// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TelloyaJourney } from "./telloya-journey"

afterEach(() => cleanup())

describe("Telloya journey panel", () => {
  it("shows a missing plan as still to be confirmed", () => {
    render(<TelloyaJourney snapshot={{ source: "telloya" }} />)
    expect(screen.getByText((_, node) => node?.tagName === "P" && node.textContent === "General enquiry · Plan to be confirmed")).toBeTruthy()
    expect(screen.getByText("Demo · current")).toBeTruthy()
    expect(screen.getByText(/Mark the demonstration booked/)).toBeTruthy()
  })

  it("stays off a legacy enquiry", () => {
    const { container } = render(<TelloyaJourney snapshot={{ source: "homepage", planTier: "basic" }} />)
    expect(container.textContent).toBe("")
  })
})
