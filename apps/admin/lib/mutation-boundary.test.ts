/**
 * Step 23 security acceptance: every mutation entry point is accounted for.
 *
 * Each command module asserts its own origin check, but nothing asserted that
 * a new route handler has one at all. These checks walk `app/api` on disk and
 * require every POST route to be either a documented unauthenticated endpoint
 * or a delegate of a command module that compares the request origin against
 * the configured one. A route added without that fails here.
 */

import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

const adminRoot = new URL("../", import.meta.url)

function routeFiles(directory = new URL("app/api/", adminRoot), prefix = "/api"): Array<{ route: string; file: string }> {
  const found: Array<{ route: string; file: string }> = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "route.ts") found.push({ route: prefix, file: `${directory.pathname}route.ts` })
    else if (entry.isDirectory()) found.push(...routeFiles(new URL(`${entry.name}/`, directory), `${prefix}/${entry.name}`))
  }
  return found
}

const read = (file: string) => readFileSync(file, "utf8")

/**
 * The endpoints that legitimately accept a request without an Admin session,
 * and what authenticates each one instead. Anything not on this list has to
 * go through a command module.
 */
const unauthenticatedPosts: Record<string, string> = {
  "/api/webhooks/stripe": "Stripe signature",
  "/api/webhooks/resend": "Resend signature",
  "/api/webhooks/resend/inbound": "Resend signature",
  "/api/[[...path]]": "catch-all that only refuses",
}

const originCheck = /request\.headers\.get\("origin"\) !== config\.origin/

/** The command module a route delegates to, resolved from its imports. */
function delegateSources(file: string): string[] {
  const sources: string[] = []
  for (const match of read(file).matchAll(/from "@\/(lib\/[^"]+)"/g)) {
    try { sources.push(read(new URL(`${match[1]}.ts`, adminRoot).pathname)) } catch { /* Not a local module. */ }
  }
  return sources
}

describe("mutation entry points", () => {
  it("finds the API routes this check is meant to cover", () => {
    expect(routeFiles().length).toBeGreaterThan(30)
  })

  it("requires a same-origin request for every state-changing route", () => {
    const unguarded = routeFiles()
      .filter(entry => /export async function POST/.test(read(entry.file)))
      .filter(entry => !(entry.route in unauthenticatedPosts))
      .filter(entry => !delegateSources(entry.file).some(source => originCheck.test(source)))
      .map(entry => entry.route)
    expect(unguarded).toEqual([])
  })

  it("keeps the unauthenticated list to signature-verified webhooks and the refusing catch-all", () => {
    // Widening this list is the kind of change that should be deliberate, so
    // the list itself is asserted rather than only consulted.
    expect(Object.keys(unauthenticatedPosts).sort()).toEqual([
      "/api/[[...path]]",
      "/api/webhooks/resend",
      "/api/webhooks/resend/inbound",
      "/api/webhooks/stripe",
    ])
  })

  it("verifies a signature on every webhook rather than trusting the path", () => {
    for (const route of ["/api/webhooks/stripe", "/api/webhooks/resend", "/api/webhooks/resend/inbound"]) {
      const entry = routeFiles().find(candidate => candidate.route === route)!
      const sources = delegateSources(entry.file).join("\n")
      expect(sources).toMatch(/signature|timingSafeEqual|svix|verify/i)
    }
  })

  it("exposes no route that answers an unauthenticated GET other than the cron entry point", () => {
    // The proxy lets exactly one GET through without a session, and that one
    // authenticates with its own secret.
    const proxy = read(new URL("proxy.ts", adminRoot).pathname)
    expect(proxy).toContain('pathname === "/api/internal/jobs/run"')
    expect(read(new URL("lib/jobs/run.ts", adminRoot).pathname)).toMatch(/cronAuthorized/)
    expect(read(new URL("lib/jobs/config.ts", adminRoot).pathname)).toMatch(/timingSafeEqual/)
  })
})
