import { describe, expect, it } from "vitest"
import { messageParagraphs, messageTitle } from "./present"

describe("message presentation", () => {
  it("shortens a branded subject without dropping the stored meaning", () => {
    expect(messageTitle("Payment received for your ProfileRelaunch Guided Relaunch — PR-26-GHNLB9 — SO-26-GHHRGY"))
      .toBe("Payment received for your Guided Relaunch")
    expect(messageTitle("Payment requested for your ProfileRelaunch Guided Relaunch — PR-26-GHNLB9 — SO-26-GHHRGY"))
      .toBe("Payment requested for your Guided Relaunch")
    expect(messageTitle(`Subject${"A".repeat(80)}`)).toBe(`Subject${"A".repeat(80)}`)
  })

  it("keeps paragraph breaks and does not treat markup as HTML", () => {
    expect(messageParagraphs("Hello\n\nThis is a second paragraph.\nStill the second.")).toEqual([
      "Hello",
      "This is a second paragraph.\nStill the second.",
    ])
    expect(messageParagraphs("Hello <strong>there</strong>")).toEqual(["Hello <strong>there</strong>"])
  })
})
