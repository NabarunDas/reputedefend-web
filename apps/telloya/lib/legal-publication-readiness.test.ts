import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { footerContent } from "@/lib/content"
import { cookiesOperator } from "@/app/cookies/content"
import { relaunchGuardAddon, telloyaPlans, overagePolicy, standardEntitlement } from "@/lib/pricing"

const repoRoot = resolve(process.cwd(), "../..")
const drafts = [
  "docs/telloya/marketing/m02a/legal-publication-readiness.md",
  "docs/telloya/marketing/m02a/service-agreement-review-draft.md",
  "docs/telloya/marketing/m02a/privacy-and-data-processing-review-draft.md",
  "docs/telloya/marketing/m02a/owner-decision-register.md",
  "docs/telloya/marketing/m02a/publication-and-acceptance-mapping.md",
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : []
  })
}

describe("unpublished Telloya legal drafts", () => {
  it("keeps every M-02A draft marked unapproved and unpublished", () => {
    for (const relativePath of drafts) {
      const text = readFileSync(resolve(repoRoot, relativePath), "utf8")
      expect(text).toMatch(/NOT APPROVED/)
      expect(text).toMatch(/NOT PUBLISHED/)
      expect(text).toMatch(/NOT LEGAL ADVICE/)
    }
  })

  it("does not present the drafts as accepted customer terms", () => {
    const appSource = sourceFiles(resolve(process.cwd())).join("\n")
    expect(appSource).not.toMatch(/m02a\//)
    expect(appSource).not.toMatch(/\/legal\/service-agreement/)
    expect(appSource).not.toMatch(/\/legal\/privacy/)
    expect(appSource).not.toMatch(/TELLOYA-PROPOSED-2026-11-1/)
    expect(footerContent.legal.map((item) => item.href)).toEqual([
      "/cookies",
      "https://profilerelaunch.com/privacy",
      "https://profilerelaunch.com/terms",
    ])
    expect(footerContent.note).toMatch(/not Telloya service terms/)
    expect(footerContent.note).toMatch(/still await approval/)
    expect(cookiesOperator.paragraphs.join(" ")).toMatch(/awaiting approval/)
  })

  it("keeps the approved prices and leaves production tax undecided", () => {
    expect(telloyaPlans.map((plan) => [plan.tier, plan.monthlyPriceGbp, plan.minutesPerMonth])).toEqual([
      ["basic", 49, 120],
      ["growth", 79, 300],
      ["pro", 120, 500],
      ["custom", null, null],
    ])
    expect(standardEntitlement).toEqual({ operatingLocations: 1, receptionistNumbers: 1 })
    expect(relaunchGuardAddon.pricePerLocationGbp).toBe(9.99)
    expect(overagePolicy.pricePerMinuteGbp).toBe(0.25)
    const taxSource = readFileSync(
      resolve(repoRoot, "apps/admin/lib/commercial/telloya-catalogue-proposal.ts"),
      "utf8",
    )
    expect(taxSource).toMatch(/productionTaxBehaviour:\s*null/)
    expect(taxSource).not.toMatch(/productionTaxBehaviour:\s*"NOT_APPLICABLE"/)
  })
})
