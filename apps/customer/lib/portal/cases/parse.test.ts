import { describe, expect, it } from "vitest"
import { isPublicCaseReference, parseCaseDetail, parseCasePage, parseCasesRequest, parseDashboard } from "./parse"

const submittedAt = "2026-10-08T12:00:00.000Z"

function row(overrides: Record<string, unknown> = {}) {
  return {
    reference: "PR-26-ABCDEF",
    caseType: "PROFILE_RECOVERY",
    serviceTrack: "GUIDED",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    status: "RECEIVED",
    workStage: "INITIAL_REVIEW",
    submittedAt,
    closedAt: null,
    attentionItems: [],
    ...overrides,
  }
}

function dashboard(overrides: Record<string, unknown> = {}, caseOverrides: Record<string, unknown> = {}) {
  const item = row(caseOverrides)
  return {
    summary: { activeCases: 1, attentionCases: 0, previousCases: 0 },
    attentionCases: [],
    recentCases: [item],
    ...overrides,
  }
}

describe("customer case response parsing", () => {
  it("accepts a narrow dashboard and cases page", () => {
    expect(parseDashboard(dashboard())?.recentCases[0].reference).toBe("PR-26-ABCDEF")
    expect(parseCasePage({ cases: [row()], nextCursor: { submittedAt, reference: "PR-26-ABCDEF" } })?.nextCursor?.reference).toBe("PR-26-ABCDEF")
    expect(parseCasePage({ cases: [], nextCursor: null })).toEqual({ cases: [], nextCursor: null })
  })

  it("fails closed on unknown enums, extra keys, bad references, and bad cursors", () => {
    expect(parseDashboard(dashboard({}, { status: "OPEN" }))).toBeNull()
    expect(parseDashboard(dashboard({}, { workStage: "ADMIN_REVIEW" }))).toBeNull()
    expect(parseDashboard(dashboard({}, { caseType: "OTHER" }))).toBeNull()
    expect(parseDashboard(dashboard({}, { serviceTrack: "HYBRID" }))).toBeNull()
    expect(parseDashboard(dashboard({}, { reference: "CASE-1" }))).toBeNull()
    expect(parseDashboard(dashboard({}, { reference: "RV-26-ABCDEF" }))).toBeNull()
    expect(parseDashboard(dashboard({}, { attentionItems: [{ code: "CASE_ACCESS", expiresAt: submittedAt }] }))).toBeNull()
    expect(parseDashboard(dashboard({}, { customerId: "secret", ...row() }))).toBeNull()
    expect(parseDashboard({ ...dashboard(), customerId: "secret" })).toBeNull()
    expect(parseDashboard(dashboard({ summary: { activeCases: 1, attentionCases: 0, previousCases: 0, revenue: 1 } }))).toBeNull()
    expect(parseCasePage({ cases: [row()], nextCursor: { submittedAt, reference: "nope" } })).toBeNull()
    expect(parseCasePage({ cases: [row()], nextCursor: { submittedAt, reference: "PR-26-ABCDEF", id: "x" } })).toBeNull()
    expect(parseCasesRequest({ view: "secret" })).toBeNull()
    expect(parseCasesRequest({ view: "active", before: submittedAt })).toBeNull()
    expect(parseCasesRequest({ view: "active", ref: "PR-26-ABCDEF" })).toBeNull()
    expect(parseCasesRequest({ before: "8 October 2026", ref: "PR-26-ABCDEF" })).toBeNull()
    expect(parseCasesRequest({})).toEqual({ view: "active", before: null, reference: null })
    expect(parseCasesRequest({ view: "previous", before: submittedAt, ref: "RV-26-ABCDEF" })).toEqual({
      view: "previous",
      before: submittedAt,
      reference: "RV-26-ABCDEF",
    })
    const precise = "2026-06-01T00:00:00.123456+00:00"
    expect(parseCasesRequest({ view: "all", before: precise, ref: "PR-26-ZZZZZ9" })).toEqual({
      view: "all",
      before: precise,
      reference: "PR-26-ZZZZZ9",
    })
  })

  it("rejects a dashboard whose counts disagree with the rows", () => {
    expect(parseDashboard(dashboard({ summary: { activeCases: 0, attentionCases: 0, previousCases: 0 } }))).toBeNull()
    expect(parseDashboard({
      summary: { activeCases: 1, attentionCases: 1, previousCases: 0 },
      attentionCases: [],
      recentCases: [row()],
    })).toBeNull()
  })
})

function workspaceCase(overrides: Record<string, unknown> = {}) {
  return { ...row(), outcomeCode: null, ...overrides }
}

function detail(overrides: Record<string, unknown> = {}, caseOverrides: Record<string, unknown> = {}) {
  return {
    found: true,
    case: workspaceCase(caseOverrides),
    timeline: [{ code: "CASE_RECEIVED", occurredAt: submittedAt }],
    timelineTruncated: false,
    ...overrides,
  }
}

describe("customer case detail parsing", () => {
  it("accepts a public reference and an exact owned-case envelope", () => {
    expect(isPublicCaseReference("PR-26-ABC234")).toBe(true)
    expect(isPublicCaseReference("RV-26-XYZ567")).toBe(true)
    expect(isPublicCaseReference("PR-26-ABC23")).toBe(false)
    expect(isPublicCaseReference("PR-26-ABC2345")).toBe(false)
    expect(isPublicCaseReference("XX-26-ABC234")).toBe(false)
    expect(isPublicCaseReference("PR-26-ABC23I")).toBe(false)
    const parsed = parseCaseDetail(detail({
      case: workspaceCase({ outcomeCode: "RESTORED", attentionItems: [{ code: "EVIDENCE_REQUIRED", dueAt: null }] }),
    }))
    expect(parsed && parsed.found && parsed.case.outcomeCode).toBe("RESTORED")
    expect(parseCaseDetail({ found: false })).toEqual({ found: false })
  })

  it("rejects extra keys, unknown timeline codes, unsafe outcomes, and a long timeline", () => {
    expect(parseCaseDetail({ found: false, reason: "other-customer" })).toBeNull()
    expect(parseCaseDetail({ found: false, id: "x" })).toBeNull()
    expect(parseCaseDetail(detail({ note: "secret" }))).toBeNull()
    expect(parseCaseDetail(detail({}, { outcome: "RESTORED" }))).toBeNull()
    expect(parseCaseDetail(detail({}, { outcomeCode: "RESTORED", caseType: "REVIEW_PROTECTION", reference: "RV-26-ABCDEF" }))).toBeNull()
    expect(parseCaseDetail(detail({}, { outcomeCode: "REMOVED" }))).toBeNull()
    expect(parseCaseDetail(detail({}, { outcomeCode: "CUSTOM_TEXT" }))).toBeNull()
    expect(parseCaseDetail(detail({}, { id: "secret" }))).toBeNull()
    expect(parseCaseDetail(detail({
      timeline: [{ code: "CASE_NOTE_ADDED", occurredAt: submittedAt }],
    }))).toBeNull()
    expect(parseCaseDetail(detail({
      timeline: [{ code: "CASE_RECEIVED", occurredAt: submittedAt, note: "hidden" }],
    }))).toBeNull()
    const tooMany = Array.from({ length: 21 }, () => ({ code: "CASE_RECEIVED", occurredAt: submittedAt }))
    expect(parseCaseDetail(detail({ timeline: tooMany, timelineTruncated: true }))).toBeNull()
    expect(parseCaseDetail(detail({ timeline: tooMany.slice(0, 19), timelineTruncated: true }))).toBeNull()
    const twenty = tooMany.slice(0, 20)
    expect(parseCaseDetail(detail({ timeline: twenty, timelineTruncated: true }))?.found).toBe(true)
    expect(parseCaseDetail(detail({ timeline: twenty, timelineTruncated: false }))?.found).toBe(true)
    expect(parseCaseDetail(null)).toBeNull()
    expect(parseCaseDetail(detail({
      case: workspaceCase({ outcomeCode: "REMOVED", caseType: "REVIEW_PROTECTION", reference: "RV-26-ABCDEF" }),
    })) && true).toBe(true)
  })
})
