import { afterEach, describe, expect, it, vi } from "vitest"
import { caseDetailsHref, caseWorkflowHref, caseWorkspaceChoice, devCaseJourneyPreviewEnabled } from "./gate"

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

  it("chooses the workflow only for the plain DEV case URL", () => {
    vi.stubEnv("VERCEL_ENV", open.VERCEL_ENV)
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", open.VERCEL_GIT_COMMIT_REF)
    vi.stubEnv("SUPABASE_URL", open.SUPABASE_URL)
    expect(caseWorkspaceChoice({})).toBe("workflow")
    expect(caseWorkspaceChoice({ view: "details" })).toBe("details")
    expect(caseWorkspaceChoice({ before: "event-1" })).toBe("details")
    expect(caseWorkspaceChoice({ view: "details", before: "event-1" })).toBe("details")
    expect(caseDetailsHref("case-1")).toBe("/cases/case-1?view=details")
    expect(caseDetailsHref("case-1", "event-1")).toBe("/cases/case-1?view=details&before=event-1")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(caseWorkspaceChoice({})).toBe("details")
    expect(caseDetailsHref("case-1", "event-1")).toBe("/cases/case-1?before=event-1")
    vi.stubEnv("VERCEL_ENV", open.VERCEL_ENV)
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/other")
    expect(caseWorkspaceChoice({})).toBe("details")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", open.VERCEL_GIT_COMMIT_REF)
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    expect(caseWorkspaceChoice({})).toBe("details")
    expect(caseDetailsHref("case-1")).toBe("/cases/case-1")
    expect(caseWorkflowHref("case-1")).toBe("/cases/case-1/journey")
  })
})

afterEach(() => { vi.unstubAllEnvs() })
