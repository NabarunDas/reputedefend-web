/// <reference path="./fontkit.d.ts" />
/**
 * Embeds SIL Open Font License Noto faces for characters Helvetica cannot draw.
 * A name is never rewritten, dropped, or copied into an error message.
 * Each PDF receives only the glyphs that document uses.
 */
import { openSync } from "fontkit"
import { fileURLToPath } from "node:url"

type Glyph = { id: number; codePoints: number[]; advanceWidth: number }
type Position = { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }
type Face = {
  unitsPerEm: number
  postscriptName: string
  ascent: number
  descent: number
  capHeight?: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  glyphForCodePoint: (code: number) => Glyph
  layout: (text: string) => { glyphs: Glyph[]; positions: Position[]; advanceWidth: number }
  createSubset: () => {
    includeGlyph: (glyph: Glyph) => void
    encode: () => Uint8Array
    mapping: Record<string, number>
  }
}

type Run = { face: string; glyphs: Glyph[]; positions: Position[] }

export type EmbeddedFace = {
  resourceName: string
  baseFont: string
  fileHex: string
  widths: string
  toUnicode: string
  bbox: [number, number, number, number]
  ascent: number
  descent: number
  capHeight: number
}

const MISSING = "This document uses a character the PDF fonts cannot draw."

function utf16(point: number): string {
  if (point <= 0xffff) return point.toString(16).padStart(4, "0")
  const shifted = point - 0x10000
  const high = 0xd800 + (shifted >> 10)
  const low = 0xdc00 + (shifted & 0x3ff)
  return high.toString(16).padStart(4, "0") + low.toString(16).padStart(4, "0")
}
const FILES = {
  sans: "NotoSans-Regular.ttf",
  sansBold: "NotoSans-Bold.ttf",
  bengali: "NotoSansBengali-Regular.ttf",
  devanagari: "NotoSansDevanagari-Regular.ttf",
  arabic: "NotoNaskhArabic-Regular.ttf",
  chinese: "NotoSansSC-VF.ttf",
} as const

const loaded = new Map<string, Face>()
const prepared = new Map<string, { mapping: Record<string, number>; embedded: EmbeddedFace }>()

function load(name: string): Face {
  const cached = loaded.get(name)
  if (cached) return cached
  const filename = FILES[name as keyof typeof FILES]
  const face = openSync(fileURLToPath(new URL(`./fonts/${filename}`, import.meta.url))) as unknown as Face
  loaded.set(name, face)
  return face
}

function covered(face: Face, code: number): boolean {
  return face.glyphForCodePoint(code).id !== 0
}

function faceFor(code: number, bold: boolean): string | null {
  if (code >= 0x0980 && code <= 0x09ff) return covered(load("bengali"), code) ? "bengali" : null
  if (code >= 0x0900 && code <= 0x097f) return covered(load("devanagari"), code) ? "devanagari" : null
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f) || (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)) {
    return covered(load("arabic"), code) ? "arabic" : null
  }
  if ((code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) {
    return covered(load("chinese"), code) ? "chinese" : null
  }
  const latin = bold ? "sansBold" : "sans"
  if (covered(load(latin), code)) return latin
  if (bold && covered(load("sans"), code)) return "sans"
  return null
}

/** Helvetica WinAnsi can draw these. Everything else needs an embedded face. */
function helvetica(code: number): boolean {
  if (code === 0x20 || (code >= 0x21 && code <= 0x7e)) return true
  if (code >= 0xa0 && code <= 0xff) return true
  return code === 0x2013 || code === 0x2014 || code === 0x2018 || code === 0x2019
    || code === 0x201c || code === 0x201d || code === 0x2022
}

function needsUnicode(value: string): boolean {
  for (const char of value) {
    if (!helvetica(char.codePointAt(0) ?? 0)) return true
  }
  return false
}

function layoutRuns(value: string, bold: boolean): Run[] {
  const groups: Array<{ face: string; text: string }> = []
  let text = ""
  let face = ""
  for (const char of value) {
    const next = faceFor(char.codePointAt(0) ?? 0, bold)
    if (!next) throw new Error(MISSING)
    if (next !== face && text) {
      groups.push({ face, text })
      text = ""
    }
    face = next
    text += char
  }
  if (text) groups.push({ face, text })
  return groups.map(group => {
    const laid = load(group.face).layout(group.text)
    if (laid.glyphs.some(glyph => glyph.id === 0)) throw new Error(MISSING)
    return { face: group.face, glyphs: laid.glyphs, positions: laid.positions }
  })
}

function hex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return `${out}>`
}

/** Subset every character Helvetica cannot draw before the pages are painted. */
export function prepareUnicode(samples: string[]) {
  prepared.clear()
  const glyphs = new Map<string, Map<number, Glyph>>()
  const remember = (bold: boolean) => {
    for (const sample of samples) {
      if (!needsUnicode(sample)) continue
      for (const run of layoutRuns(sample, bold)) {
        const found = glyphs.get(run.face) ?? new Map<number, Glyph>()
        for (const glyph of run.glyphs) found.set(glyph.id, glyph)
        glyphs.set(run.face, found)
      }
    }
  }
  remember(false)
  remember(true)
  let index = 3
  for (const [name, found] of glyphs) {
    if (found.size === 0) continue
    const face = load(name)
    const subset = face.createSubset()
    for (const glyph of found.values()) subset.includeGlyph(glyph)
    const widths = [...found.values()].flatMap(glyph => {
      const id = subset.mapping[String(glyph.id)]
      return id == null ? [] : [`${id} [${Math.round((glyph.advanceWidth * 1000) / face.unitsPerEm)}]`]
    })
    const chars = [...found.values()].flatMap(glyph => {
      const id = subset.mapping[String(glyph.id)]
      if (id == null || glyph.codePoints.length === 0) return []
      const source = id.toString(16).padStart(4, "0")
      const target = glyph.codePoints.map(utf16).join("")
      return [`<${source}> <${target}>`]
    })
    const blocks: string[] = []
    for (let start = 0; start < chars.length; start += 100) {
      const slice = chars.slice(start, start + 100)
      blocks.push(`${slice.length} beginbfchar\n${slice.join("\n")}\nendbfchar`)
    }
    const cmap = blocks.length === 0 ? "" : `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${blocks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`
    prepared.set(name, {
      mapping: subset.mapping,
      embedded: {
        resourceName: `F${index}`,
        baseFont: face.postscriptName.replace(/[^A-Za-z0-9+-]/g, "") || `Noto${index}`,
        fileHex: hex(subset.encode()),
        widths: widths.join(" "),
        toUnicode: cmap,
        bbox: [face.bbox.minX, face.bbox.minY, face.bbox.maxX, face.bbox.maxY].map(value => Math.round(value)) as [number, number, number, number],
        ascent: Math.round(face.ascent),
        descent: Math.round(face.descent),
        capHeight: Math.round(face.capHeight ?? face.ascent),
      },
    })
    index += 1
  }
}

export function unicodeFaces(): EmbeddedFace[] {
  return [...prepared.values()].map(entry => entry.embedded)
}

export function unicodeWidth(value: string, size: number, bold: boolean): number | null {
  if (!needsUnicode(value)) return null
  let width = 0
  for (const run of layoutRuns(value, bold)) {
    const face = load(run.face)
    const advance = run.positions.reduce((sum, position) => sum + position.xAdvance, 0)
    width += (advance * size) / face.unitsPerEm
  }
  return width
}

export function unicodeCommands(value: string, size: number, bold: boolean, color: string, x: number, y: number): string | null {
  if (!needsUnicode(value)) return null
  const commands: string[] = []
  let cursor = x
  for (const run of layoutRuns(value, bold)) {
    const face = load(run.face)
    const ready = prepared.get(run.face)
    if (!ready) throw new Error(MISSING)
    const scale = size / face.unitsPerEm
    run.glyphs.forEach((glyph, index) => {
      const position = run.positions[index]
      const id = ready.mapping[String(glyph.id)]
      if (id == null) throw new Error(MISSING)
      const left = cursor + position.xOffset * scale
      const baseline = y + position.yOffset * scale
      commands.push(`BT /${ready.embedded.resourceName} ${size} Tf ${color} rg 1 0 0 1 ${left.toFixed(2)} ${baseline.toFixed(2)} Tm <${id.toString(16).padStart(4, "0")}> Tj ET`)
      cursor += position.xAdvance * scale
    })
  }
  return commands.join("\n")
}
