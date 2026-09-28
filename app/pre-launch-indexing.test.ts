import type { Metadata } from "next"
import { afterEach, describe, expect, it, vi } from "vitest"
import robots from "@/app/robots"
import sitemap from "@/app/sitemap"
import { brandSiteUrl } from "@/lib/brand"
import { isSitePublic } from "@/lib/site-visibility"

// Root metadata is evaluated on import, so each case re-imports the layout.
// The font loaders are the only thing in that module that cannot run here.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-body" }),
  Manrope: () => ({ variable: "--font-display" }),
}))

async function rootRobots(vercelEnv: string, siteLaunched: string) {
  vi.stubEnv("VERCEL_ENV", vercelEnv)
  vi.stubEnv("SITE_LAUNCHED", siteLaunched)
  vi.resetModules()
  const { metadata } = (await import("@/app/layout")) as { metadata: Metadata }
  return metadata.robots
}

const NO_INDEX = { index: false, follow: false }
const INDEXABLE = { index: true, follow: true }
const BLOCK_ALL = { userAgent: "*", disallow: "/" }
const PUBLIC_RULES = { userAgent: "*", allow: "/", disallow: ["/api/"] }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("pre-launch indexing gate", () => {
  it("only treats the site as public in production with the launch flag set", () => {
    expect(isSitePublic({ VERCEL_ENV: "production", SITE_LAUNCHED: "true" })).toBe(true)
    for (const env of [
      { VERCEL_ENV: "production", SITE_LAUNCHED: "false" },
      { VERCEL_ENV: "production", SITE_LAUNCHED: "" },
      { VERCEL_ENV: "production", SITE_LAUNCHED: undefined },
      { VERCEL_ENV: "production", SITE_LAUNCHED: "TRUE" },
      { VERCEL_ENV: "production", SITE_LAUNCHED: "1" },
      { VERCEL_ENV: "preview", SITE_LAUNCHED: "true" },
      { VERCEL_ENV: "development", SITE_LAUNCHED: "true" },
      { VERCEL_ENV: "", SITE_LAUNCHED: "true" },
      { VERCEL_ENV: undefined, SITE_LAUNCHED: "true" },
      {},
    ]) {
      expect(isSitePublic(env), JSON.stringify(env)).toBe(false)
    }
  })

  it("tolerates padded environment values", () => {
    expect(isSitePublic({ VERCEL_ENV: " production ", SITE_LAUNCHED: " true " })).toBe(true)
  })

  // A. Preview before launch.
  it("keeps Preview non-indexable with the launch flag off", async () => {
    expect(await rootRobots("preview", "false")).toEqual(NO_INDEX)
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("SITE_LAUNCHED", "false")
    expect(robots().rules).toEqual(BLOCK_ALL)
    expect(robots().sitemap).toBeUndefined()
    expect(sitemap()).toEqual([])
  })

  // B. Preview with the launch flag on: must still never be public.
  it("keeps Preview non-indexable even when the launch flag is on", async () => {
    expect(await rootRobots("preview", "true")).toEqual(NO_INDEX)
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("SITE_LAUNCHED", "true")
    expect(robots().rules).toEqual(BLOCK_ALL)
    expect(robots().sitemap).toBeUndefined()
    expect(sitemap()).toEqual([])
  })

  // C. Normal pre-launch state: Production exists but is not indexable.
  it("keeps Production non-indexable before launch", async () => {
    expect(await rootRobots("production", "false")).toEqual(NO_INDEX)
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SITE_LAUNCHED", "false")
    expect(robots().rules).toEqual(BLOCK_ALL)
    expect(robots().sitemap).toBeUndefined()
    expect(sitemap()).toEqual([])
  })

  // D. Launched: the only indexable combination.
  it("makes Production indexable once the launch flag is set", async () => {
    expect(await rootRobots("production", "true")).toEqual(INDEXABLE)
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SITE_LAUNCHED", "true")
    const rules = robots()
    expect(rules.rules).toEqual(PUBLIC_RULES)
    expect(rules.sitemap).toBe(`${brandSiteUrl}/sitemap.xml`)
    const urls = sitemap().map((entry) => entry.url)
    for (const path of [
      "/",
      "/business-profile-recovery",
      "/review-protection",
      "/relaunch-guard",
      "/resources",
      "/resources/google-business-profile-recovery",
      "/resources/google-business-profile-verification-access",
      "/resources/google-reviews",
      "/resources/google-review-abuse-scams",
    ]) {
      expect(urls.filter((url) => url === `${brandSiteUrl}${path}`), path).toHaveLength(1)
    }
    expect(urls.length).toBeGreaterThan(9)
  })

  it("never advertises a sitemap location while the site is not public", () => {
    for (const [vercelEnv, siteLaunched] of [
      ["preview", "false"],
      ["preview", "true"],
      ["production", "false"],
      ["development", "true"],
      ["", "true"],
    ]) {
      vi.stubEnv("VERCEL_ENV", vercelEnv)
      vi.stubEnv("SITE_LAUNCHED", siteLaunched)
      const label = `${vercelEnv}/${siteLaunched}`
      expect(robots().sitemap, label).toBeUndefined()
      // `Allow: /` must never appear next to the blanket disallow, or a crawler
      // could read it as the less restrictive match.
      expect(robots().rules, label).toEqual(BLOCK_ALL)
      expect(sitemap(), label).toEqual([])
    }
  })
})
