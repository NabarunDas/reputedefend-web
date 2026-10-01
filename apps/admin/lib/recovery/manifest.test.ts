import { describe, expect, it } from "vitest"
import { readdirSync } from "node:fs"
import { appliedMigrationHead, chainAfter, chainThrough, findMigration, manifestFilenames, manifestVersions, migrationChain, migrationHead, pendingMigrations } from "./manifest"
import { logicalName, migrationVersion } from "./history"

const directory = new URL("../../../../supabase/migrations/", import.meta.url)
const repositoryFilenames = readdirSync(directory).filter(name => name.endsWith(".sql")).sort()

describe("the migration chain manifest", () => {
  it("describes every migration in the repository exactly once", () => {
    expect(manifestFilenames()).toEqual(repositoryFilenames)
  })

  it("is ordered the way PostgreSQL received it", () => {
    expect(manifestVersions()).toEqual([...manifestVersions()].sort())
    expect(manifestVersions()).toEqual(repositoryFilenames.map(migrationVersion))
  })

  it("records the applied Step 23 migration as both repository and dev head", () => {
    // The two heads answer different questions and must stay derived rather
    // than stated: migrationHead is the newest migration on disk,
    // appliedMigrationHead the newest one the dev project has received. They
    // coincide exactly when nothing is waiting, which is the case now.
    expect(migrationHead).toBe(migrationChain.at(-1))
    expect(appliedMigrationHead).toBe(migrationChain.findLast(entry => entry.appliedToDev))
    expect(pendingMigrations().length === 0).toBe(migrationHead === appliedMigrationHead)

    expect(migrationHead.filename).toBe("20261001220255_quote_surface_fixes_v1.sql")
    expect(migrationHead.step).toBe("Step 23 quote surface fixes")
    expect(migrationHead.appliedToDev).toBe(true)
    expect(appliedMigrationHead.filename).toBe("20261001220255_quote_surface_fixes_v1.sql")
    expect(appliedMigrationHead.step).toBe("Step 23 quote surface fixes")
    expect(appliedMigrationHead.appliedToDev).toBe(true)
  })

  it("never marks any migration as safe to replay", () => {
    for (const entry of migrationChain) expect(entry.safeToReplay).toBe(false)
  })

  it("has no reviewed migration still waiting to be applied", () => {
    // Derived from appliedToDev rather than from a remembered filename, so the
    // list populates again the moment a new migration is added.
    expect(pendingMigrations()).toEqual(migrationChain.filter(entry => !entry.appliedToDev))
    expect(pendingMigrations()).toEqual([])
  })

  it("keeps every applied migration ahead of every pending one", () => {
    const lastApplied = migrationChain.findLastIndex(entry => entry.appliedToDev)
    expect(migrationChain.slice(0, lastApplied + 1).every(entry => entry.appliedToDev)).toBe(true)
    expect(migrationChain.slice(lastApplied + 1).every(entry => !entry.appliedToDev)).toBe(true)
  })

  it("gives every migration a logical step and a verification probe", () => {
    for (const entry of migrationChain) {
      expect(entry.step.length).toBeGreaterThan(0)
      expect(entry.verification.category.length).toBeGreaterThan(0)
      expect(entry.verification.probe).toMatch(/^(public|admin_private)\.[a-z0-9_]+$/)
    }
  })

  it("records which migrations change data as well as schema", () => {
    const withData = migrationChain.filter(entry => entry.containsDataChange).map(entry => entry.version)
    expect(withData).toEqual([
      "20260917080553",
      "20260917160740",
      "20260918083220",
      "20260929210000",
      "20260929221604",
      "20260929233953",
      "20260930164529",
      "20260930180050",
      "20260930222821",
    ])
  })

  it("names the foundation migrations that later work cannot be reordered around", () => {
    const foundation = migrationChain.filter(entry => entry.kind === "foundation").map(entry => logicalName(entry.filename))
    expect(foundation).toEqual([
      "core_data_foundation_v1",
      "relaunch_guard_data_foundation_v1",
      "single_admin_auth_v1",
      "admin_evidence_foundation_v1",
      "jobs_outbox_operational_health_v1",
    ])
  })

  it("splits the chain at a checkpoint so an upgrade can be rehearsed", () => {
    const through = chainThrough("20260929183214")
    const after = chainAfter("20260929183214")
    expect(through.at(-1)?.filename).toBe("20260929183214_jobs_outbox_operational_health_v1.sql")
    expect(after[0].filename).toBe("20260929210000_communications_outgoing_mail_v1.sql")
    expect(through.length + after.length).toBe(migrationChain.length)
  })

  it("refuses to split at a version it does not know", () => {
    expect(() => chainThrough("19990101000000")).toThrow(/unknown migration version/)
    expect(findMigration("19990101000000_invented.sql")).toBeNull()
  })
})
