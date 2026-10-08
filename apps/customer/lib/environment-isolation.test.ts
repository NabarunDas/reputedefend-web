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
      "VERCEL_BRANCH_URL",
      "VERCEL_URL",
    ]) delete process.env[key]
  })

  function configure(projectRef: string, environment: "preview" | "production") {
    process.env.SUPABASE_URL = `https://${projectRef}.supabase.co`
    process.env.SUPABASE_SECRET_KEY = "test-value"
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-value"
    process.env.VERCEL_ENV = environment
    if (environment === "preview") {
      process.env.VERCEL_BRANCH_URL = "profilerelaunch-customer-git-preview-clientcove.vercel.app"
      process.env.VERCEL_URL = "profilerelaunch-customer-random-clientcove.vercel.app"
    }
  }

  it("accepts Preview -> DEV and rejects Preview -> PROD", () => {
    configure(DEV, "preview")
    expect(customerBackendConfig()?.url).toBe(`https://${DEV}.supabase.co`)
    expect(customerBackendConfig()?.origin).toBe("https://profilerelaunch-customer-git-preview-clientcove.vercel.app")
    configure(PROD, "preview")
    expect(customerBackendConfig()).toBeNull()
  })

  it("accepts Production -> PROD and rejects Production -> DEV", () => {
    configure(PROD, "production")
    process.env.CUSTOMER_ORIGIN = "https://attacker.example"
    expect(customerBackendConfig()?.url).toBe(`https://${PROD}.supabase.co`)
    expect(customerBackendConfig()?.origin).toBe("https://customer.profilerelaunch.com")
    configure(DEV, "production")
    expect(customerBackendConfig()).toBeNull()
  })

  it("fails Preview closed when Vercel does not provide a valid preview hostname", () => {
    configure(DEV, "preview")
    delete process.env.VERCEL_BRANCH_URL
    process.env.VERCEL_URL = "not-vercel.example"
    process.env.CUSTOMER_ORIGIN = "https://customer-preview.example.com"
    expect(customerBackendConfig()).toBeNull()
  })
})
