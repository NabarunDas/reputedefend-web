export const PUBLIC_BODY_LIMIT_BYTES = 64 * 1024

export type BoundedJson =
  | { ok: true; value: unknown }
  | { ok: false; status: 413 | 400 }

/**
 * Reads a request body by bytes and stops at 64 KiB. Callers must treat a
 * rejected body as final: do not parse further, persist, or send email.
 */
export async function readBoundedJson(request: Request): Promise<BoundedJson> {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let raw = ""
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const bytes = value?.byteLength ?? 0
        size += bytes
        if (size > PUBLIC_BODY_LIMIT_BYTES) {
          await reader.cancel()
          return { ok: false, status: 413 }
        }
        raw += decoder.decode(value, { stream: true })
      }
    } catch {
      return { ok: false, status: 400 }
    }
  }
  raw += decoder.decode()
  if (raw.length === 0) return { ok: false, status: 400 }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, status: 400 }
  }
}
