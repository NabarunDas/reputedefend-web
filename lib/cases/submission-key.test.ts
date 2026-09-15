import { describe, expect, it } from "vitest"
import { isSubmissionKey, readSubmissionKey } from "@/lib/cases/submission-key"

describe("isSubmissionKey", () => {
  it("accepts a UUID", () => {
    expect(isSubmissionKey("11111111-2222-4333-8444-555555555555")).toBe(true)
    expect(isSubmissionKey("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toBe(true)
  })

  it("rejects missing or malformed values", () => {
    expect(isSubmissionKey(undefined)).toBe(false)
    expect(isSubmissionKey("")).toBe(false)
    expect(isSubmissionKey("not-a-uuid")).toBe(false)
    expect(isSubmissionKey("11111111222243338444555555555555")).toBe(false)
    expect(isSubmissionKey("11111111-2222-4333-8444-55555555555")).toBe(false)
  })
})

describe("readSubmissionKey", () => {
  it("reads a valid submissionKey from the request body", () => {
    expect(readSubmissionKey({ submissionKey: "11111111-2222-4333-8444-555555555555" })).toBe(
      "11111111-2222-4333-8444-555555555555",
    )
  })

  it("returns null when the key is absent or invalid", () => {
    expect(readSubmissionKey({ submissionKey: "nope" })).toBeNull()
    expect(readSubmissionKey({})).toBeNull()
    expect(readSubmissionKey(null)).toBeNull()
  })
})
