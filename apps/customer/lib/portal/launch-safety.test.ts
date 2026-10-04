import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const customerRoot = new URL("../..", import.meta.url)
const repoRoot = new URL("../../../..", import.meta.url)

function files(directory: URL, match: (name: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const next = new URL(`${entry.name}/`, directory)
    if (entry.isDirectory()) found.push(...files(next, match))
    else if (match(entry.name)) found.push(`${directory.pathname}${entry.name}`)
  }
  return found
}

const portalViews = files(new URL("app/portal/", customerRoot), name => name.endsWith(".tsx") && !name.includes(".test."))

function hrefs(source: string) {
  return [...source.matchAll(/href=(?:\{`([^`]+)`\}|"([^"]+)"|'([^']+)')/g)].map(match => match[1] || match[2] || match[3])
}

function allowedPortalHref(href: string) {
  return [
    /^\/portal$/,
    /^\/portal\/cases$/,
    /^\/portal\/cases\?view=(?:active|previous|all)$/,
    /^\/portal\/cases\?view=\$\{[^}]+\}$/,
    /^\/portal\/cases\?view=\$\{[^}]+\}\&before=\$\{[^}]+\}\&ref=\$\{[^}]+\}$/,
    /^\/portal\/cases\/\$\{[^}]+\}$/,
    /^\/portal\/cases\/\$\{[^}]+\}\/(?:documents|service|payments)$/,
    /^\/portal\/documents$/,
    /^\/portal\/payments$/,
    /^\/portal\/guard$/,
    /^\/portal\/guard\/\$\{[^}]+\}$/,
    /^\/portal\/messages$/,
    /^\/portal\/messages\?before=\$\{[^}]+\}\&selector=\$\{[^}]+\}$/,
    /^\/portal\/messages\/\$\{[^}]+\}$/,
    /^\/portal\/account$/,
    /^\/api\/portal\/documents\/download\?reference=\$\{[^}]+\}\&selector=\$\{[^}]+\}$/,
    /^\/api\/portal\/payments\/receipt\?selector=\$\{[^}]+\}$/,
    /^\/api\/portal\/payments\/invoice\?reference=\$\{[^}]+\}\&selector=\$\{[^}]+\}$/,
  ].some(pattern => pattern.test(href))
}

describe("customer portal launch safety", () => {
  it("keeps portal links on real routes and out of query secrets", () => {
    const linkFiles = [
      ...portalViews,
      new URL("lib/portal/cases/model.ts", customerRoot).pathname,
      new URL("lib/portal/cases/workspace.ts", customerRoot).pathname,
    ]
    const found = linkFiles.flatMap(file => {
      const source = readFileSync(file, "utf8")
      const templates = [...source.matchAll(/`(\/(?:portal|api\/portal)[^`]*)`/g)].map(match => match[1])
      return [...hrefs(source), ...templates].map(href => ({ file, href }))
    })
    const portalHrefs = found.filter(item => item.href.startsWith("/portal") || item.href.startsWith("/api/portal"))
    const rejected = portalHrefs.filter(item => !allowedPortalHref(item.href))
    expect(rejected).toEqual([])
    const joined = portalHrefs.map(item => item.href).join("\n")
    expect(joined).not.toMatch(/relaunch-guard|next=|email=|token=|otp=|secret=/i)
    expect(joined).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  it("does not render portal content as HTML and does not add a marketing Customer Login", () => {
    const markup = portalViews.map(file => readFileSync(file, "utf8")).join("\n")
    expect(markup).not.toContain("dangerouslySetInnerHTML")
    expect(markup).not.toMatch(/tabIndex=\{?[1-9]/)
    const marketing = [
      ...files(new URL("app/", repoRoot), name => name.endsWith(".tsx")),
      ...files(new URL("components/", repoRoot), name => name.endsWith(".tsx")),
    ]
    const leaked = marketing.filter(file => /Customer Login|href=["'`]\/login/.test(readFileSync(file, "utf8")))
    expect(leaked).toEqual([])
  })

  it("keeps messages and account read-only and the portal gate exact", () => {
    const messages = readFileSync(new URL("app/portal/messages/messages-view.tsx", customerRoot), "utf8")
    const account = readFileSync(new URL("app/portal/account/account-view.tsx", customerRoot), "utf8")
    const config = readFileSync(new URL("lib/portal/config.ts", customerRoot), "utf8")
    expect(messages).not.toMatch(/<textarea|<input|compose/i)
    expect(account).not.toMatch(/<textarea|<input|admin_record_save_v1|admin_contact_verify_v1/)
    expect(config).toContain('process.env.CUSTOMER_PORTAL_ENABLED === "true"')
    expect(config).not.toMatch(/process\.env\.CUSTOMER_AUTH_ENABLED/)
    const views = portalViews.map(file => readFileSync(file, "utf8")).join("\n")
    expect(views).not.toMatch(/\b(RPC|UUID|webhook)\b|service role|\boperator\b/i)
  })

  it("wraps long portal text and respects reduced motion at the recorded widths", () => {
    const css = readFileSync(new URL("app/globals.css", customerRoot), "utf8")
    expect(css).toContain("overflow-x: clip")
    expect(css).toContain("overflow-wrap: anywhere")
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain("@media (max-width: 359px)")
    expect(css).toContain("@media (max-width: 480px)")
    expect(css).toContain("@media (min-width: 768px)")
    expect(css).toContain("@media (min-width: 1024px)")
    expect(css).toMatch(/\.portal-nav-list[\s\S]*overflow-x: auto/)
    expect(css).toContain("scroll-margin-inline: 1rem")
    const nav = readFileSync(new URL("app/portal/portal-nav.tsx", customerRoot), "utf8")
    expect(nav).toContain("<a ")
    expect(nav).not.toContain("tabIndex={-1}")
  })
})
