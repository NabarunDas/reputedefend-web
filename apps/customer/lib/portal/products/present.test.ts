import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { CustomerCaseRow, CustomerDashboard } from "@/lib/portal/cases/parse"
import type { OnboardingRequestView } from "@/lib/portal/onboarding/types"
import { presentProducts, type ProductCard, type ProductKey, type ProductSources } from "./present"

const submittedAt = "2026-10-08T12:00:00.000Z"
const assessment = { label: "Start an assessment", href: "https://profilerelaunch.com/get-help" }
const guardEnquiry = { label: "Enquire about Relaunch Guard", href: "https://profilerelaunch.com/get-help" }
const telloyaEmail = { label: "Email us about Telloya", href: "mailto:contact@profilerelaunch.com" }
const openRecovery = { label: "Open dashboard", href: "/portal/recovery" }
const openGuard = { label: "Open dashboard", href: "/portal/guard" }

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

const emptyRecovery = {
  status: "ready" as const,
  dashboard: dashboard({
    summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
    recentCases: [],
  }),
}

function sources(overrides: Partial<ProductSources> = {}): ProductSources {
  return {
    recovery: { status: "ready", dashboard: dashboard() },
    guard: { status: "ready", locations: [] },
    ...overrides,
  }
}

function text(cards: readonly ProductCard[]) {
  return JSON.stringify(cards)
}

function tile(cards: readonly ProductCard[], key: ProductKey) {
  const found = cards.find(card => card.key === key)
  if (!found) throw new Error(key)
  return found
}

function labels(card: ProductCard) {
  return card.actions.map(action => action.label)
}

describe("product launcher", () => {
  it("lists three services and does not treat a sign-in or a case as a subscription", () => {
    const cards = presentProducts(sources())
    expect(cards.map(card => card.key)).toEqual(["recovery", "guard", "telloya"])
    expect(cards.map(card => card.name)).toEqual(["Recovery & Review Support", "Relaunch Guard", "Telloya"])
    expect(tile(cards, "recovery").group).toBe("yours")
    expect(tile(cards, "recovery").actions).toEqual([openRecovery])
    expect(tile(cards, "guard").group).toBe("explore")
    expect(tile(cards, "guard").actions).toEqual([guardEnquiry])
    expect(tile(cards, "guard").statusLabel).toBeUndefined()
    expect(tile(cards, "telloya").group).toBe("explore")
    expect(tile(cards, "telloya").actions).toEqual([telloyaEmail])
    expect(tile(cards, "telloya").unavailableReason).toBe("Telloya is not open in your portal yet.")
    expect(text(cards)).not.toMatch(/\b(Active|Paid|Trial|Subscribed|Not subscribed)\b/)
    expect(text(cards)).not.toContain("/portal/telloya")
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

  it("opens Recovery only when a case exists and offers the assessment otherwise", () => {
    const ready = tile(presentProducts(sources({
      recovery: {
        status: "ready",
        dashboard: dashboard({
          summary: { activeCases: 2, attentionCases: 1, previousCases: 0 },
          attentionCases: [row()],
        }),
      },
    })), "recovery")
    expect(ready.group).toBe("yours")
    expect(ready.actions).toEqual([openRecovery])
    expect(ready.context).toContain("Harbour Bakery")
    expect(ready.context).not.toContain("A case is not a subscription")
    expect(ready.statusLabel).toBe("Cases open")
    expect(ready.attention).toBe("1 case needs your attention")

    const several = tile(presentProducts(sources({
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
    })), "recovery")
    expect(several.attention).toBe("2 cases need your attention")
    expect(several.context).toContain("Harbour Bakery and 2 other businesses")

    const none = tile(presentProducts(sources({ recovery: emptyRecovery })), "recovery")
    expect(none.group).toBe("explore")
    expect(none.actions).toEqual([assessment])
    expect(none.statusLabel).toBeUndefined()
    expect(none.context).toBe("No cases are open on this account.")
    expect(labels(none)).not.toContain("Open dashboard")

    const missing = tile(presentProducts(sources({
      recovery: { status: "unavailable" },
      guard: { status: "unavailable" },
    })), "recovery")
    expect(missing.group).toBe("unconfirmed")
    expect(missing.actions).toEqual([])
    expect(missing.statusLabel).toBe("Status temporarily unavailable")
    expect(missing.unavailableReason).toMatch(/does not say whether it has been set up/)
    expect(text([missing])).not.toMatch(/unpurchased|not purchased|Active|Not subscribed/)
  })

  it("does not open Guard just because the monitoring query succeeds", () => {
    const empty = tile(presentProducts(sources()), "guard")
    expect(empty.group).toBe("explore")
    expect(empty.actions).toEqual([guardEnquiry])
    expect(empty.context).toContain("No covered locations are on file.")
    expect(empty.context).not.toMatch(/Monitoring is recorded/)
    expect(empty.statusLabel).toBeUndefined()

    const quiet = tile(presentProducts(sources({
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: false }] },
    })), "guard")
    expect(quiet.actions).toEqual([guardEnquiry])
    expect(quiet.context).toContain("Harbour Bakery")
    expect(quiet.context).not.toMatch(/Monitoring is recorded/)

    const recorded = tile(presentProducts(sources({
      guard: {
        status: "ready",
        locations: [
          { businessName: "Harbour Bakery", monitoringActive: true },
          { businessName: "North Pier Cafe", monitoringActive: false },
        ],
      },
    })), "guard")
    expect(recorded.group).toBe("yours")
    expect(recorded.actions).toEqual([openGuard])
    expect(recorded.statusLabel).toBeUndefined()
    expect(recorded.context).toContain("Harbour Bakery and North Pier Cafe. Monitoring is recorded for 1 location.")

    const missing = presentProducts(sources({
      recovery: emptyRecovery,
      guard: { status: "unavailable" },
    }))
    expect(tile(missing, "guard").group).toBe("unconfirmed")
    expect(tile(missing, "guard").actions).toEqual([])
    expect(tile(missing, "guard").statusLabel).toBe("Status temporarily unavailable")
    expect(tile(missing, "recovery").actions).toEqual([assessment])
  })

  it("leaves commercial labels off when no projection is supplied", () => {
    const cards = presentProducts(sources())
    expect(cards.map(card => card.statusLabel)).toEqual(["Cases open", undefined, undefined])
    expect(tile(cards, "telloya").actions).toEqual([telloyaEmail])
    expect(tile(cards, "telloya").unavailableReason).toBe("Telloya is not open in your portal yet.")
    expect(text(cards)).not.toMatch(/Not subscribed|Status temporarily unavailable|Subscribe/)
  })

  it("puts Telloya with a recorded state under Your services and still withholds a dashboard", () => {
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
    const telloya = tile(cards, "telloya")
    expect(telloya.group).toBe("yours")
    expect(telloya.statusLabel).toBe("Partially active")
    expect(telloya.statusLabel).not.toBe("Active")
    expect(telloya.statusLabel).not.toBe("Not subscribed")
    expect(telloya.context).toContain("High Street: Active")
    expect(telloya.context).toContain("Dock: Ready for provider verification")
    expect(telloya.actions).toEqual([])
    expect(telloya.unavailableReason).toBe("There is no Telloya workspace to open yet.")
    expect(telloya.attention).toBe("This location is waiting for provider verification.")
    expect(text([telloya])).not.toMatch(/\bPaid\b|Subscribe|\/portal\/telloya/)
    expect(tile(cards, "guard").group).toBe("explore")
    expect(tile(cards, "guard").statusLabel).toBe("Not subscribed")
    expect(tile(cards, "guard").actions).toEqual([guardEnquiry])
  })

  it("labels a pilot as a pilot and an expired pilot as expired", () => {
    const pilot = tile(presentProducts(sources({
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
    })), "telloya")
    expect(pilot.group).toBe("yours")
    expect(pilot.statusLabel).toBe("Pilot")
    expect(pilot.actions).toEqual([])
    expect(text([pilot])).not.toMatch(/\b(Paid|Active)\b/)

    const expired = tile(presentProducts(sources({
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
    })), "telloya")
    expect(expired.statusLabel).toBe("Expired")
    expect(expired.actions).toEqual([])
    expect(text([expired])).not.toMatch(/\bPaid\b/)
  })

  it("keeps recorded Guard monitoring open and does not call a preview active", () => {
    const recorded = tile(presentProducts(sources({
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
    })), "guard")
    expect(recorded.group).toBe("yours")
    expect(recorded.actions).toEqual([openGuard])
    expect(recorded.statusLabel).toBe("Active")
    expect(recorded.context).toContain("Monitoring is recorded for 1 location.")
    expect(recorded.context).toContain("Your existing Guard monitoring is unchanged.")
    expect(recorded.context).toContain("High Street: Active")

    const preview = tile(presentProducts(sources({
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
    })), "guard")
    expect(preview.group).toBe("yours")
    expect(preview.statusLabel).toBe("Pending")
    expect(preview.context).not.toContain("Active")
    expect(preview.attention).toBe("Guard monitoring is not active from this bundle.")
    expect(preview.context).not.toMatch(/can activate/)
    expect(preview.actions).toEqual([])
  })

  it("keeps known Guard monitoring open when only the extra commercial read fails", () => {
    const cards = presentProducts(sources({
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: true }] },
      commercial: {
        reads: { telloya: "unavailable", guard: "unavailable" },
        businesses: [],
      },
    }))
    const recovery = tile(cards, "recovery")
    const guard = tile(cards, "guard")
    expect(recovery.actions).toEqual([openRecovery])
    expect(guard.group).toBe("yours")
    expect(guard.actions).toEqual([openGuard])
    expect(guard.statusLabel).toBeUndefined()
    expect(guard.context).toContain("Status temporarily unavailable.")
    expect(guard.context).toContain("Monitoring is recorded for 1 location.")
    expect(guard.unavailableReason).toBe("Some extra details are temporarily unavailable. Monitoring already recorded is unchanged.")
    expect(text([guard])).not.toMatch(/stopped|no longer|Not subscribed/)
    expect(tile(cards, "telloya").group).toBe("unconfirmed")
    expect(tile(cards, "telloya").statusLabel).toBe("Status temporarily unavailable")
    expect(tile(cards, "telloya").actions).toEqual([])
    expect(text(cards)).not.toMatch(/Not subscribed/)

    const operational = presentProducts(sources({
      guard: { status: "unavailable" },
      commercial: { reads: { telloya: "ok", guard: "unavailable" }, businesses: [] },
    }))
    expect(tile(operational, "guard").group).toBe("unconfirmed")
    expect(tile(operational, "guard").statusLabel).toBe("Status temporarily unavailable")
    expect(tile(operational, "guard").actions).toEqual([])
    expect(tile(operational, "guard").unavailableReason).toMatch(/does not say whether it has been set up/)
    expect(text([tile(operational, "guard")])).not.toMatch(/stopped|no longer|Not subscribed/)
  })

  it("shows an accepted Telloya subscription with no locations as pending and withholds a dashboard", () => {
    const pending = tile(presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "pending", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    })), "telloya")
    expect(pending.group).toBe("yours")
    expect(pending.statusLabel).toBe("Pending")
    expect(pending.context).toBe("Harbour Bakery: Pending.")
    expect(pending.attention).toBe("Telloya is not active yet.")
    expect(pending.actions).toEqual([])
    expect(pending.unavailableReason).toBe("There is no Telloya workspace to open yet.")
    expect(text([pending])).not.toMatch(/Not subscribed|\b(Active|Paid)\b/)

    const absent = tile(presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [],
      },
    })), "telloya")
    expect(absent.group).toBe("explore")
    expect(absent.statusLabel).toBe("Not subscribed")
    expect(absent.actions).toEqual([telloyaEmail])
    expect(absent.attention).toBeNull()

    const mixed = tile(presentProducts(sources({
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
    })), "telloya")
    expect(mixed.group).toBe("yours")
    expect(mixed.statusLabel).toBe("Partially active")
    expect(mixed.statusLabel).not.toBe("Active")
    expect(mixed.statusLabel).not.toBe("Pending")
    expect(mixed.statusLabel).not.toBe("Not subscribed")
    expect(mixed.context).toContain("Harbour Bakery, High Street: Active")
    expect(mixed.context).toContain("North Yard: Pending")
    expect(mixed.actions).toEqual([])
  })

  it("groups each account from its own cases and commercial rows", () => {
    const recoveryOnly = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))
    expect(tile(recoveryOnly, "recovery").group).toBe("yours")
    expect(tile(recoveryOnly, "recovery").actions).toEqual([openRecovery])
    expect(tile(recoveryOnly, "recovery").statusLabel).not.toBe("Not subscribed")
    expect(tile(recoveryOnly, "guard").group).toBe("explore")
    expect(tile(recoveryOnly, "guard").statusLabel).toBe("Not subscribed")
    expect(tile(recoveryOnly, "guard").actions).toEqual([guardEnquiry])
    expect(tile(recoveryOnly, "telloya").group).toBe("explore")
    expect(tile(recoveryOnly, "telloya").actions).toEqual([telloyaEmail])

    const telloyaOnly = presentProducts(sources({
      recovery: emptyRecovery,
      guard: { status: "ready", locations: [] },
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "active", locations: [{ locationName: "High Street", status: "active", nextStep: null }] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
    }))
    expect(tile(telloyaOnly, "telloya").group).toBe("yours")
    expect(tile(telloyaOnly, "telloya").statusLabel).toBe("Active")
    expect(tile(telloyaOnly, "telloya").actions).toEqual([])
    expect(tile(telloyaOnly, "guard").group).toBe("explore")
    expect(tile(telloyaOnly, "recovery").group).toBe("explore")
    expect(tile(telloyaOnly, "recovery").actions).toEqual([assessment])
    expect(text([tile(telloyaOnly, "telloya")])).not.toContain("/portal/telloya")

    const guardOnly = presentProducts(sources({
      recovery: emptyRecovery,
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
    expect(tile(guardOnly, "guard").group).toBe("yours")
    expect(tile(guardOnly, "guard").statusLabel).toBe("Active")
    expect(tile(guardOnly, "guard").actions).toEqual([openGuard])
    expect(tile(guardOnly, "recovery").group).toBe("explore")
    expect(tile(guardOnly, "telloya").group).toBe("explore")

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
    expect(tile(both, "recovery").group).toBe("yours")
    expect(tile(both, "telloya").group).toBe("yours")
    expect(tile(both, "telloya").statusLabel).toBe("Setup in progress")
    expect(tile(both, "telloya").actions).toEqual([])
    expect(tile(both, "guard").group).toBe("yours")
    expect(tile(both, "guard").statusLabel).toBe("Pilot")
    expect(tile(both, "guard").actions).toEqual([])

    const none = presentProducts(sources({
      recovery: emptyRecovery,
      guard: { status: "ready", locations: [] },
      commercial: { reads: { telloya: "ok", guard: "ok" }, businesses: [] },
    }))
    expect(none.every(card => card.group === "explore")).toBe(true)
    expect(tile(none, "guard").statusLabel).toBe("Not subscribed")
    expect(tile(none, "telloya").statusLabel).toBe("Not subscribed")
    expect(tile(none, "recovery").actions).toEqual([assessment])
    expect(tile(none, "guard").actions).toEqual([guardEnquiry])
    expect(labels(tile(none, "guard"))).not.toContain("Open dashboard")
    expect(text(none)).not.toMatch(/\/portal\/telloya|checkout/)
  })

  it("keeps one active location from speaking for every location", () => {
    const mixed = tile(presentProducts(sources({
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
    })), "guard")
    expect(mixed.group).toBe("yours")
    expect(mixed.statusLabel).toBe("Partially active")
    expect(mixed.statusLabel).not.toBe("Active")
    expect(mixed.statusLabel).not.toBe("Not subscribed")
    expect(mixed.context).toContain("High Street: Active")
    expect(mixed.context).toContain("Dock: Not subscribed")
    expect(mixed.actions).toEqual([openGuard])

    const businesses = presentProducts(sources({
      recovery: emptyRecovery,
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
    expect(tile(businesses, "guard").statusLabel).toBe("Partially active")
    expect(tile(businesses, "guard").context).toContain("Harbour Bakery, High Street: Active")
    expect(tile(businesses, "guard").context).toContain("North Yard: Not subscribed")
    expect(tile(businesses, "telloya").statusLabel).toBe("Partially active")
    expect(tile(businesses, "telloya").statusLabel).not.toBe("Active")
    expect(tile(businesses, "telloya").context).toContain("North Yard: Not subscribed")
    expect(tile(businesses, "telloya").actions).toEqual([])

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
    expect(tile(varies, "guard").group).toBe("yours")
    expect(tile(varies, "guard").statusLabel).toBe("Status varies by location")
    expect(tile(varies, "guard").actions).toEqual([])
    expect(tile(varies, "guard").context).toContain("High Street: Pending")
    expect(tile(varies, "guard").context).toContain("Dock: Not subscribed")
    expect(tile(varies, "telloya").statusLabel).toBe("Status varies by location")
    expect(tile(varies, "telloya").context).toContain("Dock: Setup in progress")
  })

  it("does not open Guard when coverage is recorded but the workspace read failed", () => {
    const guard = tile(presentProducts(sources({
      guard: { status: "unavailable" },
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: { status: "active", locations: [] },
        }],
      },
    })), "guard")
    expect(guard.group).toBe("yours")
    expect(guard.statusLabel).toBe("Active")
    expect(guard.actions).toEqual([])
    expect(guard.unavailableReason).toMatch(/does not say whether coverage has changed/)
  })

  it("shows a Telloya or Complete request without replacing Recovery, Guard, or a real entitlement", () => {
    const progress = (overrides: Partial<OnboardingRequestView> = {}): OnboardingRequestView => ({
      product: "Telloya",
      stage: "under_review",
      statusLabel: "Request in progress",
      waitingFor: "us",
      customerActionRequired: false,
      businessName: "Harbour Bakery",
      locations: ["High Street"],
      completed: ["Request received", "Under review"],
      nextStep: "We are reviewing this request.",
      receivedAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-01T09:30:00.000Z",
      ...overrides,
    })
    const commercial = {
      reads: { telloya: "ok" as const, guard: "ok" as const },
      businesses: [{
        businessName: "Harbour Bakery",
        telloya: { status: "not_subscribed" as const, locations: [] },
        guard: { status: "not_subscribed" as const, locations: [] },
      }],
    }
    const shown = presentProducts(sources({
      commercial,
      onboarding: { status: "ready", requests: [progress()] },
    }))
    expect(tile(shown, "recovery").actions).toEqual([openRecovery])
    expect(tile(shown, "guard").statusLabel).toBe("Not subscribed")
    expect(tile(shown, "guard").actions).toEqual([guardEnquiry])
    expect(tile(shown, "telloya").group).toBe("yours")
    expect(tile(shown, "telloya").statusLabel).toBe("Request in progress")
    expect(tile(shown, "telloya").actions).toEqual([{ label: "Track setup", href: "/portal/onboarding" }])
    expect(tile(shown, "telloya").context).toContain("Harbour Bakery")
    expect(text(shown)).not.toContain("/portal/telloya")
    expect(tile(shown, "telloya").actions.map(action => action.label)).not.toContain("Open dashboard")

    const complete = presentProducts(sources({
      commercial,
      onboarding: { status: "ready", requests: [progress({ product: "Complete", statusLabel: "Offer being prepared", stage: "offer_preparation" })] },
    }))
    expect(tile(complete, "telloya").statusLabel).toBe("Offer being prepared")
    expect(tile(complete, "telloya").context).toContain("Complete for Harbour Bakery")
    expect(tile(complete, "guard").statusLabel).toBe("Not subscribed")
    expect(tile(complete, "guard").actions).toEqual([guardEnquiry])

    const both = presentProducts(sources({
      commercial,
      onboarding: {
        status: "ready",
        requests: [
          progress({ businessName: null, locations: null, statusLabel: "Awaiting verification" }),
          progress({
            product: "Complete",
            businessName: "North Yard",
            statusLabel: "Offer being prepared",
            receivedAt: "2026-11-02T09:00:00.000Z",
          }),
        ],
      },
    }))
    expect(tile(both, "telloya").statusLabel).toBe("Status varies by request")
    expect(tile(both, "telloya").context).toContain("Telloya: Awaiting verification")
    expect(tile(both, "telloya").context).toContain("Complete for North Yard: Offer being prepared")
    expect(tile(both, "telloya").context?.indexOf("Awaiting verification")).toBeLessThan(tile(both, "telloya").context?.indexOf("North Yard") ?? 0)

    const active = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "active", locations: [{ locationName: "High Street", status: "active", nextStep: null }] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
      onboarding: { status: "ready", requests: [progress({ stage: "ready", statusLabel: "Ready for use" })] },
    }))
    expect(tile(active, "telloya").statusLabel).toBe("Active")
    expect(tile(active, "telloya").actions).toEqual([{ label: "View progress", href: "/portal/onboarding" }])
    expect(tile(active, "telloya").actions.map(action => action.label)).not.toContain("Open dashboard")

    const missed = presentProducts(sources({ commercial, onboarding: { status: "unavailable" } }))
    expect(tile(missed, "telloya").statusLabel).toBe("Status temporarily unavailable")
    expect(tile(missed, "telloya").statusLabel).not.toBe("Not subscribed")
    expect(tile(missed, "telloya").actions).toEqual([])

    const closed = presentProducts(sources({ onboarding: { status: "unavailable" } }))
    expect(tile(closed, "telloya").statusLabel).toBe("Status temporarily unavailable")
    expect(tile(closed, "telloya").statusLabel).not.toBe("Not subscribed")
    expect(text([tile(closed, "telloya")])).not.toMatch(/\bActive\b/)

    const unknownService = presentProducts(sources({
      commercial: { reads: { telloya: "unavailable", guard: "ok" }, businesses: [] },
      onboarding: { status: "ready", requests: [progress({ businessName: null, locations: null, statusLabel: "Awaiting verification" })] },
    }))
    expect(tile(unknownService, "telloya").statusLabel).toBe("Awaiting verification")
    expect(tile(unknownService, "telloya").statusLabel).not.toBe("Not subscribed")
    expect(tile(unknownService, "telloya").statusLabel).not.toBe("Active")
    expect(tile(unknownService, "telloya").actions).toEqual([{ label: "Track setup", href: "/portal/onboarding" }])
  })

  it("keeps a closed request out of Your services and does not infer Active", () => {
    const progress = (overrides: Partial<OnboardingRequestView> = {}): OnboardingRequestView => ({
      product: "Telloya",
      stage: "closed",
      statusLabel: "Request closed",
      waitingFor: "us",
      customerActionRequired: false,
      businessName: "Harbour Bakery",
      locations: ["High Street"],
      completed: ["Request received"],
      nextStep: "This request is closed.",
      receivedAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-01T09:30:00.000Z",
      ...overrides,
    })
    const commercial = {
      reads: { telloya: "ok" as const, guard: "ok" as const },
      businesses: [{
        businessName: "Harbour Bakery",
        telloya: { status: "not_subscribed" as const, locations: [] },
        guard: { status: "not_subscribed" as const, locations: [] },
      }],
    }
    const closed = presentProducts(sources({
      commercial,
      onboarding: { status: "ready", requests: [progress({ stage: "declined" })] },
    }))
    expect(tile(closed, "telloya").group).toBe("explore")
    expect(tile(closed, "telloya").statusLabel).toBe("Not subscribed")
    expect(tile(closed, "telloya").actions).toEqual([
      telloyaEmail,
      { label: "View previous request", href: "/portal/onboarding" },
    ])
    expect(tile(closed, "telloya").context).toContain("Request closed")
    expect(tile(closed, "guard").statusLabel).toBe("Not subscribed")
    expect(tile(closed, "guard").actions).toEqual([guardEnquiry])

    const mixed = presentProducts(sources({
      commercial,
      onboarding: {
        status: "ready",
        requests: [
          progress(),
          progress({
            stage: "under_review",
            statusLabel: "Request in progress",
            businessName: "North Yard",
            receivedAt: "2026-11-02T09:00:00.000Z",
          }),
        ],
      },
    }))
    expect(tile(mixed, "telloya").group).toBe("yours")
    expect(tile(mixed, "telloya").statusLabel).toBe("Request in progress")
    expect(tile(mixed, "telloya").statusLabel).not.toBe("Active")
    expect(tile(mixed, "telloya").context).not.toContain("Request closed")
    expect(tile(mixed, "telloya").actions).toEqual([{ label: "Track setup", href: "/portal/onboarding" }])

    const setup = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "setup", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
      onboarding: { status: "ready", requests: [progress()] },
    }))
    expect(tile(setup, "telloya").statusLabel).toBe("Setup in progress")
    expect(tile(setup, "telloya").actions).toEqual([{ label: "View previous request", href: "/portal/onboarding" }])

    const claimed = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "not_subscribed", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
      onboarding: { status: "ready", requests: [progress({ stage: "ready", statusLabel: "Active" })] },
    }))
    expect(tile(claimed, "telloya").statusLabel).toBe("Request in progress")
    expect(tile(claimed, "telloya").statusLabel).not.toBe("Active")

    const pilot = presentProducts(sources({
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "pilot", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      },
      onboarding: { status: "unavailable" },
    }))
    expect(tile(pilot, "telloya").statusLabel).toBe("Pilot")
    expect(tile(pilot, "telloya").group).toBe("yours")

    const missed = presentProducts(sources({
      commercial,
      onboarding: { status: "unavailable" },
    }))
    expect(tile(missed, "telloya").statusLabel).toBe("Status temporarily unavailable")
    expect(tile(missed, "telloya").statusLabel).not.toBe("Not subscribed")
    expect(tile(missed, "telloya").statusLabel).not.toBe("Active")
    expect(tile(missed, "telloya").group).toBe("unconfirmed")
  })
})
