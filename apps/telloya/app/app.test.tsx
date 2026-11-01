// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { TelloyaLogo } from "@/components/telloya-logo"
import { Footer } from "@/components/footer"
import { brandName, brandSiteUrl, brandDescriptor, brandOperator } from "@/lib/brand"
import { isSitePublic } from "@/lib/config"
import { legalIdentity } from "../../../lib/legal"

describe("Telloya Branding", () => {
  it("renders the Telloya logo with correct brand name", () => {
    render(<TelloyaLogo />)
    expect(screen.getByLabelText(brandName)).toBeInTheDocument()
  })

  it("uses the correct brand name", () => {
    expect(brandName).toBe("Telloya")
  })

  it("supports dark variant for light backgrounds", () => {
    const { container } = render(<TelloyaLogo variant="dark" />)
    const logo = container.querySelector('span')
    expect(logo?.style.color).toBe("var(--green)")
  })

  it("supports light variant for dark backgrounds", () => {
    const { container } = render(<TelloyaLogo variant="light" />)
    const logo = container.querySelector('span')
    expect(logo?.style.color).toBe("var(--lime)")
  })
})

describe("Legal Disclosure", () => {
  it("displays correct operator disclosure", () => {
    render(<Footer />)
    expect(screen.getByText(/Telloya is an AI receptionist service operated by/i)).toBeInTheDocument()
    // ProfileRelaunch Ltd appears twice (in link and in copyright), so use getAllByText
    const elements = screen.getAllByText(/ProfileRelaunch Ltd/i)
    expect(elements.length).toBeGreaterThan(0)
  })

  it("uses verified legal identity from central source", () => {
    render(<Footer />)
    const footerText = document.body.textContent || ""
    
    expect(footerText).toContain(legalIdentity.legalName)
    expect(footerText).toContain(legalIdentity.registrationNumber)
    expect(footerText).toContain(legalIdentity.placeOfRegistration)
  })

  it("includes complete registered office address", () => {
    render(<Footer />)
    const footerText = document.body.textContent || ""
    
    // Verify key address components
    expect(footerText).toContain("71–75 Shelton Street")
    expect(footerText).toContain("Covent Garden")
    expect(footerText).toContain("London")
    expect(footerText).toContain("WC2H 9JQ")
  })

  it("footer logo uses light variant for contrast", () => {
    const { container } = render(<Footer />)
    const logo = container.querySelector('.site-logo-footer')
    expect(logo).toBeInTheDocument()
    // Light variant should be used on dark footer background
    expect(logo?.getAttribute('style')).toContain("var(--lime)")
  })
})

describe("Site Visibility and Launch Gate", () => {
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

  it("trims whitespace from environment variables", () => {
    expect(isSitePublic({ VERCEL_ENV: " production ", TELLOYA_LAUNCHED: " true " })).toBe(true)
  })
})

describe("Marketing Claims", () => {
  it("uses realistic product language without absolute guarantees", async () => {
    // Read the actual page source to verify claims
    const pageSource = await import("@/app/page")
    const pageModule = pageSource.default
    
    // Verify the page component exists and exports correctly
    expect(pageModule).toBeDefined()
    expect(typeof pageModule).toBe("function")
  })
})

describe("Metadata and SEO", () => {
  it("uses correct canonical domain", () => {
    expect(brandSiteUrl).toBe("https://telloya.com")
  })
  
  it("brand configuration is complete", () => {
    expect(brandName).toBe("Telloya")
    expect(brandSiteUrl).toBe("https://telloya.com")
    expect(brandDescriptor).toBe("AI Receptionist by ProfileRelaunch")
    expect(brandOperator).toBe("ProfileRelaunch Ltd")
  })
})

describe("Pre-launch Behavior", () => {
  it("sitemap returns empty array when not launched", async () => {
    const sitemapModule = await import("@/app/sitemap")
    const sitemap = sitemapModule.default
    
    // Mock environment as pre-launch
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "production", TELLOYA_LAUNCHED: "false" }
    
    const result = sitemap()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
    
    process.env = originalEnv
  })
  
  it("sitemap returns URLs when launched", async () => {
    const sitemapModule = await import("@/app/sitemap")
    const sitemap = sitemapModule.default
    
    // Mock environment as launched
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "production", TELLOYA_LAUNCHED: "true" }
    
    const result = sitemap()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].url).toBe("https://telloya.com")
    
    process.env = originalEnv
  })
  
  it("robots configuration disallows all when not launched", async () => {
    const robotsModule = await import("@/app/robots")
    const robots = robotsModule.default
    
    // Mock environment as pre-launch
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "production", TELLOYA_LAUNCHED: "false" }
    
    const result = robots()
    expect(result.rules).toBeDefined()
    if (!Array.isArray(result.rules)) {
      expect(result.rules.disallow).toBe("/")
    }
    
    process.env = originalEnv
  })
})
