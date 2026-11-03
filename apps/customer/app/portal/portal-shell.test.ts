import { describe, expect, it } from "vitest"
import { selectPortalShell, workspaceHeading } from "./portal-shell"

describe("portal shells", () => {
  it("keeps setup progress out of the Recovery navigation", () => {
    expect(selectPortalShell("/portal/onboarding", true)).toBe("onboarding")
    expect(selectPortalShell("/portal/onboarding", false)).toBe("legacy")
    expect(workspaceHeading("/portal/onboarding", "onboarding")).toEqual({ product: null, destination: "Setup progress" })
    expect(selectPortalShell("/portal/recovery", true)).toBe("recovery")
    expect(selectPortalShell("/portal/cases", true)).toBe("recovery")
    expect(selectPortalShell("/portal/guard", true)).toBe("guard")
    expect(selectPortalShell("/portal/account", true)).toBe("account")
    expect(selectPortalShell("/portal/products", true)).toBe("launcher")
  })
})
