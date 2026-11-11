/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
import HomePage from "@/app/page"
import DemoPage from "@/app/demo/page"
import Features from "@/app/features/page"
import HowItWorks from "@/app/how-it-works/page"
import Industries from "@/app/industries/page"
import { TelloyaEnquiryForm } from "@/components/telloya-enquiry-form"
import { personalisedDemoOffer } from "@/lib/content"

afterEach(() => cleanup())

const pages = [
  ["homepage", HomePage],
  ["demo", DemoPage],
  ["how it works", HowItWorks],
  ["features", Features],
  ["industries", Industries],
] as const

describe("personalised demonstration messaging", () => {
  it("uses one request URL and keeps a demonstration request from becoming a booking", () => {
    expect(personalisedDemoOffer.href).toBe("/enquire?intent=personalised-demo")
    expect(personalisedDemoOffer.cta).toBe("Request a personalised demo")
    expect(personalisedDemoOffer.heading).toBe("Experience Telloya answering calls for your business")
    expect(personalisedDemoOffer.reassurance).toBe("No payment details required. No obligation to subscribe.")
    expect(personalisedDemoOffer.steps).toHaveLength(5)
    expect(personalisedDemoOffer.boundary).toMatch(/not a confirmed appointment/)
    expect(personalisedDemoOffer.boundary).toMatch(/No subscription starts automatically/)
    expect(personalisedDemoOffer.boundary).toMatch(/no agent is provisioned/)
    expect(personalisedDemoOffer.support).toMatch(/not guaranteed/)
    expect(JSON.stringify(personalisedDemoOffer)).not.toMatch(/\bfree\b/i)
    expect(personalisedDemoOffer.href).not.toMatch(/checkout|stripe|book|subscribe/i)
  })

  it("points every personalised-demo call to action at the intent URL and keeps general enquiries on /enquire", () => {
    for (const [name, Page] of pages) {
      const { unmount } = render(<Page />)
      const demoLinks = screen.getAllByRole("link", { name: personalisedDemoOffer.cta })
      expect(demoLinks.length, name).toBeGreaterThan(0)
      for (const link of demoLinks) {
        expect(link, name).toHaveAttribute("href", "/enquire?intent=personalised-demo")
      }
      const general = screen.getAllByRole("link").filter((link) =>
        /^(Enquire about Telloya|Enquire now|Get in touch|Enquire)$/.test((link.textContent ?? "").replace(/\s+/g, " ").trim()),
      )
      expect(general.length, name).toBeGreaterThan(0)
      for (const link of general) {
        expect(link, name).toHaveAttribute("href", "/enquire")
      }
      expect(screen.getByText(personalisedDemoOffer.reassurance)).toBeInTheDocument()
      unmount()
    }
  })

  it("keeps the approved offer on the homepage, demo, how it works and features pages", () => {
    for (const Page of [HomePage, DemoPage, HowItWorks, Features]) {
      const { unmount } = render(<Page />)
      expect(screen.getByRole("heading", { name: personalisedDemoOffer.heading })).toBeInTheDocument()
      expect(screen.getByText(personalisedDemoOffer.description)).toBeInTheDocument()
      unmount()
    }
  })

  it("invites industry visitors to experience a receptionist configured for their business", () => {
    render(<Industries />)
    expect(screen.getByRole("heading", { name: "Experience an AI receptionist configured for your business" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Designed for more service businesses/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Enquire now" })).toHaveAttribute("href", "/enquire")
  })

  it("explains the live demonstration number on the demo page without treating the film as the demonstration", () => {
    render(<DemoPage />)
    expect(screen.getByText(personalisedDemoOffer.distinction)).toBeInTheDocument()
    expect(screen.getByText(personalisedDemoOffer.boundary)).toBeInTheDocument()
    for (const step of personalisedDemoOffer.steps) {
      expect(screen.getByText(step)).toBeInTheDocument()
    }
    expect(screen.getByRole("link", { name: "Enquire about Telloya" })).toHaveAttribute("href", "/enquire")
  })

  it("keeps a personalised-demo enquiry as a request and leaves a general enquiry unchanged", () => {
    const { unmount } = render(
      <TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} initialRequestIntent="personalised-demo" />,
    )
    const note = screen.getByRole("note")
    expect(note).toHaveTextContent("demonstration telephone number")
    expect(note).toHaveTextContent("not a confirmed appointment")
    expect(note).toHaveTextContent("No payment details are required")
    expect(note).toHaveTextContent("no obligation to subscribe")
    expect(note).not.toHaveTextContent(/instant|self-service|confirmed appointment time/i)
    unmount()

    render(<TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} />)
    expect(screen.queryByRole("note")).not.toBeInTheDocument()
    expect(screen.queryByText(/demonstration telephone number/)).not.toBeInTheDocument()
  })
})
