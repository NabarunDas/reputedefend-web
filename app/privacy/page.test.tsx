/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { legalIdentity } from "@/lib/legal"
import { privacyMarketing, privacyMonitoringFields, privacyUpdated } from "./content"
import PrivacyPage from "./page"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("@/components/legal-page.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}))

afterEach(() => {
  cleanup()
})

describe("/privacy page", () => {
  it("renders monitoring fields, Supabase storage and the service-versus-marketing distinction", () => {
    render(<PrivacyPage />)

    expect(screen.getByText(`Privacy notice updated: ${privacyUpdated}`)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Relaunch Guard setup" })).toBeInTheDocument()
    expect(
      screen.getByText("When online monitoring setup is available, the form asks for:"),
    ).toBeInTheDocument()
    const setupHeading = screen.getByRole("heading", { name: "Relaunch Guard setup" })
    const setupList = setupHeading.nextElementSibling?.nextElementSibling
    expect([...setupList?.querySelectorAll("li") ?? []].map((item) => item.textContent)).toEqual([
      ...privacyMonitoringFields,
    ])
    expect(screen.getByText("Monitoring setup records: Supabase")).toBeInTheDocument()
    expect(
      screen.getByText(/we store setup requests and related customer, business and location details in Supabase/i),
    ).toBeInTheDocument()
    expect(screen.getByText(privacyMarketing)).toBeInTheDocument()
    expect(privacyMarketing).toContain("service communications")
    expect(privacyMarketing).toContain("do not subscribe you to marketing emails")
    expect(privacyMarketing).not.toMatch(/newsletter signup is available/i)
    expect(screen.getByText("Enquiry email delivery: Resend")).toBeInTheDocument()
    expect(
      screen.getByText("Optional website analytics: Google Analytics 4, only if configured and accepted"),
    ).toBeInTheDocument()
  })

  it("keeps contact links working and does not change the shared legal notice date", () => {
    render(<PrivacyPage />)
    const contactLinks = screen.getAllByRole("link", { name: "Contact" })
    expect(contactLinks.length).toBeGreaterThan(0)
    expect(contactLinks.every((link) => link.getAttribute("href") === "/contact")).toBe(true)
    expect(legalIdentity.noticeUpdated).toBe("13 September 2026")
    expect(privacyUpdated).toBe("16 September 2026")
    expect(privacyUpdated).not.toBe(legalIdentity.noticeUpdated)
    expect(screen.getByText(`Last updated ${legalIdentity.noticeUpdated}`)).toBeInTheDocument()
  })
})
