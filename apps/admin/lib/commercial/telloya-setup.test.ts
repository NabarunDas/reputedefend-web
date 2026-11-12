import { describe, expect, it } from "vitest"
import { telloyaSetupChecklist } from "./telloya-setup"

describe("Telloya setup checklist", () => {
  it("does not start setup before the first verified invoice", () => {
    const checklist = telloyaSetupChecklist({ initialInvoicePaid: false, completed: ["preferences"] })
    expect(checklist.customerStatus).toBe("not_started")
    expect(checklist.steps.every(step => step.state === "closed")).toBe(true)
    expect(checklist.goLive).toBe("blocked")
  })

  it("moves through preparing and testing without becoming active", () => {
    const preparing = telloyaSetupChecklist({ initialInvoicePaid: true, completed: ["preferences"] })
    expect(preparing.customerLabel).toBe("Preparing your receptionist")
    expect(preparing.next).toBe("Confirm AI configuration")
    const testing = telloyaSetupChecklist({
      initialInvoicePaid: true,
      completed: ["preferences", "ai", "number", "forwarding", "test_call"],
    })
    expect(testing.customerLabel).toBe("Testing")
    const ready = telloyaSetupChecklist({
      initialInvoicePaid: true,
      completed: ["preferences", "ai", "number", "forwarding", "test_call", "customer_connection"],
    })
    expect(ready.customerLabel).toBe("Ready for activation")
    expect(ready.goLiveReason).toBe("voice_safety_gates_unverified")
    expect(ready.customerLabel).not.toBe("Active")
  })
})
