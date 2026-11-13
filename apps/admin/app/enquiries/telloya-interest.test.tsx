// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { EnquiryPayload } from "@/lib/enquiries/model"
import { TelloyaEnquiryInterest } from "./telloya-interest"

afterEach(() => cleanup())

const payload: EnquiryPayload = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+447700900123",
  businessName: "Harbour Plumbing",
  country: "GB",
  subject: "",
  service: "",
  details: "Plan tier: growth",
  websiteUrl: "https://harbour.example",
  businessProfileUrl: "",
  reviewUrl: "",
  source: "telloya",
  product: "telloya",
  trade: "Plumbing",
  planTier: "growth",
  guardInterested: true,
  guardLocationCount: 2,
  voicePreference: "female",
  voiceAccent: "British",
  primaryLanguage: "English",
  speakingStyle: "professional",
  additionalLanguages: "Polish",
  overageInterested: true,
  overageMonthlyCapGbp: 40,
  missedCallProblem: "Calls while on site",
  phoneSetup: "Mobile",
  contactPreference: "Weekday mornings",
  receptionistQuestions: "Ask for the boiler make and whether they have a service plan.",
  privacyAccepted: true,
}

describe("Telloya enquiry interest in Admin", () => {
  it("shows the selected plan, Guard interest and optional details without treating them as a purchase", () => {
    render(<TelloyaEnquiryInterest payload={payload} enquiryRef="TY-26-ABCDEF" />)
    expect(screen.getByText("TY-26-ABCDEF")).toBeTruthy()
    expect(screen.getByText("General enquiry")).toBeTruthy()
    expect(screen.getByText(/No personalised-demonstration request was recorded/)).toBeTruthy()
    expect(screen.getByText("Growth")).toBeTruthy()
    expect(screen.getByText(/not an approved offer/i)).toBeTruthy()
    expect(screen.getByText(/Yes, 2 locations requested/)).toBeTruthy()
    expect(screen.getByText(/not a Guard purchase/i)).toBeTruthy()
    expect(screen.getByText("Telloya")).toBeTruthy()
    expect(screen.queryByText(/Complete bundle/)).toBeTruthy()
    expect(screen.queryByText(/purchased the Complete/i)).toBeNull()
    expect(screen.getByText(/proposed cap £40 per month/)).toBeTruthy()
    expect(screen.getByText(/does not authorise overage billing/i)).toBeTruthy()
    expect(screen.getByText("Acknowledged")).toBeTruthy()
    expect(screen.getByText("Mobile")).toBeTruthy()
    expect(screen.getByText("Calls while on site")).toBeTruthy()
    expect(screen.getByText("female")).toBeTruthy()
    expect(screen.getByText("British")).toBeTruthy()
    expect(screen.getByText("English")).toBeTruthy()
    expect(screen.getByText("Weekday mornings")).toBeTruthy()
    expect(screen.getByText("Ask for the boiler make and whether they have a service plan.")).toBeTruthy()
    expect(screen.getByText(/does not book a demonstration or provision an agent/i)).toBeTruthy()
    expect(screen.getByText(/do not approve an offer, take payment, start Stripe/i)).toBeTruthy()
  })

  it("keeps a Custom quotation separate from optional calls and does not invent Guard interest", () => {
    render(<TelloyaEnquiryInterest payload={{
      ...payload,
      planTier: "custom",
      guardInterested: false,
      guardLocationCount: undefined,
      overageInterested: false,
      overageMonthlyCapGbp: undefined,
      customMonthlyMinutes: 1000,
      customMonthlyCalls: undefined,
      customPhoneNumbers: 2,
      customLocations: 4,
      customRequirements: "Night answering",
      phoneSetup: "",
    }} enquiryRef="TY-26-CUSTOM1" />)
    expect(screen.getByText("Custom")).toBeTruthy()
    expect(screen.getByText("1000")).toBeTruthy()
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0)
    expect(screen.getByText("Night answering")).toBeTruthy()
    expect(screen.getByText("No Guard interest recorded")).toBeTruthy()
    expect(screen.queryByText(/Complete \(Telloya \+ Relaunch Guard\)/)).toBeNull()
  })

  it("shows a personalised demonstration request separately from the optional questions", () => {
    render(<TelloyaEnquiryInterest payload={{
      ...payload,
      requestIntent: "personalised-demo",
    }} enquiryRef="TY-26-DEMO01" />)
    expect(screen.getByText("Personalised live demonstration")).toBeTruthy()
    expect(screen.getByText(/not a confirmed booking and it does not provision an agent/i)).toBeTruthy()
    expect(screen.getByText("Ask for the boiler make and whether they have a service plan.")).toBeTruthy()
    expect(screen.queryByText("General enquiry")).toBeNull()
  })

  it("names a missing plan as still to be confirmed", () => {
    render(<TelloyaEnquiryInterest payload={{ ...payload, planTier: undefined }} enquiryRef="TY-26-NOPLAN" />)
    expect(screen.getByText("Plan to be confirmed")).toBeTruthy()
    expect(screen.getByText(/No plan was selected/)).toBeTruthy()
    expect(screen.queryByText(/required plan/i)).toBeNull()
  })

  it("does not render for a ProfileRelaunch enquiry", () => {
    const { container } = render(<TelloyaEnquiryInterest payload={{ ...payload, source: "contact", product: undefined, planTier: undefined }} enquiryRef={null} />)
    expect(container.textContent).toBe("")
  })
})
