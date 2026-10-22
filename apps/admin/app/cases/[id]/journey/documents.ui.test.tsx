// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseCommunicationRead } from "@/lib/communications/model"
import type { EvidenceRequest } from "@/lib/evidence/model"
import { buildJourneyDocuments, type JourneyDocuments } from "@/lib/case-journey/documents"
import { renderEvidenceRequest } from "@/lib/communications/brand-email"
import { DocumentRequestPanel } from "./documents"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const MESSAGE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const sendDisabled = "Outgoing customer email is not enabled yet. Reviewed drafts are preserved, but sending will be enabled only after the production worker runs at the required cadence."

function request(title = "Google suspension or rejection notice"): EvidenceRequest {
  return {
    id: REQUEST_ID,
    title,
    requestText: `${title} — The notice Google sent about the suspension or rejection.`,
    status: "OPEN",
    dueAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    fulfilledAt: null,
    version: 4,
  }
}

function communication(overrides: Partial<CaseCommunicationRead["communications"][number]> = {}): CaseCommunicationRead["communications"][number] {
  const row: CaseCommunicationRead["communications"][number] = {
    id: MESSAGE_ID,
    caseId: CASE_ID,
    caseReference: "PR-1042",
    communicationType: "EVIDENCE_REQUEST",
    templateKey: "EVIDENCE_REQUEST",
    templateVersion: 1,
    lifecycle: "DRAFT",
    deliveryStatus: "NONE",
    legacyStatus: null,
    recipient: "alex@example.com",
    subject: "Evidence needed for PR-1042",
    bodyText: "To continue with PR-1042, we need the Google suspension notice.",
    provider: null,
    providerMessageId: null,
    lastError: null,
    contentLocked: false,
    contentVersion: 1,
    version: 2,
    draftedAt: "2026-02-02T00:00:00.000Z",
    reviewedAt: null,
    queuedAt: null,
    firstProviderAttemptAt: null,
    providerAcceptedAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    supersededBy: null,
    events: [],
    evidenceRequestId: REQUEST_ID,
    eventsTruncated: false,
    canReplace: false,
    ...overrides,
  }
  if (!Object.prototype.hasOwnProperty.call(overrides, "bodyHtml")) {
    row.bodyHtml = `<p>${row.bodyText ?? ""}</p>`
  }
  return row
}

function documents(input: {
  caseType?: string
  issue?: string
  requests?: EvidenceRequest[]
  history?: CaseCommunicationRead | null
  drafting?: { customerOriginConfigured: boolean; uploadLinkConfigured: boolean; senderConfigured: boolean }
} = {}): JourneyDocuments {
  const history = input.history === undefined
    ? {
      status: "success" as const,
      complete: true,
      total: 0,
      returned: 0,
      verifiedEmail: "alex@example.com",
      verifiedEmailSuppressed: false,
      communications: [],
    }
    : input.history
  return buildJourneyDocuments({
    caseType: input.caseType ?? "PROFILE_RECOVERY",
    issue: input.issue ?? "The business profile was suspended without warning.",
    businessName: "Mercer Bakery",
    requests: input.requests ?? [],
    history,
    sendDisabledReason: sendDisabled,
    drafting: input.drafting ?? { customerOriginConfigured: true, uploadLinkConfigured: true, senderConfigured: true },
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  refresh.mockClear()
})

function jsonResponse(status: number, message: string) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ message }) }
}

describe("the step 3 document request", () => {
  it("shows the original request and lets the operator edit the suggested documents", async () => {
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    expect(screen.getByText("Mercer Bakery")).toBeInTheDocument()
    expect(screen.getByText("Profile recovery")).toBeInTheDocument()
    expect(screen.getByText("The business profile was suspended without warning.")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Include Google suspension or rejection notice" })).toBeChecked()
    fireEvent.change(screen.getByLabelText("Document name: Google suspension or rejection notice"), { target: { value: "Suspension notice from Google" } })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "The evidence request has been recorded. No email was sent."))
    vi.stubGlobal("fetch", fetchMock)
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    await screen.findByText("The evidence request has been recorded. No email was sent.")
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/evidence/command")
    expect(body).toMatchObject({
      operation: "create_request",
      caseId: CASE_ID,
      title: "Suspension notice from Google",
      dueAt: null,
    })
    expect(body.requestText).toMatch(/Suspension notice from Google — The notice Google sent/)
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i)
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
  })

  it("changes the suggested documents for a review dispute and for monitoring", () => {
    const { unmount } = render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      caseType: "REVIEW_PROTECTION",
      issue: "A customer asked for a review to be removed.",
    })} />)
    expect(screen.getByText("Review protection")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /suspension or rejection/i })).toBeNull()
    expect(screen.getByRole("checkbox", { name: /Google correspondence or appeal reference/ })).not.toBeChecked()
    unmount()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      caseType: "MONITORING",
      issue: "Watch the listing each month.",
    })} />)
    expect(screen.getByRole("checkbox", { name: /Website or business contact details/ })).not.toBeChecked()
    expect(screen.getByRole("button", { name: "Save evidence requirements" })).toBeDisabled()
    expect(screen.getByText(/Save the documents together as one requirement/i)).toBeInTheDocument()
  })

  it("does not save an empty checklist or a requirement that is already open", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Google suspension or rejection notice" }))
    expect(screen.getByRole("button", { name: "Save evidence requirements" })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()

    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({ requests: [request()] })} />)
    expect(screen.getByRole("heading", { name: "Google suspension or rejection notice" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: "Google suspension or rejection notice" })).toHaveLength(1)
    expect(screen.getByText("Requirements saved. The customer has not been contacted.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(await screen.findByText(/already saved/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses one idempotency key for a repeated save and stops after a session or conflict failure", async () => {
    let resolveFetch: (value: ReturnType<typeof jsonResponse>) => void = () => undefined
    const fetchMock = vi.fn().mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    const button = screen.getByRole("button", { name: "Save evidence requirements" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch(jsonResponse(500, "We couldn’t confirm the change. Reload the record before trying again."))
    expect(await screen.findByRole("button", { name: "Reload this step" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save evidence requirements" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    cleanup()
    const denied = vi.fn().mockResolvedValue(jsonResponse(401, "Your session has ended. Please sign in again."))
    vi.stubGlobal("fetch", denied)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(await screen.findByText("Your session has ended. Please sign in again.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reload this step" })).toBeNull()
  })

  it("drafts from the saved requirement and reviews the exact message without offering send", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "The communication was drafted. It has not been sent."))
    vi.stubGlobal("fetch", fetchMock)
    const { unmount } = render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({ requests: [request("Shop licence")] })} />)
    fireEvent.click(screen.getByRole("button", { name: "Generate email draft" }))
    await screen.findByText("The communication was drafted. It has not been sent.")
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      operation: "draft",
      templateKey: "EVIDENCE_REQUEST",
      caseId: CASE_ID,
      evidenceRequestId: REQUEST_ID,
    })
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/communications")
    unmount()

    const reviewedFetch = vi.fn().mockResolvedValue(jsonResponse(409, "That communication changed. Reload the page and try again."))
    vi.stubGlobal("fetch", reviewedFetch)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request()],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication()],
      },
    })} />)
    expect(screen.getByText("alex@example.com")).toBeInTheDocument()
    expect(screen.getByText("Evidence needed for PR-1042")).toBeInTheDocument()
    expect(screen.queryByText("To continue with PR-1042, we need the Google suspension notice.")).toBeNull()
    const preview = screen.getByTitle("Branded email preview")
    expect(preview).toHaveAttribute("sandbox", "")
    expect(preview.getAttribute("srcdoc")).toBe("<p>To continue with PR-1042, we need the Google suspension notice.</p>")
    expect(preview.getAttribute("srcdoc")).not.toContain("profile-relaunch-logo.png")
    expect(preview.getAttribute("srcdoc")).not.toContain("#t=")
    expect(screen.getByText(/has not been approved, and it has not been sent/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Approve email" }))
    expect(await screen.findByText("That communication changed. Reload the page and try again.")).toBeInTheDocument()
    expect(JSON.parse(String(reviewedFetch.mock.calls[0][1].body))).toMatchObject({
      operation: "review",
      communicationId: MESSAGE_ID,
      version: 2,
    })
    expect(screen.queryByRole("button", { name: "Approve email" })).toBeNull()
    expect(screen.getByRole("button", { name: "Reload this step" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
  })

  it("keeps a reviewed draft when sending is unavailable and does not draft to a suppressed address", () => {
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request()],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication({ lifecycle: "REVIEWED", contentLocked: true, reviewedAt: "2026-02-03T00:00:00.000Z" })],
      },
    })} />)
    expect(screen.getByRole("heading", { name: "Approved — Not sent" })).toBeInTheDocument()
    expect(screen.getByText("The customer has not been sent this email.")).toBeInTheDocument()
    expect(screen.queryByText("To continue with PR-1042, we need the Google suspension notice.")).toBeNull()
    expect(screen.getByText("This approved wording is kept. A later change is a new draft.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Generate email draft" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve email" })).toBeNull()
    expect(screen.queryByText(sendDisabled)).toBeNull()

    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "The business profile was suspended without warning.",
      businessName: "Mercer Bakery",
      requests: [request()],
      history: {
        status: "success",
        complete: true,
        total: 0,
        returned: 0,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: true,
        communications: [],
      },
      sendDisabledReason: sendDisabled,
      drafting: { customerOriginConfigured: true, uploadLinkConfigured: true, senderConfigured: true },
    })} />)
    expect(screen.getByText(/email address is suppressed/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Generate email draft" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
  })

  it("explains when the preview cannot draft or review and still lets a requirement be saved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "The evidence request has been recorded. No email was sent."))
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request("Shop licence")],
      drafting: { customerOriginConfigured: false, uploadLinkConfigured: false, senderConfigured: false },
    })} />)
    expect(screen.getByText(/customer site origin is not configured/i)).toBeInTheDocument()
    expect(screen.getByText(/secure upload link is not configured/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Generate email draft" })).toBeNull()
    expect(screen.queryByText(/COMMUNICATIONS_LINK_SECRET|CUSTOMER_ORIGIN/)).toBeNull()
    expect(screen.getByText("Add another requirement")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Include other evidence" }))
    fireEvent.change(screen.getByLabelText("Other evidence title"), { target: { value: "Shop front photo" } })
    fireEvent.change(screen.getByLabelText("Other evidence description"), { target: { value: "A photo of the shop front and the street name." } })
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(await screen.findByText("The evidence request has been recorded. No email was sent.")).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe("/api/evidence/command")

    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request()],
      drafting: { customerOriginConfigured: true, uploadLinkConfigured: true, senderConfigured: false },
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication()],
      },
    })} />)
    expect(screen.getByText(/outbound sender address is not configured/i)).toBeInTheDocument()
    expect(screen.queryByText("To continue with PR-1042, we need the Google suspension notice.")).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
  })

  it("names the one requirement in the email and will not review while another open requirement is left out", () => {
    const other = request("Proof of operating location")
    other.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const { unmount } = render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request("Shop licence"), other],
    })} />)
    expect(screen.getByText("Included in this email: Shop licence")).toBeInTheDocument()
    expect(screen.getByText(/Not included in this email: Proof of operating location/)).toBeInTheDocument()
    expect(screen.getByText(/does not request those requirements/i)).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox", { name: "Requirement for this email" }), { target: { value: other.id } })
    expect(screen.getByText("Included in this email: Proof of operating location")).toBeInTheDocument()
    expect(screen.getByText(/Not included in this email: Shop licence/)).toBeInTheDocument()
    unmount()

    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request("Shop licence"), other],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication({ evidenceRequestId: REQUEST_ID, subject: "Evidence needed for PR-1042", bodyText: "To continue with PR-1042, we need Shop licence." })],
      },
    })} />)
    expect(screen.getAllByText("Included in this email: Shop licence").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Not included in this email: Proof of operating location/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Approving does not cancel those requests/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve email" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Generate email draft" })).toBeNull()
  })

  it("can request several custom documents together without treating two as a limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "The evidence request has been recorded. No email was sent."))
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Include other evidence" }))
    fireEvent.change(screen.getByLabelText("Other evidence title"), { target: { value: "Shop front photograph" } })
    fireEvent.change(screen.getByLabelText("Other evidence description"), { target: { value: "Include the shop sign and entrance." } })
    fireEvent.click(screen.getByRole("button", { name: "Add another document" }))
    fireEvent.click(screen.getByRole("button", { name: "Add another document" }))
    fireEvent.change(screen.getByLabelText("Additional document 1 title"), { target: { value: "Utility bill" } })
    fireEvent.change(screen.getByLabelText("Additional document 1 description"), { target: { value: "Recent bill showing the trading address." } })
    fireEvent.change(screen.getByLabelText("Additional document 2 title"), { target: { value: "Google appeal reply" } })
    fireEvent.change(screen.getByLabelText("Additional document 2 description"), { target: { value: "The full response from Google, if available." } })
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(await screen.findByText("The evidence request has been recorded. No email was sent.")).toBeInTheDocument()
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(sent.title).toContain("Shop front photograph")
    expect(sent.title).toContain("Utility bill")
    expect(sent.title).toContain("Google appeal reply")
    expect(sent.requestText).toContain("Recent bill showing the trading address.")
    expect(sent.operation).toBe("create_request")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejects a vague added document without sending any evidence request", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    fireEvent.click(screen.getByRole("button", { name: "Add another document" }))
    fireEvent.change(screen.getByLabelText("Additional document 1 title"), { target: { value: "Other evidence" } })
    fireEvent.change(screen.getByLabelText("Additional document 1 description"), { target: { value: "Any document you can find." } })
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(screen.getByText(/Give each additional document a specific name/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Remove additional document 1" }))
    expect(screen.queryByLabelText("Additional document 1 title")).toBeNull()
  })

  it("does not prepare a customer email from a vague Other evidence title", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Include other evidence" }))
    fireEvent.change(screen.getByLabelText("Other evidence description"), { target: { value: "Something we might need later on." } })
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(await screen.findByText(/Give each additional document a specific name/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({ requests: [request("Other evidence")] })} />)
    expect(screen.getByText(/Cancel it and save a specific document name/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Generate email draft" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Generate email draft" }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not call a provider-accepted email both queued and waiting", () => {
    const history = (deliveryStatus: "PROVIDER_ACCEPTED" | "NONE") => ({
      status: "success" as const,
      complete: true,
      total: 1,
      returned: 1,
      verifiedEmail: "alex@example.com",
      verifiedEmailSuppressed: false,
      communications: [communication({
        lifecycle: "QUEUED",
        deliveryStatus,
        contentLocked: true,
        queuedAt: "2026-02-03T00:00:00.000Z",
        evidenceRequestId: REQUEST_ID,
      })],
    })
    const { unmount } = render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request()],
      history: history("PROVIDER_ACCEPTED"),
    })} />)
    expect(screen.getByText("Accepted by email provider. Delivery is not confirmed.")).toBeInTheDocument()
    expect(screen.getByText(/The email provider accepted the message. That does not confirm the customer received it. This page does not send another copy./)).toBeInTheDocument()
    expect(screen.queryByText("Queued. Accepted by email provider.")).toBeNull()
    expect(screen.queryByText("This email is waiting. This page does not send another copy.")).toBeNull()
    expect(screen.getByText(/Issuing it is not the same as confirmed delivery./)).toBeInTheDocument()
    unmount()

    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request()],
      history: history("NONE"),
    })} />)
    expect(screen.getByText("Queued. Not sent.")).toBeInTheDocument()
    expect(screen.getByText("This email is waiting. This page does not send another copy.")).toBeInTheDocument()
    expect(screen.queryByText(/Accepted by email provider. Delivery is not confirmed./)).toBeNull()
  })

  it("keeps the public logo inside sandboxed previews for a new draft and an approved email", () => {
    const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const rendered = renderEvidenceRequest({
      caseRef: "PR-1042",
      documents: ["Shop licence"],
      uploadUrl: upload,
    })
    expect(rendered?.html).toContain("https://profilerelaunch.com/brand/profile-relaunch-logo.png")
    const history = (lifecycle: "DRAFT" | "REVIEWED") => ({
      status: "success" as const,
      complete: true,
      total: 1,
      returned: 1,
      verifiedEmail: "alex@example.com",
      verifiedEmailSuppressed: false,
      communications: [communication({
        templateVersion: 3,
        lifecycle,
        subject: rendered!.subject,
        bodyText: rendered!.text,
        bodyHtml: rendered!.html,
        contentLocked: lifecycle === "REVIEWED",
        evidenceRequestId: REQUEST_ID,
      })],
    })
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request("Shop licence")],
      history: history("DRAFT"),
    })} />)
    const draftPreview = screen.getByTitle("Branded email preview")
    expect(draftPreview).toHaveAttribute("sandbox", "")
    expect(draftPreview.getAttribute("srcdoc")).toBe(rendered!.html)
    expect(screen.getByRole("heading", { name: "Email draft" })).toBeInTheDocument()
    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request("Shop licence")],
      history: history("REVIEWED"),
    })} />)
    const approvedPreview = screen.getByTitle("Branded email preview")
    expect(approvedPreview).toHaveAttribute("sandbox", "")
    expect(approvedPreview.getAttribute("srcdoc")).toBe(rendered!.html)
    expect(screen.getByRole("heading", { name: "Approved — Not sent" })).toBeInTheDocument()
    expect(approvedPreview.getAttribute("srcdoc")).toContain("https://profilerelaunch.com/brand/profile-relaunch-logo.png")
  })

  it("shows the stored email and withholds approval when that snapshot is missing", () => {
    const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const stored = `<!DOCTYPE html><html><body><img src="https://profilerelaunch.com/profile-relaunch-logo.png" alt="ProfileRelaunch"><ul><li>Shop licence</li></ul><a href="${upload}">Upload your documents securely</a><p>Kind regards,</p><p>ProfileRelaunch Support Team</p><p>For your security, please never share passwords, verification codes or sign-in credentials.</p><p>simply reply to this email</p></body></html>`
    const text = `Please send the shop licence so we can review the listing.\n\n${upload}`
    render(<DocumentRequestPanel caseId={CASE_ID} replyMailbox="cases@profilerelaunch.com" documents={documents({
      requests: [request("Shop licence")],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication({
          subject: "Documents for PR-1042",
          bodyText: text,
          bodyHtml: stored,
          replyToAddress: "cases@profilerelaunch.com",
          evidenceRequestId: REQUEST_ID,
        })],
      },
    })} />)
    const preview = screen.getByTitle("Branded email preview")
    expect(preview).toHaveAttribute("sandbox", "")
    expect(preview.getAttribute("srcdoc")).toBe(stored)
    expect(screen.queryByText(/Please send the shop licence so we can review the listing/)).toBeNull()
    expect(screen.queryByText("Plain text")).toBeNull()
    expect(screen.getByTitle("Branded email preview").getAttribute("srcdoc")).toContain(upload)
    expect(screen.getByRole("button", { name: "Approve email" })).toBeInTheDocument()
    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request("Shop licence")],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication({
          bodyText: text,
          bodyHtml: null,
          evidenceRequestId: REQUEST_ID,
        })],
      },
    })} />)
    expect(screen.queryByTitle("Branded email preview")).toBeNull()
    expect(screen.getByText(/cannot be approved until the saved email preview matches/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve email" })).toBeNull()
  })

  it("saves plain wording without the upload link and hides approval until that wording is saved", async () => {
    const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "The wording was saved. The email has not been sent."))
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request("Shop licence")],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication({
          subject: "Evidence needed for PR-1042",
          bodyText: `To continue with PR-1042, we need the shop licence.\n\n${upload}`,
          evidenceRequestId: REQUEST_ID,
        })],
      },
    })} />)
    expect(screen.queryByText(/To continue with PR-1042, we need the shop licence/)).toBeNull()
    expect(screen.getByTitle("Branded email preview").getAttribute("srcdoc")).toContain("To continue with PR-1042, we need the shop licence.")
    expect(screen.getByTitle("Branded email preview").getAttribute("srcdoc")).toContain(upload)
    expect(screen.queryByLabelText("Email subject")).toBeNull()
    expect(screen.queryByLabelText("Email message")).toBeNull()
    expect(screen.getByRole("button", { name: "Approve email" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Edit email" }))
    expect(screen.getByLabelText("Email subject")).toHaveValue("Evidence needed for PR-1042")
    expect(screen.getByLabelText("Email message")).toHaveValue("To continue with PR-1042, we need the shop licence.")
    expect(screen.getByText(upload)).toBeInTheDocument()
    expect(screen.queryByTitle("Unsaved email preview")).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve email" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Email message"), { target: { value: "Please use https://evil.example/steal for the file." } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    expect(await screen.findByText(/Use plain wording/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }))
    expect(screen.queryByLabelText("Email message")).toBeNull()
    expect(screen.getByTitle("Branded email preview")).toBeInTheDocument()
    expect(screen.queryByLabelText("Email message")).toBeNull()
    expect(screen.queryByText("Plain text")).toBeNull()
    expect(screen.getByRole("button", { name: "Approve email" })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Edit email" }))
    fireEvent.change(screen.getByLabelText("Email subject"), { target: { value: "Documents for your profile" } })
    fireEvent.change(screen.getByLabelText("Email message"), { target: { value: "Please send the shop licence and the suspension notice." } })
    expect(screen.queryByRole("button", { name: "Approve email" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }))
    expect(screen.getByText("Evidence needed for PR-1042")).toBeInTheDocument()
    expect(screen.queryByText("Documents for your profile")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Edit email" }))
    fireEvent.change(screen.getByLabelText("Email subject"), { target: { value: "Documents for your profile" } })
    fireEvent.change(screen.getByLabelText("Email message"), { target: { value: "Please send the shop licence and the suspension notice." } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await screen.findByText("The wording was saved. The email has not been sent.")
    expect(screen.queryByText("Documents for your profile")).toBeNull()
    expect(screen.queryByText("Please send the shop licence and the suspension notice.")).toBeNull()
    expect(screen.queryByText(upload)).toBeNull()
    expect(screen.getByText(/Reload this step to view the saved email/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Reload this step" })).toBeNull()
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/journey/wording")
    expect(sent).toEqual({
      communicationId: MESSAGE_ID,
      version: 2,
      subject: "Documents for your profile",
      message: "Please send the shop licence and the suspension notice.",
    })
    expect(JSON.stringify(sent)).not.toContain(upload)
    expect(JSON.stringify(sent)).not.toMatch(/recipient|fromAddress|<|https?:/)
  })
})
