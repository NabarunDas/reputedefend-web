import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { adminLaunchBlocking, computedEnvFamilies, environmentContract, expectedAbsentAtCutover, variable } from "./environment"
import { containsSecret } from "./secrets"
import { environmentReads, unsupportedEnvironmentAccess } from "./source-scan"

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const ignoredDirectories = new Set(["node_modules", ".git", ".next", "dist", "coverage", "out"])

function sourceFiles(): string[] {
  const found: string[] = []
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      if (ignoredDirectories.has(name)) continue
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx|mjs|js|jsx)$/.test(name)) found.push(path)
    }
  }
  walk(repoRoot)
  return found
}

const isTestFile = (path: string) => /\.test\.|\/testing\/|^test\/|^scripts\//.test(path)

/** Every reader, and separately the readers that ship to production. */
const allReads = new Map<string, string[]>()
const productionReads = new Map<string, string[]>()
const unsupportedAccess: { file: string; unsupported: string[] }[] = []
for (const file of sourceFiles()) {
  const path = relative(repoRoot, file).replaceAll("\\", "/")
  const source = readFileSync(file, "utf8")
  for (const name of new Set(environmentReads(source))) {
    allReads.set(name, [...(allReads.get(name) ?? []), path])
    if (!isTestFile(path)) productionReads.set(name, [...(productionReads.get(name) ?? []), path])
  }
  if (!isTestFile(path)) {
    const unsupported = unsupportedEnvironmentAccess(source)
    if (unsupported.length > 0) unsupportedAccess.push({ file: path, unsupported })
  }
}

const contractNames = environmentContract.map(entry => entry.name)

describe("production environment contract", () => {
  it("classifies every variable the code actually reads", () => {
    const unclassified = [...allReads.keys()].filter(name => !contractNames.includes(name)).sort()
    expect(unclassified).toEqual([])
  })

  it("can see every environment access in production source", () => {
    // The inventory above is only complete while every access is one the
    // scanner recognises. Aliasing the environment object, or reaching it
    // through syntax this scanner does not understand, would leave reads
    // unclassified without failing the check above, so it fails here instead.
    expect(unsupportedAccess).toEqual([])
  })

  it("does not classify a variable nothing reads", () => {
    // A contract entry for a name no code reads is either a leftover or a
    // guess from documentation, and both are the thing this step forbids.
    const unread = contractNames.filter(name => !allReads.has(name)).sort()
    expect(unread).toEqual([])
  })

  it("names the files that read each variable, and only files that do", () => {
    // Production entries name production readers. A TEST_ONLY entry names the
    // test code that reads it, because that is the whole point of the entry.
    const wrong = environmentContract
      .map(entry => {
        const source = entry.classification === "TEST_ONLY" ? allReads : productionReads
        return {
          name: entry.name,
          actual: (source.get(entry.name) ?? []).slice().sort(),
          declared: entry.readBy.slice().sort(),
        }
      })
      .filter(entry => entry.actual.join("|") !== entry.declared.join("|"))
    expect(wrong).toEqual([])
  })

  it("has no duplicate entry", () => {
    expect(new Set(contractNames).size).toBe(contractNames.length)
  })

  it("records every entry completely", () => {
    const incomplete = environmentContract
      .filter(
        entry =>
          entry.apps.length === 0
          || entry.controls.trim().length < 15
          || entry.whenAbsent.trim().length < 15
          || entry.readBy.length === 0,
      )
      .map(entry => entry.name)
    expect(incomplete).toEqual([])
  })

  it("carries no value anywhere, only expected presence", () => {
    const source = readFileSync(new URL("./environment.ts", import.meta.url), "utf8")
    expect(containsSecret(source)).toBe(false)
    // An entry has no field a value could live in. Catching a new one here is
    // cheaper than catching it in review.
    const fields = new Set(environmentContract.flatMap(entry => Object.keys(entry)))
    expect([...fields].sort()).toEqual([
      "apps",
      "atAdminCutover",
      "blocksAdminLaunch",
      "blocksOptionalCapabilityOnly",
      "classification",
      "controls",
      "name",
      "readBy",
      "scope",
      "secret",
      "whenAbsent",
    ])
  })

  it("treats a variable only test code reads as TEST_ONLY", () => {
    const testOnly = [...allReads.keys()].filter(name => !productionReads.has(name))
    expect(testOnly).toEqual(["VITEST"])
    expect(variable("VITEST")?.classification).toBe("TEST_ONLY")
    expect(variable("VITEST")?.atAdminCutover).toBe("ABSENT")
  })

  it("marks the variables a signed-in Admin cannot work without", () => {
    expect(adminLaunchBlocking().map(entry => entry.name).sort()).toEqual([
      "ADMIN_AUTH_ENABLED",
      "ADMIN_ORIGIN",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_URL",
    ])
    // Everything Admin core needs must be expected to be present at cutover.
    expect(adminLaunchBlocking().every(entry => entry.atAdminCutover === "PRESENT")).toBe(true)
  })

  it("expects every live-capability gate to be absent at Admin cutover", () => {
    const gates = [
      "COMMUNICATIONS_SEND_ENABLED",
      "COMMUNICATIONS_INBOUND_ENABLED",
      "PAYMENTS_PROVIDER_MODE",
      "PRIVACY_DELETION_ENABLED",
      "GOOGLE_BUSINESS_PROFILE_API_ENABLED",
      "GUARD_CHECKS_ENABLED",
      "GUARD_ALERTS_ENABLED",
      "GUARD_ALERT_NOTIFICATIONS_ENABLED",
    ]
    const absent = expectedAbsentAtCutover().map(entry => entry.name)
    expect(gates.filter(name => !absent.includes(name))).toEqual([])
  })

  it("expects static AWS credentials to be absent, because their presence disables storage", () => {
    for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) {
      const entry = variable(name)
      expect(entry?.atAdminCutover).toBe("ABSENT")
      expect(entry?.blocksAdminLaunch).toBe(false)
    }
  })

  it("never marks a feature gate as a secret", () => {
    const wrong = environmentContract
      .filter(entry => entry.classification === "FEATURE_GATE" && entry.secret)
      .map(entry => entry.name)
    expect(wrong).toEqual([])
  })

  it("marks every provider secret as secret", () => {
    const wrong = environmentContract
      .filter(entry => entry.classification === "PROVIDER_SECRET" && !entry.secret)
      .map(entry => entry.name)
    expect(wrong).toEqual([])
  })

  it("records the computed link-secret family the scanner cannot see", () => {
    expect(computedEnvFamilies.map(entry => entry.pattern)).toEqual(["COMMUNICATIONS_LINK_SECRET_V{n}"])
    const link = readFileSync(new URL("../communications/link.ts", import.meta.url), "utf8")
    expect(link).toContain("COMMUNICATIONS_LINK_SECRET_V${version}")
  })
})
