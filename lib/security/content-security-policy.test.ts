import { afterEach, describe, expect, it, vi } from "vitest"
import { marketingContentSecurityPolicy, privateAppContentSecurityPolicy } from "./content-security-policy.mjs"

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
})
