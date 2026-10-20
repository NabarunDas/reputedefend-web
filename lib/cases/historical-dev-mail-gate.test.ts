import { describe, expect, it } from "vitest"
import { supabaseUrlMatchesEnvironment } from "@/lib/supabase/config"

/**
 * The decision that was deployed for PR-26-RZYCE4, copied from merge 22f4b1c.
 * It is not the live send path. The reported flag bytes leave the enable and
 * kill-switch branches open. Several later checks can still close this old
 * function. Which of those checks ran for that case is undetermined: the
 * allowlist and the stored recipients were not readable. The live path no
 * longer consults this gate.
 */
const DEV_SUPABASE_URLS = [
  "https://rmzozuiamjcclvtgutgd.supabase.co",
  "https://rmzozuiamjcclvtgutgd.supabase.co/",
]
const EXACT_ADDRESS = /^[a-z0-9.!#$%&'*+=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

function isExactDevUrl(url: string | undefined) {
  return DEV_SUPABASE_URLS.includes(url?.trim() ?? "")
}

function exactAddress(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const address = value.trim().toLowerCase()
  if (address.length < 3 || address.length > 254) return null
  const at = address.indexOf("@")
  if (at <= 0 || at !== address.lastIndexOf("@")) return null
  if (address.slice(0, at).length > 64) return null
  if (!EXACT_ADDRESS.test(address)) return null
  return address
}

function parseAllowlist(raw: string | undefined): ReadonlySet<string> | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) return null
  const allow = new Set<string>()
  for (const part of text.split(",")) {
    const address = exactAddress(part)
    if (!address) return null
    allow.add(address)
  }
  return allow.size > 0 ? allow : null
}

type CloseReason =
  | "outside"
  | "open"
  | "git-ref"
  | "database"
  | "kill-switch"
  | "mail-disabled"
  | "allowlist"
  | "internal-approval"
  | "no-pending"
  | "customer"
  | "internal"

function deployedCloseReason(
  customer: string | null,
  internal: string | null,
  runtime: Record<string, string | undefined>,
): CloseReason {
  if (runtime.VERCEL_ENV !== "preview") return "outside"
  if (runtime.VERCEL_GIT_COMMIT_REF !== "develop") return "git-ref"
  if (!isExactDevUrl(runtime.SUPABASE_URL)) return "database"
  if (runtime.DEV_CASE_INTAKE_NO_EMAIL === "true") return "kill-switch"
  if (runtime.DEV_MAIL_ENABLED !== "true") return "mail-disabled"
  const allow = parseAllowlist(runtime.DEV_MAIL_ALLOWED_RECIPIENTS)
  if (!allow) return "allowlist"
  const internalRaw = runtime.DEV_MAIL_INTERNAL_RECIPIENT
  const internalConfigured = typeof internalRaw === "string" && internalRaw.trim() !== ""
  const dedicatedInternal = internalConfigured ? exactAddress(internalRaw) : null
  if (internalConfigured && !dedicatedInternal) return "internal-approval"
  if (customer === null && internal === null) return "no-pending"
  const customerAddress = customer === null ? null : exactAddress(customer)
  if (customer !== null && (!customerAddress || !allow.has(customerAddress))) return "customer"
  if (internal !== null) {
    const internalAddress = exactAddress(internal)
    if (!internalAddress) return "internal"
    const listed = allow.has(internalAddress)
    const distinctDedicated = Boolean(
      dedicatedInternal && internalAddress === dedicatedInternal && dedicatedInternal !== customerAddress,
    )
    if (!listed && !distinctDedicated) return "internal"
  }
  return "open"
}

const EXACT_TRUE = String.fromCharCode(116, 114, 117, 101)
const EXACT_FALSE = String.fromCharCode(102, 97, 108, 115, 101)
const DEV_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"

const lane = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  SUPABASE_URL: DEV_URL,
  DEV_MAIL_ENABLED: EXACT_TRUE,
  DEV_CASE_INTAKE_NO_EMAIL: EXACT_FALSE,
  DEV_MAIL_ALLOWED_RECIPIENTS: "owner@example.com,cases@example.com",
}

describe("deployed DEV mail gate, with the exact cause left undetermined", () => {
  it("uses the four bytes Vercel reported for the enable flag", () => {
    expect([...EXACT_TRUE].map((char) => char.charCodeAt(0))).toEqual([116, 114, 117, 101])
    expect(EXACT_TRUE).toBe("true")
    expect(EXACT_TRUE.length).toBe(4)
    expect([...EXACT_FALSE].map((char) => char.charCodeAt(0))).toEqual([102, 97, 108, 115, 101])
    expect(EXACT_FALSE).toBe("false")
  })

  it("does not close on those bytes when the lane and both recipients match", () => {
    expect(deployedCloseReason("owner@example.com", "cases@example.com", lane)).toBe("open")
  })

  it("can still close on those same bytes when a later check fails", () => {
    expect(deployedCloseReason("owner@example.com", "cases@example.com", {
      ...lane,
      DEV_MAIL_ALLOWED_RECIPIENTS: undefined,
    })).toBe("allowlist")
    expect(deployedCloseReason("stranger@example.com", "cases@example.com", lane)).toBe("customer")
    expect(deployedCloseReason("owner@example.com", "stranger@example.com", lane)).toBe("internal")
    expect(deployedCloseReason("owner@example.com", "cases@example.com", {
      ...lane,
      VERCEL_GIT_COMMIT_REF: "feature/pr",
    })).toBe("git-ref")
    expect(deployedCloseReason("owner@example.com", "cases@example.com", {
      ...lane,
      SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co",
    })).toBe("database")
  })

  it("closes a DEV hostname that persistence accepts when the string is not one of the two exact URLs", () => {
    const withPath = `${DEV_URL}/rest/v1`
    expect(supabaseUrlMatchesEnvironment(withPath, "preview")).toBe(true)
    expect(deployedCloseReason("owner@example.com", "cases@example.com", {
      ...lane,
      SUPABASE_URL: withPath,
    })).toBe("database")
  })

  it("would have closed a trailing newline, which is a different byte sequence from the reported value", () => {
    expect(deployedCloseReason("owner@example.com", "cases@example.com", {
      ...lane,
      DEV_MAIL_ENABLED: "true\n",
    })).toBe("mail-disabled")
    expect([...("true\n")].map((char) => char.charCodeAt(0))).not.toEqual([116, 114, 117, 101])
  })
})
