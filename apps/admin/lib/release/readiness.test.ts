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
import { approvedRecoveryObjectives, ownerDecisions, productionDatabaseStrategies, strategy } from "./decisions"
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
    expect(pendingMigrations()).toEqual([])
    expect(appliedMigrationHead.version).toBe("20261101170000")
    expect(appliedMigrationHead.containsDataChange).toBe(false)
    expect(appliedMigrationHead.safeToReplay).toBe(false)
    expect(migrationHead.filename).toBe("20261101170000_commercial_foundation_v1.sql")
    expect(migrationHead.appliedToDev).toBe(true)
    expect(migrationHead.safeToReplay).toBe(false)
    expect(appliedMigrationHead.appliedToDev).toBe(true)
    const supabase = item("supabase.applied-head")
    expect(supabase?.status).toBe("READY")
    expect(supabase?.requirement).toContain(appliedMigrationHead.version)
    expect(supabase?.requirement).toContain("Observed DEV ledger head is 20261101170000")
    expect(supabase?.requirement).toContain("The verified DEV ledger contains 92 entries")
    expect(supabase?.requirement).toContain("20261101170000 commercial_foundation_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261101170000")
    expect(supabase?.requirement).toContain("containsDataChange is false")
    expect(supabase?.requirement).toContain("51,901 characters")
    expect(supabase?.requirement).toContain("5e293cf4091c12096e7cba65e59e450e660d529d739ec8cdfc83a03bf2b2e7fb")
    expect(supabase?.requirement).toContain("All 15 commercial tables exist and have RLS enabled.")
    expect(supabase?.requirement).toContain("20261031160000 customer_portal_idle_timeout_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261031160000")
    expect(supabase?.requirement).toContain("That UPDATE is DML outside a function body, so containsDataChange is true.")
    expect(supabase?.requirement).toContain("bdb533e18a4a947f2726c9007a59f90288985d4eeae1ca9afc5c5d0d4329db8f")
    expect(supabase?.requirement).toContain("7,609 bytes")
    expect(supabase?.requirement).toContain("20261031150000 customer_case_reference_subjects_v1 is already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261031150000")
    expect(supabase?.requirement).toContain("a500bb693b914745ff746904552253bf67e8bd635f3b2798f482650d1eb6c2b1")
    expect(supabase?.requirement).toContain("The case-reference file does not rewrite stored communications, quotations, receipts or catalogue rows.")
    expect(supabase?.requirement).toContain("20261031120000 guided_pack_ready_dispatch_v1 and 20261031140000 guided_customer_outcome_v1 are already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261031120000 or 20261031140000")
    expect(supabase?.requirement).toContain("The pack-ready file does not send mail or change stored case rows by itself.")
    expect(supabase?.requirement).toContain("The outcome file does not send mail, close a case, change a payment, or edit a stored outcome.")
    expect(supabase?.requirement).toContain("20261030120000 guided_pack_stage_sync_v1, 20261030130000 guided_assessment_pack_basis_v1 and 20261030200000 guided_payment_request_after_acceptance_v1 are already applied on DEV")
    expect(supabase?.requirement).toContain("Do not replay 20261030200000")
    expect(supabase?.requirement).toContain("The repository applied-file head is 20261101170000")
    expect(supabase?.requirement).not.toContain("unapplied 20261031150000")
    expect(supabase?.requirement).not.toContain("unapplied 20261031160000")
    expect(supabase?.requirement).not.toContain("Do not apply it without a separate approval")
    expect(supabase?.requirement).not.toContain("unapplied 20261031120000")
    expect(supabase?.requirement).not.toContain("unapplied 20261031140000")
    expect(supabase?.requirement).not.toContain("unapplied 20261030200000")
    expect(supabase?.requirement).not.toContain("unapplied 20261030120000")
    expect(supabase?.requirement).not.toContain("unapplied 20261030130000")
    expect(supabase?.requirement).toContain("35,478 characters")
    expect(supabase?.requirement).toContain("db1a0d28fb368c7f9c9d12970f83ed46065109a1c9147451e3e75cc835fa6e56")
    expect(supabase?.requirement).toContain("20261029150239")
    expect(supabase?.requirement).toContain("Develop mail dispatch 20261029000000 remains applied on DEV")
    expect(supabase?.requirement).toContain("20,338 characters")
    expect(supabase?.requirement).toContain("9a510a79f57da4641176c3d1bec52a9d6d10f3880763924dc7c47057ecb89a2a")
    expect(supabase?.requirement).toContain("20261029150125")
    expect(supabase?.requirement).toContain("Context function volatility 20261028223000 remains applied on DEV")
    expect(supabase?.requirement).toContain("20261028200606")
    expect(supabase?.requirement).toContain("Draft document role 20261028200000 remains applied on DEV")
    expect(supabase?.requirement).toContain("d78e22b62753beb07a1013370b885abbe0e51cd940dfdc4c223888b492789d2c")
    expect(supabase?.requirement).toContain("1,698 characters")
    expect(supabase?.requirement).toContain("admin_guided_pack_mail_context_v1(text, uuid, uuid)")
    expect(supabase?.requirement).toContain("admin_guided_completion_context_v1(text, uuid)")
    expect(supabase?.requirement).toContain("admin_managed_notice_context_v1(text, text, uuid, uuid)")
    expect(supabase?.requirement).toContain("NOTIFY pgrst, 'reload schema'")
    expect(supabase?.requirement).not.toContain("is not applied to DEV")
    expect(supabase?.requirement).not.toContain("20261028223000 remains unapplied")
    expect(supabase?.requirement).toContain("75052ce67d660f5836b59b8cb1f98cd76b39076ea68fa87ec5cdcaf522b56368")
    expect(supabase?.requirement).toContain("20261028185030")
    expect(supabase?.requirement).toContain("23,704-character")
    expect(supabase?.requirement).toContain("must not be replayed")
    expect(supabase?.requirement).toContain("20261026180000 and payment receipt delivery 20261026190000 are already in the DEV ledger")
    expect(supabase?.requirement).toContain("Compare the source SHA-256 of 20261026180000 and 20261026190000")
    expect(supabase?.requirement).toContain("Guided pack publication 20261028160000 remains applied on DEV")
    expect(supabase?.requirement).toContain("ce08c89bb8a5388bf75c1edb2c33979eca396ea5d92665cf0f799ef9d858ef83")
    expect(supabase?.requirement).toContain("20261028161444")
    expect(supabase?.requirement).toContain("30,023-character")
    expect(supabase?.requirement).toContain("Guided post-payment handover 20261028120000 remains applied on DEV")
    expect(supabase?.requirement).toContain("01f1e7c1a91d5414177da91a8f109e5dd24062ad1d2a863a5b5395b58b01baa4")
    expect(supabase?.requirement).toContain("Billing documents 20261027120000 remains applied on DEV")
    expect(supabase?.requirement).toContain("bb3ff59154e28d73208529557f67cdce144a4cf1b017257198c8be4301ab52e0")
    expect(supabase?.requirement).toContain("ADMIN-JOURNEY-E2E-03 20261020150000 admin_journey_e2e_03_success_fee_guard_v1 was independently applied to DEV only")
    expect(supabase?.requirement).toContain("ADMIN-JOURNEY-E2E-04 20261020210000 admin_journey_e2e_04_customer_outcome_v1 was independently applied to DEV only")
    expect(supabase?.requirement).toContain("recorded without replay")
    expect(supabase?.requirement).toContain("Step 10B 20261019183000 admin_journey_10b_record_outcome_v1 was applied to DEV only")
    expect(supabase?.requirement).toContain("It was not applied to Production")
    expect(supabase?.requirement).toContain("genuine scheduled SEC-08 new-head backup 20261014T213909Z")
    expect(supabase?.requirement).toContain("AWS ApprovedMigrationHead remain 20261014170000")
    expect(supabase?.requirement).toContain("Production applied head")
    expect(supabase?.requirement).toContain("CodeBuild project, IAM role and ENABLED three-hour Scheduler identities were preserved")
    expect(supabase?.requirement).not.toContain("source-only")
    expect(supabase?.requirement).not.toContain("|")
    expect(supabase?.evidence).toContain("PROD applied SEC-02 and SEC-03")
    expect(supabase?.evidence).toContain("20260915120000")
    expect(supabase?.evidence).toContain("20261010200000 customer_action_otp_limits_v1")
    expect(supabase?.evidence).toContain("appliedToDev true")
    expect(supabase?.evidence).toContain("contains 92 entries and ends at canonical 20261101170000")
    expect(supabase?.evidence).toContain("5e293cf4091c12096e7cba65e59e450e660d529d739ec8cdfc83a03bf2b2e7fb")
    expect(supabase?.evidence).toContain("recorded without replaying SQL")
    expect(supabase?.externalAction).toContain("Do not replay DEV-applied 20261031120000 or 20261031140000")
    expect(supabase?.externalAction).toContain("Do not replay DEV-applied 20261101170000")
    expect(supabase?.externalAction).toContain("Do not replay DEV-applied 20261031160000")
    expect(supabase?.externalAction).toContain("Do not replay DEV-applied 20261031150000")
    expect(supabase?.evidence).toContain("rmzozuiamjcclvtgutgd")
    expect(supabase?.evidence).toContain("cxwwekdzkkjjbiyofrov applied canonical SEC-08")
    expect(supabase?.evidence).toContain("0 trusted hashes")
    expect(supabase?.evidence).toContain("DB_CONNECTIVITY_RETRIES_EXHAUSTED")
    expect(supabase?.externalAction).toContain("Do not replay applied DEV or Production migrations")
    expect(supabase?.externalAction).toContain("genuine new-head SEC-08 archive 20261014T213909Z")
    expect(supabase?.verification).toContain("COM-13A/COM-13B/COM-14A/PAY-ENV-01/PAY-ENV-04 each appears once in DEV only")
    expect(supabase?.verification).toContain("SEC-08 appears once in both migration ledgers")
    expect(supabase?.verification).toContain("Compare DEV head against canonical 20261101170000")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261101170000")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261031160000")
    expect(supabase?.verification).toContain("Production head against 20261014170000")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261031150000")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261031140000 or 20261031120000")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261030200000")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261029010000 or apply it to Production")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261029000000 or apply it to Production")
    expect(supabase?.verification).toContain("Do not replay DEV-applied 20261028223000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("If DEV head differs from canonical 20261101170000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261101170000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261031160000")
    expect(supabase?.stopCondition).toContain("Production head differs from canonical 20261014170000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261031150000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261031120000 or 20261031140000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261030200000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261029010000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261029000000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261028223000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261025163000, 20261026140000 or 20261026170000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261026180000 or 20261026190000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261027120000. Do not replay DEV-applied 20261028120000 or apply it to Production. Do not replay DEV-applied 20261028160000 or apply it to Production. Do not replay DEV-applied 20261028200000 or apply it to Production.")
    expect(supabase?.requirement).not.toContain("20261028120000 remains unapplied")
    expect(supabase?.requirement).not.toContain("20261028160000 remains unapplied")
    expect(supabase?.requirement).not.toContain("20261028200000 remains unapplied")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261025020000, 20261025140000 or 20261025160000")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261021155147")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261021214813 or apply it to Production")
    expect(supabase?.stopCondition).toContain("Do not replay DEV-applied 20261020210000 or apply it to Production")
    expect(supabase?.stopCondition).toContain("do not apply those statements to Production")
    expect(supabase?.stopCondition).toContain("Stop the release if the AWS backup head drifts")
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
      "retention.periods",
      "service.first-response",
    ])
    const incomplete = ownerDecisions
      .filter(entry => entry.question.trim().length < 30 || entry.currentBehaviour.trim().length < 30 || entry.blocks.trim().length < 10)
      .map(entry => entry.id)
    expect(incomplete).toEqual([])
  })

  it("records the approved launch recovery objectives separately from unresolved decisions", () => {
    expect(approvedRecoveryObjectives).toEqual({
      approvedAt: "2026-10-05",
      databaseRpoHours: 4,
      coreServiceRtoHours: 4,
      logicalBackupCadenceHours: 3,
      logicalBackupRetentionDays: 7,
    })
    expect(ownerDecisions.some(entry => entry.id === "recovery.objectives")).toBe(false)
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
    expect(item("supabase.migration-ledger-discrepancy")?.status).toBe("READY")
    expect(item("supabase.migration-ledger-discrepancy")?.externalAction).toBeNull()
    expect(item("supabase.legacy-objects")?.status).toBe("READY")
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
    expect(counts).toEqual({ READY: 15, READY_DISABLED: 8, ACTION_REQUIRED: 7, BLOCKED: 3, DEFERRED: 3 })
    expect(doc).toContain(
      "Fifteen items are `READY`, eight are `READY_DISABLED`, seven are\n`ACTION_REQUIRED`, three are `BLOCKED` and three are `DEFERRED`",
    )
    expect(item("email.dev-mail-schedule")?.status).toBe("BLOCKED")
    expect(item("email.dev-mail-schedule")?.requirement).toContain("not a GitHub Actions schedule")
    expect(item("email.dev-mail-schedule")?.evidence).toContain("not_needed")
  })
})
