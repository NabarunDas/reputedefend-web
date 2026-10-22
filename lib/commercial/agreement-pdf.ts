/**
 * Branded PDF of the exact agreement wording supplied by the caller.
 *
 * The file adds a ProfileRelaunch header and page numbers around that wording.
 * It does not rewrite clauses. WinAnsi covers the pound sign and the dashes
 * used in the registered office and the agreement title. No Node built-in is
 * imported, so a customer page can build the file in the browser.
 */
import { agreementBlocks } from "./agreement-render"

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 54
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const TOP = 730
const BOTTOM = 64

const WIN_ANSI: Record<number, number> = {
  0x2013: 0x96,
  0x2014: 0x97,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x00a3: 0xa3,
  0x00a0: 0xa0,
}

const FROM_WIN_ANSI: Record<number, string> = {
  0x96: "\u2013",
  0x97: "\u2014",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0xa3: "\u00a3",
  0xa0: "\u00a0",
}

type PdfLine = { font: "F1" | "F2"; size: number; text: string; leading: number }

function encodeWinAnsi(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f
    if (code >= 0x20 && code <= 0x7e) bytes.push(code)
    else if (WIN_ANSI[code] !== undefined) bytes.push(WIN_ANSI[code])
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code)
    else bytes.push(0x3f)
  }
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

function wrap(text: string, size: number): string[] {
  const width = size * 0.52
  const words = text.split(" ")
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (current && next.length * width > CONTENT_WIDTH) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : [""]
}

function layout(body: string): PdfLine[] {
  const lines: PdfLine[] = []
  for (const block of agreementBlocks(body)) {
    const size = block.kind === "heading" ? 13 : 11
    const font = block.kind === "heading" ? "F2" : "F1"
    const leading = block.kind === "heading" ? 22 : 15
    const wrapped = wrap(block.text, size)
    wrapped.forEach((text, index) => {
      lines.push({ font, size, text, leading: index === 0 ? leading : 14 })
    })
  }
  return lines
}

function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = []
  let page: PdfLine[] = []
  let y = TOP
  for (const line of lines) {
    if (y - line.leading < BOTTOM && page.length > 0) {
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
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
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
  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`
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
        if (/^[0-7]{3}$/.test(octal)) {
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
    if (/^Page \d+$/.test(trimmed)) return false
    return true
  }).join(" ")
}
