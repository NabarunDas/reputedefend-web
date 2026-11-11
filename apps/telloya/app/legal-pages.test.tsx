/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
import PrivacyPage from "@/app/privacy/page"
import TermsPage from "@/app/terms/page"
import { Footer } from "@/components/footer"
import { demonstrationPrivacyNote, vatStatement, websiteTerms } from "@/lib/legal-notices"
import { telloyaPlans } from "@/lib/pricing"

afterEach(() => cleanup())

describe("Telloya website terms and privacy notice", () => {
  it("keeps website terms distinct from a paid-service agreement", () => {
    render(<TermsPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Website terms" })).toBeInTheDocument()
    expect(screen.getByRole("note")).toHaveTextContent(/Draft for legal review/)
    expect(screen.getByText(vatStatement)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "privacy notice" })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: "cookie notice" })).toHaveAttribute("href", "/cookies")
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/does not confirm a demonstration appointment/)
    expect(text).toMatch(/Governing law, jurisdiction, liability and service credits are not set out/)
    expect(text).not.toMatch(/VAT-exempt|courts of|liability cap/i)
    expect(websiteTerms.sections.some((section) => section.id === "paid-service")).toBe(true)
  })

  it("states the verified demonstration position without an absolute deletion or training promise", () => {
    render(<PrivacyPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Personalised demonstration calls" })).toBeInTheDocument()
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/live telephone conversation with an AI receptionist/)
    expect(text).toMatch(/processed temporarily so the AI can respond/)
    expect(text).toMatch(/normal call history does not keep the full call audio or a full transcript/)
    expect(text).toMatch(/Basic operational call metadata may still be kept/)
    expect(text).toMatch(/No agent-level or account-level webhook destination is configured/)
    expect(text).toMatch(/does not currently provide a persisted structured enquiry summary/)
    expect(text).toMatch(/does not authorise the content of a demonstration call for AI training/)
    expect(text).toMatch(/does not guarantee that the voice provider excludes caller content from training/)
    expect(text).toMatch(/future paid subscription/)
    expect(text).toMatch(/Destructive deletion is switched off/)
    expect(text).toMatch(/no scheduled job runs the function/)
    expect(text).toMatch(/Automatic deletion after 90 days is not operating/)
    expect(text).toMatch(/uses Retell as the voice provider/)
    expect(text).toMatch(/does not state a processing country/)
    expect(text).toMatch(/does not describe a completed international-transfer arrangement/)
    expect(text).toMatch(/Supabase/)
    expect(text).toMatch(/Resend/)
    expect(text).toMatch(/Vercel/)
    expect(text).toMatch(/Cloudflare Stream/)
    expect(text).toMatch(/not a completed legal assessment/)
    expect(screen.getByRole("link", { name: "profilerelaunch.com/privacy" })).toHaveAttribute("href", "https://profilerelaunch.com/privacy")
    expect(text).not.toMatch(/has not been verified|completely unverified|10 minutes|no data is ever|we do not record|recordings are not kept|this notice confirms that calls are not recorded|will not be used for training|UK Addendum is the only/i)
  })

  it("links the footer to the Telloya notices and keeps the company privacy notice", () => {
    render(<Footer />)
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
    expect(screen.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies")
    expect(screen.getByRole("link", { name: "Main Website" })).toHaveAttribute("href", "https://profilerelaunch.com")
  })

  it("does not add VAT to the approved plan prices", () => {
    expect(telloyaPlans.map((plan) => plan.monthlyPriceGbp)).toEqual([49, 79, 120, null])
    expect(vatStatement).toBe("ProfileRelaunch Ltd is not currently registered for VAT. VAT is not charged on the published prices.")
    expect(vatStatement).not.toMatch(/VAT-exempt|can never/i)
  })

  it("keeps the demo privacy sentence to one link and avoids an unverified-recording disclaimer", () => {
    expect(demonstrationPrivacyNote).toBe("How that demonstration call is handled is explained in the privacy notice.")
    expect(demonstrationPrivacyNote).not.toMatch(/has not been verified|completely unverified|no persistent audio|we do not record|not used for model training|10 minutes/i)
  })
})
