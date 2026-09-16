/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { StartMonitoringForm, SUCCESS_COPY } from "./start-monitoring-form"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

const SUBMISSION_KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

function stubSubmissionKey(key = SUBMISSION_KEY) {
  vi.spyOn(window.crypto, "randomUUID").mockReturnValue(key as ReturnType<Crypto["randomUUID"]>)
  return key
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Morgan" } })
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } })
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Harbour Bakery" } })
  fireEvent.change(screen.getByLabelText("Country"), { target: { value: "United Kingdom" } })
  fireEvent.change(screen.getByLabelText("Google Business Profile URL"), {
    target: { value: "https://maps.google.com/?cid=123" },
  })
  fireEvent.click(screen.getByRole("checkbox", { name: /authorised/i }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("StartMonitoringForm", () => {
  it("shows a short onboarding form without incident or credential fields", () => {
    render(<StartMonitoringForm />)
    expect(screen.getByLabelText("Full name")).toBeInTheDocument()
    expect(screen.getByLabelText("Google Business Profile URL")).toBeInTheDocument()
    expect(screen.getByLabelText("Number of locations to monitor")).toHaveAttribute("type", "number")
    expect(screen.queryByLabelText(/what happened/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/review url/i)).not.toBeInTheDocument()
    expect(document.querySelector("input[type='password']")).toBeNull()
    expect(document.querySelector("input[type='file']")).toBeNull()
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
  })

  it("keeps values and the same submission key after a failed request", async () => {
    stubSubmissionKey()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        json: async () => ({ ok: true, persisted: true, status: "REQUESTED", receiptEmailSent: true }),
      })
    vi.stubGlobal("fetch", fetchMock)

    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument()
    })
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan")
    expect(screen.getByLabelText("Business name")).toHaveValue("Harbour Bakery")

    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: SUCCESS_COPY.title })).toBeInTheDocument()
    })
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).submissionKey).toBe(SUBMISSION_KEY)
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).submissionKey).toBe(SUBMISSION_KEY)
    expect(screen.getByText(SUCCESS_COPY.notActive)).toBeInTheDocument()
    expect(screen.queryByText(/PR-|RV-|GR-/)).not.toBeInTheDocument()
  })
})
