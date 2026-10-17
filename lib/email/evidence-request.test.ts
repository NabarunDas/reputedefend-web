import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  brandStoredEvidenceEmail,
  composeEvidenceRequestEmail,
  evidenceDocumentItems,
  evidenceRequestSubject,
} from "@/lib/email/evidence-request"
import { customerEmailLogoUrl } from "@/lib/email/customer-message"

const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const proposalPath = new URL("../../docs/admin/20261017170000_comms_brand_evidence_request_v3.sql", import.meta.url)

function sqlBodies(sql: string): string[] {
  return [...sql.matchAll(/(?:^|\s)E'((?:\\'|[^'])*)'/g)].map(match => (match[1] ?? "").replace(/\\n/g, "\n").replace(/\\'/g, "'"))
}

describe("evidence request email", () => {
  it("renders one document and several documents as a real list", () => {
    expect(evidenceDocumentItems("Shop licence")).toEqual(["Shop licence"])
    expect(evidenceDocumentItems("Shop licence; Proof of operating location")).toEqual([
      "Shop licence",
      "Proof of operating location",
    ])
    expect(evidenceDocumentItems("Other evidence")).toBeNull()
    expect(evidenceDocumentItems("Shop licence; Other evidence")).toBeNull()

    const one = composeEvidenceRequestEmail({ caseRef: "PR-1042", documents: ["Shop licence"], uploadUrl: upload })
    const several = composeEvidenceRequestEmail({
      caseRef: "PR-1042",
      documents: ["Shop licence", "Proof of operating location"],
      uploadUrl: upload,
    })
    expect(one?.subject).toBe("Supporting documents for your ProfileRelaunch enquiry — PR-1042")
    for (const message of [one, several]) {
      expect(message?.html).toContain("<ul")
      expect(message?.html).toContain(customerEmailLogoUrl)
      expect(message?.html).toContain(`href="${upload}"`)
      expect(message?.html.match(new RegExp(upload, "g"))).toHaveLength(1)
      expect(message?.text.match(new RegExp(upload, "g"))).toHaveLength(1)
      expect(message?.text.endsWith("sign-in credentials.") || message?.text.includes(upload)).toBe(true)
      expect(message?.html).not.toContain("#t=")
      expect(message?.text).not.toContain("#t=")
      expect(message?.html).not.toMatch(/\bthis document\b/i)
      expect(message?.text).not.toMatch(/\b(reply|guarantee|payment|delivered|lifecycle|template)\b/i)
    }
    expect(one?.html.match(/<li/g)).toHaveLength(1)
    expect(several?.html.match(/<li/g)).toHaveLength(2)
    expect(several?.text).toContain("- Shop licence\n- Proof of operating location")
    expect(one?.text).toContain("could you please provide the following information?")
    expect(several?.text).toContain("could you please provide the following information?")
  })

  it("promises a reply only when a monitored mailbox is configured", () => {
    const closed = composeEvidenceRequestEmail({ caseRef: "PR-1042", documents: ["Shop licence"], uploadUrl: upload })
    const open = composeEvidenceRequestEmail({
      caseRef: "PR-1042",
      documents: ["Shop licence"],
      uploadUrl: upload,
      replyTo: "cases@profilerelaunch.com",
    })
    expect(closed?.text).not.toMatch(/\breply\b/i)
    expect(closed?.text).toContain("ProfileRelaunch website")
    expect(open?.text).toContain("simply reply to this email")
    expect(open?.html).not.toContain("cases@profilerelaunch.com")
  })

  it("keeps the secret token out of the drafted snapshot", () => {
    const message = composeEvidenceRequestEmail({ caseRef: "PR-1042", documents: ["Shop licence"], uploadUrl: upload })
    expect(message?.html).not.toContain("#t=")
    expect(message?.text).not.toContain("#t=")
    expect(message?.html.match(new RegExp(upload.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1)
    expect(brandStoredEvidenceEmail({
      subject: "Documents",
      body: `${upload}#t=${"a".repeat(64)}`,
    })).toBeNull()
  })

  it("turns a saved semicolon title into bullets without showing a vague name", () => {
    const branded = brandStoredEvidenceEmail({
      subject: "Supporting information for your enquiry — PR-1042",
      documentTitle: "Shop licence; Proof of operating location",
      body: `Hello,\n\nShop licence; Proof of operating location\n\n${upload}`,
    })
    expect(branded?.documents).toEqual(["Shop licence", "Proof of operating location"])
    expect(branded?.html.match(/<li/g)).toHaveLength(2)
    expect(branded?.html).not.toContain("Shop licence; Proof")
    expect(brandStoredEvidenceEmail({
      subject: "Documents",
      documentTitle: "Other evidence",
      body: `Hello,\n\nOther evidence\n\n${upload}`,
    })?.html).not.toContain("Other evidence")
  })

  it("renders a snapshotted bullet list once, including its footer", () => {
    const branded = brandStoredEvidenceEmail({
      subject: "Supporting documents for your ProfileRelaunch enquiry — PR-1042",
      documentTitle: "Shop licence; Proof of operating location",
      body: [
        "Hello,",
        "Documents requested\n- Shop licence\n- Proof of operating location",
        "Please use the secure button below to upload your documents.",
        `Upload your documents securely\n${upload}`,
        "Case reference: PR-1042",
        "https://profilerelaunch.com",
        "For your security, please never share passwords, verification codes or sign-in credentials.",
      ].join("\n\n"),
    })
    expect(branded?.html.match(/<li/g)).toHaveLength(2)
    expect(branded?.html.match(/Case reference: PR-1042/g)).toHaveLength(1)
    expect(branded?.text.match(/Case reference: PR-1042/g)).toHaveLength(1)
    expect(branded?.html.match(/For your security/g)).toHaveLength(1)
    expect(branded?.html.match(/profile-relaunch-logo.png/g)).toHaveLength(1)
  })

  it("matches the unapplied version 3 draft and does not edit version 2", () => {
    const sql = readFileSync(proposalPath, "utf8")
    expect(proposalPath.pathname).not.toContain("/supabase/migrations/")
    expect(sql).toContain(evidenceRequestSubject)
    const templateBody = sqlBodies(sql).find(body => body.includes("{specific_document}"))
    expect(templateBody).toContain("{upload_url}")
    expect(templateBody).toContain("{case_ref}")
    expect(templateBody).not.toMatch(/\breply\b/i)
    expect(sql).toContain("'EVIDENCE_REQUEST'")
    expect(sql).toMatch(/3,\s*\n\s*'Evidence request'/)
    expect(sql).toContain("'DRAFT'")
    expect(sql).not.toMatch(/^\s*UPDATE\b/im)
    expect(sql).not.toMatch(/SET\s+status\s*=\s*'APPROVED'/i)
    expect(sql).toContain("template_version, 0) < 3")
  })
})
