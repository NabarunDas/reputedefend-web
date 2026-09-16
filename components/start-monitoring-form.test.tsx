/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import {
  CORRECT_DETAILS_LABEL,
  KEY_ERROR,
  RATE_LIMIT_COPY,
  RETRY_COPY,
  StartMonitoringForm,
  SUCCESS_COPY,
} from "./start-monitoring-form"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

const SUBMISSION_KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const SECOND_KEY = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"

function stubSubmissionKey(keys: string[] = [SUBMISSION_KEY]) {
  const spy = vi.spyOn(window.crypto, "randomUUID")
  keys.forEach((key) => {
    spy.mockReturnValueOnce(key as ReturnType<Crypto["randomUUID"]>)
  })
  spy.mockReturnValue((keys[keys.length - 1] ?? SUBMISSION_KEY) as ReturnType<Crypto["randomUUID"]>)
  return spy
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
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

function submittedBody(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  return JSON.parse(fetchMock.mock.calls[index]?.[1]?.body as string) as Record<string, unknown>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
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

  it("does not dispatch when local validation fails", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<StartMonitoringForm />)
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(/please enter your name/i)
    expect(document.activeElement).toBe(screen.getByRole("alert"))
  })

  it("sends only one in-flight request for rapid duplicate submits", async () => {
    stubSubmissionKey()
    let resolveFetch: ((value: unknown) => void) | undefined
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))
    vi.stubGlobal("fetch", fetchMock)
    render(<StartMonitoringForm />)
    fillValidForm()
    const button = screen.getByRole("button", { name: "Submit setup request" })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.submit(button.closest("form") as HTMLFormElement)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText("Full name")).toHaveAttribute("readonly")
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Changed Ltd" } })
    expect(screen.getByLabelText("Business name")).toHaveValue("Harbour Bakery")
    resolveFetch?.(jsonResponse({ ok: true, persisted: true, receiptEmailSent: true }))
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
  })

  it("retries a network failure with the identical payload and submission key", async () => {
    stubSubmissionKey()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, persisted: true, status: "REQUESTED", receiptEmailSent: true }))
    vi.stubGlobal("fetch", fetchMock)

    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(RETRY_COPY))
    expect(screen.getByRole("link", { name: CORRECT_DETAILS_LABEL })).toHaveAttribute("href", "/contact")
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: SUCCESS_COPY.title })).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(submittedBody(fetchMock, 0)).toMatchObject({
      businessName: "Harbour Bakery",
      source: "start-monitoring",
      submissionKey: SUBMISSION_KEY,
      companyFax: "",
    })
    expect(submittedBody(fetchMock, 1)).toEqual(submittedBody(fetchMock, 0))
    expect(screen.getByText(SUCCESS_COPY.recorded("Harbour Bakery"))).toBeInTheDocument()
    expect(screen.getByText(SUCCESS_COPY.notActive)).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: SUCCESS_COPY.title }))
    expect(screen.queryByText(/PR-|RV-|GR-/)).not.toBeInTheDocument()
  })

  it("ignores edits after an uncertain failure so retry and success stay on the captured details", async () => {
    stubSubmissionKey()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, persisted: true, receiptEmailSent: true }))
    vi.stubGlobal("fetch", fetchMock)

    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await screen.findByRole("button", { name: "Try again" })
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Beta Ltd" } })
    expect(screen.getByLabelText("Business name")).toHaveValue("Harbour Bakery")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
    expect(submittedBody(fetchMock, 1).businessName).toBe("Harbour Bakery")
    expect(screen.getByText(SUCCESS_COPY.recorded("Harbour Bakery"))).toBeInTheDocument()
    expect(screen.queryByText(/Beta Ltd/)).not.toBeInTheDocument()
  })

  it("allows a new attempt after a first-attempt structured 400 validation error", async () => {
    const keySpy = stubSubmissionKey([SUBMISSION_KEY, SECOND_KEY])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        errors: {
          fullName: "Please keep your name within 100 characters.",
          ignored: { nested: true },
        },
      }, 400))
      .mockResolvedValueOnce(jsonResponse({ ok: true, persisted: true, receiptEmailSent: true }))
    vi.stubGlobal("fetch", fetchMock)

    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Please keep your name within 100 characters.")
    })
    expect(screen.queryByText(RETRY_COPY)).not.toBeInTheDocument()
    expect(screen.getByLabelText("Full name")).not.toHaveAttribute("readonly")
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alexandra Morgan" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
    expect(keySpy).toHaveBeenCalledTimes(2)
    expect(submittedBody(fetchMock, 1).submissionKey).toBe(SECOND_KEY)
    expect(submittedBody(fetchMock, 1).fullName).toBe("Alexandra Morgan")
  })

  it("does not unlock editing when an uncertain attempt is later followed by a 400", async () => {
    stubSubmissionKey()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        errors: { fullName: "Please enter your name." },
      }, 400))
    vi.stubGlobal("fetch", fetchMock)

    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await screen.findByRole("button", { name: "Try again" })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("alert")).toHaveTextContent(RETRY_COPY)
    expect(screen.queryByText("Please enter your name.")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Full name")).toHaveAttribute("readonly")
    expect(submittedBody(fetchMock, 1).submissionKey).toBe(SUBMISSION_KEY)
  })

  it("preserves the original payload after a 429 and allows a later retry", async () => {
    stubSubmissionKey()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, message: "unavailable" }, 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true, persisted: true, receiptEmailSent: true }))
    vi.stubGlobal("fetch", fetchMock)

    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(RATE_LIMIT_COPY))
    expect(screen.getByRole("alert")).toHaveTextContent(RETRY_COPY)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
    expect(submittedBody(fetchMock, 0).submissionKey).toBe(SUBMISSION_KEY)
    expect(submittedBody(fetchMock, 1).submissionKey).toBe(SUBMISSION_KEY)
  })

  it("treats a non-JSON response as a recoverable retry", async () => {
    stubSubmissionKey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("Unexpected token < in JSON")
      },
    }))
    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await screen.findByRole("button", { name: "Try again" })
    expect(screen.getByRole("alert")).toHaveTextContent(RETRY_COPY)
    expect(document.activeElement).toBe(screen.getByRole("alert"))
  })

  it("treats a malformed success-looking JSON shape as a retry", async () => {
    stubSubmissionKey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true, message: "maybe" })))
    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await screen.findByRole("button", { name: "Try again" })
    expect(screen.queryByRole("heading", { name: SUCCESS_COPY.title })).not.toBeInTheDocument()
  })

  it("does not accept a non-2xx response with a success-looking body", async () => {
    stubSubmissionKey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      persisted: true,
      receiptEmailSent: true,
    }, 500)))
    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await screen.findByRole("button", { name: "Try again" })
    expect(screen.queryByRole("heading", { name: SUCCESS_COPY.title })).not.toBeInTheDocument()
  })

  it("shows a saved-request confirmation when receiptEmailSent is false", async () => {
    stubSubmissionKey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      persisted: true,
      status: "REQUESTED",
      receiptEmailSent: false,
    })))
    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
    expect(screen.getByText(SUCCESS_COPY.emailFailed)).toBeInTheDocument()
    expect(screen.getByText(SUCCESS_COPY.notActive)).toBeInTheDocument()
    expect(screen.queryByText(/inbox|delivered/i)).not.toBeInTheDocument()
    expect(screen.queryByText(SUBMISSION_KEY)).not.toBeInTheDocument()
  })

  it("keeps the form editable and does not dispatch when key generation fails", async () => {
    vi.spyOn(window.crypto, "randomUUID").mockImplementation(() => {
      throw new Error("crypto unavailable")
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<StartMonitoringForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole("button", { name: "Submit setup request" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(KEY_ERROR))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Full name")).not.toHaveAttribute("readonly")
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan")
    expect(screen.getByRole("button", { name: "Submit setup request" })).not.toBeDisabled()
  })
})
