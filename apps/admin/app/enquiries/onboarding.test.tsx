// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { OnboardingPanel } from "./onboarding"
import type { OnboardingView } from "@/lib/commercial/onboarding"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const enquiryId = "11111111-1111-4111-8111-111111111111"
const base = {
  supported: true as const,
  productHint: "TELLOYA" as const,
  termsConfigured: false,
  invitationReady: false,
  invitationSent: false as const,
  emailVerified: false,
  contactVerified: false,
  membership: null,
  outstanding: ["Choose Telloya or Complete and open the onboarding request."],
  nextAction: "Choose Telloya or Complete and open the onboarding request.",
  request: null,
  customer: null,
  candidates: [],
  businesses: [],
  locations: [],
  history: [],
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("Telloya onboarding panel", () => {
  it("does not add an onboarding section when the enquiry is not a Telloya or Complete request", () => {
    const view: OnboardingView = { supported: false }
    render(<OnboardingPanel view={view} enquiryId={enquiryId} open businessName="" country="" />)
    expect(screen.queryByRole("heading", { name: "Telloya and Complete onboarding" })).toBeNull()
  })

  it("starts with the product choice and does not show a price", () => {
    render(<OnboardingPanel view={{ ...base, step: "classify" }} enquiryId={enquiryId} open businessName="North Plumbing" country="United Kingdom" />)
    expect((screen.getByRole("radio", { name: "Telloya" }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole("button", { name: "Open onboarding" })).toBeTruthy()
    expect(screen.getByText(/Commercial terms not yet configured/)).toBeTruthy()
    expect(screen.queryByText(/£/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Prepare the approved offer" })).toBeNull()
  })

  it("distinguishes an unverified mailbox from Admin approval", () => {
    render(<OnboardingPanel view={{
      ...base,
      step: "next",
      emailVerified: false,
      contactVerified: false,
      membership: "pending",
      outstanding: ["The customer email is not verified. Admin approval does not verify it and does not send an invitation.", "Commercial terms not yet configured. No approved price is offered."],
      nextAction: "The customer email is not verified. Admin approval does not verify it and does not send an invitation.",
      request: { id: "33333333-3333-4333-8333-333333333333", product: "TELLOYA", state: "MAILBOX_REQUIRED", version: 3, customerId: "22222222-2222-4222-8222-222222222222", businessId: "44444444-4444-4444-8444-444444444444", declineReason: null, subscriptionId: null },
      customer: { id: "22222222-2222-4222-8222-222222222222", name: "North Owner", emailVerified: false, version: 1 },
    }} enquiryId={enquiryId} open businessName="North Plumbing" country="United Kingdom" />)
    expect(screen.getByText(/Customer email is not verified/)).toBeTruthy()
    expect(screen.getByText(/Pending is not verified authority/)).toBeTruthy()
    expect(screen.getByText(/No invitation email is sent/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mark ready for a later invitation" })).toBeTruthy()
  })

  it("shows a verified customer without offering a missing price", () => {
    render(<OnboardingPanel view={{
      ...base,
      step: "next",
      emailVerified: true,
      contactVerified: true,
      membership: "verified",
      termsConfigured: false,
      outstanding: ["Commercial terms not yet configured. No approved price is offered."],
      nextAction: "Commercial terms not yet configured. No approved price is offered.",
      request: { id: "33333333-3333-4333-8333-333333333333", product: "COMPLETE", state: "IN_REVIEW", version: 4, customerId: "22222222-2222-4222-8222-222222222222", businessId: "44444444-4444-4444-8444-444444444444", declineReason: null, subscriptionId: null },
      customer: { id: "22222222-2222-4222-8222-222222222222", name: "Verified Owner", emailVerified: true, version: 2 },
    }} enquiryId={enquiryId} open businessName="North Plumbing" country="United Kingdom" />)
    expect(screen.getByText(/Customer email verified/)).toBeTruthy()
    expect(screen.getByText(/Business authority is verified/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Prepare the approved offer" })).toBeNull()
    expect(screen.getByRole("button", { name: "Mark ready for a later invitation" })).toBeTruthy()
  })

  it("shows a fixed offer and does not treat withdrawn authority as selectable", () => {
    render(<OnboardingPanel view={{
      ...base,
      step: "next",
      emailVerified: true,
      contactVerified: true,
      membership: "verified",
      termsConfigured: true,
      outstanding: [],
      nextAction: null,
      request: { id: "33333333-3333-4333-8333-333333333333", product: "COMPLETE", state: "OFFERED", version: 6, customerId: "22222222-2222-4222-8222-222222222222", businessId: "44444444-4444-4444-8444-444444444444", declineReason: null, subscriptionId: "55555555-5555-4555-8555-555555555555" },
      customer: { id: "22222222-2222-4222-8222-222222222222", name: "Verified Owner", emailVerified: true, version: 2 },
    }} enquiryId={enquiryId} open businessName="North Plumbing" country="United Kingdom" />)
    expect(screen.getByText(/locations and commercial terms are fixed/)).toBeTruthy()
    expect(screen.getByText(/withdrawn in the same step/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save locations" })).toBeNull()
  })

  it("does not offer a match that would restore withdrawn authority", () => {
    render(<OnboardingPanel view={{
      ...base,
      step: "business",
      membership: "revoked",
      outstanding: ["Business authority has been withdrawn. Withdrawn authority cannot receive an invitation."],
      nextAction: "Business authority has been withdrawn. Withdrawn authority cannot receive an invitation.",
      request: { id: "33333333-3333-4333-8333-333333333333", product: "TELLOYA", state: "IN_REVIEW", version: 2, customerId: "22222222-2222-4222-8222-222222222222", businessId: null, declineReason: null, subscriptionId: null },
      businesses: [{ id: "44444444-4444-4444-8444-444444444444", name: "North Plumbing", membership: "revoked", membershipVersion: 2 }],
    }} enquiryId={enquiryId} open businessName="North Plumbing" country="United Kingdom" />)
    expect(screen.getByText(/Matching does not restore it/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Use North Plumbing" })).toBeNull()
  })
})
