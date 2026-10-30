import { describe, expect, it } from "vitest"
import { messageIsLong, messageParagraphs, messagePreview, messageTitle } from "./present"

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

  it("previews one long paragraph, two long paragraphs, and many short paragraphs", () => {
    const one = `Start ${"word ".repeat(120)}end.`
    expect(messageIsLong(one)).toBe(true)
    const onePreview = messagePreview(one)
    expect(onePreview.endsWith("…")).toBe(true)
    expect(onePreview.length).toBeLessThan(one.length)
    expect(one.startsWith(onePreview.slice(0, -1))).toBe(true)
    expect(onePreview).not.toContain("end.")

    const first = `Alpha ${"word ".repeat(90)}`.trim()
    const second = `Beta ${"word ".repeat(90)}end.`.trim()
    const two = `${first}\n\n${second}`
    expect(messageIsLong(two)).toBe(true)
    const twoPreview = messagePreview(two)
    expect(two.startsWith(twoPreview.slice(0, -1))).toBe(true)
    expect(twoPreview).not.toContain("end.")

    const many = ["One.", "Two.", "Three.", "Four.", "Five."].join("\n\n")
    expect(messageIsLong(many)).toBe(true)
    expect(messagePreview(many)).toBe("One.\n\nTwo.…")
    expect(messageIsLong("Hello <strong>there</strong>")).toBe(false)
    expect(messagePreview("Thanks, this is my reply.")).toBe("Thanks, this is my reply.")
  })
})
