import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { findMigration, pendingMigrations } from "../recovery/manifest"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "./reauth-copy"

const root = new URL("../../../../", import.meta.url)
const migrationName = "20261024085235_admin_recent_signin_30m_v1.sql"
const replaced = [
  "public.admin_record_save_v1",
  "public.admin_contact_verify_v1",
  "public.admin_membership_save_v1",
  "public.admin_authorization_command_v1",
  "public.admin_manager_access_command_v1",
  "public.admin_revoke_session_v1",
  "public.admin_catalogue_command_v1",
  "public.admin_job_replay_v1",
  "public.admin_dev_stripe_one_shot_claim_v1",
  "admin_private.admin_payment_command_core_v1",
  "public.payment_prepare_invoice_v1",
  "admin_private.guard_activate_v1",
  "admin_private.guard_issue_price_change_v1",
  "admin_private.guard_schedule_cancellation_v1",
  "admin_private.guard_undo_cancellation_v1",
  "admin_private.guard_request_immediate_cancellation_v1",
  "admin_private.guard_approve_refund_v1",
  "admin_private.guard_approve_immediate_cancellation_v1",
  "admin_private.guard_approve_credit_v1",
  "admin_private.guard_map_provider_price_v1",
  "admin_private.settings_reauth_ok_v1",
] as const

function read(path: string) {
  return readFileSync(new URL(path, root), "utf8")
}

describe("the Admin 30-minute recent-sign-in migration", () => {
  const sql = read(`supabase/migrations/${migrationName}`)

  it("replaces the audited functions and no unrelated timer", () => {
    expect(findMigration(migrationName)).toMatchObject({
      appliedToDev: true,
      containsDataChange: false,
      safeToReplay: false,
    })
    expect(pendingMigrations().map(entry => entry.filename)).toEqual([
      "20261031120000_guided_pack_ready_dispatch_v1.sql",
    ])
    const created = sql.split("\n").filter(line => line.startsWith("CREATE OR REPLACE FUNCTION ") || line.startsWith("CREATE FUNCTION "))
    expect(created.map(line => line.replace(/^CREATE OR REPLACE FUNCTION |^CREATE FUNCTION /, "").split("(")[0])).toEqual([...replaced])
    expect(sql).not.toContain("interval '5 minutes'")
    expect(sql).not.toContain("job_backoff")
    expect(sql).not.toContain("48 hours 5 minutes")
    expect(sql).toContain("interval '30 minutes'")
    expect(sql).toContain("created_at >= now() - interval '30 minutes'")
    expect(sql).toContain("last_seen_at>now()-interval '30 minutes'")
  })

  it("leaves historical definitions and the already-applied email claim unchanged", () => {
    const historical = read("supabase/migrations/20260917183422_admin_client_workspace_v1.sql")
    expect(historical).toContain("interval '5 minutes'")
    const supersededEmail = read("supabase/migrations/20261022172455_quote_offer_email_v1.sql")
    expect(supersededEmail).toContain("interval '5 minutes'")
    const appliedEmail = read("supabase/migrations/20261023221042_dev_email_recent_login_30m_v1.sql")
    expect(appliedEmail).toContain("interval '30 minutes'")
    expect(appliedEmail).not.toContain("interval '5 minutes'")
    expect(sql).not.toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.admin_dev_send_email_claim_v1/)
  })

  it("uses one recent-sign-in sentence in Admin commands and screens", () => {
    expect(ADMIN_RECENT_SIGN_IN_MESSAGE).toBe(
      "For security, sign in again if your last Admin sign-in was more than 30 minutes ago.",
    )
    const allowed = new Set([
      "apps/admin/lib/evidence/storage.test.ts",
      "apps/admin/lib/evidence/command.test.ts",
      "apps/admin/lib/communications/database.test.ts",
    ])
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(new URL(dir, root))) {
        const path = `${dir}${name}`
        if (name === "node_modules" || name === ".next") continue
        const statPath = new URL(path, root)
        try {
          const listed = readdirSync(statPath)
          walk(`${path}/`)
          void listed
        } catch {
          if (!/\.(ts|tsx|md)$/.test(name)) continue
          const relative = path.replace(/^\.\//, "")
          if (allowed.has(relative)) continue
          const recentSignInPhrase = ["five", "minutes"].join(" ")
          if (read(path).toLowerCase().includes(recentSignInPhrase)) hits.push(relative)
        }
      }
    }
    walk("apps/admin/")
    expect(hits).toEqual([])
  })
})
