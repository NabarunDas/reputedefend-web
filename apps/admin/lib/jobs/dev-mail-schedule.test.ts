import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { assessDevMailSchedule, devMailScheduleUrl, observeDevMailWorkflow } from "./dev-mail-schedule"

describe("DEV mail recovery target", () => {
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

  it("does not schedule a GitHub runner", () => {
    const workflow = readFileSync(new URL("../../../../.github/workflows/dev-mail-dispatch-worker.yml", import.meta.url), "utf8")
    expect(workflow).not.toMatch(/schedule:|cron:/)
    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).toContain("/api/internal/jobs/dev-mail-dispatch")
    expect(workflow).not.toMatch(/admin\.profilerelaunch\.com|profilerelaunch-admin\.vercel\.app/)
    const vercel = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")
    expect(vercel).not.toContain("crons")
    const recovery = readFileSync(new URL("../../../../supabase/migrations/20261029010000_dev_mail_shared_dispatch_v1.sql", import.meta.url), "utf8")
    const empty = recovery.indexOf("IF n = 0 THEN")
    const network = recovery.indexOf("net.http_get")
    expect(empty).toBeGreaterThan(0)
    expect(network).toBeGreaterThan(empty)
    expect(recovery).not.toContain("net.http_post")
    expect(recovery).not.toContain("WHERE url")
    expect(recovery).toContain("net._http_response WHERE id = $1")
    const route = readFileSync(new URL("../../app/api/internal/jobs/dev-mail-dispatch/route.ts", import.meta.url), "utf8")
    const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8")
    expect(route).toContain("export const GET = runDevMailDispatchRequest")
    expect(route).not.toMatch(/export const POST/)
    expect(proxy).toContain('const devMailCronRead = request.method === "GET"\n    && (pathname === "/api/internal/jobs/dev-mail-dispatch" || pathname === "/api/internal/jobs/dev-mail-pack-retry")')
    expect(workflow).not.toMatch(/-X POST|--request POST/)
    const schedule = readFileSync(new URL("../../../../supabase/dev-only/dev_mail_dispatch_schedule.sql", import.meta.url), "utf8")
    expect(schedule).toContain("cron.schedule")
    expect(schedule).toContain("*/5 * * * *")
    expect(schedule).not.toMatch(/Bearer [A-Za-z0-9]/)
    expect(schedule).not.toContain("supabase/migrations")
    expect(recovery).toContain("x-vercel-protection-bypass")
    expect(recovery).toContain("dev_mail_dispatch_bypass")
    expect(recovery).toContain("'blocked'")
    expect(recovery).not.toMatch(/x-vercel-protection-bypass=/)
    expect(recovery).toContain("profilerelaunch-admin-git-develop-")
    expect(schedule).toContain("dev_mail_dispatch_bypass")
    expect(schedule).toContain("x-vercel-protection-bypass")
    expect(schedule).not.toContain("dev-mail-pack-retry-recovery")
    expect(schedule).not.toContain("dev_mail_pack_retry_recovery_v1")
    const packSchedule = readFileSync(new URL("../../../../supabase/dev-only/dev_mail_pack_retry_schedule.sql", import.meta.url), "utf8")
    const packPreflight = readFileSync(new URL("../../../../supabase/dev-only/dev_mail_pack_retry_preflight.sql", import.meta.url), "utf8")
    expect(packSchedule).toContain("dev-mail-pack-retry-recovery")
    expect(packSchedule).toContain("SELECT public.dev_mail_pack_retry_recovery_v1()")
    expect(packSchedule).toContain("cron.unschedule")
    expect(packSchedule).toContain("dev_mail_pack_retry_url")
    expect(packSchedule).toContain("dev_mail_dispatch_bearer")
    expect(packSchedule).toContain("dev_mail_dispatch_bypass")
    expect(packSchedule).toContain("general dispatch activation changed")
    expect(packSchedule).not.toMatch(/cron\.schedule\(\s*'dev-mail-dispatch-recovery'/)
    expect(packSchedule).not.toContain("dev_mail_dispatch_recovery_v1")
    expect(packSchedule).not.toMatch(/insert\s+into\s+admin_private\.dev_mail_dispatch_activation/i)
    expect(packSchedule).not.toMatch(/update\s+admin_private\.dev_mail_dispatch_activation/i)
    expect(packSchedule).not.toMatch(/delete\s+from\s+admin_private\.dev_mail_dispatch_activation/i)
    expect(packSchedule).not.toMatch(/Bearer [A-Za-z0-9]/)
    expect(packSchedule).not.toContain("decrypted_secret")
    expect(packPreflight).toContain("PR-26-MEVY5P")
    expect(packPreflight).toContain("437a952d-10ed-497a-b67b-9eebb560c9cd")
    expect(packPreflight).toContain("matches_pack_retry_shape")
    expect(packPreflight).toContain("20261031120000")
    expect(packPreflight).toContain("dev_mail_pack_retry_url")
    expect(packPreflight).toContain("dev_mail_dispatch_bearer")
    expect(packPreflight).toContain("dev_mail_dispatch_bypass")
    expect(packPreflight).toContain("dev-mail-dispatch-recovery")
    expect(packPreflight).not.toMatch(/^\s*(insert|update|delete)\b/im)
    expect(packPreflight).not.toContain("cron.schedule")
    expect(packPreflight).not.toContain("cron.unschedule")
    expect(packPreflight).not.toMatch(/^\s*SELECT\s+public\.dev_mail_pack_retry_recovery_v1\s*\(/m)
    expect(packPreflight).not.toMatch(/SELECT\s+decrypted_secret/i)
    expect(packPreflight).not.toMatch(/SELECT\s+secret\b/i)
    expect(packPreflight).not.toMatch(/Bearer [A-Za-z0-9]/)
    expect(workflow).toContain("x-vercel-protection-bypass")
    expect(workflow).not.toMatch(/--location|-L |x-vercel-protection-bypass=/)
  })

  it("treats a GitHub cron as refused even on main", () => {
    const workflow = readFileSync(new URL("../../../../.github/workflows/dev-mail-dispatch-worker.yml", import.meta.url), "utf8")
    expect(assessDevMailSchedule(observeDevMailWorkflow(workflow, { defaultBranch: "main", onDefaultBranch: true }))).toEqual({
      scheduled: false,
      reason: "database_recovery",
    })
    const cron = `${workflow}\n  schedule:\n    - cron: "*/5 * * * *"\n`
    expect(assessDevMailSchedule(observeDevMailWorkflow(cron, { defaultBranch: "main", onDefaultBranch: true }))).toEqual({
      scheduled: false,
      reason: "github_schedule_refused",
    })
    expect(assessDevMailSchedule(observeDevMailWorkflow(workflow, { defaultBranch: "develop", onDefaultBranch: true })).reason).toBe("wrong_default_branch")
  })
})
