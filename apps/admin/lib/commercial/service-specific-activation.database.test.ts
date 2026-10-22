import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"
import { proposedServiceAgreements } from "../../../../lib/commercial/service-agreements"
import { paidServiceAgreementContentHash } from "../../../../lib/commercial/paid-service-agreement"

const devActivation = new URL("../../../../supabase/dev-activation/20261022_five_owner_approved_agreements.sql", import.meta.url)

describe("service-specific owner agreement activation (isolated in-memory database)", () => {
  it("preserves legacy mode after schema migration, then activates five exact owner-approved bodies", async () => {
    const db = new PGlite()
    try {
      await preparePlatform(db)
      await applyChain(db)
      const baseline = await db.query<{ mode: string }>(
        "select mode from admin_private.paid_service_agreement_routing_config where id=true",
      )
      expect(baseline.rows).toEqual([{ mode: "LEGACY" }])
      const before = await db.query<{ version_id: string; operative: boolean }>(
        "select version_id, operative from public.paid_service_agreement_catalogue order by version_id",
      )
      expect(before.rows).toEqual([{ version_id: "PS-2026-10-14.2", operative: false }])

      // This is synthetic in-memory fixture state only, never a live solicitor approval.
      const oldVersion = "PS-2026-10-14.2"
      const solicitorStatement = `Solicitor reviewed paid-service agreement ${oldVersion} with SHA-256 ${paidServiceAgreementContentHash}.`
      await db.query(
        "update public.paid_service_agreement_catalogue set status='APPROVED', operative=true, solicitor_confirmed_at=now(), solicitor_statement=$1 where version_id=$2",
        [solicitorStatement, oldVersion],
      )

      await db.exec(readFileSync(devActivation, "utf8"))
      const active = await db.query<{
        version_id: string
        content_hash: string
        body_text: string
        operative: boolean
        solicitor_statement: string | null
      }>("select version_id,content_hash,body_text,operative,solicitor_statement from public.paid_service_agreement_catalogue order by version_id")
      expect(active.rows).toHaveLength(6)
      const old = active.rows.find(r => r.version_id === oldVersion)!
      expect(old.content_hash).toBe(paidServiceAgreementContentHash)
      expect(old.solicitor_statement).toBe(solicitorStatement)
      for (const agreement of proposedServiceAgreements) {
        const row = active.rows.find(r => r.version_id === agreement.version)!
        expect(row.operative).toBe(true)
        expect(row.content_hash).toBe(agreement.contentHash)
        expect(row.body_text).toBe(agreement.body)
        expect(row.solicitor_statement).toBeNull()
      }
      const mode = await db.query<{ mode: string }>(
        "select mode from admin_private.paid_service_agreement_routing_config where id=true",
      )
      expect(mode.rows).toEqual([{ mode: "SERVICE_SPECIFIC" }])

      const records = await db.query<{ version_id: string; event: string }>(
        "select version_id,event from public.paid_service_agreement_events where event='OWNER_APPROVED' order by version_id",
      )
      expect(records.rows).toHaveLength(5)
      expect(records.rows.every(r => r.event === "OWNER_APPROVED")).toBe(true)
      const ver = await db.query<{ version: string | null }>(
        "select admin_private.paid_service_expected_version_v2('GUIDED_RELAUNCH') as version",
      )
      expect(ver.rows[0].version).toBe("PS-2026-10-22.GR")
      const missing = await db.query<{ version: string | null }>(
        "select admin_private.paid_service_expected_version_v2('NOT_A_SERVICE') as version",
      )
      expect(missing.rows[0].version).toBeNull()

      const valid = await db.query<{ ready: boolean; body: string }>(
        "select ready,body from admin_private.paid_service_quote_disclosure_v1($1,$2)",
        [proposedServiceAgreements[0].version, proposedServiceAgreements[0].contentHash],
      )
      expect(valid.rows).toEqual([{ ready: true, body: proposedServiceAgreements[0].body }])
      const wrong = await db.query<{ ready: boolean; body: string }>(
        "select ready,body from admin_private.paid_service_quote_disclosure_v1($1,$2)",
        [proposedServiceAgreements[0].version, proposedServiceAgreements[1].contentHash],
      )
      expect(wrong.rows).toEqual([])
      await expect(db.query(
        "update public.paid_service_agreement_catalogue set body_text='tampered' where version_id=$1",
        [proposedServiceAgreements[0].version],
      )).rejects.toThrow()
    } finally {
      await db.close()
    }
  }, 180000)
})
