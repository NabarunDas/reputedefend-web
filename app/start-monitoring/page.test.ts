import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { guardPrice } from "@/lib/guard-offer"
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
    expect(page).toContain("You do not need an existing problem or a previous case")
    expect(page).toContain("Monitoring is not active")
    expect(page).not.toContain("NEXT_PUBLIC_")
    expect(page).not.toContain("Tell us what happened")
    expect(sitemapPaths).not.toContain("/start-monitoring")
  })

  it("uses the shared Guard price without Early Access wording or a hardcoded fallback", () => {
    expect(page).toContain('from "@/lib/guard-offer"')
    expect(page).toContain("guardPrice")
    expect(page).toContain("${guardPrice} per month, per location")
    expect(page).not.toContain("pricingGroups")
    expect(page).not.toContain("Early Access")
    expect(page).not.toMatch(/£9\.99\/month/)
    expect(guardPrice).toBe("£9.99")
  })
})
