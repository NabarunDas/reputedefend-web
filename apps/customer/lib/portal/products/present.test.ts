import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { CustomerCaseRow, CustomerDashboard } from "@/lib/portal/cases/parse"
import { presentProducts, type ProductSources } from "./present"

const submittedAt = "2026-10-08T12:00:00.000Z"

function row(overrides: Partial<CustomerCaseRow> = {}): CustomerCaseRow {
  return {
    reference: "PR-26-ABCDEF",
    caseType: "PROFILE_RECOVERY",
    serviceTrack: "GUIDED",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    status: "UNDER_REVIEW",
    workStage: "EVIDENCE_COLLECTION",
    submittedAt,
    closedAt: null,
    attentionItems: [],
    ...overrides,
  }
}

function dashboard(overrides: Partial<CustomerDashboard> = {}): CustomerDashboard {
  return {
    summary: { activeCases: 1, attentionCases: 0, previousCases: 0 },
    attentionCases: [],
    recentCases: [row()],
    ...overrides,
  }
}

function sources(overrides: Partial<ProductSources> = {}): ProductSources {
  return {
    recovery: { status: "ready", dashboard: dashboard() },
    guard: { status: "ready", locations: [] },
    ...overrides,
  }
}

function text(cards: ReturnType<typeof presentProducts>) {
  return JSON.stringify(cards)
}

describe("product presentation", () => {
  it("describes three products without a subscription state", () => {
    const cards = presentProducts(sources())
    expect(cards.map(card => card.key)).toEqual(["recovery", "guard", "telloya"])
    expect(text(cards)).not.toMatch(/\b(Active|Paid|Trial|Subscribed|Subscription)\b/)
    expect(cards.every(card => !("entitlement" in card))).toBe(true)
    const telloya = cards[2]
    expect(telloya.status).toBe("exploring")
    expect(telloya.action).toBeNull()
    expect(telloya.unavailableReason).toBe("Telloya is not open in your portal yet.")
    expect(telloya.attention).toBeNull()
    const source = readFileSync(new URL("./present.ts", import.meta.url), "utf8")
    expect(source).not.toContain("/portal/telloya")
    expect(source).not.toMatch(/https?:\/\//)
  })

  it("opens Recovery from the dashboard projection and keeps a failed read neutral", () => {
    const ready = presentProducts(sources({
      recovery: {
        status: "ready",
        dashboard: dashboard({
          summary: { activeCases: 2, attentionCases: 1, previousCases: 0 },
          attentionCases: [row()],
        }),
      },
    }))[0]
    expect(ready.status).toBe("open")
    expect(ready.action).toEqual({ label: "Open Recovery & Reviews", href: "/portal/recovery" })
    expect(ready.context).toBe("Harbour Bakery")
    expect(ready.attention).toBe("1 case needs your attention")
    expect(ready.unavailableReason).toBeNull()

    const several = presentProducts(sources({
      recovery: {
        status: "ready",
        dashboard: dashboard({
          summary: { activeCases: 3, attentionCases: 2, previousCases: 0 },
          attentionCases: [
            row({ reference: "PR-26-AAAAAA", businessName: "Harbour Bakery" }),
            row({ reference: "PR-26-BBBBBB", businessName: "North Pier Cafe" }),
          ],
          recentCases: [row({ reference: "PR-26-CCCCCC", businessName: "West Quay" })],
        }),
      },
    }))[0]
    expect(several.attention).toBe("2 cases need your attention")
    expect(several.context).toBe("Harbour Bakery and 2 other businesses")

    const missing = presentProducts(sources({ recovery: { status: "unavailable" } }))[0]
    expect(missing.status).toBe("unavailable")
    expect(missing.action).toBeNull()
    expect(missing.attention).toBeNull()
    expect(missing.unavailableReason).toMatch(/does not say whether it has been set up/)
    expect(text([missing])).not.toMatch(/unpurchased|not purchased|Active/)
  })

  it("uses the Guard projection for location context and does not invent monitoring", () => {
    const empty = presentProducts(sources())[1]
    expect(empty.action).toEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(empty.context).toBe("No covered locations are on file.")
    expect(empty.context).not.toMatch(/Monitoring is recorded/)

    const quiet = presentProducts(sources({
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: false }] },
    }))[1]
    expect(quiet.context).toBe("Harbour Bakery")
    expect(quiet.context).not.toMatch(/Monitoring is recorded/)

    const recorded = presentProducts(sources({
      guard: {
        status: "ready",
        locations: [
          { businessName: "Harbour Bakery", monitoringActive: true },
          { businessName: "North Pier Cafe", monitoringActive: false },
        ],
      },
    }))[1]
    expect(recorded.context).toBe("Harbour Bakery and North Pier Cafe. Monitoring is recorded for 1 location.")

    const missing = presentProducts(sources({ guard: { status: "unavailable" } }))[1]
    expect(missing.status).toBe("unavailable")
    expect(missing.action).toBeNull()
    expect(missing.unavailableReason).toMatch(/does not say whether it has been set up/)
  })
})
