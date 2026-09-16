import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { sitemapPaths } from "@/lib/site-nav"

const page = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
)

describe("/start-monitoring page", () => {
  it("is gated by the server-only flag and is not indexed", () => {
    expect(page).toContain("isMonitoringPersistenceEnabled")
    expect(page).toContain("notFound()")
    expect(page).toContain("force-dynamic")
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*true/)
    expect(page).toContain("Start your monitoring setup")
    expect(page).toContain("You do not need to have a current problem")
    expect(page).toContain("Monitoring is not active")
    expect(page).not.toContain("NEXT_PUBLIC_")
    expect(page).not.toContain("Tell us what happened")
    expect(sitemapPaths).not.toContain("/start-monitoring")
  })
})
