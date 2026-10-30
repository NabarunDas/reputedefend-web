// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const nav = vi.hoisted(() => ({ pathname: "/" }))
const headerPath = vi.hoisted(() => ({ value: "" }))

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-body" }),
  Manrope: () => ({ variable: "--font-display" }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => name === "x-customer-pathname" ? headerPath.value : null }),
  cookies: async () => ({ get: () => undefined }),
}))

vi.mock("next/image", () => ({
  default: ({ alt, src, className }: { alt: string; src: string; className?: string }) => (
    // Test double only. The app uses next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} className={className} />
  ),
}))

import { CustomerHeader } from "@/components/customer-header"
import RootLayout, { metadata } from "./layout"

afterEach(() => {
  cleanup()
  nav.pathname = "/"
  headerPath.value = ""
})

describe("customer layout", () => {
  it("uses the approved logo, essential footer links, and no tracking", async () => {
    const { container } = render(await RootLayout({ children: <p>Secure page</p> }))
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

  it("replaces the marketing return link with the customer's name on portal pages only", async () => {
    nav.pathname = "/portal"
    headerPath.value = "/portal"
    render(await RootLayout({ children: <p>Portal</p> }))
    expect(screen.queryByRole("link", { name: "Back to ProfileRelaunch" })).toBeNull()
    expect(screen.getByText("My account").tagName).toBe("P")
    expect(screen.getAllByRole("link", { name: "ProfileRelaunch home" }).some(link => link.getAttribute("href") === "https://profilerelaunch.com")).toBe(true)
    cleanup()

    nav.pathname = "/portal/documents"
    render(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.getByText("Aarshav Das")).toHaveAttribute("title", "Aarshav Das")
    expect(screen.queryByText("Harbour Bakery")).toBeNull()
    cleanup()

    nav.pathname = "/"
    const { container } = render(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.getByRole("link", { name: "Back to ProfileRelaunch" })).toBeTruthy()
    expect(container.textContent).not.toContain("Aarshav Das")
    expect(container.textContent).not.toContain("My account")
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

  it("optimises both logos in the browser and leaves remote images unconfigured", () => {
    const header = readFileSync(join(process.cwd(), "components/customer-header.tsx"), "utf8")
    const footer = readFileSync(join(process.cwd(), "components/customer-footer.tsx"), "utf8")
    const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8")
    expect(header).not.toContain("unoptimized")
    expect(footer).not.toContain("unoptimized")
    expect(header).toContain('sizes="(max-width: 767px) 160px, 208px"')
    expect(footer).toContain('sizes="180px"')
    expect(header).toContain("width={logoSize.width}")
    expect(header).toContain("height={logoSize.height}")
    expect(footer).toContain("width={logoSize.width}")
    expect(footer).toContain("height={logoSize.height}")
    expect(config).not.toMatch(/remotePatterns|images\.domains/)
  })
})
