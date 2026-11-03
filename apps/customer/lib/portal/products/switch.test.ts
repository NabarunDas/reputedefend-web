import { describe, expect, it } from "vitest"
import { presentProducts } from "./present"
import { currentProductKey, productSwitchChoices } from "./switch"

const submittedAt = "2026-10-08T12:00:00.000Z"

function dashboard(activeCases: number) {
  return {
    summary: { activeCases, attentionCases: 0, previousCases: 0 },
    attentionCases: [],
    recentCases: activeCases > 0 ? [{
      reference: "PR-26-ABCDEF",
      caseType: "PROFILE_RECOVERY" as const,
      serviceTrack: "GUIDED" as const,
      businessName: "Harbour Bakery",
      locationName: "High Street",
      status: "UNDER_REVIEW" as const,
      workStage: "EVIDENCE_COLLECTION" as const,
      submittedAt,
      closedAt: null,
      attentionItems: [],
    }] : [],
  }
}

describe("product switch choices", () => {
  it("opens only the workspaces the launcher would open", () => {
    const choices = productSwitchChoices(presentProducts({
      recovery: { status: "ready", dashboard: dashboard(1) },
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: true }] },
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "active", locations: [{ locationName: "High Street", status: "active", nextStep: null }] },
          guard: { status: "active", locations: [{ locationName: "High Street", status: "active", monitoringRecorded: true, allocation: null, nextStep: null }] },
        }],
      },
    }))
    expect(choices.map(choice => choice.key)).toEqual(["recovery", "guard", "telloya"])
    expect(choices[0]).toMatchObject({ kind: "open", href: "/portal/recovery" })
    expect(choices[1]).toMatchObject({ kind: "open", href: "/portal/guard" })
    expect(choices[2].href).toBeUndefined()
    expect(choices[2].kind).toBe("pending")
    expect(choices[2].note).toBe("There is no Telloya workspace to open yet.")
    expect(choices[2].action).toBeUndefined()
    expect(JSON.stringify(choices)).not.toContain("/portal/telloya")
  })

  it("keeps an unread Telloya on the contact action and does not invent a dashboard", () => {
    const choices = productSwitchChoices(presentProducts({
      recovery: { status: "ready", dashboard: dashboard(0) },
      guard: { status: "ready", locations: [] },
    }))
    expect(choices[0]).toMatchObject({ kind: "contact", action: { label: "Start an assessment", href: "https://profilerelaunch.com/get-help" } })
    expect(choices[0].href).toBeUndefined()
    expect(choices[1]).toMatchObject({ kind: "contact", action: { label: "Enquire about Relaunch Guard" } })
    expect(choices[1].href).toBeUndefined()
    expect(choices[2]).toMatchObject({
      kind: "contact",
      action: { label: "Email us about Telloya", href: "mailto:contact@profilerelaunch.com" },
    })
    expect(choices[2].href).toBeUndefined()
    expect(JSON.stringify(choices)).not.toMatch(/Not subscribed|\/portal\/telloya/)
  })

  it("does not treat an unconfirmed read as inactive or active", () => {
    const choices = productSwitchChoices(presentProducts({
      recovery: { status: "unavailable" },
      guard: { status: "unavailable" },
      commercial: { reads: { telloya: "unavailable", guard: "unavailable" }, businesses: [] },
    }))
    expect(choices.map(choice => choice.kind)).toEqual(["unconfirmed", "unconfirmed", "unconfirmed"])
    expect(choices.every(choice => choice.href === undefined && choice.action === undefined)).toBe(true)
    expect(choices.every(choice => choice.note === "Status temporarily unavailable")).toBe(true)
    expect(JSON.stringify(choices)).not.toMatch(/Not subscribed|Active/)
  })

  it("names the current workspace without treating Account as a product", () => {
    expect(currentProductKey("/portal/recovery")).toBe("recovery")
    expect(currentProductKey("/portal/cases/PR-26-ABCDEF/documents")).toBe("recovery")
    expect(currentProductKey("/portal/payments")).toBe("recovery")
    expect(currentProductKey("/portal/guard")).toBe("guard")
    expect(currentProductKey("/portal/guard/document")).toBe("guard")
    expect(currentProductKey("/portal/account")).toBeNull()
    expect(currentProductKey("/portal/products")).toBeNull()
  })
})
