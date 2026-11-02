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

function actionLabels(card: ReturnType<typeof presentProducts>[number]) {
  return card.actions.map(action => action.label)
}

describe("product presentation", () => {
  it("describes ProfileRelaunch and Telloya without a subscription state", () => {
    const cards = presentProducts(sources())
    expect(cards.map(card => card.key)).toEqual(["profilerelaunch", "telloya"])
    expect(cards[0].services.join(" ")).toMatch(/Recovery/)
    expect(cards[0].services.join(" ")).toMatch(/Review Protection/)
    expect(cards[0].services.join(" ")).toMatch(/Relaunch Guard/)
    expect(text(cards)).not.toMatch(/\b(Active|Paid|Trial|Subscribed|Subscription)\b/)
    expect(cards.every(card => !("entitlement" in card))).toBe(true)
    const telloya = cards[1]
    expect(telloya.status).toBe("exploring")
    expect(telloya.actions).toEqual([])
    expect(telloya.unavailableReason).toBe("Telloya is not open in your portal yet.")
    expect(telloya.attention).toBeNull()
    const source = readFileSync(new URL("./present.ts", import.meta.url), "utf8")
    const view = readFileSync(new URL("../../../app/portal/products/products-view.tsx", import.meta.url), "utf8")
    expect(source).not.toContain("/portal/telloya")
    expect(source).not.toMatch(/https?:\/\//)
    expect(`${source}\n${view}`).not.toMatch(/\/checkout|stripe|createSubscription|Subscribe/)
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
    expect(ready.actions).toContainEqual({ label: "Open Recovery dashboard", href: "/portal/recovery" })
    expect(ready.context).toContain("Harbour Bakery")
    expect(ready.context).toContain("A case is not a subscription.")
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
    expect(several.context).toContain("Harbour Bakery and 2 other businesses")

    const missing = presentProducts(sources({
      recovery: { status: "unavailable" },
      guard: { status: "unavailable" },
    }))[0]
    expect(missing.status).toBe("unavailable")
    expect(missing.actions).toEqual([])
    expect(missing.attention).toBeNull()
    expect(missing.unavailableReason).toMatch(/does not say whether it has been set up/)
    expect(text([missing])).not.toMatch(/unpurchased|not purchased|Active|Not subscribed/)
  })

  it("uses the Guard projection for location context and does not invent monitoring", () => {
    const empty = presentProducts(sources())[0]
    expect(empty.actions).toContainEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(empty.context).toContain("No covered locations are on file.")
    expect(empty.context).not.toMatch(/Monitoring is recorded/)

    const quiet = presentProducts(sources({
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: false }] },
    }))[0]
    expect(quiet.context).toContain("Harbour Bakery")
    expect(quiet.context).not.toMatch(/Monitoring is recorded/)

    const recorded = presentProducts(sources({
      guard: {
        status: "ready",
        locations: [
          { businessName: "Harbour Bakery", monitoringActive: true },
          { businessName: "North Pier Cafe", monitoringActive: false },
        ],
      },
    }))[0]
    expect(recorded.context).toContain("Harbour Bakery and North Pier Cafe. Monitoring is recorded for 1 location.")

    const missing = presentProducts(sources({
      recovery: { status: "ready", dashboard: dashboard({ summary: { activeCases: 0, attentionCases: 0, previousCases: 0 }, recentCases: [] }) },
      guard: { status: "unavailable" },
    }))[0]
    expect(missing.status).toBe("exploring")
    expect(actionLabels(missing)).not.toContain("Open Relaunch Guard")
    expect(missing.unavailableReason).toMatch(/does not say whether it has been set up/)
  })

  it("leaves the existing cards unchanged when no projection is supplied", () => {
    const cards = presentProducts(sources())
    expect(cards.map(card => card.statusLabel)).toEqual([undefined, undefined])
    expect(cards[0].actions).toContainEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(cards[1].unavailableReason).toBe("Telloya is not open in your portal yet.")
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
    const telloya = cards[1]
    expect(telloya.statusLabel).toBe("Ready for provider verification")
    expect(telloya.statusLabel).not.toBe("Active")
    expect(telloya.context).toContain("High Street: Active")
    expect(telloya.context).toContain("Dock: Ready for provider verification")
    expect(telloya.actions).toEqual([])
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
    }))[1]
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
    }))[1]
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
    }))[0]
    expect(recorded.actions).toContainEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
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
    }))[0]
    expect(preview.statusLabel).toBe("Pending")
    expect(preview.statusLabel).not.toBe("Active")
    expect(preview.attention).toBe("Guard monitoring is not active from this bundle.")
    expect(preview.context).not.toMatch(/can activate/)
    expect(preview.actions).toContainEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
  })

  it("keeps known Guard monitoring open when only the extra commercial read fails", () => {
    const cards = presentProducts(sources({
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: true }] },
      commercial: {
        reads: { telloya: "unavailable", guard: "unavailable" },
        businesses: [],
      },
    }))
    const profile = cards[0]
    expect(profile.actions).toContainEqual({ label: "Open Recovery dashboard", href: "/portal/recovery" })
    expect(profile.actions).toContainEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(profile.status).toBe("open")
    expect(profile.statusLabel).toBe("Status temporarily unavailable")
    expect(profile.context).toContain("Monitoring is recorded for 1 location.")
    expect(profile.unavailableReason).toBe("Some extra details are temporarily unavailable. Monitoring already recorded is unchanged.")
    expect(text([profile])).not.toMatch(/stopped|no longer|Not subscribed/)
    expect(cards[1].statusLabel).toBe("Status temporarily unavailable")
    expect(cards[1].actions).toEqual([])
    expect(text(cards)).not.toMatch(/Not subscribed/)

    const operational = presentProducts(sources({
      guard: { status: "unavailable" },
      commercial: { reads: { telloya: "ok", guard: "unavailable" }, businesses: [] },
    }))[0]
    expect(operational.statusLabel).toBe("Status temporarily unavailable")
    expect(actionLabels(operational)).not.toContain("Open Relaunch Guard")
    expect(operational.unavailableReason).toMatch(/does not say whether it has been set up/)
    expect(text([operational])).not.toMatch(/stopped|no longer|Not subscribed/)
  })

  it("shows an accepted subscription with no locations as pending rather than purchased or absent", () => {
    const pending = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "pending", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))[1]
    expect(pending.status).toBe("exploring")
    expect(pending.statusLabel).toBe("Pending")
    expect(pending.context).toBe("Harbour Bakery: Pending.")
    expect(pending.attention).toBe("Telloya is not active yet.")
    expect(pending.actions).toEqual([])
    expect(pending.unavailableReason).toBe("There is no Telloya workspace to open yet.")
    expect(text([pending])).not.toMatch(/Not subscribed|\b(Active|Paid)\b/)

    const absent = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [],
      },
    }))[1]
    expect(absent.statusLabel).toBe("Not subscribed")
    expect(absent.actions).toEqual([{ label: "Request access", href: "https://telloya.com/enquire" }])
    expect(absent.attention).toBeNull()

    const mixed = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [
          {
            businessName: "Harbour Bakery",
            telloya: {
              status: "active",
              locations: [{ locationName: "High Street", status: "active", nextStep: null }],
            },
            guard: { status: "not_subscribed", locations: [] },
          },
          {
            businessName: "North Yard",
            telloya: { status: "pending", locations: [] },
            guard: { status: "not_subscribed", locations: [] },
          },
        ],
      },
    }))[1]
    expect(mixed.statusLabel).toBe("Pending")
    expect(mixed.statusLabel).not.toBe("Active")
    expect(mixed.context).toContain("Harbour Bakery, High Street: Active")
    expect(mixed.context).toContain("North Yard: Pending")
  })

  it("shows each customer's products from the commercial projection and does not activate the other", () => {
    const emptyRecovery = {
      status: "ready" as const,
      dashboard: dashboard({
        summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
        recentCases: [],
      }),
    }
    const profileOnly = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: {
            status: "active",
            locations: [{ locationName: "High Street", status: "active", monitoringRecorded: true, allocation: null, nextStep: null }],
          },
        }],
      },
    }))
    expect(profileOnly[0].statusLabel).toBe("Active")
    expect(profileOnly[0].context).toContain("A case is not a subscription.")
    expect(profileOnly[0].actions).toContainEqual({ label: "Open Recovery dashboard", href: "/portal/recovery" })
    expect(profileOnly[1].statusLabel).toBe("Not subscribed")
    expect(profileOnly[1].actions).toEqual([{ label: "Request access", href: "https://telloya.com/enquire" }])
    expect(text([profileOnly[1]])).not.toMatch(/\/portal\/telloya/)

    const telloyaOnly = presentProducts(sources({
      recovery: emptyRecovery,
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "active", locations: [{ locationName: "High Street", status: "active", nextStep: null }] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))
    expect(telloyaOnly[0].statusLabel).toBe("Not subscribed")
    expect(actionLabels(telloyaOnly[0])).not.toContain("Open Recovery dashboard")
    expect(telloyaOnly[0].actions).toContainEqual({ label: "Request access", href: "https://profilerelaunch.com/get-help" })
    expect(telloyaOnly[1].statusLabel).toBe("Active")
    expect(telloyaOnly[1].actions).toEqual([])
    expect(telloyaOnly[1].unavailableReason).toBe("There is no Telloya workspace to open yet.")

    const both = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "setup", locations: [{ locationName: "High Street", status: "setup", nextStep: null }] },
          guard: {
            status: "pilot",
            locations: [{ locationName: "High Street", status: "pilot", monitoringRecorded: false, allocation: null, nextStep: null }],
          },
        }],
      },
    }))
    expect(both.map(card => card.key)).toEqual(["profilerelaunch", "telloya"])
    expect(both[0].statusLabel).toBe("Pilot")
    expect(both[1].statusLabel).toBe("Setup in progress")
    expect(both[1].actions).toEqual([])

    const none = presentProducts(sources({
      recovery: emptyRecovery,
      commercial: { reads: { telloya: "ok", guard: "ok" }, businesses: [] },
    }))
    expect(none.map(card => card.statusLabel)).toEqual(["Not subscribed", "Not subscribed"])
    expect(actionLabels(none[0])).not.toContain("Open Recovery dashboard")
    expect(none[1].actions).toEqual([{ label: "Request access", href: "https://telloya.com/enquire" }])
    expect(text(none)).not.toMatch(/\/portal\/telloya|checkout/)

    const oneLocation = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: {
            status: "active",
            locations: [
              { locationName: "High Street", status: "active", monitoringRecorded: true, allocation: null, nextStep: null },
              { locationName: "Dock", status: "not_subscribed", monitoringRecorded: false, allocation: null, nextStep: null },
            ],
          },
        }],
      },
    }))[0]
    expect(oneLocation.statusLabel).toBe("Not subscribed")
    expect(oneLocation.context).toContain("High Street: Active")
    expect(oneLocation.context).toContain("Dock: Not subscribed")
  })
})
