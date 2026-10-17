import { afterEach, describe, expect, it, vi } from "vitest"
import { customerEmailLogoUrl } from "../email/customer-message"
import { renderEvidenceRequest } from "../email/evidence-request"
import { adminContentSecurityPolicy, marketingContentSecurityPolicy, privateAppContentSecurityPolicy } from "./content-security-policy.mjs"

const marketingConfig = await import(/* @vite-ignore */ new URL("../../next.config.mjs", import.meta.url).href)

function directives(policy: string) {
  return Object.fromEntries(
    policy.split(";").map(part => part.trim()).filter(Boolean).map(part => {
      const [name] = part.split(" ")
      return [name, part]
    }),
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("content security policy", () => {
  it("enforces a marketing policy with framing, object, base and form limits", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const rules = await marketingConfig.default.headers()
    const headers = Object.fromEntries(rules[0].headers.map((header: { key: string; value: string }) => [header.key, header.value]))
    expect(headers["Content-Security-Policy-Report-Only"]).toBeUndefined()
    const policy = headers["Content-Security-Policy"]
    const parsed = directives(policy)
    expect(parsed["default-src"]).toBe("default-src 'self'")
    expect(parsed["script-src"]).toBe("script-src 'self' 'unsafe-inline' https://www.googletagmanager.com")
    expect(parsed["script-src-attr"]).toBe("script-src-attr 'none'")
    expect(parsed["style-src"]).toBe("style-src 'self' 'unsafe-inline'")
    expect(parsed["img-src"]).toBe("img-src 'self' data: https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com")
    expect(parsed["font-src"]).toBe("font-src 'self'")
    expect(parsed["connect-src"]).toBe("connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://analytics.google.com")
    expect(parsed["frame-src"]).toBe("frame-src 'none'")
    expect(parsed["frame-ancestors"]).toBe("frame-ancestors 'none'")
    expect(parsed["base-uri"]).toBe("base-uri 'self'")
    expect(parsed["object-src"]).toBe("object-src 'none'")
    expect(parsed["form-action"]).toBe("form-action 'self'")
    expect(policy).not.toMatch(/unsafe-eval|doubleclick|googlesyndication|fonts\.googleapis|fonts\.gstatic|\bhttps:;/ )
  })

  it("allows script evaluation only while the development server is running", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(marketingContentSecurityPolicy()).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com")
    expect(privateAppContentSecurityPolicy()).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")

    vi.stubEnv("NODE_ENV", "production")
    expect(marketingContentSecurityPolicy()).not.toContain("unsafe-eval")
    expect(privateAppContentSecurityPolicy()).not.toContain("unsafe-eval")
    expect(privateAppContentSecurityPolicy()).toContain("connect-src 'self' https://*.amazonaws.com")
    expect(privateAppContentSecurityPolicy()).not.toContain("googletagmanager")
  })

  it("allows the public ProfileRelaunch logo in Admin and nowhere else", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const adminConfig = (await import(/* @vite-ignore */ new URL("../../apps/admin/next.config.mjs", import.meta.url).href)).default
    const customerConfig = (await import(/* @vite-ignore */ new URL("../../apps/customer/next.config.mjs", import.meta.url).href)).default
    const headerValue = async (config: { headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>> }) => {
      const rules = await config.headers()
      return rules[0].headers.find(header => header.key === "Content-Security-Policy")?.value ?? ""
    }
    const adminPolicy = await headerValue(adminConfig)
    const customerPolicy = await headerValue(customerConfig)
    const admin = directives(adminPolicy)
    const customer = directives(customerPolicy)
    const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const email = renderEvidenceRequest({
      caseRef: "PR-1042",
      documents: ["Shop licence"],
      uploadUrl: upload,
    })
    expect(customerEmailLogoUrl).toBe("https://profilerelaunch.com/brand/profile-relaunch-logo.png")
    expect(email?.html).toContain(`src="${customerEmailLogoUrl}"`)
    expect(email?.html).not.toContain("#t=")
    expect(admin["img-src"]).toBe("img-src 'self' data: https://profilerelaunch.com")
    expect(admin["img-src"]?.split(" ").slice(1)).toEqual(["'self'", "data:", new URL(customerEmailLogoUrl).origin])
    expect(customer["img-src"]).toBe("img-src 'self' data:")
    expect(adminPolicy).not.toMatch(/img-src[^;]*\s(?:https:|\*)(?:;|\s)/)
    for (const name of ["default-src", "script-src", "script-src-attr", "style-src", "font-src", "connect-src", "frame-src", "frame-ancestors", "base-uri", "object-src", "form-action"]) {
      expect(admin[name]).toBe(customer[name])
    }
    expect(admin["frame-src"]).toBe("frame-src 'none'")
    expect(admin["object-src"]).toBe("object-src 'none'")
    expect(adminPolicy).not.toContain("googletagmanager")
    expect(adminContentSecurityPolicy()).toBe(adminPolicy)
    expect(privateAppContentSecurityPolicy()).toBe(customerPolicy)
    expect(marketingContentSecurityPolicy()).not.toContain("https://profilerelaunch.com")
  })
})
