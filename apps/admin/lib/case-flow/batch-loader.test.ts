/**
 * The server side of the batch projection.
 *
 * Two things are being protected here. The first is the round trip: a queue of
 * fifty cases must cost one projection call, so a test that merely checked the
 * answers would miss the regression that matters most. The second is the
 * refusal: the projection's answer is `jsonb`, and a page that renders fifty
 * operator decisions from it must treat a surprising payload as a failure
 * rather than as an absence.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
const notFoundError = new Error("NEXT_NOT_FOUND")
const redirectError = new Error("NEXT_REDIRECT")

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "a".repeat(64) }) }) }))
vi.mock("next/navigation", () => ({
  notFound: () => { throw notFoundError },
  redirect: () => { throw redirectError },
}))
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("../require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/auth/backend", () => ({ tokenHash: (token: string) => `hash:${token}`, backend: () => ({ rpc }) }))
vi.mock("../auth/backend", () => ({ tokenHash: (token: string) => `hash:${token}`, backend: () => ({ rpc }) }))

import {
  CASE_FLOW_BATCH_LIMIT,
  CaseFlowProjectionError,
  caseFlowBatchIds,
  narrowCaseFlowFacts,
  requiredCase,
} from "./projection"
import { loadCaseFlow, loadCaseFlowFacts, loadCaseFlows, loadCaseFlowsFacts } from "./load"
import { resolveCaseFlow } from "./resolve"
import type { CaseFlowCapabilityFact } from "./model"

const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`
const A = uuid(1)
const B = uuid(2)
const C = uuid(3)

const capabilities: CaseFlowCapabilityFact = {
  liveMailEnabled: false,
  paymentsEnabled: true,
  googleSubmissionLive: false,
}

/** One projected row, in the shape `admin_case_flow_facts_v1` emits. */
function projected(caseId: string, overrides: Record<string, unknown> = {}) {
  return {
    caseId,
    reference: "CASE-0001",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "INITIAL_REVIEW",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: null,
    outcome: null,
    outcomeSummary: null,
    customerId: uuid(90),
    businessId: uuid(91),
    locationId: uuid(92),
    plannedNextAction: null,
    plannedNextActionDueAt: null,
    allowedTransitions: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"],
    reopened: false,
    tasks: [],
    submissions: [],
    authorization: {
      membershipStatus: "missing",
      customerEmailVerified: false,
      businessAuthorityVerified: false,
      serviceAgreementAccepted: false,
      caseManagementPermissionActive: false,
      managerAccessVerified: false,
      authorizationReady: false,
      reviewRequired: [],
      agreementKinds: [],
      hasLocation: true,
    },
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    ...overrides,
  }
}

const envelope = (...cases: unknown[]) => ({ cases })

beforeEach(() => {
  rpc.mockReset().mockResolvedValue(envelope())
})

describe("what leaves the server", () => {
  it("asks the projection once for a page of cases", async () => {
    rpc.mockResolvedValue(envelope(projected(A), projected(B), projected(C)))
    const flows = await loadCaseFlows([A, B, C])

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("admin_case_flow_facts_v1", {
      p_case_ids: [A, B, C],
      p_token: `hash:${"a".repeat(64)}`,
    })
    expect([...flows.keys()].sort()).toEqual([A, B, C].sort())
  })

  it("sends the hashed session token, never the cookie value", async () => {
    await loadCaseFlowsFacts([A])
    expect(rpc.mock.calls[0][1].p_token).toBe(`hash:${"a".repeat(64)}`)
    expect(rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))
  })

  it("refuses a malformed identifier before any round trip", async () => {
    for (const bad of ["", "new", "../cases", "1 OR 1=1", "a".repeat(36), `${A} `]) {
      await expect(loadCaseFlowsFacts([bad])).rejects.toBeInstanceOf(CaseFlowProjectionError)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it("refuses more than the maximum batch before any round trip", async () => {
    const tooMany = Array.from({ length: CASE_FLOW_BATCH_LIMIT + 1 }, (_, index) => uuid(index + 1))
    await expect(loadCaseFlowsFacts(tooMany)).rejects.toThrow(/at most 50/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("accepts exactly the maximum batch", async () => {
    const full = Array.from({ length: CASE_FLOW_BATCH_LIMIT }, (_, index) => uuid(index + 1))
    rpc.mockResolvedValue(envelope(...full.map(id => projected(id))))
    expect((await loadCaseFlowsFacts(full)).size).toBe(CASE_FLOW_BATCH_LIMIT)
    expect(rpc.mock.calls[0][1].p_case_ids).toHaveLength(CASE_FLOW_BATCH_LIMIT)
  })

  it("asks for a repeated case once, and still answers for it", async () => {
    rpc.mockResolvedValue(envelope(projected(A), projected(B)))
    const facts = await loadCaseFlowsFacts([A, B, A, A])
    expect(rpc.mock.calls[0][1].p_case_ids).toEqual([A, B])
    expect(facts.get(A)?.caseId).toBe(A)
  })

  it("does not call the projection at all for an empty page", async () => {
    expect((await loadCaseFlows([])).size).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("sends the session to the login page when the projection declines it", async () => {
    rpc.mockResolvedValue(null)
    await expect(loadCaseFlowsFacts([A])).rejects.toBe(redirectError)
  })
})

describe("what comes back", () => {
  it("rejects a case that was never requested", async () => {
    rpc.mockResolvedValue(envelope(projected(A), projected(C)))
    await expect(loadCaseFlowsFacts([A, B])).rejects.toThrow(`returned ${C}, which was not requested`)
  })

  it("rejects the same case twice", async () => {
    rpc.mockResolvedValue(envelope(projected(A), projected(A)))
    await expect(loadCaseFlowsFacts([A])).rejects.toThrow(`returned ${A} more than once`)
  })

  it("treats a requested case that is missing from the answer as an error at the point of use", async () => {
    rpc.mockResolvedValue(envelope(projected(A)))
    const flows = await loadCaseFlows([A, B])
    expect(flows.has(B)).toBe(false)
    expect(() => requiredCase(flows, B)).toThrow(`no result for ${B}`)
  })

  it.each([
    ["an envelope that is a string", "cases"],
    ["an envelope that is a number", 7],
    ["an array", []],
    ["no case list", {}],
    ["a case list that is not a list", { cases: {} }],
    ["a case that is not an object", { cases: ["x"] }],
  ])("refuses %s", async (_name, payload) => {
    rpc.mockResolvedValue(payload)
    await expect(loadCaseFlowsFacts([A])).rejects.toBeInstanceOf(CaseFlowProjectionError)
  })

  it.each([
    ["a missing identifier", { caseId: undefined }],
    ["a missing stage", { technicalStage: null }],
    ["a reopened flag that is not a boolean", { reopened: "false" }],
    ["a transition list that is not a list", { allowedTransitions: "ASSESSMENT_READY" }],
    ["a task list that is not a list", { tasks: {} }],
    ["an evidence block that is not an object", { evidence: [] }],
    ["a pack count that is not a number", { packs: { packs: [], eligibleCount: "0" } }],
    ["a commercial completeness that is not a boolean", { commercial: { complete: "yes", quotes: [] } }],
    ["a quote that is not an object", { commercial: { complete: true, quotes: ["quote-1"] } }],
    ["an authorisation flag that is missing", { authorization: { membershipStatus: "verified" } }],
  ])("refuses a fact tree with %s", async (_name, overrides) => {
    rpc.mockResolvedValue(envelope(projected(A, overrides)))
    await expect(loadCaseFlowsFacts([A])).rejects.toBeInstanceOf(CaseFlowProjectionError)
  })

  it("never substitutes an empty fact tree for a tree it could not read", async () => {
    rpc.mockResolvedValue(envelope(projected(A, { tasks: null })))
    await expect(loadCaseFlows([A])).rejects.toBeInstanceOf(CaseFlowProjectionError)
  })

  it("reads a null column as the empty value the model expects", async () => {
    rpc.mockResolvedValue(envelope(projected(A, { serviceTrack: null, outcomeSummary: null, plannedNextAction: null })))
    const facts = requiredCase(await loadCaseFlowsFacts([A]), A)
    expect(facts.serviceTrack).toBe("UNDECIDED")
    expect(facts.outcomeSummary).toBe("")
    expect(facts.plannedNextAction).toBe("")
  })

  it("narrows the service track rather than trusting the column", () => {
    const narrow = (value: unknown) =>
      requiredCase(narrowCaseFlowFacts(envelope(projected(A, { serviceTrack: value })), [A], capabilities), A).serviceTrack
    expect(narrow("GUIDED")).toBe("GUIDED")
    expect(narrow("MANAGED")).toBe("MANAGED")
    expect(narrow("UNDECIDED")).toBe("UNDECIDED")
    expect(narrow(null)).toBe("UNDECIDED")
    expect(narrow("SOMETHING_NEW")).toBe("UNDECIDED")
  })

  it("does not depend on the order the database answered in", () => {
    const forwards = narrowCaseFlowFacts(envelope(projected(A), projected(B)), [A, B], capabilities)
    const backwards = narrowCaseFlowFacts(envelope(projected(B), projected(A)), [A, B], capabilities)
    expect(requiredCase(backwards, A)).toEqual(requiredCase(forwards, A))
    expect(requiredCase(backwards, B)).toEqual(requiredCase(forwards, B))
  })
})

describe("what the loader adds", () => {
  it("attaches this deployment's capabilities, which are configuration and not schema", async () => {
    rpc.mockResolvedValue(envelope(projected(A)))
    const facts = requiredCase(await loadCaseFlowsFacts([A]), A)
    expect(facts.capabilities).toEqual({
      liveMailEnabled: false,
      paymentsEnabled: expect.any(Boolean),
      googleSubmissionLive: false,
    })
    // No environment value was sent to the database to get them.
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(["p_case_ids", "p_token"])
  })

  it("resolves every fact tree with the one pure resolver, at one instant", async () => {
    rpc.mockResolvedValue(envelope(projected(A), projected(B)))
    const at = new Date("2026-06-01T12:00:00.000Z")
    const flows = await loadCaseFlows([A, B], at)
    const facts = await loadCaseFlowsFacts([A, B])

    for (const caseId of [A, B]) {
      expect(requiredCase(flows, caseId)).toEqual(resolveCaseFlow(requiredCase(facts, caseId), at.toISOString()))
    }
  })
})

describe("the single case path", () => {
  it("delegates to the batch projection", async () => {
    rpc.mockResolvedValue(envelope(projected(A)))
    const flow = await loadCaseFlow(A)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("admin_case_flow_facts_v1", { p_case_ids: [A], p_token: expect.any(String) })
    expect(flow.caseId).toBe(A)
  })

  it("loads one case's facts through the same single call", async () => {
    rpc.mockResolvedValue(envelope(projected(A)))
    expect((await loadCaseFlowFacts(A)).caseId).toBe(A)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("is a 404 for a malformed identifier, before the round trip", async () => {
    await expect(loadCaseFlow("new")).rejects.toBe(notFoundError)
    await expect(loadCaseFlowFacts("new")).rejects.toBe(notFoundError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("is a 404 for a case the projection does not know", async () => {
    rpc.mockResolvedValue(envelope())
    await expect(loadCaseFlow(A)).rejects.toBe(notFoundError)
    await expect(loadCaseFlowFacts(A)).rejects.toBe(notFoundError)
  })
})

describe("the old per-case reads", () => {
  /**
   * UX-1 composed eight reads for one case. UX-3 replaced them, and the
   * replacement is only worth anything if the old composition is gone rather
   * than merely unused: a loader left in place is a loader something will loop.
   */
  it("are not read by the case flow loader any more", async () => {
    const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("./load.ts", import.meta.url), "utf8"))
    const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    for (const legacy of [
      "admin_case_detail_v1",
      "admin_case_authorization_v1",
      "admin_evidence_case_v1",
      "admin_prepared_pack_case_v1",
      "admin_communication_list_v1",
      "admin_quote_list_v1",
      "admin_payment_list_v1",
      "admin_complaint_list_v1",
      "getCase",
      "getCaseAuthorization",
    ]) {
      expect(body).not.toContain(legacy)
    }
    expect(body).toContain("admin_case_flow_facts_v1")
  })

  it("leave exactly one projection call for one case, where there were eight reads", async () => {
    rpc.mockResolvedValue(envelope(projected(A)))
    await loadCaseFlow(A)
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["admin_case_flow_facts_v1"])
  })
})

describe("the identifier list itself", () => {
  it("keeps the caller's order so rows can be paired back", () => {
    expect(caseFlowBatchIds([C, A, B, A])).toEqual([C, A, B])
  })

  it("refuses something that is not a list of identifiers", () => {
    expect(() => caseFlowBatchIds(undefined as unknown as string[])).toThrow(CaseFlowProjectionError)
    expect(() => caseFlowBatchIds([1 as unknown as string])).toThrow(CaseFlowProjectionError)
    expect(() => caseFlowBatchIds([null as unknown as string])).toThrow(CaseFlowProjectionError)
  })

  it("counts duplicates against the caller before deduplicating them", () => {
    // Fifty-one asked for is fifty-one refused, even if they collapse to one.
    const repeated = Array.from({ length: CASE_FLOW_BATCH_LIMIT + 1 }, () => A)
    expect(() => caseFlowBatchIds(repeated)).toThrow(/at most 50/)
  })
})
