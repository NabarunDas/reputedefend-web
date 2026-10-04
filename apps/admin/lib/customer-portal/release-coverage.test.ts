import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  customerPortalDatabaseSuiteFiles,
  customerPortalDatabaseTestName,
  missingCustomerPortalDatabaseSuites,
  requiredCustomerPortalDatabaseSuites,
} from "../../../../scripts/customer-portal-database-suites.mjs"

const databaseTestName = /(^|[.])database\.test\.ts$/

const adminRoot = fileURLToPath(new URL("../..", import.meta.url))
const portalRoot = fileURLToPath(new URL(".", import.meta.url))
const releaseScript = fileURLToPath(new URL("../../../../scripts/release-customer-check.mjs", import.meta.url))

function databaseSuitesOnDisk() {
  const found: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (databaseTestName.test(entry.name)) found.push(relative(adminRoot, full).split("\\").join("/"))
    }
  }
  walk(portalRoot)
  found.sort()
  return found
}

describe("customer release database coverage", () => {
  it("discovers every Customer Portal database suite and no other Admin suite", () => {
    const discovered = customerPortalDatabaseSuiteFiles()
    const onDisk = databaseSuitesOnDisk()
    expect(String(customerPortalDatabaseTestName)).toBe(String(databaseTestName))
    expect(discovered).toEqual(onDisk)
    expect(missingCustomerPortalDatabaseSuites(discovered)).toEqual([])
    expect(discovered).toEqual(expect.arrayContaining([...requiredCustomerPortalDatabaseSuites]))
    expect(discovered.every(file => file.startsWith("lib/customer-portal/"))).toBe(true)
    expect(discovered.some(file => file.includes("lib/recovery/"))).toBe(false)
    expect(discovered.some(file => file.includes("lib/payments/"))).toBe(false)
  })

  it("makes release:customer-check run the discovered suites plus migration manifest and history", () => {
    const script = readFileSync(releaseScript, "utf8")
    expect(script).toContain("customerPortalDatabaseSuiteFiles()")
    expect(script).toContain("...databaseSuites")
    expect(script).toContain("lib/recovery/manifest.test.ts")
    expect(script).toContain("lib/recovery/history.test.ts")
    expect(script).toContain("lib/customer-portal/release-coverage.test.ts")
    expect(script).toContain("Repository checks passed. This is not production launch approval.")
  })
})
