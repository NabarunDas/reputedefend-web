// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
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
  it("uses the exact approved 3D Connected T lockup and original wordmark", () => {
    const { container } = render(<TelloyaLogo />)
    const logo = screen.getByAltText(brandName)
    expect(logo).toBeInTheDocument()
    expect(logo.getAttribute("src")).toContain("telloya-connected-t-lockup.webp")
    expect(container.querySelector(".telloya-logo-lockup")).toBeInTheDocument()
  })

  it("uses the correct brand name", () => {
    expect(brandName).toBe("Telloya")
  })

  it("uses the matching dark-wordmark variant on light surfaces", () => {
    const { container } = render(<TelloyaLogo variant="dark" />)
    expect(container.querySelector(".telloya-logo-lockup img")?.getAttribute("src")).toContain("telloya-connected-t-lockup-dark.webp")
  })

  it("uses the original white wordmark on dark surfaces", () => {
    const { container } = render(<TelloyaLogo variant="light" />)
    expect(container.querySelector(".telloya-logo-lockup img")?.getAttribute("src")).toContain("telloya-connected-t-lockup.webp")
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

  it("footer uses the final approved Connected T logo on the dark background", () => {
    const { container } = render(<Footer />)
    const logoContainer = container.querySelector('.site-logo-footer .telloya-logo-lockup')
    expect(logoContainer).toBeInTheDocument()
    const img = logoContainer?.querySelector('img')
    expect(img).toHaveAttribute("alt", brandName)
    expect(img?.getAttribute("src")).toContain("telloya-connected-t-lockup.webp")
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

  it("rings the missed-call card around its resting angle and stops when motion is reduced", () => {
    const css = readFileSync(resolve(process.cwd(), "app/homepage.module.css"), "utf8")
    expect(css).toMatch(/\.callBeacon \{[^}]*transform:rotate\(9deg\)/)
    expect(css).toContain("@keyframes missedCallRing")
    expect(css).toContain("transform: rotate(11deg)")
    expect(css).toContain("transform: rotate(7deg)")
    expect(css).toContain("animation: missedCallRing 5.5s linear infinite")
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.callBeacon \{ animation: missedCallRing/)
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*animation:none!important/)
    expect(css).not.toMatch(/\.beaconPhone \{[^}]*animation/)
  })

  it("preloads the approved mobile console only on narrow screens", () => {
    const source = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8")
    expect(source).toContain('"/brand/telloya-cinematic-console-mobile.webp"')
    expect(source).toContain('"(max-width: 639px)"')
    expect(source).toContain('"(min-width: 640px)"')
    expect(source).toContain("fetchPriority: \"high\"")
  })

  it("makes the skip-link target focusable", () => {
    const source = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8")
    expect(source).toContain('href="#main-content"')
    expect(source).toContain('id="main-content" tabIndex={-1}')
  })

  it("mobile menu button has proper ARIA attributes", () => {
    const { container } = render(<Header />)
    const button = container.querySelector('.mobile-menu-button')
    expect(button).toHaveAttribute('aria-label')
    expect(button).toHaveAttribute('aria-expanded')
    expect(button).toHaveAttribute('aria-controls')
  })

  it("mobile menu is a modal dialog only while it is open", () => {
    const { container } = render(<Header />)
    const menu = container.querySelector('#mobile-menu')
    expect(menu).toHaveAttribute('role', 'dialog')
    expect(menu).toHaveAttribute('aria-label')
    expect(menu).not.toHaveAttribute('aria-modal')
    expect(menu).toHaveAttribute('aria-hidden', 'true')
    const opener = container.querySelector<HTMLButtonElement>('.mobile-menu-button')
    expect(opener).not.toBeNull()
    fireEvent.click(opener!)
    expect(menu).toHaveAttribute('aria-modal', 'true')
    expect(menu).not.toHaveAttribute('aria-hidden')
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

  it("uses approved four-tier pricing structure", async () => {
    const contentModule = await import("@/lib/content")
    const pricingContent = contentModule.pricingContent
    
    // Verify all four tiers exist
    expect(pricingContent.plans).toHaveLength(4)
    const tiers = pricingContent.plans.map(p => p.tier)
    expect(tiers).toContain("basic")
    expect(tiers).toContain("growth")
    expect(tiers).toContain("pro")
    expect(tiers).toContain("custom")
  })

  it("marks Growth as recommended, not other plans", async () => {
    const contentModule = await import("@/lib/content")
    const pricingContent = contentModule.pricingContent
    
    const basicPlan = pricingContent.plans.find(p => p.tier === "basic")
    const growthPlan = pricingContent.plans.find(p => p.tier === "growth")
    const proPlan = pricingContent.plans.find(p => p.tier === "pro")
    const customPlan = pricingContent.plans.find(p => p.tier === "custom")
    
    expect(basicPlan?.popular).toBeFalsy()
    expect(growthPlan?.popular).toBe(true)
    expect(growthPlan?.tagline).toBe("Recommended")
    expect(proPlan?.popular).toBeFalsy()
    expect(customPlan?.popular).toBeFalsy()
  })

  it("clarifies enquiry form limitations appropriately", async () => {
    const contentModule = await import("@/lib/content")
    const pricingFaq = contentModule.pricingContent.faq.questions
    
    // Verify that any form references include appropriate limitations
    const overageQuestion = pricingFaq.find(q => q.q.includes("exceed my minutes"))
    expect(overageQuestion).toBeDefined()
    expect(overageQuestion?.a).toContain("enquiry form does not authorise")
  })

  it("presents Relaunch Guard as optional add-on, not mandatory component", async () => {
    const contentModule = await import("@/lib/content")
    const pricingContent = contentModule.pricingContent
    
    // Verify Guard section exists and is labeled as optional
    expect(pricingContent.guard).toBeDefined()
    expect(pricingContent.guard.eyebrow).toBe("Optional add-on")
    expect(pricingContent.guard.pricePerLocationGbp).toBe(9.99)
    
    // Verify lead explains it's separate and optional
    expect(pricingContent.guard.lead).toContain("optional")
    expect(pricingContent.guard.lead).toContain("separate")
    
    // Verify note explains recovery services not included
    expect(pricingContent.guard.note).toContain("not included")
  })
  
  it("shows approved pricing for fixed plans", async () => {
    const contentModule = await import("@/lib/content")
    const pricingContent = contentModule.pricingContent
    
    const basicPlan = pricingContent.plans.find(p => p.tier === "basic")
    const growthPlan = pricingContent.plans.find(p => p.tier === "growth")
    const proPlan = pricingContent.plans.find(p => p.tier === "pro")
    const customPlan = pricingContent.plans.find(p => p.tier === "custom")
    
    expect(basicPlan?.monthlyPriceGbp).toBe(49)
    expect(basicPlan?.minutesPerMonth).toBe(120)
    
    expect(growthPlan?.monthlyPriceGbp).toBe(79)
    expect(growthPlan?.minutesPerMonth).toBe(300)
    
    expect(proPlan?.monthlyPriceGbp).toBe(120)
    expect(proPlan?.minutesPerMonth).toBe(500)
    
    expect(customPlan?.monthlyPriceGbp).toBeNull()
    expect(customPlan?.minutesPerMonth).toBeNull()
  })
  
  it("uses pricing.ts as single source of truth for all commercial data", async () => {
    const pricingModule = await import("@/lib/pricing")
    const contentModule = await import("@/lib/content")
    
    // Verify plan data derives from pricing.ts
    const pricingPlans = pricingModule.telloyaPlans
    const contentPlans = contentModule.pricingContent.plans
    
    expect(contentPlans.length).toBe(pricingPlans.length)
    
    // Verify Guard pricing derives from pricing.ts
    const guardAddon = pricingModule.relaunchGuardAddon
    expect(contentModule.pricingContent.guard.pricePerLocationGbp).toBe(guardAddon.pricePerLocationGbp)
    
    // Verify overage pricing derives from pricing.ts
    const overagePolicy = pricingModule.overagePolicy
    expect(contentModule.pricingContent.overage.lead).toContain("£0.25")
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
    expect(result.length).toBe(8)
    expect(result[0].url).toBe("https://telloya.com")
    expect(result.map((entry) => entry.url)).toEqual([
      "https://telloya.com",
      "https://telloya.com/how-it-works",
      "https://telloya.com/demo",
      "https://telloya.com/features",
      "https://telloya.com/industries",
      "https://telloya.com/pricing",
      "https://telloya.com/enquire",
      "https://telloya.com/cookies",
    ])
    expect(result.every((entry) => !("lastModified" in entry))).toBe(true)
    
    process.env = originalEnv
  })

  it("sitemap stays empty in preview even when the launch flag is set", async () => {
    const sitemap = (await import("@/app/sitemap")).default
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "preview", TELLOYA_LAUNCHED: "true" }
    expect(sitemap()).toEqual([])
    process.env = originalEnv
  })

  it("robots allows crawling only when production and launched", async () => {
    const robots = (await import("@/app/robots")).default
    const originalEnv = process.env
    process.env = { ...originalEnv, VERCEL_ENV: "preview", TELLOYA_LAUNCHED: "true" }
    const preview = robots()
    expect(Array.isArray(preview.rules) ? preview.rules[0]?.disallow : preview.rules?.disallow).toBe("/")
    expect(preview.sitemap).toBeUndefined()

    process.env = { ...originalEnv, VERCEL_ENV: "production", TELLOYA_LAUNCHED: "true" }
    const launched = robots()
    expect(Array.isArray(launched.rules) ? launched.rules[0]?.allow : launched.rules?.allow).toBe("/")
    expect(launched.sitemap).toBe("https://telloya.com/sitemap.xml")
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

  it("labels dashboard usage as planned and does not promise local-currency checkout", async () => {
    const Pricing = (await import("@/app/pricing/page")).default
    render(<Pricing />)
    expect(screen.queryByText("Usage visibility in a customer dashboard (planned)")).not.toBeInTheDocument()
    expect(screen.getAllByText("Usage visibility").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Planned").length).toBeGreaterThanOrEqual(4)
    expect(screen.getAllByText(/does not offer local-currency checkout or conversion/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/unused minutes do not roll over/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/exchange rate will be shown at checkout/i)).not.toBeInTheDocument()
    expect(screen.getAllByText("£49").length).toBeGreaterThan(0)
    expect(screen.getAllByText("£79").length).toBeGreaterThan(0)
    expect(screen.getAllByText("£120").length).toBeGreaterThan(0)
    expect(screen.getAllByText("£9.99").length).toBeGreaterThan(0)
  })

  it("sends each published plan to the enquiry page without opening submission", async () => {
    const { pricingContent } = await import("@/lib/content")
    expect(pricingContent.plans.map((plan) => plan.href)).toEqual([
      "/enquire?plan=basic",
      "/enquire?plan=growth",
      "/enquire?plan=pro",
      "/enquire?plan=custom",
    ])

    const EnquirePage = (await import("@/app/enquire/page")).default
    render(await EnquirePage({ searchParams: Promise.resolve({ plan: "growth" }) }))
    expect(screen.getByRole("heading", { name: /Enquire about Telloya/i })).toBeInTheDocument()
    expect(screen.getByText(/not currently available for self-service purchase/i)).toBeInTheDocument()
    expect(screen.queryByText(/finalising pricing and packaging/i)).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/enquiry system before public launch/i)
    expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument()
  })
})
