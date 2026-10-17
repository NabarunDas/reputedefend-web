import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { evidencePreviewBlocks, splitEvidenceMessage } from "@/lib/case-journey/documents"
import {
  caseUpdateTemplateV2,
  evidenceRequestTemplateV2,
  renderTemplate,
  templateTextValid,
} from "./template-proposal"

const proposalPath = new URL("../../../../docs/admin/20261017143000_admin_journey_communication_templates_v2.sql", import.meta.url)
const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function sqlBodies(sql: string): string[] {
  return [...sql.matchAll(/(?:^|\s)E'((?:\\'|[^'])*)'/g)].map(match => (match[1] ?? "").replace(/\\n/g, "\n").replace(/\\'/g, "'"))
}

function paragraphs(value: string): string[] {
  return value.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
}

const internalLanguage = /\b(lifecycle|placeholder|outbox|supabase|evidence_request|record_version|queued|draft|template|caseflow|migration|admin_private)\b/i
const unsupportedAssurance = /\b(guarantee\w*|payment|delivered|reinstate\w*|refund|turnaround|reply|outcome)\b|google will|within \d+\s*(hour|day|business day)/i

function renderEvidence(specificDocument: string): string {
  const body = renderTemplate(evidenceRequestTemplateV2.body, {
    case_ref: "PR-1042",
    specific_document: specificDocument,
    upload_url: upload,
  })
  expect(body).not.toBeNull()
  return body ?? ""
}

describe("version 2 communication templates", () => {
  it("renders one document name and several semicolon-joined names in the same sentence", () => {
    expect(templateTextValid("EVIDENCE_REQUEST", evidenceRequestTemplateV2.subject, evidenceRequestTemplateV2.body)).toBe(true)
    const subject = renderTemplate(evidenceRequestTemplateV2.subject, {
      case_ref: "PR-1042",
      specific_document: "Shop licence",
      upload_url: upload,
    })
    expect(subject).toBe("Supporting information for your enquiry — PR-1042")

    const one = renderEvidence("Shop licence")
    const several = renderEvidence("Shop licence; Proof of operating location")
    for (const body of [one, several]) {
      expect(body.startsWith("Hello,")).toBe(true)
      expect(body).toContain("reference PR-1042")
      expect(body).toContain("the following supporting information?")
      expect(body).not.toMatch(/\bthis document\b/i)
      expect(body).toContain("Please upload the requested information using the secure link at the end of this email.")
      expect(body).toContain("please never share passwords, verification codes or sign-in credentials.")
      expect(body).not.toMatch(internalLanguage)
      expect(body).not.toMatch(unsupportedAssurance)
      expect(body).not.toMatch(/\{[a-z_]+\}/)
    }
    expect(one).toContain("\n\nShop licence\n\n")
    expect(several).toContain("\n\nShop licence; Proof of operating location\n\n")
    // render_template_v1 substitutes the saved title as one string. It does not
    // split '; ' into bullets, and this proposal does not rewrite stored titles.
    const preview = evidencePreviewBlocks(several)
    expect(preview.some(block => block.type === "list")).toBe(false)
    const named = preview.find(block => block.type === "paragraph" && block.text.includes(";"))
    expect(named && named.type === "paragraph" ? named.text : null).toBe("Shop licence; Proof of operating location")
  })

  it("keeps paragraph breaks and one trailing secure link after rendering", () => {
    const body = renderEvidence("Shop licence")
    expect(paragraphs(body)).toEqual([
      "Hello,",
      "Thank you for contacting ProfileRelaunch about your Google Business Profile.",
      "We're reviewing your enquiry, reference PR-1042. To help us understand the issue and advise you on the next steps, could you please provide the following supporting information?",
      "Shop licence",
      "Please upload the requested information using the secure link at the end of this email.",
      "If you're unsure what to provide, you can contact our team through the ProfileRelaunch website.",
      "For your security, please never share passwords, verification codes or sign-in credentials.",
      "Kind regards,",
      "ProfileRelaunch Support Team",
      "Secure document-upload link:",
      upload,
    ])
    expect(body.match(new RegExp(upload.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1)
    expect(body.trim().endsWith(upload)).toBe(true)
    expect(body.indexOf("Secure document-upload link:")).toBeLessThan(body.indexOf(upload))
    expect(splitEvidenceMessage(body)).toEqual({
      prose: paragraphs(body).slice(0, -1).join("\n\n"),
      uploadUrl: upload,
    })
    const preview = evidencePreviewBlocks(body)
    expect(preview.at(-1)).toEqual({ type: "link", url: upload })
    expect(preview.filter(block => block.type === "link")).toHaveLength(1)
  })

  it("renders a case update from the placeholders the draft command already supplies", () => {
    expect(templateTextValid("CASE_UPDATE", caseUpdateTemplateV2.subject, caseUpdateTemplateV2.body)).toBe(true)
    const values = {
      case_ref: "PR-1042",
      fact: "The listing is still suspended.",
      effect: "The review cannot continue without the notice.",
      next_step: "Send the notice through the secure page already provided.",
    }
    expect(renderTemplate(caseUpdateTemplateV2.subject, values)).toBe("An update on your enquiry — PR-1042")
    const body = renderTemplate(caseUpdateTemplateV2.body, values)
    expect(paragraphs(body ?? "")).toEqual([
      "Hello,",
      "Here is an update on your enquiry, reference PR-1042.",
      "The listing is still suspended.",
      "The review cannot continue without the notice.",
      "What happens next:",
      "Send the notice through the secure page already provided.",
      "Kind regards,",
      "ProfileRelaunch Support Team",
    ])
    expect(`${caseUpdateTemplateV2.subject}\n${caseUpdateTemplateV2.body}`).not.toMatch(internalLanguage)
    expect(`${caseUpdateTemplateV2.subject}\n${caseUpdateTemplateV2.body}`).not.toMatch(unsupportedAssurance)
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

  it("matches the unapplied SQL and leaves version 1 and stored emails untouched", () => {
    const sql = readFileSync(proposalPath, "utf8")
    expect(proposalPath.pathname).not.toContain("/supabase/migrations/")
    expect(sql).toContain(`'${evidenceRequestTemplateV2.subject}'`)
    expect(sql).toContain(`'${caseUpdateTemplateV2.subject}'`)
    expect(sqlBodies(sql)).toEqual([evidenceRequestTemplateV2.body, caseUpdateTemplateV2.body])
    expect(sql).toContain("'EVIDENCE_REQUEST'")
    expect(sql).toContain("'CASE_UPDATE'")
    expect(sql).toMatch(/2,\s*\n\s*'Evidence request'/)
    expect(sql).toContain("'DRAFT'")
    expect(sql).toContain("Version 1 remains the live approved template.")
    expect(sql).toContain("status = 'APPROVED' ORDER BY version DESC LIMIT 1")
    expect(sql).not.toMatch(/^\s*UPDATE\b/im)
    expect(sql).not.toMatch(/^\s*DELETE\b/im)
    expect(sql).not.toMatch(/SET\s+status\s*=\s*'APPROVED'/i)
    expect(sql).not.toMatch(/^\s*(insert\s+into|update|delete\s+from)\s+public\.communications\b/im)
    expect(sql).not.toMatch(/\b(delivery_events|email_outbox|communication_receipts)\b/i)
  })
})
