import { describe, expect, it } from "vitest"
import type { CaseCommunicationRead } from "../communications/model"
import type { EvidenceRequest } from "../evidence/model"
import {
  alreadySaved,
  buildJourneyDocuments,
  evidencePreviewBlocks,
  vagueEvidenceTitle,
  draftingAvailability,
  approvalNotice,
  requirementCoverage,
  requirementText,
  requirementTitle,
  splitEvidenceMessage,
  suggestDocuments,
} from "./documents"

const sendDisabled = "Outgoing customer email is not enabled yet. Reviewed drafts are preserved, but sending will be enabled only after the production worker runs at the required cadence."
const drafting = { customerOriginConfigured: true, uploadLinkConfigured: true, senderConfigured: true }

function request(title: string, status: EvidenceRequest["status"] = "OPEN"): EvidenceRequest {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title,
    requestText: title,
    status,
    dueAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    fulfilledAt: null,
    version: 1,
  }
}

function history(communications: CaseCommunicationRead["communications"] = []): CaseCommunicationRead {
  return {
    status: "success",
    complete: true,
    total: communications.length,
    returned: communications.length,
    verifiedEmail: "alex@example.com",
    verifiedEmailSuppressed: false,
    communications,
  }
}

describe("evidence suggestions", () => {
  it("suggests a suspension notice for a suspended profile and does not ask for identity documents", () => {
    const suggestions = suggestDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "The business profile was suspended without warning.",
    })
    expect(suggestions.map(item => item.title)).toContain("Google suspension or rejection notice")
    expect(suggestions.find(item => item.key === "suspension")?.selected).toBe(true)
    expect(suggestions.map(item => item.title).join(" ")).not.toMatch(/passport|driving licence|national insurance|proof of identity/i)
  })

  it("suggests registration and location evidence without treating them as mandatory for every case", () => {
    const suggestions = suggestDocuments({
      caseType: "REVIEW_PROTECTION",
      issue: "The shop needs its premises licence and Companies House registration checked.",
    })
    expect(suggestions.find(item => item.key === "registration")?.selected).toBe(true)
    expect(suggestions.find(item => item.key === "location")?.selected).toBe(false)
    expect(suggestions.find(item => item.key === "suspension")).toBeUndefined()
    expect(suggestions.find(item => item.key === "registration")?.detail).toMatch(/not a personal identity document/i)
    expect(suggestions.filter(item => item.selected)).toHaveLength(1)
  })

  it("suggests contact details for monitoring and leaves them unselected when the issue does not mention them", () => {
    const suggestions = suggestDocuments({ caseType: "MONITORING", issue: "Watch the listing each month." })
    expect(suggestions.map(item => item.key)).toEqual(["contact"])
    expect(suggestions[0]?.selected).toBe(false)
  })

  it("keeps an empty checklist from becoming a saved title", () => {
    expect(requirementTitle([])).toBeNull()
    expect(requirementText([{ title: "  ", detail: "" }])).toBeNull()
    expect(requirementTitle([{ title: "x".repeat(201) }])).toBeNull()
    expect(requirementText([{ title: "Notice", detail: "The Google email." }])).toBe("Notice — The Google email.")
  })

  it("rejects a vague document name and keeps a specific one", () => {
    expect(vagueEvidenceTitle("Other evidence")).toBe(true)
    expect(vagueEvidenceTitle(" evidence ")).toBe(true)
    expect(vagueEvidenceTitle("Shop licence; Other evidence")).toBe(true)
    expect(vagueEvidenceTitle("Shop front photograph")).toBe(false)
  })

  it("shows the secure upload link once, after the paragraphs", () => {
    const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const blocks = evidencePreviewBlocks(`Hello,\n\nPlease send this document:\n\n- Shop licence\n- Suspension notice\n\n${upload}`)
    expect(blocks.filter(block => block.type === "link")).toEqual([{ type: "link", url: upload }])
    expect(blocks.find(block => block.type === "list")).toEqual({ type: "list", items: ["Shop licence", "Suspension notice"] })
    expect(evidencePreviewBlocks(`See https://evil.example/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa and ${upload}`).some(block => block.type === "link")).toBe(false)
  })

  it("treats an open requirement with the same title as already saved", () => {
    expect(alreadySaved("Suspension notice", [request("Suspension notice")])).toBe(true)
    expect(alreadySaved("Suspension notice", [request("Suspension notice", "CANCELLED")])).toBe(false)
    expect(alreadySaved("A different notice", [request("Suspension notice")])).toBe(false)
  })

  it("does not choose a draft when the communication history is incomplete, missing or ambiguous", () => {
    const missing = buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "Suspended",
      businessName: "Mercer Bakery",
      requests: [],
      history: null,
      sendDisabledReason: sendDisabled,
      drafting,
    })
    expect(missing.history).toBe("unavailable")
    expect(missing.currentMessage).toBeNull()
    const incomplete = buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "Suspended",
      businessName: "Mercer Bakery",
      requests: [request("Notice")],
      history: { ...history(), complete: false, total: 3, returned: 1 },
      sendDisabledReason: sendDisabled,
      drafting,
    })
    expect(incomplete.history).toBe("incomplete")
    const tied = history([
      message("2026-02-01T00:00:00.000Z"),
      message("2026-02-01T00:00:00.000Z", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    ])
    const ambiguous = buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "Suspended",
      businessName: "Mercer Bakery",
      requests: [],
      history: tied,
      sendDisabledReason: sendDisabled,
      drafting,
    })
    expect(ambiguous.history).toBe("ambiguous")
    expect(ambiguous.currentMessage).toBeNull()
  })

  it("names the missing preview settings without treating them as a reason to send", () => {
    const missing = draftingAvailability({
      customerOriginConfigured: false,
      uploadLinkConfigured: false,
      senderConfigured: false,
    })
    expect(missing.canDraft).toBe(false)
    expect(missing.canReview).toBe(false)
    expect(missing.draftReasons).toEqual([
      "A customer site origin is not configured for this preview, so an evidence-request draft cannot be created.",
      "The secure upload link is not configured, so a draft cannot be created.",
    ])
    expect(missing.reviewReason).toMatch(/outbound sender address is not configured/)
    expect(JSON.stringify(missing)).not.toMatch(/COMMUNICATIONS_|CUSTOMER_ORIGIN|secret/i)
    const ready = draftingAvailability(drafting)
    expect(ready.canDraft).toBe(true)
    expect(ready.canReview).toBe(true)
    expect(ready.draftReasons).toEqual([])
    expect(ready.reviewReason).toBeNull()
  })

  it("says which open requirement one email includes and blocks review while others remain", () => {
    const first = request("Shop licence")
    const second = { ...request("Proof of operating location"), id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
    const built = buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "Suspended",
      businessName: "Mercer Bakery",
      requests: [first, second],
      history: history([{ ...message("2026-02-02T00:00:00.000Z"), evidenceRequestId: first.id }]),
      sendDisabledReason: sendDisabled,
      drafting,
    })
    expect(requirementCoverage(built)).toMatchObject({
      included: { id: first.id, title: "Shop licence" },
      omitted: [{ id: second.id, title: "Proof of operating location" }],
    })
    const notice = approvalNotice(built)
    expect(notice.blocked).toBe(false)
    expect(notice.text).toMatch(/covers only “Shop licence”/)
    expect(notice.text).toMatch(/Proof of operating location/)
    expect(notice.text).toMatch(/does not cancel/)
    const alone = buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "Suspended",
      businessName: "Mercer Bakery",
      requests: [first],
      history: history([{ ...message("2026-02-02T00:00:00.000Z"), evidenceRequestId: first.id, lifecycle: "REVIEWED", contentLocked: true }]),
      sendDisabledReason: sendDisabled,
      drafting,
    })
    expect(requirementCoverage(alone).omitted).toEqual([])
    expect(approvalNotice(alone)).toEqual({ blocked: false, text: null })
    expect(alone.currentMessage?.contentLocked).toBe(true)
    const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    expect(splitEvidenceMessage(`Please send the shop licence.\n\n${upload}`)).toEqual({
      prose: "Please send the shop licence.",
      uploadUrl: upload,
    })
    expect(splitEvidenceMessage(`See https://evil.example/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa and ${upload}`).uploadUrl).toBeNull()
    const mismatched = buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "Suspended",
      businessName: "Mercer Bakery",
      requests: [first],
      history: history([{
        ...message("2026-02-02T00:00:00.000Z"),
        evidenceRequestId: first.id,
        bodyText: `Please send the shop licence.\n\n${upload}`,
        bodyHtml: "<p>Please send the shop licence.</p>",
      }]),
      sendDisabledReason: sendDisabled,
      drafting,
    })
    expect(approvalNotice(mismatched)).toEqual({
      blocked: true,
      text: "This draft cannot be approved until the saved email preview matches the stored message.",
    })
  })
})

function message(draftedAt: string, id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"): CaseCommunicationRead["communications"][number] {
  return {
    id,
    caseId: "55555555-5555-4555-8555-555555555555",
    caseReference: "PR-1042",
    communicationType: "EVIDENCE_REQUEST",
    templateKey: "EVIDENCE_REQUEST",
    templateVersion: 1,
    lifecycle: "DRAFT",
    deliveryStatus: "NONE",
    legacyStatus: null,
    recipient: "alex@example.com",
    subject: "Evidence needed",
    bodyText: "Please upload the notice.",
    bodyHtml: "<p>Please upload the notice.</p>",
    provider: null,
    providerMessageId: null,
    lastError: null,
    contentLocked: false,
    contentVersion: 1,
    version: 2,
    draftedAt,
    reviewedAt: null,
    queuedAt: null,
    firstProviderAttemptAt: null,
    providerAcceptedAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    supersededBy: null,
    events: [],
    evidenceRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    eventsTruncated: false,
    canReplace: false,
  }
}
