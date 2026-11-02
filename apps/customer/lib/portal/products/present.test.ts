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
    expect(source).toMatch(/A case is not a subscription/)
    expect(source).toMatch(/Signing in does not start a subscription/)
    expect(source).not.toContain("/portal/telloya")
    expect(source).not.toMatch(/https?:\/\//)
    expect(view).not.toContain("A sign-in does not start a subscription")
    const enquiry = readFileSync(new URL("./enquiry.ts", import.meta.url), "utf8")
    expect(enquiry).not.toContain("telloya.com/enquire")
    expect(enquiry).toContain("mailto:")
    expect(`${source}\n${view}\n${enquiry}`).not.toMatch(/\/checkout|stripe|createSubscription|Subscribe/)
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
    expect(ready.context).not.toContain("A case is not a subscription")
    expect(ready.statusLabel).toBeUndefined()
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
    expect(telloya.statusLabel).toBe("Partially active")
    expect(telloya.statusLabel).not.toBe("Active")
    expect(telloya.statusLabel).not.toBe("Not subscribed")
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
    expect(recorded.statusLabel).toBeUndefined()
    expect(recorded.context).toContain("Relaunch Guard: Active")

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
    expect(preview.statusLabel).toBeUndefined()
    expect(preview.context).toContain("Relaunch Guard: Pending")
    expect(preview.context).not.toContain("Relaunch Guard: Active")
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
    expect(profile.statusLabel).toBeUndefined()
    expect(profile.context).toContain("Relaunch Guard: Status temporarily unavailable.")
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
    expect(operational.statusLabel).toBeUndefined()
    expect(operational.context).toContain("Relaunch Guard: Status temporarily unavailable.")
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
    expect(absent.actions).toEqual([{ label: "Email us about Telloya", href: "mailto:contact@profilerelaunch.com" }])
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
    expect(mixed.statusLabel).toBe("Partially active")
    expect(mixed.statusLabel).not.toBe("Active")
    expect(mixed.statusLabel).not.toBe("Pending")
    expect(mixed.statusLabel).not.toBe("Not subscribed")
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
    expect(profileOnly[0].statusLabel).toBeUndefined()
    expect(profileOnly[0].context).toContain("Relaunch Guard: Active")
    expect(profileOnly[0].context).not.toContain("A case is not a subscription")
    expect(profileOnly[0].actions).toContainEqual({ label: "Open Recovery dashboard", href: "/portal/recovery" })
    expect(profileOnly[1].statusLabel).toBe("Not subscribed")
    expect(profileOnly[1].actions).toEqual([{ label: "Email us about Telloya", href: "mailto:contact@profilerelaunch.com" }])
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
    expect(telloyaOnly[0].statusLabel).toBeUndefined()
    expect(telloyaOnly[0].context).toContain("Relaunch Guard: Not subscribed")
    expect(actionLabels(telloyaOnly[0])).not.toContain("Open Recovery dashboard")
    expect(telloyaOnly[0].actions).toContainEqual({ label: "Enquire about Relaunch Guard", href: "https://profilerelaunch.com/get-help" })
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
    expect(both[0].statusLabel).toBeUndefined()
    expect(both[0].context).toContain("Relaunch Guard: Pilot")
    expect(both[1].statusLabel).toBe("Setup in progress")
    expect(both[1].actions).toEqual([])

    const none = presentProducts(sources({
      recovery: emptyRecovery,
      commercial: { reads: { telloya: "ok", guard: "ok" }, businesses: [] },
    }))
    expect(none[0].statusLabel).toBeUndefined()
    expect(none[0].context).toContain("Relaunch Guard: Not subscribed")
    expect(none[1].statusLabel).toBe("Not subscribed")
    expect(actionLabels(none[0])).not.toContain("Open Recovery dashboard")
    expect(none[1].actions).toEqual([{ label: "Email us about Telloya", href: "mailto:contact@profilerelaunch.com" }])
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
    expect(oneLocation.statusLabel).toBeUndefined()
    expect(oneLocation.context).toContain("Relaunch Guard: Partially active")
    expect(oneLocation.context).not.toContain("Relaunch Guard: Not subscribed")
    expect(oneLocation.context).not.toContain("Relaunch Guard: Active.")
    expect(oneLocation.context).toContain("High Street: Active")
    expect(oneLocation.context).toContain("Dock: Not subscribed")
    expect(actionLabels(oneLocation)).not.toContain("Enquire about Relaunch Guard")
  })

  it("keeps Recovery open when Guard is not subscribed and does not drop a business that has no location rows", () => {
    const recoveryOnly = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))[0]
    expect(recoveryOnly.statusLabel).toBeUndefined()
    expect(recoveryOnly.actions).toContainEqual({ label: "Open Recovery dashboard", href: "/portal/recovery" })
    expect(recoveryOnly.context).toContain("Relaunch Guard: Not subscribed")
    expect(recoveryOnly.context).not.toMatch(/^Not subscribed/)
    expect(text([recoveryOnly])).not.toMatch(/"statusLabel":"Not subscribed"/)

    const mixedBusinesses = presentProducts(sources({
      recovery: {
        status: "ready",
        dashboard: dashboard({ summary: { activeCases: 0, attentionCases: 0, previousCases: 0 }, recentCases: [] }),
      },
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [
          {
            businessName: "Harbour Bakery",
            telloya: { status: "active", locations: [{ locationName: "High Street", status: "active", nextStep: null }] },
            guard: {
              status: "active",
              locations: [{ locationName: "High Street", status: "active", monitoringRecorded: true, allocation: null, nextStep: null }],
            },
          },
          {
            businessName: "North Yard",
            telloya: { status: "not_subscribed", locations: [] },
            guard: { status: "not_subscribed", locations: [] },
          },
        ],
      },
    }))
    expect(mixedBusinesses[0].statusLabel).toBeUndefined()
    expect(mixedBusinesses[0].context).toContain("Relaunch Guard: Partially active")
    expect(mixedBusinesses[0].context).toContain("Harbour Bakery, High Street: Active")
    expect(mixedBusinesses[0].context).toContain("North Yard: Not subscribed")
    expect(mixedBusinesses[1].statusLabel).toBe("Partially active")
    expect(mixedBusinesses[1].statusLabel).not.toBe("Active")
    expect(mixedBusinesses[1].statusLabel).not.toBe("Not subscribed")
    expect(mixedBusinesses[1].context).toContain("Harbour Bakery, High Street: Active")
    expect(mixedBusinesses[1].context).toContain("North Yard: Not subscribed")
    expect(mixedBusinesses[1].actions).toEqual([])

    const varies = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: {
            status: "pending",
            locations: [
              { locationName: "High Street", status: "pending", nextStep: null },
              { locationName: "Dock", status: "setup", nextStep: null },
            ],
          },
          guard: {
            status: "pending",
            locations: [
              { locationName: "High Street", status: "pending", monitoringRecorded: false, allocation: null, nextStep: null },
              { locationName: "Dock", status: "not_subscribed", monitoringRecorded: false, allocation: null, nextStep: null },
            ],
          },
        }],
      },
    }))
    expect(varies[0].context).toContain("Relaunch Guard: Status varies by location")
    expect(varies[0].context).toContain("High Street: Pending")
    expect(varies[0].context).toContain("Dock: Not subscribed")
    expect(varies[1].statusLabel).toBe("Status varies by location")
    expect(varies[1].context).toContain("High Street: Pending")
    expect(varies[1].context).toContain("Dock: Setup in progress")
  })
})
