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

  it("leaves the existing cards unchanged when no projection is supplied", () => {
    const cards = presentProducts(sources())
    expect(cards.map(card => card.statusLabel)).toEqual([undefined, undefined, undefined])
    expect(cards[1].action).toEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(cards[2].unavailableReason).toBe("Telloya is not open in your portal yet.")
    expect(text(cards)).not.toMatch(/Not subscribed|Status temporarily unavailable|Subscribe/)
  })

  it("shows Telloya location status and does not treat one live location as the whole business", () => {
    const cards = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: {
            status: "ready_for_provider",
            locations: [
              { locationName: "High Street", status: "active", nextStep: null },
              { locationName: "Dock", status: "ready_for_provider", nextStep: "This location is waiting for provider verification." },
            ],
          },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))
    const telloya = cards[2]
    expect(telloya.statusLabel).toBe("Ready for provider verification")
    expect(telloya.statusLabel).not.toBe("Active")
    expect(telloya.context).toContain("High Street: Active")
    expect(telloya.context).toContain("Dock: Ready for provider verification")
    expect(telloya.action).toBeNull()
    expect(telloya.attention).toBe("This location is waiting for provider verification.")
    expect(text([telloya])).not.toMatch(/\bPaid\b|Subscribe|\/portal\/telloya/)
  })

  it("labels a pilot as a pilot and an expired pilot as expired", () => {
    const pilot = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: {
            status: "pilot",
            locations: [{ locationName: "High Street", status: "pilot", nextStep: "This pilot is open until its approved end." }],
          },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))[2]
    expect(pilot.statusLabel).toBe("Pilot")
    expect(text([pilot])).not.toMatch(/\b(Paid|Active)\b/)

    const expired = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: {
            status: "expired",
            locations: [{ locationName: "High Street", status: "expired", nextStep: "This period has ended." }],
          },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))[2]
    expect(expired.statusLabel).toBe("Expired")
    expect(text([expired])).not.toMatch(/\bPaid\b/)
  })

  it("keeps Guard monitoring when a preview allocation is present and does not call a preview active", () => {
    const recorded = presentProducts(sources({
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: true }] },
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: {
            status: "active",
            locations: [{
              locationName: "High Street",
              status: "active",
              monitoringRecorded: true,
              allocation: "preview",
              nextStep: null,
            }],
          },
        }],
      },
    }))[1]
    expect(recorded.action).toEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(recorded.context).toContain("Monitoring is recorded for 1 location.")
    expect(recorded.context).toContain("Your existing Guard monitoring is unchanged.")
    expect(recorded.statusLabel).toBe("Active")

    const preview = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: {
            status: "pending",
            locations: [{
              locationName: "Dock",
              status: "pending",
              monitoringRecorded: false,
              allocation: "preview",
              nextStep: "Guard monitoring is not active from this bundle.",
            }],
          },
        }],
      },
    }))[1]
    expect(preview.statusLabel).toBe("Pending")
    expect(preview.statusLabel).not.toBe("Active")
    expect(preview.attention).toBe("Guard monitoring is not active from this bundle.")
    expect(preview.context).not.toMatch(/can activate/)
    expect(preview.action).toEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
  })

  it("says status is temporarily unavailable when a product read fails", () => {
    const cards = presentProducts(sources({
      commercial: {
        reads: { telloya: "unavailable", guard: "unavailable" },
        businesses: [],
      },
    }))
    expect(cards[0].action).toEqual({ label: "Open Recovery & Reviews", href: "/portal/recovery" })
    expect(cards[0].statusLabel).toBeUndefined()
    expect(cards[1].action).toEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(cards[1].statusLabel).toBe("Status temporarily unavailable")
    expect(cards[2].statusLabel).toBe("Status temporarily unavailable")
    expect(cards[2].action).toBeNull()
    expect(text(cards)).not.toMatch(/Not subscribed/)
  })
})
