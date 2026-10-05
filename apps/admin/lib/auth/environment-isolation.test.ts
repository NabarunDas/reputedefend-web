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
    ]) delete process.env[key]
  })

  function configure(projectRef: string, environment: "preview" | "production") {
    process.env.ADMIN_AUTH_ENABLED = "true"
    process.env.ADMIN_ORIGIN = environment === "production"
      ? "https://admin.profilerelaunch.com"
      : "https://admin-preview.example.com"
    process.env.SUPABASE_URL = `https://${projectRef}.supabase.co`
    process.env.SUPABASE_SECRET_KEY = "test-value"
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-value"
    process.env.VERCEL_ENV = environment
  }

  it("accepts Preview -> DEV and rejects Preview -> PROD", () => {
    configure(DEV, "preview")
    expect(authConfig()?.url).toBe(`https://${DEV}.supabase.co`)
    configure(PROD, "preview")
    expect(authConfig()).toBeNull()
  })

  it("accepts Production -> PROD and rejects Production -> DEV", () => {
    configure(PROD, "production")
    expect(authConfig()?.url).toBe(`https://${PROD}.supabase.co`)
    configure(DEV, "production")
    expect(authConfig()).toBeNull()
  })
})
