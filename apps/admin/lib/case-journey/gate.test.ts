import { describe, expect, it } from "vitest"
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
    expect(caseWorkspaceChoice({}, open)).toBe("workflow")
    expect(caseWorkspaceChoice({ view: "details" }, open)).toBe("details")
    expect(caseWorkspaceChoice({ before: "event-1" }, open)).toBe("details")
    expect(caseWorkspaceChoice({ view: "details", before: "event-1" }, open)).toBe("details")
    expect(caseWorkspaceChoice({}, { ...open, VERCEL_ENV: "production" })).toBe("details")
    expect(caseWorkspaceChoice({}, { ...open, VERCEL_GIT_COMMIT_REF: "feature/other" })).toBe("details")
    expect(caseWorkspaceChoice({}, { ...open, SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" })).toBe("details")
    expect(caseDetailsHref("case-1", undefined, open)).toBe("/cases/case-1?view=details")
    expect(caseDetailsHref("case-1", "event-1", open)).toBe("/cases/case-1?view=details&before=event-1")
    expect(caseDetailsHref("case-1", "event-1", { ...open, VERCEL_ENV: "production" })).toBe("/cases/case-1?before=event-1")
    expect(caseDetailsHref("case-1", undefined, {})).toBe("/cases/case-1")
    expect(caseWorkflowHref("case-1")).toBe("/cases/case-1/journey")
  })
})
