import { describe, expect, it } from "vitest"
import { devCaseIntakeEmailSuppressed } from "./persistence-config"

describe("DEV Get Help no-outbound-email gate", () => {
  const valid = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop",
    DEV_CASE_INTAKE_NO_EMAIL: "true", SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co" }
  it("suppresses only deliberately opted-in develop intake", () => {
    expect(devCaseIntakeEmailSuppressed(valid)).toBe(true)
    expect(devCaseIntakeEmailSuppressed({...valid, SUPABASE_URL: valid.SUPABASE_URL + "/"})).toBe(true)
  })
  it("retains previous behavior everywhere else", () => {
    for (const changes of [{VERCEL_ENV:"production"},{VERCEL_ENV:"development"},
      {VERCEL_GIT_COMMIT_REF:"feature/pr"}, {DEV_CASE_INTAKE_NO_EMAIL:"false"},
      {SUPABASE_URL:"https://cxwwekdzkkjjbiyofrov.supabase.co"}]) {
      expect(devCaseIntakeEmailSuppressed({...valid,...changes})).toBe(false)
    }
  })
})
