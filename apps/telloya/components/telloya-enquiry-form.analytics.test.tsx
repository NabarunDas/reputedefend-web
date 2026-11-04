/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { TelloyaEnquiryForm } from "./telloya-enquiry-form"

const sendTelloyaLeadConversion = vi.hoisted(() => vi.fn())

vi.mock("@/lib/analytics", () => ({
  sendTelloyaLeadConversion: (...args: unknown[]) => sendTelloyaLeadConversion(...args),
}))

const email = "ada@example.com"
const phone = "+447700900123"
const business = "Harbour Plumbing"
const reference = "TY-26-ABCDEF"

function fillAndSubmit(guard = false) {
  render(
    <TelloyaEnquiryForm
      capabilities={{ submissionEnabled: true }}
      initialPlanTier="growth"
      initialGuardInterested={guard}
    />,
  )
  if (guard) {
    fireEvent.change(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ }), {
      target: { value: "2" },
    })
  }
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
  fireEvent.change(screen.getByRole("textbox", { name: /Business name/ }), { target: { value: business } })
  fireEvent.change(screen.getByRole("textbox", { name: /^Country/ }), { target: { value: "United Kingdom" } })
  fireEvent.change(screen.getByRole("textbox", { name: /Trade or service/ }), { target: { value: "Plumbing" } })
  fireEvent.change(screen.getByRole("textbox", { name: /Business website URL/ }), { target: { value: "https://harbour.example" } })
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
  fireEvent.change(screen.getByRole("textbox", { name: /Your name/ }), { target: { value: "Ada Lovelace" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: email } })
  fireEvent.change(screen.getByRole("textbox", { name: /Phone number/ }), { target: { value: phone } })
  fireEvent.change(screen.getByRole("textbox", { name: /missed-call challenge/ }), { target: { value: "Calls while on site" } })
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
  fireEvent.click(screen.getByRole("checkbox", { name: /privacy notice/ }))
  fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
}

afterEach(() => {
  cleanup()
  sendTelloyaLeadConversion.mockReset()
  vi.unstubAllGlobals()
})

describe("Telloya enquiry analytics", () => {
  it("sends one generate_lead after a genuine success and omits personal fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        message: "Your enquiry has been received.",
        enquiryRef: reference,
        leadConversion: true,
        receiptEmailStatus: "sent",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    fillAndSubmit(true)
    await screen.findByRole("heading", { name: /we have received your enquiry/i })
    expect(sendTelloyaLeadConversion).toHaveBeenCalledTimes(1)
    expect(sendTelloyaLeadConversion).toHaveBeenCalledWith({
      planTier: "growth",
      guardInterested: true,
    })
    const recorded = JSON.stringify(sendTelloyaLeadConversion.mock.calls)
    for (const secret of [reference, email, phone, business, "harbour.example", "submissionKey", "Calls while on site"]) {
      expect(recorded).not.toContain(secret)
    }
    expect(screen.getByText(reference)).toBeInTheDocument()
  })

  it("does not send a conversion for a duplicate, failed or simulated response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          enquiryRef: reference,
          leadConversion: false,
          message: "Your enquiry has been received.",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ ok: false, message: "Unable to process this enquiry right now." }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: false,
          simulated: true,
          enquiryRef: reference,
          leadConversion: true,
          message: "Unable to process this enquiry right now.",
        }),
      })
    vi.stubGlobal("fetch", fetchMock)

    fillAndSubmit(false)
    await screen.findByRole("heading", { name: /we have received your enquiry/i })
    expect(sendTelloyaLeadConversion).not.toHaveBeenCalled()

    cleanup()
    fillAndSubmit(false)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to process this enquiry right now."))
    expect(screen.queryByRole("heading", { name: /we have received your enquiry/i })).not.toBeInTheDocument()
    expect(sendTelloyaLeadConversion).not.toHaveBeenCalled()

    cleanup()
    fillAndSubmit(false)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to process this enquiry right now."))
    expect(screen.queryByRole("heading", { name: /we have received your enquiry/i })).not.toBeInTheDocument()
    expect(sendTelloyaLeadConversion).not.toHaveBeenCalled()
  })
})
