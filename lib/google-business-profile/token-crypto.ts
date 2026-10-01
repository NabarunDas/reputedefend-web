import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// AES-256-GCM. The key never leaves the server process and is never written to
// the connection table, so ciphertext alone is not enough to recover a token.
const algorithm = "aes-256-gcm"

export type EncryptedToken = {
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: string
}

function derive(key: string): Buffer {
  return createHash("sha256").update(key).digest()
}

export function encryptTokenPayload(input: {
  payload: unknown
  key: string
  keyVersion: string
  iv?: Buffer
}): EncryptedToken {
  const iv = input.iv ?? randomBytes(12)
  const cipher = createCipheriv(algorithm, derive(input.key), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(input.payload), "utf8"), cipher.final()])
  return {
    ciphertext: body.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: input.keyVersion,
  }
}

// Returns null rather than throwing on a tampered or wrongly keyed payload, so
// a caller cannot leak crypto detail through an error message.
export function decryptTokenPayload<T>(input: { encrypted: EncryptedToken; key: string }): T | null {
  try {
    const decipher = createDecipheriv(algorithm, derive(input.key), Buffer.from(input.encrypted.iv, "base64"))
    decipher.setAuthTag(Buffer.from(input.encrypted.authTag, "base64"))
    const body = Buffer.concat([
      decipher.update(Buffer.from(input.encrypted.ciphertext, "base64")),
      decipher.final(),
    ])
    return JSON.parse(body.toString("utf8")) as T
  } catch {
    return null
  }
}

// Fields that must never appear in an RPC response, audit row, log line or
// error message. Used by tests and by the Admin response scrubber.
export const forbiddenTokenFields = [
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "client_secret",
  "clientSecret",
  "token_ciphertext",
  "ciphertext",
  "authTag",
  "auth_tag",
  "id_token",
  "idToken",
  "code",
] as const

// Shapes real Google credentials take. Field-name scanning alone misses a
// secret carried in an innocuously named field, so values are matched too.
const tokenValuePatterns = [
  // Access tokens.
  /ya29\.[A-Za-z0-9._-]{8,}/,
  // Refresh tokens. The leading boundary excludes base64 and URL characters so
  // an ordinary path segment or ciphertext blob cannot trip it.
  /(^|[^A-Za-z0-9+/=_-])1\/\/[A-Za-z0-9._-]{20,}/,
  // Authorization codes.
  /(^|[^A-Za-z0-9+/=_-])4\/[01][A-Za-z0-9._-]{20,}/,
  // OAuth client secrets.
  /GOCSPX-[A-Za-z0-9_-]{8,}/,
]

export function containsTokenMaterial(value: unknown): boolean {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null)
  if (!text) return false
  if (forbiddenTokenFields.some(field => text.includes(`"${field}"`))) return true
  return tokenValuePatterns.some(pattern => pattern.test(text))
}
