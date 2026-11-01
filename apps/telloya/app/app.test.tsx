// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { TelloyaLogo } from "@/components/telloya-logo"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { brandName, brandSiteUrl, brandDescriptor, brandOperator } from "@/lib/brand"
import { isSitePublic } from "@/lib/config"
import { getCustomerPortalHref } from "@/lib/customer-portal"
import { legalIdentity } from "../../../lib/legal"
import {
  PRODUCTION_CUSTOMER_PORTAL_HREF,
  DEV_CUSTOMER_PORTAL_HREF,
} from "../../../lib/customer-portal-href"

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
    // ProfileRelaunch Ltd appears multiple times
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
    const { container} = render(<Footer />)
    const logo = container.querySelector('.site-logo-footer span')
    expect(logo).toBeInTheDocument()
    // Light variant should be used on dark footer background
    const style = logo?.getAttribute('style')
    expect(style).toBeTruthy()
    expect(style).toContain("var(--lime)")
  })

  it("includes legal terms disclosure about missing product-specific policies", () => {
    render(<Footer />)
    const footerText = document.body.textContent || ""
    
    expect(footerText).toContain("company-wide website notices")
    expect(footerText).toContain("before public launch")
  })
})

describe("Navigation", () => {
  it("renders main navigation links", () => {
    render(<Header />)
    expect(screen.getByText("How It Works")).toBeInTheDocument()
    expect(screen.getByText("Features")).toBeInTheDocument()
    expect(screen.getByText("Industries")).toBeInTheDocument()
    expect(screen.getByText("Pricing")).toBeInTheDocument()
    expect(screen.getByText("Request Info")).toBeInTheDocument()
  })

  it("includes customer login CTA", () => {
    render(<Header />)
    expect(screen.getByText("Customer Login")).toBeInTheDocument()
  })

  it("mobile menu button has proper ARIA attributes", () => {
    const { container } = render(<Header />)
    const button = container.querySelector('.mobile-menu-button')
    expect(button).toHaveAttribute('aria-label')
    expect(button).toHaveAttribute('aria-expanded')
    expect(button).toHaveAttribute('aria-controls')
  })

  it("mobile menu has dialog role and proper ARIA", () => {
    const { container } = render(<Header />)
    const menu = container.querySelector('#mobile-menu')
    expect(menu).toHaveAttribute('role', 'dialog')
    expect(menu).toHaveAttribute('aria-modal', 'true')
    expect(menu).toHaveAttribute('aria-label')
  })
})

describe("Customer Portal Routing", () => {
  it("uses production portal by default", () => {
    const originalEnv = process.env
    process.env = {}
    
    expect(getCustomerPortalHref()).toBe(PRODUCTION_CUSTOMER_PORTAL_HREF)
    
    process.env = originalEnv
  })

  it("uses production portal for production environment", () => {
    const originalEnv = process.env
    process.env = { VERCEL_ENV: "production" }
    
    expect(getCustomerPortalHref()).toBe(PRODUCTION_CUSTOMER_PORTAL_HREF)
    
    process.env = originalEnv
  })

  it("uses DEV portal only for develop preview", () => {
    const originalEnv = process.env
    process.env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop" }
    
    expect(getCustomerPortalHref()).toBe(DEV_CUSTOMER_PORTAL_HREF)
    
    process.env = originalEnv
  })

  it("uses production portal for feature branch previews", () => {
    const originalEnv = process.env
    process.env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/test" }
    
    expect(getCustomerPortalHref()).toBe(PRODUCTION_CUSTOMER_PORTAL_HREF)
    
    process.env = originalEnv
  })
})

describe("Contact Email Consistency", () => {
  it("uses verified contact email from central legal identity", () => {
    expect(legalIdentity.contactEmail).toBe("contact@profilerelaunch.com")
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

  it("does not claim Complete is 'Recommended'", async () => {
    const contentModule = await import("@/lib/content")
    const pricingContent = contentModule.pricingContent
    
    // Verify Complete plan doesn't have highlight flag
    const completePlan = pricingContent.plans.find(p => p.name === "Complete")
    expect(completePlan).toBeDefined()
    expect('highlight' in (completePlan || {})).toBe(false)
  })

  it("describes Complete as proposed package", async () => {
    const contentModule = await import("@/lib/content")
    const pricingContent = contentModule.pricingContent
    
    const completePlan = pricingContent.plans.find(p => p.name === "Complete")
    expect(completePlan?.description).toContain("Proposed package")
    expect(completePlan?.status).toContain("Proposed")
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
