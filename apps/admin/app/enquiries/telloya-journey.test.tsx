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
    expect(screen.getByRole("button", { name: "Mark demo booked" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Mark demo completed" })).toHaveProperty("disabled", true)
    expect(screen.getByText(/does not book, place, or provision a Retell demonstration/)).toBeTruthy()
    expect(screen.getByText("Preview / test only, not available to customers")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send offer" })).toHaveProperty("disabled", true)
    expect(screen.getByText(/No illustrative total is available/)).toBeTruthy()
    expect(screen.getByText(/Going live stays blocked/)).toBeTruthy()
  })

  it("shows a labelled catalogue illustration for Growth and two Guard locations", () => {
    render(<TelloyaJourney snapshot={{ source: "telloya", planTier: "growth", guardLocationCount: 2 }} />)
    expect(screen.getByText(/Illustrative monthly total £98.98/)).toBeTruthy()
    expect(screen.getByText(/not an approved offer/)).toBeTruthy()
  })

  it("stays off a legacy enquiry", () => {
    const { container } = render(<TelloyaJourney snapshot={{ source: "homepage", planTier: "basic" }} />)
    expect(container.textContent).toBe("")
  })
})
