import { describe, expect, it } from "vitest"
import { archiveEntryName, submissionPackFilename } from "./archive-entry"

describe("archive entry names", () => {
  it("keeps the original filename and disambiguates collisions without using a storage path", () => {
    const used = new Set<string>()
    expect(submissionPackFilename("PR-26-GHNLB9")).toBe("ProfileRelaunch_PR-26-GHNLB9_Submission_Pack.zip")
    expect(archiveEntryName("letter.pdf", used)).toBe("letter.pdf")
    expect(archiveEntryName("letter.pdf", used)).toBe("letter (2).pdf")
    expect(archiveEntryName("../../secret.txt", used)).toBe("secret.txt")
    expect(archiveEntryName("..\\..\\evil.pdf", used)).toBe("evil.pdf")
    expect(archiveEntryName("..", used)).toBeNull()
    expect(archiveEntryName("folder/../../..", used)).toBeNull()
    expect([...used].join(" ")).not.toMatch(/cases\/|storage|amazonaws/)
  })
})
