// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
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
    fireEvent.change(screen.getByRole("textbox", { name: /Business name/ }), { target: { value: "Harbour Plumbing" } })
    fireEvent.change(screen.getByRole("textbox", { name: /^Country/ }), { target: { value: "United Kingdom" } })
    fireEvent.change(screen.getByRole("textbox", { name: /Trade or service/ }), { target: { value: "Plumbing" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.queryByRole("spinbutton", { name: /Proposed monthly cap/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Interested in additional minutes/ }))
    const cap = screen.getByRole("spinbutton", { name: /Proposed monthly cap/ }) as HTMLInputElement
    expect(cap).toBeRequired()
    expect(cap.labels?.[0]?.textContent ?? "").not.toMatch(/Optional/)
  })
})
