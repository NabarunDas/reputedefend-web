import { describe, expect, it } from "vitest"
import { devCaseJourneyPreviewEnabled } from "./gate"

const open = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
}

describe("the case journey preview gate", () => {
  it("opens only on the develop Preview against the DEV project", () => {
    expect(devCaseJourneyPreviewEnabled(open)).toBe(true)
    expect(devCaseJourneyPreviewEnabled({ ...open, SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co/" })).toBe(true)
  })

  it("denies Production, other Preview branches, and any other database", () => {
    expect(devCaseJourneyPreviewEnabled({})).toBe(false)
    expect(devCaseJourneyPreviewEnabled({ ...open, VERCEL_ENV: "production" })).toBe(false)
    expect(devCaseJourneyPreviewEnabled({ ...open, VERCEL_ENV: "development" })).toBe(false)
    expect(devCaseJourneyPreviewEnabled({ ...open, VERCEL_GIT_COMMIT_REF: "cursor/mkt-ux-11-get-help-intake-e296" })).toBe(false)
    expect(devCaseJourneyPreviewEnabled({ ...open, SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" })).toBe(false)
  })
})
