/** Restrict new customer action links to their existing quotation and the server's seven-day cap. */
const minute = 60_000
const day = 24 * 60 * minute

export function quoteActionExpiryWindow(quoteValidUntil: string | undefined, now = Date.now()) {
  const validUntil = quoteValidUntil ? Date.parse(quoteValidUntil) : NaN
  const earliest = now + 16 * minute // server requires strictly more than 15 minutes
  const latest = Math.min(
    now + 7 * day - 2 * minute, // headroom for network delay and rounded datetime-local input
    Number.isFinite(validUntil) ? validUntil : Number.POSITIVE_INFINITY,
  )
  const ready = latest > earliest + minute
  const suggested = ready ? Math.min(now + day, latest - minute) : NaN
  return { earliest, latest, suggested, ready }
}

export function localDateTime(value: number): string {
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ""
  const two = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`
}
