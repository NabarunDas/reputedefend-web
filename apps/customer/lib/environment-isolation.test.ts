import { afterEach, describe, expect, it } from "vitest"
import { customerBackendConfig } from "./config"

const PROD = "cxwwekdzkkjjbiyofrov"
const DEV = "rmzozuiamjcclvtgutgd"

describe("Customer environment isolation", () => {
  afterEach(() => {
    for (const key of [
      "CUSTOMER_ORIGIN",
      "SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "VERCEL_ENV",
    ]) delete process.env[key]
  })

  function configure(projectRef: string, environment: "preview" | "production") {
    process.env.CUSTOMER_ORIGIN = environment === "production"
      ? "https://customer.profilerelaunch.com"
      : "https://customer-preview.example.com"
    process.env.SUPABASE_URL = `https://${projectRef}.supabase.co`
    process.env.SUPABASE_SECRET_KEY = "test-value"
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-value"
    process.env.VERCEL_ENV = environment
  }

  it("accepts Preview -> DEV and rejects Preview -> PROD", () => {
    configure(DEV, "preview")
    expect(customerBackendConfig()?.url).toBe(`https://${DEV}.supabase.co`)
    configure(PROD, "preview")
    expect(customerBackendConfig()).toBeNull()
  })

  it("accepts Production -> PROD and rejects Production -> DEV", () => {
    configure(PROD, "production")
    expect(customerBackendConfig()?.url).toBe(`https://${PROD}.supabase.co`)
    configure(DEV, "production")
    expect(customerBackendConfig()).toBeNull()
  })
})
