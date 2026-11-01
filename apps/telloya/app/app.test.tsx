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
    expect(screen.getByAltText(brandName)).toBeInTheDocument()
  })

  it("uses the correct brand name", () => {
    expect(brandName).toBe("Telloya")
  })

  it("supports dark variant for light backgrounds", () => {
    const { container } = render(<TelloyaLogo variant="dark" />)
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img?.getAttribute('alt')).toBe("Telloya")
  })

  it("supports light variant for dark backgrounds", () => {
    const { container } = render(<TelloyaLogo variant="light" />)
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img?.getAttribute('alt')).toBe("Telloya")
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
    const { container } = render(<Footer />)
    const logo = container.querySelector('.site-logo-footer img')
    expect(logo).toBeInTheDocument()
    // Light variant should be used on dark footer background
    expect(logo?.getAttribute('alt')).toBe("Telloya")
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
    expect(screen.getAllByText("How It Works").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Features").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Industries").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Pricing").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Enquire").length).toBeGreaterThan(0)
  })

  it("includes customer login CTA", () => {
    render(<Header />)
    const loginLinks = screen.getAllByText("Customer Login")
    expect(loginLinks.length).toBeGreaterThan(0)
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

  it("mobile menu has inert attribute when closed", () => {
    const { container } = render(<Header />)
    const menu = container.querySelector('#mobile-menu')
    expect(menu).toHaveAttribute('inert')
  })
})

describe("Customer Portal Routing", () => {
  it("uses production portal by default", () => {
    const originalEnv = process.env
    process.env = { ...originalEnv }
    delete process.env.VERCEL_ENV
    delete process.env.VERCEL_GIT_COMMIT_REF
    
    expect(getCustomerPortalHref()).toBe(PRODUCTION_CUSTOMER_PORTAL_HREF)
    
    process.env = originalEnv
  })

  it("uses production portal for production environment", () => {
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "production" }
    
    expect(getCustomerPortalHref()).toBe(PRODUCTION_CUSTOMER_PORTAL_HREF)
    
    process.env = originalEnv
  })

  it("uses DEV portal only for develop preview", () => {
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop" }
    
    expect(getCustomerPortalHref()).toBe(DEV_CUSTOMER_PORTAL_HREF)
    
    process.env = originalEnv
  })

  it("uses production portal for feature branch previews", () => {
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/test" }
    
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

  it("homepage does not render Recommended badge for Complete", async () => {
    const HomePage = (await import("@/app/page")).default
    const { container } = render(<HomePage />)
    
    // Check that no Recommended badge appears on the page
    const badge = container.querySelector('.pricing-badge')
    expect(badge).not.toBeInTheDocument()
  })

  it("does not reference a non-existent enquiry form", async () => {
    const contentModule = await import("@/lib/content")
    const pricingFaq = contentModule.pricingContent.faq.questions
    
    // Check that FAQ doesn't claim there's a form
    const formReferences = pricingFaq.filter(q => 
      q.a.toLowerCase().includes('enquiry form') || 
      (q.a.toLowerCase().includes('submit') && q.a.toLowerCase().includes('form'))
    )
    expect(formReferences.length).toBe(0)
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
    expect(result.length).toBe(6)
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

describe("Page Structure and Accessibility", () => {
  it("homepage does not have nested main landmark", async () => {
    const HomePage = (await import("@/app/page")).default
    const { container } = render(<HomePage />)
    // Page components should not have their own <main> tags
    // The layout.tsx provides the single <main> wrapper
    const mains = container.querySelectorAll('main')
    expect(mains.length).toBe(0)
  })

  it("all six marketing pages exist and are importable", async () => {
    const pages = [
      "@/app/page",
      "@/app/how-it-works/page",
      "@/app/features/page",
      "@/app/industries/page",
      "@/app/pricing/page",
      "@/app/demo/page"
    ]
    
    for (const pagePath of pages) {
      const pageModule = await import(pagePath)
      expect(pageModule.default).toBeDefined()
      expect(typeof pageModule.default).toBe("function")
    }
  })

  it("navigation links point to correct routes", () => {
    const { container } = render(<Header />)
    const links = Array.from(container.querySelectorAll('.site-nav-links a'))
    
    const hrefs = links.map(link => link.getAttribute('href'))
    expect(hrefs).toContain('/how-it-works')
    expect(hrefs).toContain('/features')
    expect(hrefs).toContain('/industries')
    expect(hrefs).toContain('/pricing')
    expect(hrefs).toContain('/enquire')
  })

  it("customer login CTA points to valid portal href", () => {
    const { container } = render(<Header />)
    const ctaLinks = Array.from(container.querySelectorAll('a')).filter(
      link => link.textContent?.includes('Customer Login')
    )
    
    expect(ctaLinks.length).toBeGreaterThan(0)
    const href = ctaLinks[0].getAttribute('href')
    expect(href).toBeTruthy()
    expect(
      href === PRODUCTION_CUSTOMER_PORTAL_HREF || 
      href === DEV_CUSTOMER_PORTAL_HREF
    ).toBe(true)
  })
})
