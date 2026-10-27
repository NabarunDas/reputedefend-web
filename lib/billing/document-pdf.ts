/**
 * A4 PDF for a billing document.
 * The file is the download. It has no browser controls and no print instructions.
 * The logo is the ProfileRelaunch mark supplied by the caller.
 */
import { helveticaBoldWidths, helveticaWidths } from "../commercial/helvetica-widths"
import { billingComparableLines, type BillingDocument, type BillingLine } from "./document"
import { pngToRgb } from "./png"
import { prepareUnicode, unicodeCommands, unicodeFaces, unicodeWidth, type EmbeddedFace } from "./pdf-unicode"

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN
const BODY_TOP = 688
const BODY_BOTTOM = 64
const GREEN = "0.039 0.431 0.235"
const INK = "0.063 0.149 0.122"
const MUTED = "0.365 0.427 0.400"
const HAIRLINE = "0.780 0.835 0.800"
const ROW = "0.953 0.969 0.957"

const FROM_WIN_ANSI: Record<number, string> = {
  0x96: "\u2013",
  0xa3: "\u00a3",
  0xa0: "\u00a0",
}

function winAnsiByte(code: number): number | null {
  if (code === 0x20 || (code >= 0x21 && code <= 0x7e)) return code
  if (code >= 0xa0 && code <= 0xff) return code
  if (code === 0x2013) return 0x96
  if (code === 0x2014) return 0x97
  if (code === 0x2018) return 0x91
  if (code === 0x2019) return 0x92
  if (code === 0x201c) return 0x93
  if (code === 0x201d) return 0x94
  if (code === 0x2022) return 0x95
  return null
}

function requireByte(code: number): number {
  const byte = winAnsiByte(code)
  if (byte === null || helveticaWidths[byte] <= 0 || helveticaBoldWidths[byte] <= 0) {
    throw new Error("This document uses a character the PDF fonts cannot draw.")
  }
  return byte
}

function pdfString(value: string): string {
  let out = "("
  for (const char of value) {
    const byte = requireByte(char.codePointAt(0) ?? 0)
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, "0")}`
    else out += String.fromCharCode(byte)
  }
  return `${out})`
}

function measure(value: string, size: number, bold: boolean): number {
  const embedded = unicodeWidth(value, size, bold)
  if (embedded !== null) return embedded
  const widths = bold ? helveticaBoldWidths : helveticaWidths
  let width = 0
  for (const char of value) width += (widths[requireByte(char.codePointAt(0) ?? 0)] * size) / 1000
  return width
}

function wrap(value: string, size: number, width: number, bold: boolean): string[] {
  const words = value.split(" ")
  const lines: string[] = []
  let current = ""
  const place = (word: string) => {
    if (measure(word, size, bold) <= width) {
      const next = current ? `${current} ${word}` : word
      if (current && measure(next, size, bold) > width) {
        lines.push(current)
        current = word
      } else current = next
      return
    }
    if (current) {
      lines.push(current)
      current = ""
    }
    let chunk = ""
    for (const char of word) {
      const next = `${chunk}${char}`
      if (chunk && measure(next, size, bold) > width) {
        lines.push(chunk)
        chunk = char
      } else chunk = next
    }
    current = chunk
  }
  for (const word of words) if (word) place(word)
  if (current || lines.length === 0) lines.push(current)
  return lines
}

type CommandPage = { commands: string[] }

function text(page: CommandPage, bold: boolean, size: number, color: string, x: number, y: number, value: string) {
  if (!value) return
  const embedded = unicodeCommands(value, size, bold, color, x, y)
  if (embedded) {
    page.commands.push(embedded)
    return
  }
  page.commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfString(value)} Tj ET`)
}

function right(page: CommandPage, bold: boolean, size: number, color: string, edge: number, y: number, value: string) {
  text(page, bold, size, color, edge - measure(value, size, bold), y, value)
}

function rule(page: CommandPage, y: number, color = HAIRLINE) {
  page.commands.push(`${color} rg ${MARGIN} ${y.toFixed(2)} ${(CONTENT_RIGHT - MARGIN).toFixed(2)} 0.6 re f`)
}

function header(page: CommandPage, document: BillingDocument, imageName: string, imageWidth: number, imageHeight: number) {
  const logoHeight = 34
  const logoWidth = logoHeight * imageWidth / imageHeight
  page.commands.push(`q ${logoWidth.toFixed(2)} 0 0 ${logoHeight.toFixed(2)} ${MARGIN} 782 cm /${imageName} Do Q`)
  right(page, true, 20, INK, CONTENT_RIGHT, 796, document.title)
  right(page, false, 10, MUTED, CONTENT_RIGHT, 778, document.reference)
  right(page, false, 10, INK, CONTENT_RIGHT, 762, document.issuedOnLabel)
  const chipWidth = Math.max(72, measure(document.status, 9, true) + 18)
  const chipX = CONTENT_RIGHT - chipWidth
  page.commands.push(`${ROW} rg ${chipX.toFixed(2)} 740 ${chipWidth.toFixed(2)} 16 re f`)
  page.commands.push(`${GREEN} rg ${chipX.toFixed(2)} 740 3 16 re f`)
  text(page, true, 9, GREEN, chipX + 10, 744, document.status)
  page.commands.push(`${GREEN} rg ${MARGIN} 732 ${(CONTENT_RIGHT - MARGIN).toFixed(2)} 2.5 re f`)
}

function footer(page: CommandPage, document: BillingDocument, pageNumber: number, pageCount: number) {
  page.commands.push(`${GREEN} rg ${MARGIN} 46 ${(CONTENT_RIGHT - MARGIN).toFixed(2)} 1.5 re f`)
  const support = document.seller.email ?? document.seller.name
  text(page, false, 8, MUTED, MARGIN, 32, support)
  text(page, false, 8, MUTED, MARGIN, 20, document.seller.name)
  right(page, false, 8, MUTED, CONTENT_RIGHT, 26, `Page ${pageNumber} of ${pageCount}`)
}

type Block = { height: number; draw: (page: CommandPage, top: number) => void; row?: boolean; keepWithNext?: boolean }

const PAGE_BODY = BODY_TOP - BODY_BOTTOM

function parties(document: BillingDocument): Block {
  const seller = [document.seller.name, ...document.seller.lines, ...document.sellerMeta, document.seller.email ?? ""]
    .filter(Boolean)
    .flatMap(line => wrap(line, 9, 230, false))
  const bill = [document.billTo.name, ...document.billTo.lines, document.billTo.email ?? ""]
    .filter(Boolean)
    .flatMap(line => wrap(line, 9, 230, false))
  const rows = Math.max(seller.length, bill.length, 1)
  const height = 18 + rows * 12 + 8
  return {
    height,
    draw(page, top) {
      page.commands.push(`${ROW} rg ${MARGIN} ${(top - height + 6).toFixed(2)} ${(CONTENT_RIGHT - MARGIN).toFixed(2)} ${(height - 8).toFixed(2)} re f`)
      text(page, true, 8, MUTED, MARGIN + 8, top - 10, "FROM")
      text(page, true, 8, MUTED, MARGIN + 268, top - 10, "BILL TO")
      seller.forEach((line, index) => text(page, index === 0, 9, INK, MARGIN + 8, top - 26 - index * 12, line))
      bill.forEach((line, index) => text(page, index === 0, 9, INK, MARGIN + 268, top - 26 - index * 12, line))
    },
  }
}

const QTY_X = 360
const UNIT_X = 450
const AMOUNT_X = CONTENT_RIGHT

function tableHead(): Block {
  return {
    height: 22,
    keepWithNext: true,
    draw(page, top) {
      page.commands.push(`${ROW} rg ${MARGIN} ${(top - 18).toFixed(2)} ${(CONTENT_RIGHT - MARGIN).toFixed(2)} 20 re f`)
      text(page, true, 8, MUTED, MARGIN + 4, top - 12, "DESCRIPTION")
      right(page, true, 8, MUTED, QTY_X, top - 12, "QTY")
      right(page, true, 8, MUTED, UNIT_X, top - 12, "UNIT PRICE")
      right(page, true, 8, MUTED, AMOUNT_X, top - 12, "AMOUNT")
    },
  }
}

function tableRows(line: BillingLine): Block[] {
  const description = wrap(line.description, 10, 250, false).map(part => ({ part, size: 10, step: 13, color: INK }))
  const detail = (line.detail ? wrap(line.detail, 8, 250, false) : []).map(part => ({ part, size: 8, step: 11, color: MUTED }))
  const parts = [...description, ...detail]
  const groups: typeof parts[] = []
  let current: typeof parts = []
  let used = 16
  for (const part of parts) {
    if (current.length > 0 && used + part.step > PAGE_BODY - 22) {
      groups.push(current)
      current = []
      used = 16
    }
    current.push(part)
    used += part.step
  }
  if (current.length > 0 || groups.length === 0) groups.push(current)
  return groups.map((group, index) => {
    const height = 8 + group.reduce((sum, part) => sum + part.step, 0) + 8
    return {
      height,
      row: true,
      draw(page: CommandPage, top: number) {
        let y = top - 14
        group.forEach(part => {
          text(page, false, part.size, part.color, MARGIN + 4, y, part.part)
          y -= part.step
        })
        if (index === 0) {
          right(page, false, 10, INK, QTY_X, top - 14, line.quantity)
          right(page, false, 10, INK, UNIT_X, top - 14, line.unitAmount)
          right(page, false, 10, INK, AMOUNT_X, top - 14, line.amount)
        }
        rule(page, top - height + 2)
      },
    }
  })
}

function totals(document: BillingDocument): Block {
  const height = 10 + document.totals.length * 16
  return {
    height,
    draw(page, top) {
      page.commands.push(`${ROW} rg ${(CONTENT_RIGHT - 230).toFixed(2)} ${(top - height + 4).toFixed(2)} 230 ${(height - 6).toFixed(2)} re f`)
      document.totals.forEach((row, index) => {
        const y = top - 16 - index * 16
        const last = index === document.totals.length - 1
        const bold = row.label === "Total" || row.label === "Amount paid" || row.label === "Amount due" || row.label === "Amount credited" || row.label === "Outstanding"
        if (last) rule(page, y + 12)
        right(page, bold, 10, MUTED, UNIT_X, y, row.label)
        right(page, true, 10, INK, AMOUNT_X, y, row.value)
      })
    },
  }
}

function details(document: BillingDocument): Block[] {
  if (document.details.length === 0) return []
  const valueWidth = CONTENT_RIGHT - MARGIN - 132
  const blocks: Block[] = [{
    height: 20,
    keepWithNext: true,
    draw(page, top) {
      text(page, true, 8, MUTED, MARGIN, top - 12, document.detailHeading)
    },
  }]
  for (const row of document.details) {
    const lines = wrap(row.value, 9, valueWidth, false)
    blocks.push({
      height: 4 + lines.length * 12,
      draw(page, top) {
        text(page, false, 9, MUTED, MARGIN, top - 12, row.label)
        lines.forEach((line, index) => text(page, false, 9, INK, MARGIN + 124, top - 12 - index * 12, line))
      },
    })
  }
  return blocks
}

function notes(document: BillingDocument): Block[] {
  const lines = document.notes.flatMap(note => wrap(note, 8, CONTENT_RIGHT - MARGIN, false))
  return lines.map(line => ({
    height: 12,
    draw(page: CommandPage, top: number) {
      text(page, false, 8, MUTED, MARGIN, top - 10, line)
    },
  }))
}

function pack(blocks: Block[]): Block[][] {
  const pages: Block[][] = []
  let page: Block[] = []
  let used = 0
  for (const block of blocks) {
    if (block.height === 0) continue
    if (block.height > PAGE_BODY) throw new Error("This document has a section taller than one page.")
    if (used > 0 && used + block.height > PAGE_BODY) {
      const carried: Block[] = []
      while (page.length > 0 && page[page.length - 1].keepWithNext) {
        const moved = page.pop()!
        used -= moved.height
        carried.unshift(moved)
      }
      if (page.length > 0) pages.push(page)
      page = carried
      used = carried.reduce((sum, item) => sum + item.height, 0)
      if (used + block.height > PAGE_BODY) {
        if (page.length > 0) pages.push(page)
        page = []
        used = 0
      }
      if (block.row && !page.some(item => item.keepWithNext)) {
        const head = tableHead()
        if (used + head.height + block.height <= PAGE_BODY) {
          page.push(head)
          used += head.height
        }
      }
    }
    page.push(block)
    used += block.height
  }
  if (page.length > 0 || pages.length === 0) pages.push(page)
  return pages
}

export function buildBillingPdf(document: BillingDocument, logo: Uint8Array): Uint8Array {
  prepareUnicode(billingComparableLines(document))
  const image = pngToRgb(logo, 720)
  const blocks = [parties(document), { height: 16, draw() {} }, tableHead(), ...document.lines.flatMap(line => tableRows(line)), { height: 8, draw() {} }, totals(document), { height: 12, draw() {} }, ...details(document), { height: 8, draw() {} }, ...notes(document)]
  const pages = pack(blocks)
  const drawn: CommandPage[] = pages.map(() => ({ commands: [] }))
  pages.forEach((pageBlocks, index) => {
    const page = drawn[index]
    header(page, document, "Im1", image.width, image.height)
    let top = BODY_TOP
    for (const block of pageBlocks) {
      block.draw(page, top)
      top -= block.height
    }
    footer(page, document, index + 1, pages.length)
  })
  return assemble(drawn.map(page => page.commands.join("\n")), image, document)
}

function hex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

function embeddedFontObjects(face: EmbeddedFace, objects: string[]): number {
  const fileNumber = objects.length + 1
  objects.push(`<< /Length ${face.fileHex.length} /Filter /ASCIIHexDecode >>\nstream\n${face.fileHex}\nendstream`)
  let toUnicodeNumber = 0
  if (face.toUnicode) {
    toUnicodeNumber = objects.length + 1
    objects.push(`<< /Length ${face.toUnicode.length} >>\nstream\n${face.toUnicode}\nendstream`)
  }
  const descriptorNumber = objects.length + 1
  objects.push(`<< /Type /FontDescriptor /FontName /${face.baseFont} /Flags 4 /FontBBox [${face.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${face.ascent} /Descent ${face.descent} /CapHeight ${face.capHeight} /StemV 80 /FontFile2 ${fileNumber} 0 R >>`)
  const cidNumber = objects.length + 1
  const widths = face.widths || "0 [1000]"
  objects.push(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${face.baseFont} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorNumber} 0 R /DW 1000 /W [${widths}] >>`)
  const typeNumber = objects.length + 1
  const toUnicode = toUnicodeNumber ? ` /ToUnicode ${toUnicodeNumber} 0 R` : ""
  objects.push(`<< /Type /Font /Subtype /Type0 /BaseFont /${face.baseFont} /Encoding /Identity-H /DescendantFonts [${cidNumber} 0 R]${toUnicode} >>`)
  return typeNumber
}

function assemble(streams: string[], image: { width: number; height: number; rgb: Uint8Array }, document: BillingDocument): Uint8Array {
  const fontRegular = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  const fontBold = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  const imageHex = `${hex(image.rgb)}>`
  const imageObject = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${imageHex.length} /Filter /ASCIIHexDecode >>\nstream\n${imageHex}\nendstream`
  const objects: string[] = ["", "", fontRegular, fontBold, imageObject]
  const faces = unicodeFaces()
  const faceNumbers = faces.map(face => embeddedFontObjects(face, objects))
  const fonts = [`/F1 3 0 R`, `/F2 4 0 R`, ...faces.map((face, index) => `/${face.resourceName} ${faceNumbers[index]} 0 R`)].join(" ")
  const pageNumbers: number[] = []
  const contentNumbers: number[] = []
  streams.forEach(stream => {
    const pageNumber = objects.length + 1
    const contentNumber = pageNumber + 1
    pageNumbers.push(pageNumber)
    contentNumbers.push(contentNumber)
    objects.push("PAGE")
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  const infoNumber = objects.length + 1
  objects.push(`<< /Title ${pdfString(`${document.title} ${document.reference}`)} /Producer ${pdfString("ProfileRelaunch")} >>`)
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[1] = `<< /Type /Pages /Kids [${pageNumbers.map(number => `${number} 0 R`).join(" ")}] /Count ${streams.length} >>`
  pageNumbers.forEach((number, index) => {
    objects[number - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentNumbers[index]} 0 R /Resources << /Font << ${fonts} >> /XObject << /Im1 5 0 R >> >> >>`
  })
  let file = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((entry, index) => {
    offsets.push(file.length)
    file += `${index + 1} 0 obj\n${entry}\nendobj\n`
  })
  const xref = file.length
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) file += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(file.length)
  for (let index = 0; index < file.length; index += 1) bytes[index] = file.charCodeAt(index) & 0xff
  return bytes
}

function pdfStrings(pdf: Uint8Array): string[] {
  const source = Array.from(pdf, byte => String.fromCharCode(byte)).join("")
  const pieces: string[] = []
  let index = source.indexOf("\nstream\n")
  const streams: string[] = []
  while (index !== -1) {
    const start = index + "\nstream\n".length
    const end = source.indexOf("\nendstream", start)
    if (end === -1) break
    streams.push(source.slice(start, end))
    index = source.indexOf("\nstream\n", end)
  }
  for (const stream of streams) {
    if (stream.startsWith("89504e") || /^[0-9a-f]+>?$/.test(stream.slice(0, 40))) continue
    let cursor = 0
    while (cursor < stream.length) {
      if (stream[cursor] !== "(") {
        cursor += 1
        continue
      }
      cursor += 1
      let text = ""
      while (cursor < stream.length) {
        const char = stream[cursor]
        if (char === "\\") {
          const next = stream[cursor + 1] ?? ""
          if (next === "(" || next === ")" || next === "\\") {
            text += next
            cursor += 2
            continue
          }
          const octal = stream.slice(cursor + 1, cursor + 4)
          if (octal.length === 3 && [...octal].every(digit => digit >= "0" && digit <= "7")) {
            const code = Number.parseInt(octal, 8)
            text += FROM_WIN_ANSI[code] ?? String.fromCharCode(code)
            cursor += 4
            continue
          }
          text += next
          cursor += 2
          continue
        }
        if (char === ")") {
          cursor += 1
          break
        }
        const code = char.charCodeAt(0)
        text += FROM_WIN_ANSI[code] ?? char
        cursor += 1
      }
      pieces.push(text)
    }
  }
  return pieces
}

/** Visible words recovered from the PDF, including the title, amounts and page numbers. */
export function billingPdfText(pdf: Uint8Array): string {
  return pdfStrings(pdf).join("\n")
}
