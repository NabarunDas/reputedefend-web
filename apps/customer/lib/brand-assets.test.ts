import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const repoRoot = new URL("../../../", import.meta.url)

const pairs = [
  ["public/brand/profile-relaunch-logo.png", "apps/customer/public/brand/profile-relaunch-logo.png"],
  ["public/brand/profile-relaunch-logo-light.png", "apps/customer/public/brand/profile-relaunch-logo-light.png"],
  ["public/icon.png", "apps/customer/public/icon.png"],
  ["public/apple-icon.png", "apps/customer/public/apple-icon.png"],
] as const

describe("approved brand asset parity", () => {
  for (const [source, copy] of pairs) {
    it(`${copy} matches the marketing file byte for byte`, () => {
      const approved = readFileSync(new URL(source, repoRoot))
      const customer = readFileSync(new URL(copy, repoRoot))
      expect(customer.equals(approved)).toBe(true)
      expect(customer.byteLength).toBeGreaterThan(1000)
    })
  }
})

describe("customer brand tokens", () => {
  it("keeps the approved palette and does not use Arial as the primary font", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8")
    for (const token of [
      "--ink: #10261F",
      "--muted: #5D6D66",
      "--paper: #F7F8F3",
      "--surface: #FFFFFF",
      "--line: #DFE5DC",
      "--green: #0A6E3C",
      "--green-dark: #085330",
      "--accent: #009838",
      "--lime: #C5E8B4",
      "--warm: #F0E8DA",
      "--danger: #8B1E1E",
      "--radius-sm: 12px",
      "--radius-md: 18px",
      "--radius-lg: 24px",
      "--radius-pill: 999px",
      "--font-body",
      "--font-display",
    ]) {
      expect(css).toContain(token)
    }
    expect(css).not.toMatch(/font-family:\s*Arial\s*,/)
    expect(css).not.toMatch(/max-width:\s*40rem/)
    expect(css).toContain("prefers-reduced-motion")
  })
})
