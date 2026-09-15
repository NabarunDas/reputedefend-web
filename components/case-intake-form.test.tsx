/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { CaseIntakeForm, EVIDENCE_NOTE, PERSISTED_SUCCESS_COPY, STEP_TITLES, SUBMIT_NOTE, SUCCESS_COPY, SIMULATED_COPY } from "./case-intake-form"
import { CASE_SERVICES, FORMAL_CASE_SERVICES, parseServiceParam } from "@/lib/enquiry"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

const validDetails = "The profile was suspended on Monday after a verification prompt. We have the original notice and have not tried another appeal yet."

function continueStep() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }))
}

function fillAboutYou() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Morgan" } })
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } })
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Harbour Bakery" } })
  fireEvent.change(screen.getByLabelText("Country"), { target: { value: "Ireland" } })
}

async function submitValidAssessment(initialService: "profile-recovery" | "review-protection" | "profile-access" = "profile-recovery") {
  render(<CaseIntakeForm initialService={initialService} />)
  continueStep()
  fillAboutYou()
  continueStep()
  fireEvent.change(screen.getByLabelText("Tell us what happened"), { target: { value: validDetails } })
  continueStep()
  fireEvent.click(screen.getByRole("checkbox", { name: /accurate/i }))
  fireEvent.click(screen.getByRole("checkbox", { name: /privacy/i }))
  fireEvent.click(screen.getByRole("button", { name: "Submit assessment" }))
}

const SUBMISSION_KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

function stubSubmissionKey(key = SUBMISSION_KEY) {
  vi.spyOn(window.crypto, "randomUUID").mockReturnValue(key as ReturnType<Crypto["randomUUID"]>)
  return key
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("CaseIntakeForm", () => {
  it("keeps four named steps and does not ask for Guided or Managed during intake", () => {
    render(<CaseIntakeForm />)
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: STEP_TITLES[1] })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("type", "button")
    expect(screen.queryByRole("radio", { name: /managed/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: /guided/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/budget/i)).not.toBeInTheDocument()
    expect(document.querySelector("input[type='file']")).toBeNull()
    expect(document.querySelector("input[type='password']")).toBeNull()
    expect(CASE_SERVICES.map((item) => item.value)).toEqual([
      "profile-recovery",
      "profile-access",
      "review-protection",
      "general",
    ])
    expect(FORMAL_CASE_SERVICES.map((item) => item.value)).toEqual([
      "profile-recovery",
      "profile-access",
      "review-protection",
    ])
  })

  it("does not offer General / not sure as a formal assessment option", () => {
    render(<CaseIntakeForm />)
    expect(screen.queryByRole("radio", { name: /General \/ not sure/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByRole("radio", { name: /Business Profile Recovery/ })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Verification \/ Access/ })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Review Protection/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact")
  })

  it("preselects Profile Recovery from the query alias and keeps it editable", () => {
    expect(parseServiceParam("profile-recovery")).toBe("profile-recovery")
    render(<CaseIntakeForm initialService={parseServiceParam("profile-recovery")} />)
    const recovery = screen.getByRole("radio", { name: /Business Profile Recovery/ })
    expect(recovery).toBeChecked()
    fireEvent.click(screen.getByRole("radio", { name: /Review Protection/i }))
    expect(recovery).not.toBeChecked()
    fireEvent.click(recovery)
    expect(recovery).toBeChecked()
  })

  it("preselects Review Protection from ?service=review", () => {
    render(<CaseIntakeForm initialService={parseServiceParam("review")} />)
    expect(screen.getByRole("radio", { name: /Review Protection/i })).toBeChecked()
  })

  it("preselects the access/verification option from ?service=access", () => {
    render(<CaseIntakeForm initialService={parseServiceParam("access")} />)
    expect(screen.getByRole("radio", { name: /Verification \/ Access/ })).toBeChecked()
  })

  it("falls back to an unselected Step 1 for an invalid query", () => {
    render(<CaseIntakeForm initialService={parseServiceParam("unknown")} />)
    expect(screen.getByRole("heading", { name: STEP_TITLES[1] })).toBeInTheDocument()
    for (const option of screen.getAllByRole("radio")) {
      expect(option).not.toBeChecked()
    }
  })

  it("blocks Step 1 without a service and then retains values through Back/Continue", async () => {
    render(<CaseIntakeForm />)
    continueStep()
    expect(screen.getByRole("alert")).toHaveTextContent(/help with/i)

    fireEvent.click(screen.getByRole("radio", { name: /Business Profile Recovery/i }))
    continueStep()
    expect(screen.getByRole("heading", { name: STEP_TITLES[2] })).toBeInTheDocument()
    expect(screen.getByLabelText(/Phone number/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Business website URL/)).toBeInTheDocument()
    fillAboutYou()
    continueStep()

    expect(screen.getByRole("heading", { name: STEP_TITLES[3] })).toBeInTheDocument()
    expect(screen.getByLabelText(/Google Business Profile URL/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Relevant review URL/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Tell us what happened"), { target: { value: validDetails } })
    expect(screen.getByText(EVIDENCE_NOTE)).toBeInTheDocument()
    continueStep()

    expect(screen.getByRole("heading", { name: STEP_TITLES[4] })).toBeInTheDocument()
    expect(screen.getByText("Harbour Bakery")).toBeInTheDocument()
    expect(screen.getByText("Ireland")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /accurate/i })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /privacy/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit assessment" })).toBeInTheDocument()
    expect(screen.getByText(SUBMIT_NOTE)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByLabelText("Tell us what happened")).toHaveValue(validDetails)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan")
    expect(screen.getByLabelText("Country")).toHaveValue("Ireland")
  })

  it("shows a review URL for Review Protection and submits source get-help", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<CaseIntakeForm initialService="review-protection" />)
    continueStep()
    fillAboutYou()
    continueStep()
    expect(screen.getByLabelText(/Relevant review URL/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Google Business Profile URL/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Tell us what happened"), { target: { value: validDetails } })
    continueStep()
    fireEvent.click(screen.getByRole("checkbox", { name: /accurate/i }))
    fireEvent.click(screen.getByRole("checkbox", { name: /privacy/i }))
    fireEvent.click(screen.getByRole("button", { name: "Submit assessment" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.source).toBe("get-help")
    expect(body.service).toBe("review-protection")
    expect(body.companyFax).toBe("")
    expect(body.fullName).toBe("Alex Morgan")
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
    expect(screen.getByText(SUCCESS_COPY.body)).toBeInTheDocument()
    expect(screen.queryByText(SIMULATED_COPY.kicker)).not.toBeInTheDocument()
  })

  it("keeps development simulation visually distinct from a live acknowledgement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, simulated: true }),
    }))
    render(<CaseIntakeForm initialService="profile-recovery" />)
    continueStep()
    fillAboutYou()
    continueStep()
    fireEvent.change(screen.getByLabelText("Tell us what happened"), { target: { value: validDetails } })
    continueStep()
    fireEvent.click(screen.getByRole("checkbox", { name: /accurate/i }))
    fireEvent.click(screen.getByRole("checkbox", { name: /privacy/i }))
    fireEvent.click(screen.getByRole("button", { name: "Submit assessment" }))
    await screen.findByText(SIMULATED_COPY.kicker)
    expect(screen.getByRole("heading", { name: SIMULATED_COPY.title })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: SUCCESS_COPY.title })).not.toBeInTheDocument()
  })

  it("preserves values when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false }),
    }))
    render(<CaseIntakeForm initialService="profile-recovery" />)
    continueStep()
    fillAboutYou()
    continueStep()
    fireEvent.change(screen.getByLabelText("Tell us what happened"), { target: { value: validDetails } })
    continueStep()
    fireEvent.click(screen.getByRole("checkbox", { name: /accurate/i }))
    fireEvent.click(screen.getByRole("checkbox", { name: /privacy/i }))
    fireEvent.click(screen.getByRole("button", { name: "Submit assessment" }))
    await screen.findByRole("alert")
    expect(screen.getByRole("alert")).toHaveTextContent(/still on this page/i)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByLabelText("Tell us what happened")).toHaveValue(validDetails)
  })

  it("sends one submission UUID and reuses it when retrying", async () => {
    stubSubmissionKey()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetchMock)

    render(<CaseIntakeForm initialService="profile-recovery" />)
    continueStep()
    fillAboutYou()
    continueStep()
    fireEvent.change(screen.getByLabelText("Tell us what happened"), { target: { value: validDetails } })
    continueStep()
    fireEvent.click(screen.getByRole("checkbox", { name: /accurate/i }))
    fireEvent.click(screen.getByRole("checkbox", { name: /privacy/i }))
    fireEvent.click(screen.getByRole("button", { name: "Submit assessment" }))
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("button", { name: "Submit assessment" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const first = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(first.submissionKey).toBe(SUBMISSION_KEY)
    expect(second.submissionKey).toBe(SUBMISSION_KEY)
    expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(SUBMISSION_KEY)).not.toBeInTheDocument()
  })

  it("displays the persisted case reference when the API returns one", async () => {
    stubSubmissionKey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        persisted: true,
        caseRef: "PR-26-7K4M2Q",
        caseType: "PROFILE_RECOVERY",
        receiptEmailSent: true,
      }),
    }))
    await submitValidAssessment()
    await screen.findByRole("heading", { name: PERSISTED_SUCCESS_COPY.title })
    expect(screen.getByText("PR-26-7K4M2Q")).toBeInTheDocument()
    expect(screen.getByText(PERSISTED_SUCCESS_COPY.referenceLabel)).toBeInTheDocument()
    expect(screen.getByText(PERSISTED_SUCCESS_COPY.review)).toBeInTheDocument()
    expect(screen.getByText(PERSISTED_SUCCESS_COPY.keep)).toBeInTheDocument()
    expect(screen.getByText(PERSISTED_SUCCESS_COPY.emailSent)).toBeInTheDocument()
    expect(screen.queryByText(SUCCESS_COPY.body)).not.toBeInTheDocument()
  })

  it("tells the customer the case was recorded if the receipt email failed", async () => {
    stubSubmissionKey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        persisted: true,
        caseRef: "RV-26-X8P3LM",
        caseType: "REVIEW_PROTECTION",
        receiptEmailSent: false,
      }),
    }))
    await submitValidAssessment("review-protection")
    await screen.findByText("RV-26-X8P3LM")
    expect(screen.getByText(PERSISTED_SUCCESS_COPY.emailFailed)).toBeInTheDocument()
    expect(screen.queryByText(PERSISTED_SUCCESS_COPY.emailSent)).not.toBeInTheDocument()
  })
})
