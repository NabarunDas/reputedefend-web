// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const nav = vi.hoisted(() => ({ pathname: "/" }))

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-body" }),
  Manrope: () => ({ variable: "--font-display" }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/image", () => ({
  default: ({ alt, src, className }: { alt: string; src: string; className?: string }) => (
    <img alt={alt} src={src} className={className} />
  ),
}))

import RootLayout, { metadata } from "./layout"

afterEach(() => {
  cleanup()
  nav.pathname = "/"
})

describe("customer layout", () => {
  it("uses the approved logo, essential footer links, and no tracking", () => {
    const { container } = render(<RootLayout><p>Secure page</p></RootLayout>)
    const homes = screen.getAllByRole("link", { name: "ProfileRelaunch home" })
    const home = homes.find(link => link.getAttribute("href") === "https://profilerelaunch.com")
    expect(home).toBeTruthy()
    expect(home).not.toHaveAttribute("target")
    expect(home?.querySelector("img")).toHaveAttribute("src", "/brand/profile-relaunch-logo.png")
    const back = screen.getByRole("link", { name: "Back to ProfileRelaunch" })
    expect(back).toHaveAttribute("href", "https://profilerelaunch.com")
    expect(back).not.toHaveAttribute("target")

    const footer = screen.getByRole("navigation", { name: "ProfileRelaunch" })
    expect([...footer.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual([
      "https://profilerelaunch.com/",
      "https://profilerelaunch.com/contact",
      "https://profilerelaunch.com/privacy",
      "https://profilerelaunch.com/terms",
    ])
    expect(document.body.textContent).toContain("Restore visibility. Protect your reputation.")
    expect(document.body.textContent).toMatch(/© \d{4} ProfileRelaunch\./)
    expect(document.body.textContent).toContain("ProfileRelaunch is independent of Google.")
    expect(document.querySelector(".customer-footer img")).toHaveAttribute("src", "/brand/profile-relaunch-logo-light.png")
    expect(container.textContent).not.toMatch(/Cookie Settings|Get Help|Admin/)
    expect(container.innerHTML).not.toMatch(/googletagmanager|google-analytics|gtag\(|GTM-/)
    expect(container.querySelector("script")).toBeNull()
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content")
    expect(container.querySelector("main")).toHaveClass("customer-main")
    expect(container.querySelector("header.brand")).toBeNull()
  })

  it("replaces the marketing return link with quiet portal context", () => {
    nav.pathname = "/portal"
    render(<RootLayout><p>Portal</p></RootLayout>)
    expect(screen.queryByRole("link", { name: "Back to ProfileRelaunch" })).toBeNull()
    expect(screen.getByText("Secure customer area").tagName).toBe("P")
    expect(screen.getAllByRole("link", { name: "ProfileRelaunch home" }).some(link => link.getAttribute("href") === "https://profilerelaunch.com")).toBe(true)
  })

  it("keeps the customer app out of search indexes and off marketing metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false, noarchive: true })
    expect(metadata.referrer).toBe("no-referrer")
    expect(metadata.title).toEqual({ default: "ProfileRelaunch", template: "%s | ProfileRelaunch" })
    expect(metadata.openGraph).toBeUndefined()
    expect(JSON.stringify(metadata.icons)).toContain("/icon.png")
    expect(JSON.stringify(metadata.icons)).toContain("/apple-icon.png")
    const source = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8")
    expect(source).toContain('from "next/font/google"')
    expect(source).toContain("Inter")
    expect(source).toContain("Manrope")
    expect(source).toContain('variable: "--font-body"')
    expect(source).toContain('variable: "--font-display"')
    expect(source).toContain("bodyFont.variable")
    expect(source).toContain("displayFont.variable")
    expect(source).not.toMatch(/analytics|googletagmanager|gtag|openGraph/i)
  })
})
