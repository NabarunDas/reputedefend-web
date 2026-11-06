// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TelloyaEnquiryForm } from "./telloya-enquiry-form"

afterEach(() => cleanup())

describe("Telloya enquiry form commercial labels", () => {
  it("shows an indicative fixed-plan plus Guard total without authorising billing", () => {
    render(<TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} initialPlanTier="growth" />)
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ }), { target: { value: "2" } })
    expect(screen.getByText(/Indicative monthly total: £98\.98/)).toBeInTheDocument()
    expect(screen.getByText(/does not authorise billing/)).toBeInTheDocument()
  })

  it("keeps Custom monthly calls optional", () => {
    render(<TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} initialPlanTier="custom" />)
    const calls = screen.getByRole("spinbutton", { name: /Expected calls per month/ }) as HTMLInputElement
    expect(calls).not.toBeRequired()
    expect(calls.labels?.[0]?.textContent).toMatch(/Optional/)
  })

  it("marks the overage cap required only after additional-minute interest is selected", () => {
    render(<TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} initialPlanTier="basic" />)
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.queryByRole("spinbutton", { name: /Proposed monthly cap/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    expect(screen.queryByRole("spinbutton", { name: /Proposed monthly cap/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Interested in additional minutes/ }))
    const cap = screen.getByRole("spinbutton", { name: /Proposed monthly cap/ }) as HTMLInputElement
    expect(cap).toBeRequired()
    expect(cap.labels?.[0]?.textContent ?? "").not.toMatch(/Optional/)
  })
})

const enabled = { submissionEnabled: true as const }
const reference = "TY-26-ABCDEF"

function renderEnabled(initialPlanTier: "" | "basic" | "growth" | "pro" | "custom" = "growth", initialGuardInterested = false) {
  return render(
    <TelloyaEnquiryForm
      capabilities={enabled}
      initialPlanTier={initialPlanTier}
      initialGuardInterested={initialGuardInterested}
    />,
  )
}

function fillContact() {
  fireEvent.change(screen.getByRole("textbox", { name: /Business name/ }), { target: { value: "Harbour Plumbing" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^Country/ }), { target: { value: "United Kingdom" } })
  fireEvent.change(screen.getByRole("textbox", { name: /Business type or trade/ }), { target: { value: "Plumbing" } })
  fireEvent.change(screen.getByRole("textbox", { name: /Contact name/ }), { target: { value: "Ada Lovelace" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "ada@example.com" } })
  fireEvent.change(screen.getByRole("textbox", { name: /Phone number/ }), { target: { value: "+447700900123" } })
  fireEvent.click(screen.getByRole("checkbox", { name: /privacy notice/ }))
}

describe("Telloya short enquiry journey", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each(["basic", "growth", "pro", "custom"] as const)("preselects %s from the plan parameter", (plan) => {
    renderEnabled(plan)
    expect(screen.getByRole("radio", { name: new RegExp(plan, "i") })).toBeChecked()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "2")
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1")
  })

  it("asks for Guard locations only after interest, and keeps the count when editing the service", () => {
    renderEnabled("pro")
    expect(screen.queryByRole("spinbutton", { name: /How many locations need Guard protection/ })).not.toBeInTheDocument()
    expect(screen.getByText(/£120 per month and includes 500 minutes\/month/)).toBeInTheDocument()
    expect(screen.getByText(/not a final approved offer/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ }))
    const locations = screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ })
    fireEvent.change(locations, { target: { value: "3" } })
    expect(screen.getByText(/Indicative monthly total: £149\.97/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.click(screen.getByRole("button", { name: /Edit Your service/ }))
    expect(screen.getByRole("radio", { name: /Pro/ })).toBeChecked()
    expect(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ })).toHaveValue(3)
  })

  it("requires the minimum Custom quotation fields and leaves calls optional", () => {
    renderEnabled("custom")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    const summary = screen.getByRole("alert")
    expect(summary).toHaveTextContent("Please enter monthly minutes required.")
    expect(summary).toHaveTextContent("Please enter the number of phone numbers.")
    expect(summary).toHaveTextContent("Please enter the number of locations.")
    expect(summary).not.toHaveTextContent("calls")
    fireEvent.change(screen.getByRole("spinbutton", { name: /Monthly minutes needed/ }), { target: { value: "1000" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: /Phone numbers needed/ }), { target: { value: "2" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: /Number of locations/ }), { target: { value: "4" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ }), { target: { value: "2" } })
    expect(screen.getByText(/Indicative Guard amount: £19\.98/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByRole("heading", { name: /Your business and contact details/ })).toBeInTheDocument()
  })

  it("requires business, contact and privacy details, and keeps optional details collapsed", () => {
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.queryByRole("textbox", { name: /missed-call challenge/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: /current phone setup/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    const summary = screen.getByRole("alert")
    expect(summary).toHaveTextContent("Please enter your business name.")
    expect(summary).toHaveTextContent("Please enter your country.")
    expect(summary).toHaveTextContent("Please describe your trade or service.")
    expect(summary).toHaveTextContent("Please enter your name.")
    expect(summary).toHaveTextContent("Please enter a valid email address.")
    expect(summary).toHaveTextContent("Please enter a valid phone number.")
    expect(summary).toHaveTextContent("Please confirm you have read the privacy notice.")
    expect(summary).not.toHaveTextContent("phone setup")
    expect(screen.getAllByText(/does not take payment, activate the service, or authorise a recurring charge/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "Please enter your business name." }))
    expect(document.activeElement).toHaveAttribute("name", "businessName")
  })

  it("keeps entered details when moving back and forward", () => {
    renderEnabled("growth")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.change(screen.getByRole("textbox", { name: /Business name/ }), { target: { value: "Harbour Plumbing" } })
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    fireEvent.change(screen.getByRole("textbox", { name: /current phone setup/ }), { target: { value: "Mobile" } })
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    expect(screen.getByRole("radio", { name: /Growth/ })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByRole("textbox", { name: /Business name/ })).toHaveValue("Harbour Plumbing")
    expect(screen.getByRole("textbox", { name: /current phone setup/ })).toHaveValue("Mobile")
  })

  it("shows a persisted TY reference and the acknowledgement email status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        enquiryRef: reference,
        leadConversion: false,
        receiptEmailStatus: "sent",
        message: "Your enquiry has been received.",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    renderEnabled("growth")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    expect(await screen.findByRole("heading", { name: /we have received your enquiry/i })).toBeInTheDocument()
    expect(screen.getByText(reference)).toBeInTheDocument()
    expect(screen.getByText(/Admin will review it and contact you/)).toBeInTheDocument()
    expect(screen.getByText(/confirmation email has been accepted/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Copy reference" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(reference))
  })

  it.each([
    ["suppressed", /No confirmation email was requested/],
    ["unavailable", /could not send a confirmation email/],
  ] as const)("presents a %s acknowledgement email accurately", async (receiptEmailStatus, copy) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        enquiryRef: reference,
        leadConversion: false,
        receiptEmailStatus,
        message: "Your enquiry has been received.",
      }),
    }))
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    expect(await screen.findByText(copy)).toBeInTheDocument()
    expect(screen.getByText(reference)).toBeInTheDocument()
  })

  it("does not show success for HTTP 200 without a persisted TY reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, message: "Your enquiry has been received.", leadConversion: true }),
    }))
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete this enquiry right now.")
    expect(screen.queryByRole("heading", { name: /we have received your enquiry/i })).not.toBeInTheDocument()
  })

  it("ignores a second submit while the first request is in flight", async () => {
    let release: (value: unknown) => void = () => {}
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      release = resolve
    }))
    vi.stubGlobal("fetch", fetchMock)
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    const submit = screen.getByRole("button", { name: "Submit enquiry" })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()
    release({
      json: async () => ({
        ok: true,
        enquiryRef: reference,
        leadConversion: false,
        receiptEmailStatus: "sent",
      }),
    })
    expect(await screen.findByText(reference)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps online submission closed and explains that no payment is taken", () => {
    render(<TelloyaEnquiryForm />)
    expect(screen.getByRole("status")).toHaveTextContent(/enquiry system before public launch/i)
    expect(screen.queryByRole("button", { name: /Submit enquiry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: /Growth/ })).not.toBeInTheDocument()
  })

  it("uses a mobile-first layout and accessible progress", () => {
    const css = readFileSync(resolve(process.cwd(), "components/telloya-enquiry-form.module.css"), "utf8")
    expect(css).toMatch(/@media \(max-width: 480px\)/)
    expect(css).toMatch(/flex-direction:\s*column-reverse/)
    renderEnabled("")
    const progress = screen.getByRole("progressbar")
    expect(progress).toHaveAttribute("aria-valuemin", "1")
    expect(progress).toHaveAttribute("aria-valuemax", "2")
    expect(screen.getByRole("group", { name: /Choose your Telloya plan/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    const summary = screen.getByRole("alert")
    expect(summary).toHaveTextContent("Please select a plan.")
    fireEvent.click(screen.getByRole("button", { name: "Please select a plan." }))
    expect(document.activeElement?.id).toMatch(/planTier$/)
  })

  it("preserves a legacy complete-link Guard preference until a plan is chosen", () => {
    renderEnabled("", true)
    fireEvent.click(screen.getByRole("radio", { name: /Basic/ }))
    expect(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ })).toBeChecked()
    expect(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ })).toBeInTheDocument()
  })
})
