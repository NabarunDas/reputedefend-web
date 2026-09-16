import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { brandName, brandSiteUrl } from "@/lib/brand"
import { formattedFromAddress } from "@/lib/enquiry-config"
import { customerAcknowledgementSubject, enquiryEmailSubject } from "@/lib/enquiry-email"
import { legalIdentity } from "@/lib/legal"
import { pricingGroups, pricingLabel } from "@/lib/pricing"
import { informationNav, primaryNav, serviceNav, sitemapPaths } from "@/lib/site-nav"
import { homepageFaqs } from "@/lib/homepage-content"
import { recoveryFaqs } from "@/app/business-profile-recovery/content"
import { privacyAnalytics, privacyNoUpload } from "@/app/privacy/content"
import { termsPricing } from "@/app/terms/content"

const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8")
const customerCopy = JSON.stringify({
  homepageFaqs,
  recoveryFaqs,
  privacyAnalytics,
  termsPricing,
  legalIdentity: {
    tradingName: legalIdentity.tradingName,
    legalName: legalIdentity.legalName,
    siteUrl: legalIdentity.siteUrl,
  },
})

describe("launch readiness", () => {
  it("keeps customer-visible display brand on ProfileRelaunch", () => {
    expect(brandName).toBe("ProfileRelaunch")
    expect(customerCopy).not.toContain("ReputeDefend")
    expect(formattedFromAddress("enquiries@reputedefend.com")).toBe("ProfileRelaunch <enquiries@reputedefend.com>")
    expect(enquiryEmailSubject({
      fullName: "Alex",
      email: "alex@example.com",
      businessName: "Harbour Bakery",
      country: "",
      phone: "",
      service: "profile-recovery",
      subject: "",
      websiteUrl: "",
      businessProfileUrl: "",
      reviewUrl: "",
      details: "Case",
      informationAccurate: true,
      privacyAccepted: true,
      source: "get-help",
    })).toBe("[ProfileRelaunch] New Profile Recovery case — Harbour Bakery")
    expect(customerAcknowledgementSubject()).toMatch(/^\[ProfileRelaunch\] /)
  })

  it("uses the HTTPS apex canonical and keeps cookies in the sitemap", () => {
    expect(brandSiteUrl).toBe("https://profilerelaunch.com")
    expect(legalIdentity.siteUrl).toBe("https://profilerelaunch.com")
    expect(sitemapPaths).toEqual([
      "/",
      "/business-profile-recovery",
      "/review-protection",
      "/relaunch-guard",
      "/how-it-works",
      "/pricing",
      "/about",
      "/resources",
      "/contact",
      "/get-help",
      "/privacy",
      "/cookies",
      "/terms",
      "/disclaimer",
    ])
    expect(serviceNav.map((item) => item.label)).toEqual([
      "Profile Recovery",
      "Review Protection",
      "Relaunch Guard",
    ])
    expect(serviceNav.map((item) => item.href)).toEqual([
      "/business-profile-recovery",
      "/review-protection",
      "/relaunch-guard",
    ])
    expect(primaryNav.map((item) => item.label)).toEqual([
      "How It Works",
      "Pricing",
      "About",
    ])
    expect(informationNav.map((item) => item.label)).toContain("Cookies")
    expect(primaryNav.map((item) => item.href)).not.toContain("/cookies")
    expect(primaryNav.map((item) => item.href)).not.toContain("/relaunch-guard")
  })

  it("locks current published prices and does not commit a fake GA id", () => {
    expect(pricingLabel).toBe("Pricing")
    const prices = pricingGroups.flatMap((group) => group.items.map((item) => item.price))
    expect(prices).toEqual(["£99", "£299", "£59", "£149", "£9.99"])
    expect(termsPricing.items.join(" ")).toContain("£99")
    expect(termsPricing.items.join(" ")).toContain("£9.99")
    expect(envExample).not.toMatch(/G-TEST|G-[A-Z0-9]{6,}/)
    expect(envExample).not.toMatch(/GOOGLE_SITE_VERIFICATION=\S/)
    expect(privacyNoUpload.toLowerCase()).toContain("does not currently provide file")
  })

  it("publishes the ProfileRelaunch public contact mailbox without changing enquiry From example", () => {
    expect(legalIdentity.contactEmail).toBe("contact@profilerelaunch.com")
    expect(envExample).toContain("enquiries@reputedefend.com")
    expect(envExample).not.toContain("contact@profilerelaunch.com")
    expect(envExample).not.toContain("ENQUIRY_SEND_CUSTOMER_ACK=true")
  })
})
