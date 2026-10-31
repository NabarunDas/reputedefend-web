// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { GuidedHandoverForm, type GuidedHandoverState } from "./handover-form"

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

const reference = "PR-26-ABCDEF"
const openState: GuidedHandoverState = {
  submitted: false,
  correctionRequested: false,
  outcomeReported: false,
  outcomeReviewed: false,
  evidenceOptions: [],
}

function renderForm(state: Partial<GuidedHandoverState> = {}) {
  return render(<GuidedHandoverForm reference={reference} {...openState} {...state} />)
}

function labelled(name: string) {
  const label = [...document.querySelectorAll("label")].find(item => item.textContent?.includes(name))
  const control = label?.querySelector("input, textarea, select")
  if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement) && !(control instanceof HTMLSelectElement)) {
    throw new Error(`missing field ${name}`)
  }
  return control
}

function toggleNamed(name: string) {
  const toggle = screen.getAllByRole("button", { name }).find(button => button.getAttribute("type") === "button")
  if (!toggle) throw new Error(`missing toggle for ${name}`)
  return toggle
}

function panel(name: string) {
  const region = document.getElementById(toggleNamed(name).getAttribute("aria-controls") ?? "")
  if (!region) throw new Error(`missing panel for ${name}`)
  return region
}

describe("guided handover actions", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    refresh.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("crypto", { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("starts with both actions collapsed", () => {
    renderForm()
    expect(screen.getByRole("heading", { name: "What would you like to do next?" })).toBeTruthy()
    const correction = screen.getByRole("button", { name: "Request a correction" })
    const submission = screen.getByRole("button", { name: "I've submitted my pack to Google" })
    expect(correction).toHaveAttribute("aria-expanded", "false")
    expect(submission).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("Ask us to change something before you submit your pack.")).toBeTruthy()
    expect(screen.getByText("Let us know when you've submitted it yourself.")).toBeTruthy()
    expect(labelled("What should we change?")).not.toBeVisible()
    expect(labelled("Date you submitted it")).not.toBeVisible()
    expect(screen.queryByRole("button", { name: "Update Google's decision" })).toBeNull()
  })

  it("opens one action at a time and keeps typed text when switching", () => {
    renderForm()
    const correction = screen.getByRole("button", { name: "Request a correction" })
    const submission = screen.getByRole("button", { name: "I've submitted my pack to Google" })
    fireEvent.click(correction)
    expect(correction).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("status")).toHaveTextContent("Request a correction opened.")
    const note = screen.getByLabelText("What should we change?")
    fireEvent.change(note, { target: { value: "Please correct the trading name on the pack." } })
    fireEvent.click(correction)
    expect(correction).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("status")).toHaveTextContent("Request a correction closed.")
    expect(labelled("What should we change?")).toHaveValue("Please correct the trading name on the pack.")

    fireEvent.click(submission)
    expect(submission).toHaveAttribute("aria-expanded", "true")
    expect(correction).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText(/ProfileRelaunch does not submit Guided packs to Google\./)).toBeVisible()
    fireEvent.change(screen.getByLabelText("Date you submitted it"), { target: { value: "2026-10-20" } })
    fireEvent.change(screen.getByLabelText("Google reference, if Google gave you one"), { target: { value: "GBP-440" } })
    fireEvent.change(screen.getByLabelText("What did you submit?"), { target: { value: "I sent the completed pack from my own Google account." } })
    fireEvent.click(correction)
    expect(submission).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByLabelText("What should we change?")).toHaveValue("Please correct the trading name on the pack.")
    expect(labelled("Date you submitted it")).toHaveValue("2026-10-20")
    expect(labelled("Google reference, if Google gave you one")).toHaveValue("GBP-440")
    expect(labelled("What did you submit?")).toHaveValue("I sent the completed pack from my own Google account.")
  })

  it("uses keyboard-focusable buttons with expanded state and a visible focus style", () => {
    renderForm()
    const correction = screen.getByRole("button", { name: "Request a correction" })
    const submission = screen.getByRole("button", { name: "I've submitted my pack to Google" })
    expect(correction.tagName).toBe("BUTTON")
    expect(submission.tagName).toBe("BUTTON")
    expect(correction).toHaveAttribute("type", "button")
    expect(submission).toHaveAttribute("type", "button")
    expect(correction).toHaveAttribute("aria-controls", "guided-correction-panel")
    expect(document.getElementById("guided-correction-panel")).toHaveAttribute("aria-labelledby", correction.id)
    correction.focus()
    expect(correction).toHaveFocus()
    fireEvent.keyDown(correction, { key: "Enter" })
    fireEvent.click(correction)
    expect(correction).toHaveAttribute("aria-expanded", "true")
    submission.focus()
    expect(submission).toHaveFocus()
    fireEvent.keyDown(submission, { key: " " })
    fireEvent.click(submission)
    expect(submission).toHaveAttribute("aria-expanded", "true")
    expect(correction).toHaveAttribute("aria-expanded", "false")
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    expect(css).toContain(".guided-next button:focus-visible")
    const mobile = css.slice(css.indexOf("@media (max-width: 640px)"))
    expect(mobile).toContain(".guided-action-toggle,")
    expect(mobile).toContain(".guided-next button.guided-submit { width: 100%; }")
  })

  it("checks the submission before calling the server", () => {
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: "I've submitted my pack to Google" }))
    const form = screen.getByLabelText("What did you submit?").closest("form")
    if (!form) throw new Error("missing submission form")
    fireEvent.change(screen.getByLabelText("What did you submit?"), { target: { value: "Too short" } })
    fireEvent.change(screen.getByLabelText("Date you submitted it"), { target: { value: "2026-10-20" } })
    fireEvent.submit(form)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Check the details and try again.")
    expect(screen.getByLabelText("What did you submit?")).toHaveValue("Too short")
  })

  it("records a Google submission once and replaces the form with a confirmation", async () => {
    let release: (value: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { release = resolve }))
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: "I've submitted my pack to Google" }))
    fireEvent.change(screen.getByLabelText("Date you submitted it"), { target: { value: "2026-10-20" } })
    fireEvent.change(screen.getByLabelText("Google reference, if Google gave you one"), { target: { value: "GBP-440" } })
    fireEvent.change(screen.getByLabelText("What did you submit?"), { target: { value: "I sent the completed pack from my own Google account." } })
    const form = screen.getByLabelText("What did you submit?").closest("form")
    if (!form) throw new Error("missing submission form")
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "I submitted this to Google" })).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent("Saving your update.")
    release(new Response(JSON.stringify({ message: "We've recorded that you submitted this pack to Google. This is your report. It is not a decision from Google." }), { status: 200 }))
    expect(await screen.findByRole("heading", { name: "Your Google submission is recorded" })).toBeTruthy()
    expect(screen.getByText("20 October 2026")).toBeTruthy()
    expect(screen.getByText("GBP-440")).toBeTruthy()
    expect(screen.getByText("I sent the completed pack from my own Google account.")).toBeTruthy()
    expect(screen.getAllByText("ProfileRelaunch does not submit Guided packs to Google.").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "I've submitted my pack to Google" })).toBeNull()
    expect(screen.queryByLabelText("Date you submitted it")).toBeNull()
    expect(screen.getByRole("button", { name: "Update Google's decision" })).toHaveAttribute("aria-expanded", "false")
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/portal/documents/handover")
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("idempotency-key")).toBe("550e8400-e29b-41d4-a716-446655440000")
    expect(JSON.parse(String(init.body))).toEqual({
      reference,
      operation: "report_submission",
      note: "I sent the completed pack from my own Google account.",
      submittedOn: "2026-10-20",
      googleReference: "GBP-440",
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("shows a recorded correction without another request form", () => {
    renderForm({ correctionRequested: true })
    expect(screen.getByRole("heading", { name: "Request a correction" })).toBeTruthy()
    expect(screen.getByText("A correction request is already with ProfileRelaunch.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Request a correction" })).toBeNull()
    expect(screen.queryByLabelText("What should we change?")).toBeNull()
    expect(screen.getByRole("button", { name: "I've submitted my pack to Google" })).toHaveAttribute("aria-expanded", "false")
  })

  it("keeps a recorded Google outcome behind one expandable update", () => {
    renderForm({
      submitted: true,
      outcomeReported: true,
      evidenceOptions: [{ selector: "er-2", label: "control.pdf" }],
    })
    expect(screen.getByRole("heading", { name: "Your Google submission is recorded" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "I've submitted my pack to Google" })).toBeNull()
    expect(screen.queryByLabelText("Date you submitted it")).toBeNull()
    const outcome = toggleNamed("Update Google's decision")
    expect(outcome).toHaveAttribute("aria-expanded", "false")
    const updates = screen.getAllByText("You can update this report. ProfileRelaunch has not verified it with Google.")
    expect(updates[0]).toBeVisible()
    expect(updates[1]).not.toBeVisible()
    expect(screen.getByText("This is your report. It is not an independently verified Google decision, and it does not change your completed ProfileRelaunch service or its payment.")).not.toBeVisible()
    fireEvent.click(outcome)
    const region = within(panel("Update Google's decision"))
    expect(region.getByLabelText("Google's decision")).toBeVisible()
    expect(region.getByRole("option", { name: "Still waiting for Google" })).toBeTruthy()
    expect(region.getByRole("option", { name: "Profile reinstated" })).toBeTruthy()
    expect(region.getByRole("option", { name: "Profile not reinstated" })).toBeTruthy()
    expect(region.getByRole("option", { name: "Google requested more information" })).toBeTruthy()
    expect(region.getByRole("option", { name: "Other outcome" })).toBeTruthy()
    expect(region.getByLabelText("Supporting evidence you already uploaded")).toBeVisible()
    expect(region.getByRole("option", { name: "control.pdf" })).toBeTruthy()
    expect(region.getByRole("option", { name: "No file" })).toBeTruthy()
  })

  it("shows a validation error from the server without losing the form", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Check the details and try again." }), { status: 400 }))
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: "Request a correction" }))
    fireEvent.change(screen.getByLabelText("What should we change?"), { target: { value: "Please correct the trading name on the pack." } })
    const form = screen.getByLabelText("What should we change?").closest("form")
    if (!form) throw new Error("missing correction form")
    fireEvent.submit(form)
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the details and try again.")
    expect(screen.getByLabelText("What should we change?")).toHaveValue("Please correct the trading name on the pack.")
    expect(toggleNamed("Request a correction")).toHaveAttribute("aria-expanded", "true")
  })

  it("keeps an in-flight correction from being sent twice", async () => {
    let release: (value: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { release = resolve }))
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: "Request a correction" }))
    fireEvent.change(screen.getByLabelText("What should we change?"), { target: { value: "Please correct the trading name on the pack." } })
    const submit = screen.getAllByRole("button", { name: "Request a correction" }).find(button => button.getAttribute("type") === "submit")
    if (!submit) throw new Error("missing submit")
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    release(new Response(JSON.stringify({ message: "We've received your correction request. ProfileRelaunch will review the pack. This does not submit anything to Google." }), { status: 200 }))
    expect(await screen.findByText("A correction request is already with ProfileRelaunch.")).toBeVisible()
    expect(screen.queryByLabelText("What should we change?")).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
