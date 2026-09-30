import { describe, expect, it } from "vitest"
import { canEscalate, guardAlertQueueHref, parseAlertQueueCursors } from "./alerts-model"

describe("guard alert model", () => {
  it("builds stable queue hrefs and rejects invalid cursors", () => {
    const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)
    const cursors = parseAlertQueueCursors({ newReview: "not-a-uuid", acknowledged: "11111111-1111-4111-8111-111111111111" }, isUuid)
    expect(cursors.newReview.invalid).toBe(true)
    expect(cursors.acknowledged.after).toBe("11111111-1111-4111-8111-111111111111")
    expect(guardAlertQueueHref({ newReview: null, acknowledged: "11111111-1111-4111-8111-111111111111" }, "acknowledged", "22222222-2222-4222-8222-222222222222"))
      .toBe("/guard/alerts?acknowledged=22222222-2222-4222-8222-222222222222")
  })

  it("only allows upward escalation after acknowledgement", () => {
    expect(canEscalate("HIGH", "ACKNOWLEDGED")).toBe(true)
    expect(canEscalate("CRITICAL", "ACKNOWLEDGED")).toBe(false)
    expect(canEscalate("HIGH", "NEW")).toBe(false)
  })
})
