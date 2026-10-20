import { describe, expect, it } from "vitest"
import { supabaseUrlMatchesEnvironment } from "@/lib/supabase/config"
import {
  developDevIntakeMailLane,
  featurePreviewMailLogLine,
  intakeMailLane,
  isCasePersistenceEnabled,
  isDevSupabaseProject,
  observeIntakeMailRuntime,
} from "./persistence-config"

const DEV_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const PROD_URL = "https://cxwwekdzkkjjbiyofrov.supabase.co"

describe("case persistence flag", () => {
  it("accepts only the word true", () => {
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "true" })).toBe(true)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: " true " })).toBe(true)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "TRUE" })).toBe(false)
    expect(isCasePersistenceEnabled({})).toBe(false)
  })
})

describe("intake mail lane", () => {
  const develop = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", SUPABASE_URL: DEV_URL }

  it("shares the production delivery path with the develop DEV Preview", () => {
    expect(intakeMailLane(develop)).toBe("shared")
    expect(intakeMailLane({ ...develop, SUPABASE_URL: `${DEV_URL}/` })).toBe("shared")
    expect(intakeMailLane({ ...develop, SUPABASE_URL: `${DEV_URL}/rest/v1` })).toBe("shared")
    expect(intakeMailLane({ VERCEL_ENV: "production", SUPABASE_URL: PROD_URL })).toBe("shared")
    expect(intakeMailLane({})).toBe("shared")
    expect(developDevIntakeMailLane(develop)).toBe(true)
    expect(developDevIntakeMailLane({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "develop", SUPABASE_URL: DEV_URL })).toBe(false)
  })

  it("keeps every other Preview off the provider", () => {
    expect(intakeMailLane({ ...develop, VERCEL_GIT_COMMIT_REF: "feature/pr" })).toBe("feature-preview")
    expect(intakeMailLane({ ...develop, VERCEL_GIT_COMMIT_REF: "" })).toBe("feature-preview")
    expect(intakeMailLane({ ...develop, SUPABASE_URL: PROD_URL })).toBe("feature-preview")
    expect(developDevIntakeMailLane({ ...develop, VERCEL_GIT_COMMIT_REF: "feature/pr" })).toBe(false)
  })

  it("uses the DEV hostname, which is the same identity case persistence accepts", () => {
    const withPath = `${DEV_URL}/rest/v1`
    expect(isDevSupabaseProject(withPath)).toBe(true)
    expect(supabaseUrlMatchesEnvironment(withPath, "preview")).toBe(true)
    expect(isDevSupabaseProject(PROD_URL)).toBe(false)
    expect(isDevSupabaseProject("not a url")).toBe(false)
  })
})

describe("intake mail runtime observation", () => {
  it("reports classes and not configuration values", () => {
    const observation = observeIntakeMailRuntime({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "develop",
      SUPABASE_URL: `${DEV_URL}/rest/v1`,
    })
    expect(observation).toEqual({
      vercelEnv: "preview",
      gitRef: "develop",
      database: "exact-dev",
      lane: "shared",
    })
    const line = featurePreviewMailLogLine({ ...observation, lane: "feature-preview", gitRef: "other" })
    expect(line).toBe("[case-intake] feature preview mail withheld vercel=preview ref=other database=exact-dev")
    expect(line).not.toMatch(/@|secret|true|false/)
    expect(JSON.stringify(observation)).not.toMatch(/@/)
  })

  it("names an absent or foreign runtime without echoing it", () => {
    expect(observeIntakeMailRuntime({})).toEqual({
      vercelEnv: "absent",
      gitRef: "absent",
      database: "absent",
      lane: "shared",
    })
    expect(observeIntakeMailRuntime({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature/pr",
      SUPABASE_URL: PROD_URL,
    })).toEqual({
      vercelEnv: "preview",
      gitRef: "other",
      database: "other",
      lane: "feature-preview",
    })
  })
})
