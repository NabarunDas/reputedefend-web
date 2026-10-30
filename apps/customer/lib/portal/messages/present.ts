/**
 * Customer-facing message titles. The stored subject is not rewritten.
 * Identifiers stay available on the conversation page.
 */

const TRAILING_REF = /\s+[—–-]\s+(?:(?:PR|RV|SO)-[0-9]{2}-[A-HJ-NP-Z2-9]{6})\b/g

export function messageTitle(subject: string): string {
  const compact = subject.replace(/\s+/g, " ").trim()
  const withoutBrand = compact.replace(/\bProfileRelaunch\b\s*/g, "")
  const withoutRefs = withoutBrand.replace(TRAILING_REF, "").replace(/\s+[—–-]\s*$/, "").replace(/\s{2,}/g, " ").trim()
  return withoutRefs.length > 0 ? withoutRefs : compact
}

export function messageParagraphs(body: string): string[] {
  const blocks = body.split(/\n{2,}/).map(block => block.trim()).filter(block => block.length > 0)
  return blocks.length > 0 ? blocks : [body]
}

/** A collapsed message shows about five reading lines, then an expand control. */
export const MESSAGE_PREVIEW_CHARS = 320

export function messageIsLong(body: string): boolean {
  return body.length > MESSAGE_PREVIEW_CHARS || messageParagraphs(body).length > 4
}

/**
 * Readable prefix of a long message. The result is not the stored message:
 * the expanded view renders `body` unchanged, including every line break.
 */
export function messagePreview(body: string): string {
  if (!messageIsLong(body)) return body
  const paragraphs = messageParagraphs(body)
  const paragraphCap = paragraphs.length > 2 ? paragraphs.slice(0, 2).join("\n\n") : body
  const source = paragraphCap.length < body.length ? paragraphCap : body
  if (source.length <= MESSAGE_PREVIEW_CHARS) return `${source.replace(/\s+$/u, "")}…`
  const window = source.slice(0, MESSAGE_PREVIEW_CHARS)
  const boundary = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "))
  const cutAt = boundary >= Math.floor(MESSAGE_PREVIEW_CHARS * 0.6) ? boundary : MESSAGE_PREVIEW_CHARS
  return `${source.slice(0, cutAt).replace(/\s+$/u, "")}…`
}
