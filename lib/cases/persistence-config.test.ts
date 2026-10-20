import { describe, expect, it } from "vitest"
import { devCaseIntakeEmailSuppressed, devMarketingMailDecision, parseDevMailAllowlist } from "./persistence-config"

const DEV_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const PROD_URL = "https://cxwwekdzkkjjbiyofrov.supabase.co"

describe("DEV Get Help no-outbound-email gate", () => {
  const valid = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop",
    DEV_CASE_INTAKE_NO_EMAIL: "true", SUPABASE_URL: DEV_URL }
  it("suppresses only deliberately opted-in develop intake", () => {
    expect(devCaseIntakeEmailSuppressed(valid)).toBe(true)
    expect(devCaseIntakeEmailSuppressed({...valid, SUPABASE_URL: valid.SUPABASE_URL + "/"})).toBe(true)
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
    for (const enabled of ["TRUE", "1", "yes", " true", "true "]) {
      expect(devMarketingMailDecision("owner@example.com", "cases@example.com", {
        ...lane, DEV_MAIL_ENABLED: enabled,
      })).toBe("closed")
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
})
