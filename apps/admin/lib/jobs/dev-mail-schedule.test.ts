import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { assessDevMailSchedule, devMailScheduleUrl, observeDevMailWorkflow } from "./dev-mail-schedule"

describe("DEV mail schedule target", () => {
  it("accepts only the develop Admin preview origin", () => {
    expect(devMailScheduleUrl("https://profilerelaunch-admin-git-develop-clientcove.vercel.app")).toBe(
      "https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/jobs/dev-mail-dispatch",
    )
  })

  it("refuses production, other previews, and a secret in the URL", () => {
    expect(devMailScheduleUrl("https://admin.profilerelaunch.com")).toBeNull()
    expect(devMailScheduleUrl("https://profilerelaunch.com")).toBeNull()
    expect(devMailScheduleUrl("https://dev-hooks.profilerelaunch.com")).toBeNull()
    expect(devMailScheduleUrl("https://profilerelaunch-admin.vercel.app")).toBeNull()
    expect(devMailScheduleUrl("https://profilerelaunch-customer-git-develop-clientcove.vercel.app")).toBeNull()
    expect(devMailScheduleUrl("http://profilerelaunch-admin-git-develop-clientcove.vercel.app")).toBeNull()
    expect(devMailScheduleUrl("https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/jobs/dev-mail-dispatch")).toBeNull()
    expect(devMailScheduleUrl("https://profilerelaunch-admin-git-develop-clientcove.vercel.app?x-vercel-protection-bypass=secret")).toBeNull()
  })

  it("keeps the GitHub schedule on the same develop Admin origin", () => {
    const workflow = readFileSync(new URL("../../../../.github/workflows/dev-mail-dispatch-worker.yml", import.meta.url), "utf8")
    expect(workflow).toContain('cron: "*/5 * * * *"')
    expect(workflow).toContain("github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'")
    expect(workflow).toContain("https://profilerelaunch-admin-git-develop-[a-z0-9-]+\\.vercel\\.app")
    expect(workflow).toContain("x-vercel-protection-bypass")
    expect(workflow).toContain("/api/internal/jobs/dev-mail-dispatch")
    expect(workflow).not.toMatch(/--location|-L |x-vercel-protection-bypass=/)
    expect(workflow).not.toMatch(/echo .*(WORKER_SECRET|BYPASS|PREVIEW_ORIGIN)/)
    const vercel = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")
    expect(vercel).not.toContain("crons")
  })

  it("treats a workflow file on this branch as unscheduled while it is absent from main", () => {
    const workflow = readFileSync(new URL("../../../../.github/workflows/dev-mail-dispatch-worker.yml", import.meta.url), "utf8")
    const onThisBranch = observeDevMailWorkflow(workflow, { defaultBranch: "main", onDefaultBranch: false })
    expect(onThisBranch.cron).toBe("*/5 * * * *")
    expect(assessDevMailSchedule(onThisBranch)).toEqual({ scheduled: false, reason: "absent_from_default_branch" })
    expect(assessDevMailSchedule(observeDevMailWorkflow(workflow, { defaultBranch: "develop", onDefaultBranch: true }))).toEqual({
      scheduled: false,
      reason: "wrong_default_branch",
    })
  })

  it("accepts the same workflow only when main carries the develop-preview schedule", () => {
    const workflow = readFileSync(new URL("../../../../.github/workflows/dev-mail-dispatch-worker.yml", import.meta.url), "utf8")
    expect(assessDevMailSchedule(observeDevMailWorkflow(workflow, { defaultBranch: "main", onDefaultBranch: true }))).toEqual({
      scheduled: true,
      reason: "scheduled",
    })
    const daily = workflow.replace('cron: "*/5 * * * *"', 'cron: "0 4 * * *"')
    expect(assessDevMailSchedule(observeDevMailWorkflow(daily, { defaultBranch: "main", onDefaultBranch: true })).reason).toBe("wrong_cadence")
    const production = workflow.replace("profilerelaunch-admin-git-develop-[a-z0-9-]+\\.vercel\\.app", "admin.profilerelaunch.com")
    expect(assessDevMailSchedule(observeDevMailWorkflow(production, { defaultBranch: "main", onDefaultBranch: true })).reason).toBe("wrong_host")
  })
})
