import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { agreementBlocks } from "./agreement-render"
import { AgreementPdfError, buildAgreementPdf, pdfPlainText } from "./agreement-pdf"
import { paidServiceAgreementBody, paidServiceAgreementContentHash } from "./paid-service-agreement"
import { proposedServiceAgreement } from "./service-agreements"

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

function isContent(word: PdfWord): boolean {
  return word.yMin >= 100 && word.yMin < 788
}

function popplerPages(pdf: Uint8Array): PdfWord[][] {
  const dir = mkdtempSync(join(tmpdir(), "agreement-pdf-"))
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
  return pages.flatMap(page => page.filter(isContent).map(word => word.text)).join("")
}

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

describe("branded agreement PDF", () => {
  it("contains the exact frozen wording, including pounds, dashes and the version line", () => {
    const pdf = buildAgreementPdf(paidServiceAgreementBody)
    const source = Buffer.from(pdf).toString("latin1")
    expect(source.startsWith("%PDF-1.4\n")).toBe(true)
    const start = source.match(/startxref\n(\d+)\n%%EOF\n$/)
    expect(start).not.toBeNull()
    expect(source.slice(Number(start?.[1]), Number(start?.[1]) + 4)).toBe("xref")
    const text = compact(pdfPlainText(pdf))
    expect(text).toContain("ProfileRelaunch Ltd — Paid-service agreement")
    expect(text).toContain("Version PS-2026-10-14.2")
    expect(text).toContain("71–75 Shelton Street")
    expect(text).toContain("greater of £1,000 or twice the fee")
    expect(text).toContain("We’ll remind you before the period ends.")
    expect(text).not.toContain("## ")
    expect(text).not.toContain("SHA-256")
    expect(text).not.toContain(paidServiceAgreementContentHash)
    for (const block of agreementBlocks(paidServiceAgreementBody)) {
      expect(text).toContain(compact(block.text))
    }
  })

  it("uses the proposed Guided wording without the other service prices", () => {
    const guided = proposedServiceAgreement("GUIDED_RELAUNCH")
    expect(guided).not.toBeNull()
    const text = compact(pdfPlainText(buildAgreementPdf(guided!.body)))
    expect(text).toContain("Paid-service agreement for Guided Relaunch")
    expect(text).toContain("22 October 2026")
    expect(text).toContain("The price is £99 unless the accepted quotation states a different price.")
    expect(text).toContain("does not require you to add us as a Manager")
    expect(text).not.toContain("Version PS-")
    expect(text).not.toContain("£9.99")
    expect(text).not.toContain("£299")
    expect(text).not.toContain("£59")
    expect(text).not.toContain("£149")
    expect(text).not.toContain("SHA-256")
  })

  it("matches Poppler text, stays inside the margins, and refuses a character Helvetica cannot draw", () => {
    const source = readFileSync(new URL("./agreement-pdf.ts", import.meta.url), "utf8")
    expect(source).not.toContain("0x3f")
    const pdf = buildAgreementPdf(paidServiceAgreementBody)
    const pages = popplerPages(pdf)
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) {
      for (const word of page.filter(isContent)) {
        expect(word.xMin).toBeGreaterThanOrEqual(52)
        expect(word.xMax).toBeLessThanOrEqual(543)
      }
    }
    const expected = agreementBlocks(paidServiceAgreementBody).map(block => block.text).join("")
    const squash = (value: string) => value.replace(/\s+/g, "")
    expect(squash(contentText(pages))).toBe(squash(expected))
    const longWord = `${"M".repeat(180)} keeps £50`
    const longBody = `## 1. A long clause\n\n${longWord}\n\n## 2. The next heading\n\nThe following sentence stays with its heading on the page.`
    const longPages = popplerPages(buildAgreementPdf(longBody))
    expect(squash(contentText(longPages))).toBe(squash(agreementBlocks(longBody).map(block => block.text).join("")))
    for (const page of longPages) {
      for (const word of page.filter(isContent)) {
        expect(word.xMax).toBeLessThanOrEqual(543)
      }
    }
    const accented = buildAgreementPdf("Café — the fee is £10.")
    expect(contentText(popplerPages(accented))).toContain("Café")
    expect(contentText(popplerPages(accented))).toContain("£10")
    expect(() => buildAgreementPdf("The name is \u4f60.")).toThrow(AgreementPdfError)
    try {
      buildAgreementPdf("The name is \u4f60.")
    } catch (error) {
      expect(error).toBeInstanceOf(AgreementPdfError)
      expect((error as Error).message).toContain("U+4F60")
      expect((error as Error).message).not.toContain("?")
    }
  })
})
