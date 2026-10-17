import { describe, expect, it } from "vitest"

type NextConfigLike = {
  poweredByHeader: boolean
  headers(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>
}

/** The configs are plain ESM with no types of their own, so they are loaded by URL. */
async function loadConfig(relativePath: string): Promise<NextConfigLike> {
  const loaded = await import(/* @vite-ignore */ new URL(relativePath, import.meta.url).href)
  return loaded.default as NextConfigLike
}

const adminConfig = await loadConfig("./next.config.mjs")
const customerConfig = await loadConfig("../customer/next.config.mjs")

async function headerMap(config: NextConfigLike) {
  const rules = await config.headers()
  expect(rules).toHaveLength(1)
  expect(rules[0].source).toBe("/:path*")
  return Object.fromEntries(rules[0].headers.map(header => [header.key, header.value]))
}

describe("Admin response headers", () => {
  it("keeps every response out of search indexes and out of shared caches", async () => {
    const headers = await headerMap(adminConfig)
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow, noarchive")
    expect(headers["Cache-Control"]).toBe("private, no-store, max-age=0")
  })

  it("sets the transport and framing protections a privileged workspace needs", async () => {
    const headers = await headerMap(adminConfig)
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["X-Frame-Options"]).toBe("DENY")
    expect(headers["Referrer-Policy"]).toBe("no-referrer")
    expect(headers["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}$/)
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()")
  })

  it("restricts content to the same origin, with the presigned upload and public logo as the only exceptions", async () => {
    // Every directive except images must match the customer app. Admin also
    // allows the public ProfileRelaunch logo so a sandboxed email preview can
    // show the stored HTML. No other external image host is permitted.
    const admin = await headerMap(adminConfig)
    const customer = await headerMap(customerConfig)
    const directives = Object.fromEntries(
      admin["Content-Security-Policy"].split(";").map(part => part.trim()).filter(Boolean)
        .map(part => [part.split(" ")[0], part]),
    )
    const customerDirectives = Object.fromEntries(
      customer["Content-Security-Policy"].split(";").map(part => part.trim()).filter(Boolean)
        .map(part => [part.split(" ")[0], part]),
    )
    expect(customerDirectives["img-src"]).toBe("img-src 'self' data:")
    expect(directives["img-src"]).toBe("img-src 'self' data: https://profilerelaunch.com")
    for (const [name, value] of Object.entries(customerDirectives)) {
      if (name === "img-src") continue
      expect(directives[name]).toBe(value)
    }
    expect(directives["default-src"]).toBe("default-src 'self'")
    expect(directives["connect-src"]).toBe("connect-src 'self' https://*.amazonaws.com")
    expect(directives["frame-ancestors"]).toBe("frame-ancestors 'none'")
    expect(directives["object-src"]).toBe("object-src 'none'")
    expect(directives["form-action"]).toBe("form-action 'self'")
    expect(directives["script-src"]).toBe("script-src 'self' 'unsafe-inline'")
    expect(directives["script-src-attr"]).toBe("script-src-attr 'none'")
    expect(admin["Content-Security-Policy"]).not.toContain("unsafe-eval")
    expect(admin["Content-Security-Policy"]).not.toMatch(/google|stripe|unsafe-eval/)
  })

  it("does not advertise the framework version", async () => {
    expect(adminConfig.poweredByHeader).toBe(false)
  })
})
