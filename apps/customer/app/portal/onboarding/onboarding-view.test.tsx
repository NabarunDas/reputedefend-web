// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { OnboardingRequestView } from "@/lib/portal/onboarding/types"
import { OnboardingUnavailable, OnboardingView } from "./onboarding-view"

afterEach(cleanup)

function request(overrides: Partial<OnboardingRequestView> = {}): OnboardingRequestView {
  return {
    product: "Telloya",
    stage: "under_review",
    statusLabel: "Request in progress",
    waitingFor: "us",
    customerActionRequired: false,
    businessName: "Harbour Bakery",
    locations: ["High Street", "Dock"],
    completed: ["Request received", "Under review"],
    nextStep: "We are reviewing this request.",
    receivedAt: "2026-11-01T09:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    offerRef: null,
    offerState: null,
    ...overrides,
  }
}

describe("setup progress page", () => {
  it("shows the recorded stage, an authorised business, and the way back", () => {
    render(<OnboardingView requests={[request()]} />)
    expect(screen.getByRole("heading", { level: 1, name: "Setup progress" })).toBeTruthy()
    expect(screen.getByText("Waiting for us. We are reviewing this request.")).toBeTruthy()
    expect(screen.getByText("Harbour Bakery")).toBeTruthy()
    expect(screen.getByText("High Street")).toBeTruthy()
    expect(screen.getByText("Dock")).toBeTruthy()
    const current = document.querySelector("[aria-current='step']")
    expect(current?.textContent).toContain("Under review")
    const received = document.querySelector(".onboarding-step.is-complete")
    expect(received?.textContent).toContain("Request received")
    expect(screen.getByRole("link", { name: "Back to My Products" }).getAttribute("href")).toBe("/portal/products")
    expect(screen.getByRole("link", { name: "contact@profilerelaunch.com" })).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/Accept offer|Pay now|Subscribe|stripe|Open dashboard/)
  })

  it("hides business details while authority is pending and distinguishes action needed", () => {
    render(<OnboardingView requests={[
      request({
        stage: "verification",
        statusLabel: "Awaiting verification",
        businessName: null,
        locations: null,
        customerActionRequired: false,
        nextStep: "We are checking that you can act for this business.",
        completed: ["Request received"],
      }),
      request({
        product: "Complete",
        stage: "awaiting_customer",
        statusLabel: "Awaiting your payment",
        waitingFor: "you",
        customerActionRequired: true,
        businessName: "North Yard",
        locations: ["Yard"],
        nextStep: "A payment step has been recorded. There is no payment button on this page.",
        receivedAt: "2026-11-02T09:00:00.000Z",
        completed: ["Request received", "Offer recorded"],
      }),
    ]} />)
    expect(screen.getByText("Telloya")).toBeTruthy()
    expect(screen.getByText("Complete")).toBeTruthy()
    expect(screen.queryByText("Harbour Bakery")).toBeNull()
    expect(screen.getByText("North Yard")).toBeTruthy()
    expect(screen.getByText(/Action needed from you/)).toBeTruthy()
    expect(screen.getByText(/There is no payment button on this page/)).toBeTruthy()
    const telloya = screen.getByText("Telloya").closest("article")
    const review = [...(telloya?.querySelectorAll(".onboarding-step") ?? [])].find(step => step.textContent?.includes("Under review"))
    expect(review?.className).toContain("is-upcoming")
    expect(review?.getAttribute("aria-current")).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/Pay now|checkout/)
  })

  it("names a prepared offer and a recorded payment without a payment action", () => {
    render(<OnboardingView requests={[
      request({
        stage: "offer_preparation",
        statusLabel: "Offer prepared",
        nextStep: "An offer has been prepared. There is nothing to accept or pay on this page.",
        completed: ["Request received", "Under review", "Offer recorded"],
      }),
      request({
        product: "Complete",
        stage: "awaiting_customer",
        statusLabel: "Payment recorded",
        waitingFor: "us",
        customerActionRequired: false,
        businessName: "North Yard",
        nextStep: "A payment has been recorded. We are checking it.",
        completed: ["Request received", "Offer recorded", "Payment recorded"],
        receivedAt: "2026-11-02T09:00:00.000Z",
      }),
    ]} />)
    expect(screen.getByRole("heading", { name: "Offer prepared" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Payment recorded" })).toBeTruthy()
    expect(screen.getByText(/An offer has been prepared/)).toBeTruthy()
    expect(screen.getByText(/A payment has been recorded/)).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/Awaiting your payment|Offer being prepared|Pay now|Accept offer/)
  })

  it("does not call a missing read an empty request", () => {
    render(<OnboardingUnavailable />)
    expect(screen.getByText(/does not say whether a request is in progress/)).toBeTruthy()
    expect(screen.queryByText(/no Telloya or Complete setup request/)).toBeNull()
  })

  it("shows an empty account without a checkout", () => {
    render(<OnboardingView requests={[]} />)
    expect(screen.getByText("There is no Telloya or Complete setup request on this account.")).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/Not subscribed|Subscribe|Pay now/)
  })
})
