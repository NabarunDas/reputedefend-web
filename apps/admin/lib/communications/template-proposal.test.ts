import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  caseUpdateTemplateV2,
  evidenceRequestTemplateV2,
  renderTemplate,
  templateTextValid,
} from "./template-proposal"

const proposalPath = new URL("../../../../docs/admin/20261017143000_admin_journey_communication_templates_v2.sql", import.meta.url)

function sqlBodies(sql: string): string[] {
  return [...sql.matchAll(/(?:^|\s)E'((?:\\'|[^'])*)'/g)].map(match => (match[1] ?? "").replace(/\\n/g, "\n").replace(/\\'/g, "'"))
}

describe("version 2 communication templates", () => {
  const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

  it("renders the evidence request with one document, one upload link and no promises", () => {
    expect(templateTextValid("EVIDENCE_REQUEST", evidenceRequestTemplateV2.subject, evidenceRequestTemplateV2.body)).toBe(true)
    const subject = renderTemplate(evidenceRequestTemplateV2.subject, {
      case_ref: "PR-1042",
      specific_document: "Google suspension or rejection notice",
      upload_url: upload,
    })
    const body = renderTemplate(evidenceRequestTemplateV2.body, {
      case_ref: "PR-1042",
      specific_document: "Google suspension or rejection notice",
      upload_url: upload,
    })
    expect(subject).toBe("Documents for PR-1042")
    expect(body?.startsWith("Hello,")).toBe(true)
    expect(body).toContain("case PR-1042")
    expect(body).toContain("\n\nGoogle suspension or rejection notice\n\n")
    expect(body?.match(new RegExp(upload.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1)
    expect(body).toContain("Kind regards,")
    expect(body?.indexOf("ProfileRelaunch")).toBeLessThan(body?.indexOf(upload) ?? -1)
    expect(body?.trim().endsWith(upload)).toBe(true)
    expect(body).not.toMatch(/reply|password|verification code|other evidence|payment is|delivered/i)
    expect(body).not.toMatch(/\{[a-z_]+\}/)
  })

  it("renders a case update from the placeholders the draft command already supplies", () => {
    expect(templateTextValid("CASE_UPDATE", caseUpdateTemplateV2.subject, caseUpdateTemplateV2.body)).toBe(true)
    const body = renderTemplate(caseUpdateTemplateV2.body, {
      case_ref: "PR-1042",
      fact: "The listing is still suspended.",
      effect: "The review cannot continue without the notice.",
      next_step: "Send the notice through the secure page already provided.",
    })
    expect(renderTemplate(caseUpdateTemplateV2.subject, {
      case_ref: "PR-1042",
      fact: "The listing is still suspended.",
      effect: "The review cannot continue without the notice.",
      next_step: "Send the notice through the secure page already provided.",
    })).toBe("An update on PR-1042")
    expect(body).toContain("Hello,")
    expect(body).toContain("The listing is still suspended.")
    expect(body).toContain("What happens next:")
    expect(body?.trim().endsWith("ProfileRelaunch")).toBe(true)
    expect(body).not.toMatch(/\{[a-z_]+\}/)
  })

  it("fails closed when a value is empty or still contains a placeholder", () => {
    expect(renderTemplate(evidenceRequestTemplateV2.body, {
      case_ref: "PR-1042",
      specific_document: "",
      upload_url: upload,
    })).toBeNull()
    expect(renderTemplate(evidenceRequestTemplateV2.body, {
      case_ref: "PR-1042",
      specific_document: "See {upload_url}",
      upload_url: upload,
    })).toBeNull()
    expect(templateTextValid("EVIDENCE_REQUEST", "Hello", "No placeholders here at all.")).toBe(false)
  })

  it("matches the unapplied SQL proposal and does not rewrite version 1", () => {
    const sql = readFileSync(proposalPath, "utf8")
    expect(proposalPath.pathname).not.toContain("/supabase/migrations/")
    expect(sql).toContain("Documents for {case_ref}")
    expect(sql).toContain("An update on {case_ref}")
    expect(sqlBodies(sql)).toEqual([evidenceRequestTemplateV2.body, caseUpdateTemplateV2.body])
    expect(sql).toContain("'DRAFT'")
    expect(sql).not.toMatch(/^\s*UPDATE\b/im)
    expect(sql).not.toMatch(/SET\s+status\s*=\s*'APPROVED'/i)
  })
})
