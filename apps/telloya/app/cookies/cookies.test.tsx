/** @vitest-environment jsdom */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import CookiesPage from "./page"
import { cookiesAnalytics, cookiesChoice, cookiesNecessary, cookiesOperator, operatorPrivacyHref } from "./content"

afterEach(() => cleanup())

describe("Telloya cookies page", () => {
  it("explains necessary storage, optional analytics and withdrawal without inventing voice retention", () => {
    render(<CookiesPage />)
    expect(screen.getByRole("heading", { name: "Cookies and analytics" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: cookiesNecessary.title })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: cookiesAnalytics.title })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: cookiesChoice.title })).toBeInTheDocument()
    expect(screen.getByText(/telloya:analytics-consent:v1/)).toBeInTheDocument()
    expect(screen.getByText(/separately from any analytics choice you make on the ProfileRelaunch website/)).toBeInTheDocument()
    expect(screen.getByText(/Advertising consent stays denied/)).toBeInTheDocument()
    const operatorLink = screen.getByRole("link", { name: operatorPrivacyHref })
    expect(operatorLink).toHaveAttribute("href", operatorPrivacyHref)
    expect(screen.getByText(cookiesOperator.paragraphs[0])).toBeInTheDocument()
    const text = document.body.textContent ?? ""
    expect(text).not.toMatch(/\b\d+\s+(day|days|month|months|year|years)\b/i)
    expect(text).not.toMatch(/retained for|retention period|call recordings are stored/i)
    expect(text).toMatch(/will be published before public launch/)
  })

  it("lets the cookie cards shrink and wrap the privacy URL", () => {
    const css = readFileSync(resolve(process.cwd(), "app/cookies/cookies.module.css"), "utf8")
    expect(css).toMatch(/\.section \{[^}]*min-width:\s*0;/)
    expect(css).toMatch(/\.section a \{[^}]*overflow-wrap:\s*anywhere;/)
    expect(css).not.toMatch(/overflow-x:\s*hidden/)
    render(<CookiesPage />)
    expect(screen.getByRole("link", { name: operatorPrivacyHref })).toHaveAttribute("href", operatorPrivacyHref)
  })
})
