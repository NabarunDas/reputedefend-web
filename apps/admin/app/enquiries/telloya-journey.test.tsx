// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
import { TelloyaJourney } from "./telloya-journey"

afterEach(() => cleanup())

describe("Telloya journey panel", () => {
  it("shows a missing plan as still to be confirmed", () => {
    render(<TelloyaJourney snapshot={{ source: "telloya" }} />)
    expect(screen.getByText((_, node) => node?.tagName === "P" && node.textContent === "General enquiry · Plan to be confirmed")).toBeTruthy()
    expect(screen.getByText("Demo · current")).toBeTruthy()
    expect(screen.getByText(/Mark the demonstration booked/)).toBeTruthy()
    expect(screen.getByText("Recording stays off. The admin journey flag is not enabled.")).toBeTruthy()
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

  it("shows the authenticated booking form when the demonstration record is ready", () => {
    render(<TelloyaJourney snapshot={{ source: "telloya" }} demo={{
      availability: "ready",
      enquiryId: "22222222-2222-4222-8222-222222222222",
      status: "NOT_BOOKED",
      version: 0,
      scheduledAt: null,
      completedAt: null,
      timezone: "Europe/London",
    }} />)
    expect(screen.getByText(/Status not booked/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mark demo booked" })).toHaveProperty("disabled", false)
    expect(screen.queryByRole("button", { name: "Mark demo completed" })).toBeNull()
  })

  it("moves the next step when the recorded demonstration is completed", () => {
    render(<TelloyaJourney snapshot={{ source: "telloya" }} demo={{
      availability: "ready",
      enquiryId: "22222222-2222-4222-8222-222222222222",
      status: "COMPLETED",
      version: 2,
      scheduledAt: "2026-11-12T10:00:00.000Z",
      completedAt: "2026-11-12T11:00:00.000Z",
      timezone: "Europe/London",
    }} offer={{
      availability: "ready",
      subscriptionId: "33333333-3333-4333-8333-333333333333",
      offerRef: "VC-26-ABCDEF",
      state: "OFFERED",
      version: 1,
      amendments: [],
      emailQueued: false,
      paymentStatus: "none",
    }} />)
    expect(screen.getByText("Offer · current")).toBeTruthy()
    expect(screen.getByText(/Queue the offer email/)).toBeTruthy()
    expect(screen.queryByText("Demo · current")).toBeNull()
    expect(screen.getByText("Booked for 12 November 2026 at 10:00 (Europe/London).")).toBeTruthy()
    expect(screen.getByText("Completed at 12 November 2026 at 11:00 (Europe/London).")).toBeTruthy()
    expect(screen.queryByText(/2026-11-12T10:00:00.000Z/)).toBeNull()
    expect(screen.queryByText(/2026-11-12T11:00:00.000Z/)).toBeNull()
  })

  it("defers the catalogue offer preview to the offer workspace after a completed demo", () => {
    render(<TelloyaJourney
      snapshot={{ source: "telloya", planTier: "growth", guardLocationCount: 2 }}
      offerFirst
      demo={{
        availability: "ready",
        enquiryId: "22222222-2222-4222-8222-222222222222",
        status: "COMPLETED",
        version: 2,
        scheduledAt: null,
        completedAt: "2026-11-12T11:00:00.000Z",
        timezone: "Europe/London",
      }}
      offer={{ availability: "no_offer" }}
    />)
    expect(screen.getByText(/Prepare \/ Review personalised offer/)).toBeTruthy()
    expect(screen.getByText(/personalised offer workspace below/)).toBeTruthy()
    expect(screen.queryByText(/Illustrative monthly total/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Send offer" })).toBeNull()
  })

  it("formats a booked demonstration in the recorded timezone", () => {
    render(<TelloyaJourney snapshot={{ source: "telloya" }} demo={{
      availability: "ready",
      enquiryId: "22222222-2222-4222-8222-222222222222",
      status: "BOOKED",
      version: 1,
      scheduledAt: "2026-07-01T12:00:00.000Z",
      completedAt: null,
      timezone: "Europe/London",
    }} />)
    expect(screen.getByText("Booked for 1 July 2026 at 13:00 (Europe/London).")).toBeTruthy()
    expect(screen.queryByText(/Completed at/)).toBeNull()
    expect(screen.queryByText(/2026-07-01T12:00:00.000Z/)).toBeNull()
  })

  it("follows a paid subscription into setup", () => {
    render(<TelloyaJourney snapshot={{ source: "telloya" }} demo={{
      availability: "ready",
      enquiryId: "22222222-2222-4222-8222-222222222222",
      status: "COMPLETED",
      version: 2,
      scheduledAt: null,
      completedAt: "2026-11-12T11:00:00.000Z",
      timezone: "Europe/London",
    }} offer={{
      availability: "ready",
      subscriptionId: "33333333-3333-4333-8333-333333333333",
      offerRef: "VC-26-ABCDEF",
      state: "ACTIVE",
      version: 4,
      amendments: [],
      emailQueued: true,
      agreementAccepted: true,
      paymentStatus: "paid",
      provisionState: "FORWARDING_REQUIRED",
    }} />)
    expect(screen.getByText("Setup · current")).toBeTruthy()
    expect(screen.getByText(/Record forwarding instructions/)).toBeTruthy()
    expect(screen.getAllByText(/Going live stays blocked/).length).toBeGreaterThan(0)
  })

  it("stays off a legacy enquiry", () => {
    const { container } = render(<TelloyaJourney snapshot={{ source: "homepage", planTier: "basic" }} />)
    expect(container.textContent).toBe("")
  })
})
