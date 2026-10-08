import { afterEach, describe, expect, it } from "vitest"
import { authConfig } from "./config"

const PROD = "cxwwekdzkkjjbiyofrov"
const DEV = "rmzozuiamjcclvtgutgd"

describe("Admin environment isolation", () => {
  afterEach(() => {
    for (const key of [
      "ADMIN_AUTH_ENABLED",
      "ADMIN_ORIGIN",
      "SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "CUSTOMER_ORIGIN",
      "VERCEL_ENV",
      "VERCEL_BRANCH_URL",
      "VERCEL_URL",
    ]) delete process.env[key]
  })

  function configure(projectRef: string, environment: "preview" | "production") {
    process.env.ADMIN_AUTH_ENABLED = "true"
    process.env.SUPABASE_URL = `https://${projectRef}.supabase.co`
    process.env.SUPABASE_SECRET_KEY = "test-value"
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-value"
    process.env.VERCEL_ENV = environment
    if (environment === "preview") {
      process.env.VERCEL_BRANCH_URL = "profilerelaunch-admin-git-preview-clientcove.vercel.app"
      process.env.VERCEL_URL = "profilerelaunch-admin-random-clientcove.vercel.app"
    }
  }

  it("accepts Preview -> DEV and rejects Preview -> PROD", () => {
    configure(DEV, "preview")
    expect(authConfig()?.url).toBe(`https://${DEV}.supabase.co`)
    expect(authConfig()?.origin).toBe("https://profilerelaunch-admin-git-preview-clientcove.vercel.app")
    configure(PROD, "preview")
    expect(authConfig()).toBeNull()
  })

  it("accepts Production -> PROD and rejects Production -> DEV", () => {
    configure(PROD, "production")
    process.env.ADMIN_ORIGIN = "https://attacker.example"
    expect(authConfig()?.url).toBe(`https://${PROD}.supabase.co`)
    expect(authConfig()?.origin).toBe("https://admin.profilerelaunch.com")
    expect(authConfig()?.customerOrigin).toBe("https://customer.profilerelaunch.com")
    configure(DEV, "production")
    expect(authConfig()).toBeNull()
  })

  it("fails Preview closed when Vercel does not provide a valid preview hostname", () => {
    configure(DEV, "preview")
    delete process.env.VERCEL_BRANCH_URL
    process.env.VERCEL_URL = "not-vercel.example"
    process.env.ADMIN_ORIGIN = "https://admin-preview.example.com"
    expect(authConfig()).toBeNull()
  })
})
