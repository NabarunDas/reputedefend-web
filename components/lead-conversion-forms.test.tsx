/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ContactForm } from "./contact-form"
import { EnquiryForm } from "./enquiry-form"
import { CaseIntakeForm } from "./case-intake-form"
import { StartMonitoringForm } from "./start-monitoring-form"
import { ANALYTICS_CONSENT_KEY, LEAD_CONVERSION_EVENT } from "@/lib/analytics"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

const SUBMISSION_KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

let gtag: Mock<(...args: unknown[]) => void>

function acceptConsent() {
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted")
}

function leadEvents() {
  return gtag.mock.calls.filter((call) => call[0] === "event" && call[1] === LEAD_CONVERSION_EVENT)
}

function leadParams(index = 0) {
  return leadEvents()[index]?.[2] as Record<string, unknown> | undefined
}

function jsonFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

/** Settle any microtasks and timeouts the submit handler queued after fetch. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 10))
}

beforeEach(() => {
  window.localStorage.clear()
  gtag = vi.fn()
  window.gtag = gtag
  vi.spyOn(window.crypto, "randomUUID").mockReturnValue(SUBMISSION_KEY as ReturnType<Crypto["randomUUID"]>)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  delete window.gtag
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ------------------------------------------------------------ homepage enquiry

const homepageDetails = "Our Google Business Profile was suspended last week and we need help appealing."

function fillHomepageEnquiry(service = "profile-recovery") {
  fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: "Alex Morgan" } })
  fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: "alex@example.com" } })
  fireEvent.change(screen.getByLabelText(/Business name/), { target: { value: "Harbour Bakery" } })
  fireEvent.change(screen.getByLabelText(/What do you need help with/), { target: { value: service } })
  fireEvent.change(screen.getByLabelText(/How can we help/), { target: { value: homepageDetails } })
}

async function submitHomepageEnquiry(body: unknown, service = "profile-recovery") {
  const fetchMock = jsonFetch(body)
  vi.stubGlobal("fetch", fetchMock)
  render(<EnquiryForm />)
  fillHomepageEnquiry(service)
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  return fetchMock
}

describe("homepage enquiry conversion", () => {
  it("sends exactly one generate_lead with the selected service on a persisted submission", async () => {
    acceptConsent()
    await submitHomepageEnquiry({ ok: true })
    await waitFor(() => expect(leadEvents()).toHaveLength(1))
    expect(leadParams()).toEqual({ lead_type: "homepage_enquiry", service_type: "profile-recovery" })
  })

  it("sends nothing for a development simulation", async () => {
    acceptConsent()
    await submitHomepageEnquiry({ ok: true, simulated: true })
    await screen.findByText(/not a live enquiry/i)
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing when the API rejects the submission", async () => {
    acceptConsent()
    await submitHomepageEnquiry({ ok: false, errors: { email: "Please enter a valid email address." } })
    await settle()
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing when local validation fails before any request", () => {
    acceptConsent()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<EnquiryForm />)
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing when consent has not been given", async () => {
    await submitHomepageEnquiry({ ok: true })
    await settle()
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing when consent has been rejected", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "rejected")
    await submitHomepageEnquiry({ ok: true })
    await settle()
    expect(leadEvents()).toHaveLength(0)
  })

  it("does not emit a second event when the success screen re-renders", async () => {
    acceptConsent()
    await submitHomepageEnquiry({ ok: true })
    await waitFor(() => expect(leadEvents()).toHaveLength(1))
    const success = await screen.findByRole("heading", { name: /received your enquiry/i })
    fireEvent.focus(success)
    fireEvent.blur(success)
    await settle()
    expect(leadEvents()).toHaveLength(1)
  })

  it("carries no submitted values in the event parameters", async () => {
    acceptConsent()
    await submitHomepageEnquiry({ ok: true })
    await waitFor(() => expect(leadEvents()).toHaveLength(1))
    expect(Object.keys(leadParams() ?? {}).sort()).toEqual(["lead_type", "service_type"])
    const serialised = JSON.stringify(leadParams())
    expect(serialised).not.toContain("Alex Morgan")
    expect(serialised).not.toContain("alex@example.com")
    expect(serialised).not.toContain("Harbour Bakery")
    expect(serialised).not.toContain("suspended")
    expect(serialised).not.toContain(SUBMISSION_KEY)
  })
})

// -------------------------------------------------------------------- contact

async function submitContact(body: unknown) {
  const fetchMock = jsonFetch(body)
  vi.stubGlobal("fetch", fetchMock)
  render(<ContactForm />)
  fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: "Alex Morgan" } })
  fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: "alex@example.com" } })
  fireEvent.change(screen.getByLabelText(/^Subject$/), { target: { value: "partnership" } })
  fireEvent.change(screen.getByLabelText(/^Message$/), {
    target: { value: "Could you explain how ProfileRelaunch assessments work before we start?" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Send message" }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
}

describe("contact conversion", () => {
  it("sends exactly one generate_lead with no service and no subject", async () => {
    acceptConsent()
    await submitContact({ ok: true })
    await waitFor(() => expect(leadEvents()).toHaveLength(1))
    expect(leadParams()).toEqual({ lead_type: "contact" })
    expect(JSON.stringify(leadParams())).not.toContain("partnership")
  })

  it("sends nothing for a development simulation", async () => {
    acceptConsent()
    await submitContact({ ok: true, simulated: true })
    await settle()
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing without consent", async () => {
    await submitContact({ ok: true })
    await settle()
    expect(leadEvents()).toHaveLength(0)
  })
})

// ----------------------------------------------------------------- assessment

const assessmentDetails =
  "A suspicious review appeared on our profile last Monday and we would like it assessed against Google's policies."

async function submitAssessment(body: unknown) {
  const fetchMock = jsonFetch(body)
  vi.stubGlobal("fetch", fetchMock)
  render(<CaseIntakeForm initialService="review-protection" />)

  fireEvent.click(screen.getByRole("button", { name: "Continue" }))
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Morgan" } })
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } })
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Harbour Bakery" } })
  fireEvent.change(screen.getByLabelText("Country"), { target: { value: "Ireland" } })
  fireEvent.click(screen.getByRole("button", { name: "Continue" }))
  fireEvent.change(screen.getByLabelText("Tell us what happened"), { target: { value: assessmentDetails } })
  fireEvent.click(screen.getByRole("button", { name: "Continue" }))
  fireEvent.click(screen.getByRole("checkbox", { name: /accurate/i }))
  fireEvent.click(screen.getByRole("checkbox", { name: /privacy/i }))
  fireEvent.click(screen.getByRole("button", { name: "Submit assessment" }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
}

describe("assessment conversion", () => {
  it("sends exactly one generate_lead with the validated service enum and no case reference", async () => {
    acceptConsent()
    await submitAssessment({ ok: true, persisted: true, caseRef: "PR-2026-0001" })
    await waitFor(() => expect(leadEvents()).toHaveLength(1))
    expect(leadParams()).toEqual({ lead_type: "assessment", service_type: "review-protection" })
    expect(JSON.stringify(leadParams())).not.toContain("PR-2026-0001")
  })

  it("sends nothing for a development simulation", async () => {
    acceptConsent()
    await submitAssessment({ ok: true, simulated: true })
    await settle()
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing when the API rejects the case", async () => {
    acceptConsent()
    await submitAssessment({ ok: false, message: "unavailable" })
    await settle()
    expect(leadEvents()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- guard setup

async function submitGuard(body: unknown, status = 200) {
  const fetchMock = jsonFetch(body, status)
  vi.stubGlobal("fetch", fetchMock)
  render(<StartMonitoringForm />)
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Morgan" } })
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } })
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Harbour Bakery" } })
  fireEvent.change(screen.getByLabelText("Country"), { target: { value: "United Kingdom" } })
  fireEvent.change(screen.getByLabelText("Google Business Profile URL"), {
    target: { value: "https://maps.google.com/?cid=123" },
  })
  fireEvent.click(screen.getByRole("checkbox", { name: /authorised/i }))
  fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  return fetchMock
}

describe("guard setup conversion", () => {
  it("sends exactly one generate_lead when the API confirms a persisted request", async () => {
    acceptConsent()
    await submitGuard({ ok: true, persisted: true, receiptEmailSent: true })
    await waitFor(() => expect(leadEvents()).toHaveLength(1))
    expect(leadParams()).toEqual({ lead_type: "guard_setup" })
  })

  it("sends nothing when the response looks successful but was not persisted", async () => {
    acceptConsent()
    await submitGuard({ ok: true, message: "maybe" })
    await screen.findByRole("button", { name: "Try again" })
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing for an uncertain failure, and nothing on the retry that also fails", async () => {
    acceptConsent()
    const fetchMock = jsonFetch({ ok: false }, 503)
    vi.stubGlobal("fetch", fetchMock)
    render(<StartMonitoringForm />)
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Morgan" } })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } })
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Harbour Bakery" } })
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "United Kingdom" } })
    fireEvent.change(screen.getByLabelText("Google Business Profile URL"), {
      target: { value: "https://maps.google.com/?cid=123" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /authorised/i }))
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    const retry = await screen.findByRole("button", { name: "Try again" })
    expect(leadEvents()).toHaveLength(0)
    fireEvent.click(retry)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await screen.findByRole("button", { name: "Try again" })
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing when rate limited", async () => {
    acceptConsent()
    await submitGuard({ ok: false, message: "unavailable" }, 429)
    await screen.findByRole("button", { name: "Try again" })
    expect(leadEvents()).toHaveLength(0)
  })

  it("sends nothing when local validation fails", () => {
    acceptConsent()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<StartMonitoringForm />)
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(leadEvents()).toHaveLength(0)
  })
})
