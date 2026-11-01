// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { TelloyaLogo } from "@/components/telloya-logo"
import { brandName } from "@/lib/brand"
import { isSitePublic } from "@/lib/config"

describe("Telloya Branding", () => {
  it("renders the Telloya logo with correct brand name", () => {
    render(<TelloyaLogo />)
    expect(screen.getByLabelText(brandName)).toBeInTheDocument()
  })

  it("uses the correct brand name", () => {
    expect(brandName).toBe("Telloya")
  })
})

describe("Site Visibility", () => {
  it("is not public without TELLOYA_LAUNCHED=true", () => {
    expect(isSitePublic({ VERCEL_ENV: "production" })).toBe(false)
    expect(isSitePublic({ VERCEL_ENV: "production", TELLOYA_LAUNCHED: "false" })).toBe(false)
    expect(isSitePublic({})).toBe(false)
  })

  it("is not public in preview environments even with TELLOYA_LAUNCHED=true", () => {
    expect(isSitePublic({ VERCEL_ENV: "preview", TELLOYA_LAUNCHED: "true" })).toBe(false)
    expect(isSitePublic({ VERCEL_ENV: "development", TELLOYA_LAUNCHED: "true" })).toBe(false)
  })

  it("is public only when production and explicitly launched", () => {
    expect(isSitePublic({ VERCEL_ENV: "production", TELLOYA_LAUNCHED: "true" })).toBe(true)
  })
})
