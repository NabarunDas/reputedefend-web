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

  it("displays the privacy revision date once and does not use the shared legal date", () => {
    render(<PrivacyPage />)
    const dates = screen.getAllByText(/^Last updated /)
    expect(dates).toHaveLength(1)
    expect(dates[0]).toHaveTextContent(`Last updated ${privacyUpdated}`)
    expect(screen.queryByText(`Last updated ${legalIdentity.noticeUpdated}`)).not.toBeInTheDocument()
    expect(screen.queryByText(`Privacy notice updated: ${privacyUpdated}`)).not.toBeInTheDocument()
    expect(legalIdentity.noticeUpdated).toBe("13 September 2026")
    expect(privacyUpdated).toBe("16 September 2026")
    expect(privacyUpdated).not.toBe(legalIdentity.noticeUpdated)
    expect(
      screen.getByText(
        "We keep enquiry, case-submission and monitoring-setup information, including related activity and communication records, only for as long as needed to handle your request, provide agreed support and meet applicable legal obligations. The period depends on the type of record and why we need it.",
      ),
    ).toBeInTheDocument()
  })

  it("keeps contact links working", () => {
    render(<PrivacyPage />)
    const contactLinks = screen.getAllByRole("link", { name: "Contact" })
    expect(contactLinks.length).toBeGreaterThan(0)
    expect(contactLinks.every((link) => link.getAttribute("href") === "/contact")).toBe(true)
  })
})
