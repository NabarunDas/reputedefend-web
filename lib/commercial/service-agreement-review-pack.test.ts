import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { agreementBlocks } from "./agreement-render"
import { buildAgreementPdf } from "./agreement-pdf"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash } from "./paid-service-agreement"
import { proposedServiceAgreements } from "./service-agreements"

const packRoot = new URL("../../docs/customer/", import.meta.url)
const readingCopies = {
  GUIDED_RELAUNCH: "quote-02/guided-relaunch.pdf",
  GUIDED_REVIEW: "quote-02/guided-review.pdf",
  MANAGED_RELAUNCH: "quote-02/managed-profile-recovery.pdf",
  MANAGED_REVIEW: "quote-02/managed-review-protection.pdf",
  RELAUNCH_GUARD: "quote-02/relaunch-guard.pdf",
} as const

type PdfWord = { xMin: number; yMin: number; xMax: number; yMax: number; text: string }

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
}

function popplerPages(pdf: Buffer): PdfWord[][] {
  const dir = mkdtempSync(join(tmpdir(), "review-pack-pdf-"))
  const file = join(dir, "agreement.pdf")
  writeFileSync(file, pdf)
  const xml = execFileSync("pdftotext", ["-bbox", "-enc", "UTF-8", file, "-"], { encoding: "utf8" })
  return xml.split("<page ").slice(1).map(page => page.split("<word ").slice(1).map(chunk => {
    const attrs = chunk.slice(0, chunk.indexOf(">"))
    const number = (name: string) => Number(attrs.split(`${name}="`)[1]?.split("\"")[0])
    const text = decodeXml(chunk.slice(chunk.indexOf(">") + 1, chunk.indexOf("</word>")))
    return { xMin: number("xMin"), yMin: number("yMin"), xMax: number("xMax"), yMax: number("yMax"), text }
  }))
}

function contentText(pages: PdfWord[][]): string {
  return pages.flatMap(page => page.filter(word => word.yMin >= 100 && word.yMin < 788).map(word => word.text)).join("")
}

describe("service-agreement review pack", () => {
  const pack = readFileSync(new URL("customer-quote-02.md", packRoot), "utf8")

  it("keeps every proposal unapproved and ties each reading copy to its source hash", () => {
    expect(pack).toContain("It does not approve them.")
    expect(pack).toContain("Cursor, CI, and this document do not do that.")
    expect(pack).toContain("No catalogue row is inserted")
    expect(pack).toContain(PAID_SERVICE_AGREEMENT_VERSION)
    expect(pack).toContain(paidServiceAgreementContentHash)
    expect(proposedServiceAgreements).toHaveLength(5)
    for (const agreement of proposedServiceAgreements) {
      expect(agreement.status).toBe("SOLICITOR_REVIEW")
      expect(agreement.operative).toBe(false)
      expect(agreement.solicitorReviewComplete).toBe(false)
      expect(pack).toContain(agreement.version)
      expect(pack).toContain(agreement.contentHash)
      expect(pack).toContain(readingCopies[agreement.serviceCode])
      const pdf = readFileSync(new URL(readingCopies[agreement.serviceCode], packRoot))
      expect(Buffer.from(buildAgreementPdf(agreement.body)).equals(pdf)).toBe(true)
      const pages = popplerPages(pdf)
      expect(pages.length).toBeGreaterThan(1)
      for (const page of pages) {
        for (const word of page.filter(item => item.yMin >= 100 && item.yMin < 788)) {
          expect(word.xMin).toBeGreaterThanOrEqual(52)
          expect(word.xMax).toBeLessThanOrEqual(543)
        }
      }
      const squash = (value: string) => value.replace(/\s+/g, "")
      const expected = agreementBlocks(agreement.body).map(block => block.text).join("")
      expect(squash(contentText(pages))).toBe(squash(expected))
      const extracted = contentText(pages)
      expect(extracted).not.toContain(agreement.version)
      expect(extracted).not.toContain(agreement.contentHash)
      expect(extracted).not.toContain("SHA-256")
    }
  })

  it("asks for the substantive decisions and does not carry out the DEV rehearsal", () => {
    for (const decision of ["D1.", "D2.", "D3.", "D4.", "D5.", "D6.", "D7.", "D8.", "D9.", "D10.", "D11.", "D12.", "D13.", "D14."]) {
      expect(pack).toContain(decision)
    }
    expect(pack).toContain("does not require the customer to add ProfileRelaunch as a Manager")
    expect(pack).toContain("paid-member discount does not apply during the included period")
    expect(pack).toContain("at least 30 days' notice")
    expect(pack).toContain("aligned in draft")
    expect(pack).toContain("requires human approval")
    expect(pack).toContain("PS-2026-10-21.GR")
    expect(pack).toContain("e4f9ecb589f0e4efa8f46a25faa750bb2db3cf3ad1665b511f34fb486fbe8c88")
    expect(pack).toContain("No migration in this change.")
    expect(pack).toContain("QT-26-H6JSMB")
    expect(pack).toContain("PR-26-RZYCE4")
    expect(pack).toContain("`cancel`")
    expect(pack).toContain("`create_draft`")
    expect(pack).toContain("Do not call `create_version` and then `offer` on `QT-26-H6JSMB`")
    expect(pack).toContain("Do not leave `QT-26-H6JSMB` offered while another quotation for the case is also offered.")
    expect(pack).toContain("This rehearsal does not send them.")
    expect(pack).not.toContain("migration applied")
  })
})
