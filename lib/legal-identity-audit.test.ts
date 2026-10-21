import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

type Match = { file: string; line: number; text: string }

function trackedMatches(pattern: string): Match[] {
  let stdout = ""
  try {
    stdout = execFileSync("git", ["grep", "-n", "-I", "-i", "-E", pattern], { encoding: "utf8" })
  } catch (error) {
    const failure = error as { status?: number; stdout?: string | Buffer }
    if (failure.status === 1) return []
    throw error
  }
  return stdout.split("\n").filter(Boolean).map(line => {
    const parsed = /^([^:]+):(\d+):(.*)$/.exec(line)
    if (!parsed) throw new Error(`unexpected git grep line: ${line}`)
    return { file: parsed[1], line: Number(parsed[2]), text: parsed[3] }
  })
}

function expectRetained(matches: Match[], rules: Record<string, (text: string) => boolean>) {
  const unexpected = matches.filter(match => !rules[match.file]?.(match.text))
  expect(unexpected.map(match => `${match.file}:${match.line}:${match.text.trim()}`)).toEqual([])
}

describe("legacy legal identity", () => {
  it("keeps the retired personal identity out of current public copy", () => {
    const matches = trackedMatches("Saswati[[:space:]]+Das|Bradford[[:space:]]+Road|SN1[[:space:]]*4FE|Old Town")
    expectRetained(matches, {
      "lib/legal-identity-audit.test.ts": () => true,
      "app/about/content.test.ts": text => text.includes("not.toMatch"),
    })
    expect(matches.some(match => match.file === "app/about/content.test.ts")).toBe(true)
    expect(matches.some(match => /Saswati/.test(match.text) && match.file !== "lib/legal-identity-audit.test.ts")).toBe(false)
  })

  it("keeps Swindon only as a synthetic admin location, not as the old postal address", () => {
    const matches = trackedMatches("Swindon")
    expectRetained(matches, {
      "lib/legal-identity-audit.test.ts": () => true,
      "apps/admin/lib/records/database.test.ts": text => text.includes("Swindon") && !/Bradford|SN1|Old Town/i.test(text),
    })
    expect(matches.some(match => match.file === "apps/admin/lib/records/database.test.ts")).toBe(true)
  })

  it("keeps sole trader only as a negative test or a generic business-type example", () => {
    const matches = trackedMatches("sole[- ]trader")
    const customerPurchaser = (text: string) => /sole trader/i.test(text) && !/ProfileRelaunch is a sole trader/i.test(text)
    expectRetained(matches, {
      "lib/legal-identity-audit.test.ts": () => true,
      "app/about/content.test.ts": text => text.includes("not.toMatch"),
      "components/legal-page.test.tsx": text => text.includes("not.toBeInTheDocument"),
      "lib/resource-articles/google-business-profile-appeal-evidence-checklist.tsx": text =>
        text.includes("A sole trader, regulated company"),
      "apps/admin/app/commercial/purchaser-form.tsx": customerPurchaser,
      "apps/admin/lib/commercial/eligibility-gate.database.test.ts": text => customerPurchaser(text) && text.includes("Purchaser is a sole trader"),
      "apps/admin/lib/commercial/establishment-command.test.ts": customerPurchaser,
      "apps/admin/lib/commercial/purchaser.test.ts": customerPurchaser,
      "apps/admin/lib/commercial/purchaser.ts": customerPurchaser,
      "docs/admin/com-prod-01.md": text => customerPurchaser(text) && text.includes("permitted customer"),
    })
    expect([...new Set(matches.map(match => match.file))].sort()).toEqual([
      "app/about/content.test.ts",
      "apps/admin/app/commercial/purchaser-form.tsx",
      "apps/admin/lib/commercial/eligibility-gate.database.test.ts",
      "apps/admin/lib/commercial/establishment-command.test.ts",
      "apps/admin/lib/commercial/purchaser.test.ts",
      "apps/admin/lib/commercial/purchaser.ts",
      "components/legal-page.test.tsx",
      "docs/admin/com-prod-01.md",
      "lib/legal-identity-audit.test.ts",
      "lib/resource-articles/google-business-profile-appeal-evidence-checklist.tsx",
    ])
  })

  it("keeps Company Bradford as a fictional town example, not a street address", () => {
    const matches = trackedMatches("Company Bradford")
    expectRetained(matches, {
      "lib/legal-identity-audit.test.ts": () => true,
      "components/resources/address-service-area-pilot-view.tsx": text => text.includes("Company Leeds"),
      "lib/resource-articles/google-business-profile-address-and-service-area-rules.tsx": text => text.includes("Company Bradford"),
    })
    expect(matches.filter(match => match.file !== "lib/legal-identity-audit.test.ts")).toHaveLength(2)
  })
})
