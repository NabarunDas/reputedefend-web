/**
 * Strict reader for the customer account projection.
 * The portal session is the only authority. Unexpected keys fail closed.
 */

const ACCOUNT_REQUIRED = ["name", "email", "emailVerified", "phoneVerified"] as const
const ACCOUNT_OPTIONAL = ["phone"] as const

export type CustomerAccount = {
  name: string
  email: string
  phone: string | null
  emailVerified: true
  phoneVerified: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value : null
}

export function parseAccount(value: unknown): CustomerAccount | null {
  const row = record(value)
  if (!row) return null
  const keys = Object.keys(row)
  if (ACCOUNT_REQUIRED.some(key => !keys.includes(key))) return null
  if (keys.some(key => !(ACCOUNT_REQUIRED as readonly string[]).includes(key) && !(ACCOUNT_OPTIONAL as readonly string[]).includes(key))) {
    return null
  }
  const name = text(row.name, 200)
  const email = text(row.email, 320)
  if (!name || !email || row.emailVerified !== true || typeof row.phoneVerified !== "boolean") return null
  let phone: string | null = null
  if ("phone" in row) {
    phone = text(row.phone, 40)
    if (!phone) return null
  }
  return { name, email, phone, emailVerified: true, phoneVerified: row.phoneVerified }
}
