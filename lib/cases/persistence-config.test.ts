import { describe, expect, it } from "vitest"
import {
  devCaseIntakeEmailSuppressed,
  devMailCloseLogLine,
  devMailDiagnosticsEnabled,
  devMarketingMailLane,
  devMarketingMailReport,
  parseDevMailAllowlist,
} from "./persistence-config"

function devMarketingMailDecision(
  customer: string | null,
  internal: string | null,
  env: Record<string, string | undefined>,
) {
  return devMarketingMailReport(customer, internal, env).decision
}

const DEV_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const PROD_URL = "https://cxwwekdzkkjjbiyofrov.supabase.co"

describe("DEV Get Help no-outbound-email gate", () => {
  const valid = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop",
    DEV_CASE_INTAKE_NO_EMAIL: "true", SUPABASE_URL: DEV_URL }
  it("suppresses only deliberately opted-in develop intake", () => {
    expect(devCaseIntakeEmailSuppressed(valid)).toBe(true)
    expect(devCaseIntakeEmailSuppressed({...valid, SUPABASE_URL: valid.SUPABASE_URL + "/"})).toBe(true)
    expect(devCaseIntakeEmailSuppressed({...valid, DEV_CASE_INTAKE_NO_EMAIL: "true\n"})).toBe(true)
    expect(devCaseIntakeEmailSuppressed({...valid, DEV_CASE_INTAKE_NO_EMAIL: " false "})).toBe(false)
  })
  it("retains previous behavior everywhere else", () => {
    for (const changes of [{VERCEL_ENV:"production"},{VERCEL_ENV:"development"},
      {VERCEL_GIT_COMMIT_REF:"feature/pr"}, {DEV_CASE_INTAKE_NO_EMAIL:"false"},
      {SUPABASE_URL: PROD_URL}]) {
      expect(devCaseIntakeEmailSuppressed({...valid,...changes})).toBe(false)
    }
  })
})

const lane = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  SUPABASE_URL: DEV_URL,
  DEV_MAIL_ENABLED: "true",
  DEV_MAIL_ALLOWED_RECIPIENTS: "owner@example.com, cases@example.com",
}

describe("develop DEV mail allowlist", () => {
  it("opens only when both recipients are exact allowlist matches", () => {
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", lane)).toBe("open")
    expect(devMarketingMailDecision("Owner@Example.com", "CASES@example.com", lane)).toBe("open")
    expect(devMarketingMailDecision(" owner@example.com ", "cases@example.com", {
      ...lane,
      SUPABASE_URL: `${DEV_URL}/`,
      DEV_MAIL_ALLOWED_RECIPIENTS: " Owner@Example.com, cases@example.com ",
    })).toBe("open")
  })

  it("stays outside Production and local runtimes even when the flags are set", () => {
    expect(devMarketingMailDecision("stranger@example.com", "stranger@example.com", {
      ...lane, VERCEL_ENV: "production",
    })).toBe("outside")
    expect(devMarketingMailDecision("stranger@example.com", "stranger@example.com", {
      ...lane, VERCEL_ENV: "development",
    })).toBe("outside")
    expect(devMarketingMailDecision("stranger@example.com", "stranger@example.com", {
      DEV_MAIL_ENABLED: "true",
      DEV_MAIL_ALLOWED_RECIPIENTS: "stranger@example.com",
    })).toBe("outside")
  })

  it("closes a different Preview branch and a different database", () => {
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
      ...lane, VERCEL_GIT_COMMIT_REF: "feature/pr",
    })).toBe("closed")
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
      ...lane, SUPABASE_URL: PROD_URL,
    })).toBe("closed")
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
      ...lane, SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co.evil.example",
    })).toBe("closed")
  })

  it("closes when the enable flag or the allowlist is missing, empty or malformed", () => {
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
      ...lane, DEV_MAIL_ENABLED: undefined,
    })).toBe("closed")
    for (const enabled of ["TRUE", "1", "yes", "true\nfalse", "true true"]) {
      expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
        ...lane, DEV_MAIL_ENABLED: enabled,
      })).toBe("closed")
    }
    for (const enabled of [" true", "true ", "true\n", "true\r\n", "\ttrue"]) {
      expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
        ...lane, DEV_MAIL_ENABLED: enabled,
      })).toBe("open")
    }
    for (const list of [undefined, "", "   ", ",", "owner@example.com,", "owner@example.com,,cases@example.com",
      "*@example.com", "owner@example.com, *@example.com", "not-an-email", "owner@example.com\ncases@example.com",
      "Name <owner@example.com>", "owner@example.com;cases@example.com"]) {
      expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
        ...lane, DEV_MAIL_ALLOWED_RECIPIENTS: list,
      })).toBe("closed")
    }
    expect(parseDevMailAllowlist("owner@example.com,cases@example.com")).toEqual(new Set([
      "owner@example.com", "cases@example.com",
    ]))
    expect(parseDevMailAllowlist(undefined)).toBeNull()
  })

  it("lets the no-email kill switch win", () => {
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
      ...lane, DEV_CASE_INTAKE_NO_EMAIL: "true",
    })).toBe("closed")
  })

  it("refuses a recipient that is not the whole allowlisted mailbox", () => {
    const refused = [
      "owner@example.com,attacker@example.com",
      "owner@example.com\nattacker@example.com",
      "owner@example.com\r\nBcc: attacker@example.com",
      "\"owner@example.com\"",
      "Owner <owner@example.com>",
      "owner@example.com.evil.com",
      "attacker@example.com",
    ]
    expect(devMarketingMailDecision(" owner@example.com ", "cases@example.com", lane)).toBe("open")
    for (const customer of refused) {
      expect(devMarketingMailDecision(customer, "cases@example.com", lane)).toBe("closed")
    }
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com,attacker@example.com", lane)).toBe("closed")
    expect(devMarketingMailDecision("owner@example.com", null, {
      ...lane, DEV_MAIL_ALLOWED_RECIPIENTS: "owner@example.com",
    })).toBe("open")
    expect(devMarketingMailDecision("stranger@example.com", null, {
      ...lane, DEV_MAIL_ALLOWED_RECIPIENTS: "owner@example.com",
    })).toBe("closed")
  })

  it("sends neither message unless every pending recipient is approved", () => {
    expect(devMarketingMailDecision("owner@example.com", "stranger@example.com", lane)).toBe("closed")
    expect(devMarketingMailDecision("stranger@example.com", "cases@example.com", lane)).toBe("closed")
    expect(devMarketingMailDecision(null, "cases@example.com", lane)).toBe("open")
    expect(devMarketingMailDecision(null, "stranger@example.com", lane)).toBe("closed")
  })

  it("accepts a distinct dedicated internal mailbox and refuses to reuse it for the customer", () => {
    const dedicated = { ...lane, DEV_MAIL_ALLOWED_RECIPIENTS: "owner@example.com", DEV_MAIL_INTERNAL_RECIPIENT: "cases@example.com" }
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", dedicated)).toBe("open")
    expect(devMarketingMailDecision("cases@example.com", "cases@example.com", dedicated)).toBe("closed")
    expect(devMarketingMailDecision("owner@example.com", "other@example.com", dedicated)).toBe("closed")
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
      ...dedicated, DEV_MAIL_INTERNAL_RECIPIENT: "cases@example.com,owner@example.com",
    })).toBe("closed")
    expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
      ...dedicated, DEV_MAIL_INTERNAL_RECIPIENT: "not-an-email",
    })).toBe("closed")
  })

  it("names the closed condition without the address or the allowlist", () => {
    const customer = "stranger@example.com"
    const internal = "cases@example.com"
    const report = devMarketingMailReport("owner@example.com", "cases@example.com", {
      ...lane,
      DEV_MAIL_ENABLED: "true\n",
    })
    expect(report).toEqual({ decision: "open", reason: null, detail: null })

    const disabled = devMarketingMailReport(customer, internal, { ...lane, DEV_MAIL_ENABLED: "TRUE" })
    expect(disabled).toEqual({ decision: "closed", reason: "mail-disabled", detail: "other" })
    expect(devMarketingMailReport(customer, internal, { ...lane, DEV_MAIL_ENABLED: undefined })).toEqual({
      decision: "closed", reason: "mail-disabled", detail: "absent",
    })
    expect(devMarketingMailReport(customer, internal, { ...lane, DEV_CASE_INTAKE_NO_EMAIL: "true" })).toEqual({
      decision: "closed", reason: "kill-switch", detail: null,
    })
    expect(devMarketingMailReport(customer, internal, { ...lane, VERCEL_GIT_COMMIT_REF: "" })).toEqual({
      decision: "closed", reason: "git-ref", detail: "absent",
    })
    expect(devMarketingMailReport(customer, internal, { ...lane, VERCEL_GIT_COMMIT_REF: "feature/pr" })).toEqual({
      decision: "closed", reason: "git-ref", detail: "other",
    })
    expect(devMarketingMailReport(customer, internal, { ...lane, SUPABASE_URL: PROD_URL })).toEqual({
      decision: "closed", reason: "database", detail: null,
    })
    expect(devMarketingMailReport(customer, internal, { ...lane, DEV_MAIL_ALLOWED_RECIPIENTS: "owner@example.com\ncases@example.com" })).toEqual({
      decision: "closed", reason: "allowlist-malformed", detail: "control",
    })
    expect(devMarketingMailReport(customer, internal, { ...lane, DEV_MAIL_ALLOWED_RECIPIENTS: "owner@example.com," })).toEqual({
      decision: "closed", reason: "allowlist-malformed", detail: "empty-token",
    })
    expect(devMarketingMailReport(customer, internal, lane)).toEqual({
      decision: "closed", reason: "customer-rejected", detail: "unlisted",
    })
    expect(devMarketingMailReport("owner@example.com", "not-an-email", lane)).toEqual({
      decision: "closed", reason: "internal-rejected", detail: "invalid",
    })
    expect(devMarketingMailReport("owner@example.com", "stranger@example.com", lane)).toEqual({
      decision: "closed", reason: "internal-rejected", detail: "unlisted",
    })

    const line = devMailCloseLogLine(disabled)
    expect(line).toBe("[case-intake] dev mail closed reason=mail-disabled detail=other")
    expect(line).not.toMatch(/@|DEV_MAIL|true|TRUE/)
    expect(JSON.stringify(disabled)).not.toMatch(/stranger@example.com|owner@example.com|cases@example.com/)
    expect(devMailDiagnosticsEnabled(lane)).toBe(true)
    expect(devMailDiagnosticsEnabled({ ...lane, VERCEL_GIT_COMMIT_REF: "feature/pr" })).toBe(false)
    expect(devMailDiagnosticsEnabled({ ...lane, VERCEL_ENV: "production" })).toBe(false)
    expect(devMailDiagnosticsEnabled({ ...lane, VERCEL_GIT_COMMIT_REF: "", SUPABASE_URL: DEV_URL })).toBe(true)
    expect(devMarketingMailLane(lane)).toBe(true)
    expect(devMarketingMailLane({ ...lane, VERCEL_ENV: "production" })).toBe(false)
    expect(devMailCloseLogLine({ decision: "outside", reason: null, detail: null })).toBeNull()
  })
})
