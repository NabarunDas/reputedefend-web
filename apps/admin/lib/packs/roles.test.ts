import { describe, expect, it } from "vitest"
import type { PreparedPack } from "./model"
import { currentWorkingPack, guidedPackRoleMessages, packRoleLabel } from "./roles"

function pack(overrides: Partial<PreparedPack>): PreparedPack {
  return {
    id: overrides.id ?? "pack",
    packNumber: overrides.packNumber ?? 1,
    status: overrides.status ?? "DRAFT",
    approvalNote: "",
    createdAt: overrides.createdAt ?? "2026-10-01T00:00:00.000Z",
    approvedAt: null,
    recordVersion: 1,
    items: overrides.items ?? [],
    ...overrides,
  }
}

describe("guided pack roles", () => {
  it("names the three roles and leaves an empty choice unnamed", () => {
    expect(packRoleLabel("DELIVERABLE")).toBe("Completed statement")
    expect(packRoleLabel("INSTRUCTIONS")).toBe("Customer submission instructions")
    expect(packRoleLabel("EVIDENCE")).toBe("Supporting evidence")
    expect(packRoleLabel(null)).toBeNull()
    expect(packRoleLabel(undefined)).toBeNull()
  })

  it("states the exact missing and duplicated Guided roles", () => {
    expect(guidedPackRoleMessages([
      { role: "DELIVERABLE" },
      { role: "DELIVERABLE" },
      { role: "DELIVERABLE" },
      { role: "DELIVERABLE" },
      { role: "DELIVERABLE" },
    ])).toEqual([
      "5 completed statements; exactly 1 required",
      "0 customer submission instructions; exactly 1 required",
    ])
    expect(guidedPackRoleMessages([
      { role: "DELIVERABLE" },
      { role: "EVIDENCE" },
      { role: "EVIDENCE" },
      { role: "EVIDENCE" },
    ])).toEqual(["0 customer submission instructions; exactly 1 required"])
    expect(guidedPackRoleMessages([
      { role: "DELIVERABLE" },
      { role: "INSTRUCTIONS" },
      { role: "EVIDENCE" },
      { role: null },
    ])).toEqual(["1 file has no role"])
    expect(guidedPackRoleMessages([
      { role: "DELIVERABLE" },
      { role: "INSTRUCTIONS" },
      { role: "EVIDENCE" },
      { role: "EVIDENCE" },
      { role: "EVIDENCE" },
    ])).toEqual([])
  })

  it("uses the latest pack that has not been superseded", () => {
    const approved = pack({ id: "approved", packNumber: 1, status: "APPROVED", createdAt: "2026-10-01T00:00:00.000Z" })
    const published = pack({ id: "published", packNumber: 2, status: "APPROVED", published: true, createdAt: "2026-10-02T00:00:00.000Z" })
    const draft = pack({ id: "draft", packNumber: 3, status: "DRAFT", createdAt: "2026-10-03T00:00:00.000Z" })
    const stale = pack({ id: "stale", packNumber: 4, status: "STALE", createdAt: "2026-10-04T00:00:00.000Z" })
    expect(currentWorkingPack([approved, published, draft])?.id).toBe("draft")
    expect(currentWorkingPack([approved, published])?.id).toBe("published")
    expect(currentWorkingPack([approved, stale])?.id).toBe("stale")
    expect(currentWorkingPack([published, stale])?.id).toBe("stale")
    expect(currentWorkingPack([
      pack({ id: "first", packNumber: 1, status: "SUPERSEDED" }),
      pack({ id: "second", packNumber: 2, status: "SUPERSEDED" }),
    ])?.id).toBe("second")
    expect(currentWorkingPack([])).toBeNull()
  })
})
