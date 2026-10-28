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
