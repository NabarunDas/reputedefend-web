import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { devPaymentScheduleUrl } from "./dev-payment-schedule"

describe("DEV payment schedule target", () => {
  it("accepts only the develop Admin preview origin", () => {
    expect(devPaymentScheduleUrl("https://profilerelaunch-admin-git-develop-clientcove.vercel.app")).toBe(
      "https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/jobs/dev-payment-events",
    )
  })

  it("refuses production, other previews, and a secret in the URL", () => {
    expect(devPaymentScheduleUrl("https://admin.profilerelaunch.com")).toBeNull()
    expect(devPaymentScheduleUrl("https://profilerelaunch.com")).toBeNull()
    expect(devPaymentScheduleUrl("https://dev-hooks.profilerelaunch.com")).toBeNull()
    expect(devPaymentScheduleUrl("https://profilerelaunch-admin.vercel.app")).toBeNull()
    expect(devPaymentScheduleUrl("https://profilerelaunch-customer-git-develop-clientcove.vercel.app")).toBeNull()
    expect(devPaymentScheduleUrl("http://profilerelaunch-admin-git-develop-clientcove.vercel.app")).toBeNull()
    expect(devPaymentScheduleUrl("https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/jobs/dev-payment-events")).toBeNull()
    expect(devPaymentScheduleUrl("https://profilerelaunch-admin-git-develop-clientcove.vercel.app?x-vercel-protection-bypass=secret")).toBeNull()
  })

  it("keeps the GitHub schedule on the same develop Admin origin", () => {
    const workflow = readFileSync(new URL("../../../../.github/workflows/dev-payment-event-worker.yml", import.meta.url), "utf8")
    expect(workflow).toContain('cron: "*/5 * * * *"')
    expect(workflow).toContain("github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'")
    expect(workflow).toContain("https://profilerelaunch-admin-git-develop-[a-z0-9-]+\\.vercel\\.app")
    expect(workflow).toContain("x-vercel-protection-bypass")
    expect(workflow).not.toMatch(/--location|-L |x-vercel-protection-bypass=/)
    expect(workflow).not.toMatch(/echo .*(WORKER_SECRET|BYPASS|PREVIEW_ORIGIN)/)
  })
})
