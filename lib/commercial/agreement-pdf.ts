/**
 * Branded PDF of the exact agreement wording supplied by the caller.
 *
 * The file adds a ProfileRelaunch header and page numbers around that wording.
 * It does not rewrite clauses. Characters that Helvetica WinAnsi cannot draw
 * stop the download. They are not replaced. Widths are the Helvetica AFM
 * advances, so a line stays inside the margins, including a word with no spaces.
 * No Node built-in is imported, so a customer page can build the file in the browser.
 */
import { agreementBlocks } from "./agreement-render"
import { helveticaBoldWidths, helveticaWidths } from "./helvetica-widths"

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 54
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const TOP = 730
const BOTTOM = 64

const FROM_WIN_ANSI: Record<number, string> = {
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
  0xa0: "\u00a0",
}

export const AGREEMENT_PDF_UNAVAILABLE = "We could not create the agreement PDF. The agreement on this page is the copy to read. Contact us if you need help saving it."

export class AgreementPdfError extends Error {
  readonly codePoint: number

  constructor(codePoint: number) {
    super(AGREEMENT_PDF_UNAVAILABLE)
    this.name = "AgreementPdfError"
    this.codePoint = codePoint
  }
}

type PdfLine = { font: "F1" | "F2"; size: number; text: string; leading: number; blockStart: boolean }

function winAnsiByte(code: number): number | null {
  if (code === 0x20 || (code >= 0x21 && code <= 0x7e)) return code
  if (code >= 0xa0 && code <= 0xff) return code
  switch (code) {
    case 0x201a: return 0x82
    case 0x0192: return 0x83
    case 0x201e: return 0x84
    case 0x2026: return 0x85
    case 0x2020: return 0x86
    case 0x2021: return 0x87
    case 0x02c6: return 0x88
    case 0x2030: return 0x89
    case 0x0160: return 0x8a
    case 0x2039: return 0x8b
    case 0x0152: return 0x8c
    case 0x017d: return 0x8e
    case 0x2018: return 0x91
    case 0x2019: return 0x92
    case 0x201c: return 0x93
    case 0x201d: return 0x94
    case 0x2022: return 0x95
    case 0x2013: return 0x96
    case 0x2014: return 0x97
    case 0x02dc: return 0x98
    case 0x2122: return 0x99
    case 0x0161: return 0x9a
    case 0x203a: return 0x9b
    case 0x0153: return 0x9c
    case 0x017e: return 0x9e
    case 0x0178: return 0x9f
    default: return null
  }
}

function requireByte(code: number): number {
  const byte = winAnsiByte(code)
  if (byte === null || helveticaWidths[byte] <= 0 || helveticaBoldWidths[byte] <= 0) throw new AgreementPdfError(code)
  return byte
}

function encodeWinAnsi(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) bytes.push(requireByte(char.codePointAt(0) ?? 0))
  return bytes
}

function pdfString(text: string): string {
  let out = "("
  for (const byte of encodeWinAnsi(text)) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, "0")}`
    else out += String.fromCharCode(byte)
  }
  return `${out})`
}

function measure(text: string, size: number, widths: readonly number[]): number {
  let width = 0
  for (const char of text) width += (widths[requireByte(char.codePointAt(0) ?? 0)] * size) / 1000
  return width
}

function wrap(text: string, size: number, widths: readonly number[]): string[] {
  const words = text.split(" ")
  const lines: string[] = []
  let current = ""
  const place = (word: string) => {
    if (measure(word, size, widths) <= CONTENT_WIDTH) {
      const next = current ? `${current} ${word}` : word
      if (current && measure(next, size, widths) > CONTENT_WIDTH) {
        lines.push(current)
        current = word
      } else {
        current = next
      }
      return
    }
    if (current) {
      lines.push(current)
      current = ""
    }
    let chunk = ""
    for (const char of word) {
      const next = `${chunk}${char}`
      if (chunk && measure(next, size, widths) > CONTENT_WIDTH) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk = next
      }
    }
    current = chunk
  }
  for (const word of words) {
    if (word) place(word)
  }
  if (current || lines.length === 0) lines.push(current)
  return lines
}

function layout(body: string): PdfLine[] {
  const lines: PdfLine[] = []
  const blocks = agreementBlocks(body)
  blocks.forEach((block, blockIndex) => {
    const size = block.kind === "heading" ? 13 : 11
    const font = block.kind === "heading" ? "F2" : "F1"
    const widths = font === "F2" ? helveticaBoldWidths : helveticaWidths
    const leading = block.kind === "heading" ? 22 : 15
    const gap = blockIndex === 0 ? 0 : 6
    wrap(block.text, size, widths).forEach((text, index) => {
      lines.push({
        font,
        size,
        text,
        leading: index === 0 ? leading + gap : 14,
        blockStart: index === 0,
      })
    })
  })
  return lines
}

function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = []
  let page: PdfLine[] = []
  let y = TOP
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const next = lines[index + 1]
    const needed = line.blockStart && line.font === "F2" && next ? line.leading + next.leading : line.leading
    if (y - needed < BOTTOM && page.length > 0) {
      pages.push(page)
      page = []
      y = TOP
    }
    page.push(line)
    y -= line.leading
  }
  if (page.length > 0) pages.push(page)
  if (pages.length === 0) pages.push([])
  return pages
}

function pageStream(lines: PdfLine[], pageNumber: number): string {
  const commands = [
    "q",
    "0.039 0.431 0.235 rg",
    `${MARGIN} 748 ${CONTENT_WIDTH.toFixed(2)} 3 re f`,
    "Q",
    "BT",
    "/F2 16 Tf",
    "0.063 0.149 0.122 rg",
    `${MARGIN} 770 Td`,
    `${pdfString("ProfileRelaunch")} Tj`,
    "/F1 10 Tf",
    "0.365 0.427 0.400 rg",
    "0 -18 Td",
    `${pdfString("Paid-service agreement")} Tj`,
    "ET",
    "BT",
    "0 0 0 rg",
    `${MARGIN} ${TOP} Td`,
  ]
  let font = ""
  let size = 0
  for (const line of lines) {
    if (line.font !== font || line.size !== size) {
      commands.push(`/${line.font} ${line.size} Tf`)
      font = line.font
      size = line.size
    }
    commands.push(`0 -${line.leading} Td`)
    commands.push(`${pdfString(line.text)} Tj`)
  }
  commands.push("ET", "BT", "/F1 9 Tf", "0.365 0.427 0.400 rg", `${MARGIN} 40 Td`, `${pdfString(`Page ${pageNumber}`)} Tj`, "ET")
  return commands.join("\n")
}

function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code > 0xff) throw new AgreementPdfError(code)
    bytes[index] = code
  }
  return bytes
}

export function buildAgreementPdf(body: string): Uint8Array {
  const pages = paginate(layout(body))
  const fontRegular = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  const fontBold = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  const objects: string[] = []
  const pageObjectNumbers: number[] = []
  const contentObjectNumbers: number[] = []
  objects.push("")
  objects.push("")
  pages.forEach((lines, index) => {
    const pageNumber = objects.length + 1
    const contentNumber = pageNumber + 1
    pageObjectNumbers.push(pageNumber)
    contentObjectNumbers.push(contentNumber)
    const stream = pageStream(lines, index + 1)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentNumber} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`)
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  const fontRegularNumber = objects.length + 1
  const fontBoldNumber = fontRegularNumber + 1
  const infoNumber = fontBoldNumber + 1
  objects.push(fontRegular)
  objects.push(fontBold)
  objects.push(`<< /Title ${pdfString("ProfileRelaunch paid-service agreement")} /Producer ${pdfString("ProfileRelaunch")} >>`)
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`
  const fixedPages = pageObjectNumbers.map((number, index) => {
    const contentNumber = contentObjectNumbers[index]
    return `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentNumber} 0 R /Resources << /Font << /F1 ${fontRegularNumber} 0 R /F2 ${fontBoldNumber} 0 R >> >> >>`
  })
  fixedPages.forEach((entry, index) => {
    objects[pageObjectNumbers[index] - 1] = entry
  })
  let file = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((entry, index) => {
    offsets.push(file.length)
    file += `${index + 1} 0 obj\n${entry}\nendobj\n`
  })
  const xref = file.length
  file += `xref\n0 ${objects.length + 1}\n`
  file += "0000000000 65535 f \n"
  for (let index = 1; index < offsets.length; index += 1) {
    file += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`
  }
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return latin1(file)
}

function pdfStrings(pdf: Uint8Array): string[] {
  const source = Array.from(pdf, byte => String.fromCharCode(byte)).join("")
  const pieces: string[] = []
  let index = 0
  while (index < source.length) {
    if (source[index] !== "(") {
      index += 1
      continue
    }
    index += 1
    let text = ""
    while (index < source.length) {
      const char = source[index]
      if (char === "\\") {
        const next = source[index + 1] ?? ""
        if (next === "n" || next === "r") {
          text += "\n"
          index += 2
          continue
        }
        if (next === "(" || next === ")" || next === "\\") {
          text += next
          index += 2
          continue
        }
        const octal = source.slice(index + 1, index + 4)
        if (octal.length === 3 && octal >= "000" && octal <= "377" && [...octal].every(digit => digit >= "0" && digit <= "7")) {
          const code = Number.parseInt(octal, 8)
          text += FROM_WIN_ANSI[code] ?? String.fromCharCode(code)
          index += 4
          continue
        }
        text += next
        index += 2
        continue
      }
      if (char === ")") {
        index += 1
        break
      }
      const code = char.charCodeAt(0)
      text += FROM_WIN_ANSI[code] ?? char
      index += 1
    }
    pieces.push(text)
  }
  return pieces
}

/** Contract text recovered from the PDF, without the branded header or page numbers. */
export function pdfPlainText(pdf: Uint8Array): string {
  return pdfStrings(pdf).filter(piece => {
    const trimmed = piece.trim()
    if (trimmed === "ProfileRelaunch") return false
    if (trimmed === "Paid-service agreement") return false
    if (trimmed === "ProfileRelaunch paid-service agreement") return false
    if (trimmed.startsWith("Page ") && [...trimmed.slice(5)].every(digit => digit >= "0" && digit <= "9") && trimmed.length > 5) return false
    return true
  }).join(" ")
}
