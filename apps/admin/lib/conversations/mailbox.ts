const BARE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const ANGLED = /^([^<>]{1,160})<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>$/

export type ParsedMailbox = { address: string; display: string | null }

export function parseMailbox(value: unknown): ParsedMailbox | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (!raw || raw.length > 320) return null
  const angled = raw.match(ANGLED)
  if (angled) {
    const address = angled[2].toLowerCase()
    if (address.length > 254) return null
    const display = angled[1].trim().replace(/^"+|"+$/g, "").trim().slice(0, 120) || null
    return { address, display }
  }
  if (BARE.test(raw) && raw.length <= 254) return { address: raw.toLowerCase(), display: null }
  return null
}

export function parseMailboxList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => parseMailbox(item)?.address)
    .filter((item): item is string => !!item)
    .slice(0, 20)
}
