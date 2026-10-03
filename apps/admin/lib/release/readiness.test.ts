import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  activationBlockers,
  adminAccessBlockers,
  byArea,
  item,
  readinessModel,
  type ReleaseArea,
  statusCounts,
} from "./readiness"
import { liveCapabilities } from "./gates"
import { ownerDecisions, productionDatabaseStrategies, strategy } from "./decisions"
import { appliedMigrationHead, migrationHead, pendingMigrations } from "../recovery/manifest"

const doc = readFileSync(new URL("../../../../docs/admin/production-cutover-readiness.md", import.meta.url), "utf8")

/** Rows of one pipe table, identified by the section heading above it. */
function tableRows(heading: string): string[][] {
  const section = doc.split("\n## ").find(part => part.startsWith(`${heading}\n`))
  expect(section, `missing section: ${heading}`).toBeDefined()
  return (section ?? "")
    .split("\n")
    .filter(line => line.startsWith("| ") && !line.startsWith("| ---"))
    .slice(1)
    .map(line => line.split("|").map(cell => cell.trim()).slice(1, -1))
}

describe("readiness model", () => {
  it("covers every area Step 24A has to account for", () => {
    const areas: ReleaseArea[] = [
      "Admin application",
      "Vercel",
      "Supabase",
      "AWS evidence",
      "Email — Supabase Auth OTP",
      "Email — outgoing transactional",
      "Email — inbound",
      "Stripe",
      "Guard",
      "Google",
      "Privacy",
    ]
    const empty = areas.filter(area => byArea(area).length === 0)
    expect(empty).toEqual([])
    expect([...new Set(readinessModel.map(entry => entry.area))].sort()).toEqual([...areas].sort())
  })

  it("keeps the three email concerns separate", () => {
    // Conflating them is the specific mistake this split exists to prevent:
    // Admin sign-in depends on Supabase Auth delivery and on nothing else.
    const otp = byArea("Email — Supabase Auth OTP")
    expect(otp.length).toBeGreaterThan(0)
    expect(otp.some(entry => entry.requiredBeforeAdminProductionAccess)).toBe(true)
    expect(byArea("Email — outgoing transactional").some(entry => entry.requiredBeforeAdminProductionAccess)).toBe(false)
    expect(byArea("Email — inbound").some(entry => entry.requiredBeforeAdminProductionAccess)).toBe(false)
    expect(item("email.auth-otp")?.requirement).toContain("not the transactional mail path")
    expect(item("email.auth-otp")?.evidence).toContain("none of which take part in sign-in")
  })

  it("gives every item a unique id and a complete record", () => {
    const ids = readinessModel.map(entry => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    const incomplete = readinessModel
      .filter(
        entry =>
          entry.requirement.trim().length < 40
          || entry.evidence.trim().length < 40
          || entry.verification.trim().length < 30
          || entry.stopCondition.trim().length < 30,
      )
      .map(entry => entry.id)
    expect(incomplete).toEqual([])
  })

  it("names an action for anything that is not ready", () => {
    const silent = readinessModel
      .filter(entry => entry.status !== "READY" && entry.status !== "READY_DISABLED")
      .filter(entry => !entry.codeAction && !entry.externalAction)
      .map(entry => entry.id)
    expect(silent).toEqual([])
  })

  it("backs every ready item with something in this repository", () => {
    // A repository cannot observe a Vercel setting, a DNS record, a Supabase
    // project option or an AWS role. An item may only read ready when its
    // evidence points at a file, a function or a schema object that is here,
    // so no status rests on an assumption about an external account.
    const repositoryArtifact = /\.(?:ts|tsx|sql|mjs)\b|\(\)|supabase\/migrations|capture_method|admin_identity|admin_private/
    const unsupported = readinessModel
      .filter(entry => entry.status === "READY" || entry.status === "READY_DISABLED")
      .filter(entry => !repositoryArtifact.test(entry.evidence))
      .map(entry => entry.id)
    expect(unsupported).toEqual([])
  })

  it("marks anything that depends on an external account as not yet ready", () => {
    // The converse: every external account named in the package appears on an
    // item an operator still has to go and look at.
    const external = readinessModel.filter(entry => entry.status !== "READY" && entry.status !== "READY_DISABLED")
    expect(external.every(entry => entry.externalAction !== null)).toBe(true)
    const accounts = external.map(entry => entry.externalAction ?? "").join(" ")
    for (const account of ["Vercel", "Supabase", "AWS", "Resend", "Stripe", "Owner decision"]) {
      expect({ account, named: accounts.includes(account) }).toEqual({ account, named: true })
    }
  })

  it("names only capabilities that exist", () => {
    const known = liveCapabilities.map(entry => entry.id)
    const unknown = readinessModel.flatMap(entry => entry.requiredBeforeActivationOf.filter(id => !known.includes(id)))
    expect(unknown).toEqual([])
  })

  it("gates every live capability on at least one item", () => {
    const ungated = liveCapabilities
      .map(entry => entry.id)
      .filter(id => !readinessModel.some(row => row.requiredBeforeActivationOf.includes(id)))
    expect(ungated).toEqual([])
  })

  it("leaves nothing blocking Admin production access except external verification", () => {
    // Every remaining blocker must be something a person observes outside the
    // repository, not something the code still has to do.
    const blockers = adminAccessBlockers()
    expect(blockers.map(entry => entry.id).sort()).toEqual([
      "email.auth-otp",
      "supabase.migration-ledger-discrepancy",
      "vercel.admin-project-and-domain",
      "vercel.environment-contract",
    ])
    expect(blockers.every(entry => entry.externalAction !== null)).toBe(true)
  })

  it("withholds final sign-off on Step 22B while allowing Admin code readiness", () => {
    const rehearsal = item("supabase.recovery-rehearsal")
    expect(rehearsal?.status).toBe("DEFERRED")
    expect(rehearsal?.requiredBeforeAdminProductionAccess).toBe(false)
    expect(rehearsal?.stopCondition).toContain("Final production sign-off cannot")
  })

  it("blocks Stripe and Guard activation on their unresolved decisions", () => {
    expect(activationBlockers("stripe_payments").map(entry => entry.id)).toContain("stripe.commercial-decisions")
    expect(item("guard.operating-decisions")?.status).toBe("BLOCKED")
    // Manual Guard is not blocked by any of it.
    expect(item("guard.manual-operation-ready")?.status).toBe("READY")
    expect(item("guard.manual-operation-ready")?.evidence).toContain("MANUAL")
  })

  it("does not present Google API access as required for manual operation", () => {
    expect(item("google.manual-workflow-supported")?.status).toBe("READY")
    expect(item("google.manual-workflow-supported")?.requiredBeforeAdminProductionAccess).toBe(false)
    expect(item("google.api-inactive")?.externalAction).toContain("not a defect")
  })

  it("agrees with the recovery manifest about the applied and repository heads", () => {
    expect(pendingMigrations().map(entry => entry.version)).toEqual(["20261003224746"])
    expect(appliedMigrationHead.version).toBe("20261003204538")
    expect(migrationHead.version).toBe("20261003224746")
    const supabase = item("supabase.applied-head")
    expect(supabase?.status).toBe("READY")
    expect(supabase?.requirement).toContain(appliedMigrationHead.version)
    expect(supabase?.requirement).toContain(migrationHead.version)
    expect(supabase?.requirement).toContain("customer_portal_quotes_agreements_permissions_v1")
    expect(supabase?.requirement).toContain("has not been applied")
    expect(supabase?.requirement).not.toContain("matching the repository")
    expect(supabase?.evidence).toContain("profilerelaunch-dev")
    expect(supabase?.evidence).toContain("2026-10-03")
    expect(supabase?.evidence).toContain("20261003204538")
    expect(supabase?.evidence).toContain("20261003224746")
    expect(supabase?.externalAction).toBeNull()
  })
})

describe("owner decisions and database strategies", () => {
  it("records a decision for each unresolved area", () => {
    expect(ownerDecisions.map(entry => entry.id).sort()).toEqual([
      "activation.order",
      "commercial.tax",
      "database.production-topology",
      "guard.capacity",
      "guard.check-windows",
      "recovery.objectives",
      "retention.periods",
      "service.first-response",
    ])
    const incomplete = ownerDecisions
      .filter(entry => entry.question.trim().length < 30 || entry.currentBehaviour.trim().length < 30 || entry.blocks.trim().length < 10)
      .map(entry => entry.id)
    expect(incomplete).toEqual([])
  })

  it("marks an old suggested figure as prior art rather than as an answer", () => {
    const suggested = ownerDecisions.filter(entry => entry.priorSuggestion !== null)
    expect(suggested.length).toBeGreaterThan(0)
    expect(suggested.every(entry => /not an? (?:approved|commitment|decision)|must not be promoted|prior art/i.test(entry.priorSuggestion ?? ""))).toBe(true)
  })

  it("describes both production database strategies without choosing one", () => {
    expect(productionDatabaseStrategies.map(entry => entry.id)).toEqual(["A", "B"])
    for (const entry of productionDatabaseStrategies) {
      expect(entry.advantages.length).toBeGreaterThan(1)
      expect(entry.risks.length).toBeGreaterThan(1)
      expect(entry.prerequisites.length).toBeGreaterThan(0)
      expect(entry.prohibited.length).toBeGreaterThan(0)
    }
    expect(item("supabase.migration-ledger-discrepancy")?.status).toBe("BLOCKED")
    expect(item("supabase.migration-ledger-discrepancy")?.externalAction).toContain("Owner decision")
  })

  it("forbids replaying or fabricating history under either strategy", () => {
    const prohibited = productionDatabaseStrategies.flatMap(entry => entry.prohibited).join(" ")
    expect(prohibited).toMatch(/do not replay/i)
    expect(strategy("B").prohibited.join(" ")).toMatch(/fabricat|history rows|migration-history/i)
    expect(strategy("B").prohibited.join(" ")).toMatch(/clean/i)
  })

  it("names the three foundation migrations the remote ledger is missing", () => {
    const text = strategy("B").prohibited.join(" ")
    for (const filename of [
      "20260915120000_core_data_foundation_v1.sql",
      "20260915193000_case_intake_transaction_v1.sql",
      "20260916000000_relaunch_guard_data_foundation_v1.sql",
    ]) {
      expect(text).toContain(filename)
    }
  })
})

describe("the cutover document matches the model", () => {
  it("records the Step 24A status in its heading", () => {
    expect(doc).toContain("STEP 24A COMPLETE / FINAL PRODUCTION SIGN-OFF PENDING EXTERNAL AND STEP 22B GATES")
  })

  it("lists every readiness item with the status the model holds", () => {
    const rows = tableRows("Readiness model")
    expect(rows.map(row => [row[0], row[1], row[2]])).toEqual(
      readinessModel.map(entry => [`\`${entry.id}\``, entry.area, entry.status]),
    )
    expect(rows.map(row => row[3])).toEqual(readinessModel.map(entry => entry.requirement))
  })

  it("lists every owner decision", () => {
    const rows = tableRows("Owner decisions")
    expect(rows.map(row => [row[0], row[1], row[2]])).toEqual(
      ownerDecisions.map(entry => [`\`${entry.id}\``, entry.area, entry.question]),
    )
  })

  it("reports the status counts the model actually holds", () => {
    const counts = statusCounts()
    expect(counts).toEqual({ READY: 12, READY_DISABLED: 8, ACTION_REQUIRED: 9, BLOCKED: 3, DEFERRED: 3 })
    expect(doc).toContain(
      "Twelve items are `READY`, eight are `READY_DISABLED`, nine are\n`ACTION_REQUIRED`, three are `BLOCKED` and three are `DEFERRED`",
    )
  })
})
