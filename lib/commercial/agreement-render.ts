/**
 * Customer display of an agreement snapshot.
 *
 * The blocks are the stored wording with Markdown headings turned into
 * structure. Words are not removed. A hash is valid only for the source body,
 * including its heading markers, and not for this display.
 */

export type AgreementBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }

export function agreementBlocks(body: string): AgreementBlock[] {
  const normalized = body.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []
  return normalized.split(/\n\n+/).flatMap(chunk => {
    const text = chunk.trim()
    if (!text) return []
    if (text.startsWith("## ")) {
      const heading = text.slice(3).trim()
      return heading ? [{ kind: "heading" as const, text: heading }] : []
    }
    return [{ kind: "paragraph" as const, text }]
  })
}

export function agreementPlainText(blocks: readonly AgreementBlock[]): string {
  return blocks.map(block => block.text).join("\n\n")
}

function isAgreementVersionToken(value: string): boolean {
  if (!value.startsWith("PS-")) return false
  const parts = value.split(".")
  if (parts.length !== 2) return false
  const [dated, revision] = parts
  if (!dated.startsWith("PS-")) return false
  const date = dated.slice(3)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^[A-Za-z0-9]+$/.test(revision)
}

function isHashToken(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value)
}

/**
 * Removes the offer trigger's technical suffix from displayed terms.
 * The stored terms_reference column is not changed.
 * A terms line that is only an agreement version is omitted because the
 * agreement document below is the contract.
 */
export function customerFacingTerms(terms: string): string | null {
  let text = terms.trim()
  const marker = " SHA-256 "
  const shaAt = text.lastIndexOf(marker)
  if (shaAt >= 0) {
    const hash = text.slice(shaAt + marker.length).replace(/\.$/, "").trim()
    if (isHashToken(hash)) {
      const agreementAt = text.lastIndexOf(" Agreement ", shaAt)
      text = (agreementAt >= 0 ? text.slice(0, agreementAt) : text.slice(0, shaAt)).trim()
    }
  }
  const withoutStop = text.replace(/\.$/, "").trim()
  if (!withoutStop) return null
  if (withoutStop.startsWith("Agreement ")) {
    const version = withoutStop.slice("Agreement ".length).trim()
    if (isAgreementVersionToken(version)) return null
  }
  if (isAgreementVersionToken(withoutStop)) return null
  if (withoutStop.startsWith("Version ") && isAgreementVersionToken(withoutStop.slice("Version ".length).trim())) return null
  return text
}
