/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { DEV_CUSTOMER_PORTAL_HREF, PRODUCTION_CUSTOMER_PORTAL_HREF } from "@/lib/customer-portal-href"
import { Header } from "./header"

let pathname = "/"

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}))

vi.mock("next/link", () => ({
  default({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLAnchorElement>
  } & Record<string, unknown>) {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault()
          onClick?.(event)
        }}
        {...props}
      >
        {children}
      </a>
    )
  },
}))

function renderHeader() {
  return render(<Header />)
}

function servicesButton() {
  return screen.getByRole("button", { name: "Services" })
}

function openServices() {
  fireEvent.click(servicesButton())
}

function openMobile() {
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }))
}

function mockMatchMedia() {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener(_type: string, listener: EventListener) {
      listeners.add(listener as (event: MediaQueryListEvent) => void)
    },
    removeEventListener(_type: string, listener: EventListener) {
      listeners.delete(listener as (event: MediaQueryListEvent) => void)
    },
    dispatchEvent() {
      return true
    },
  })
  return {
    crossBreakpoint() {
      listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent))
    },
  }
}

describe("Header navigation", () => {
  let media: ReturnType<typeof mockMatchMedia>

  beforeEach(() => {
    pathname = "/"
    media = mockMatchMedia()
  })

  afterEach(() => {
    cleanup()
  })

  it("opens and closes the desktop Services disclosure with ordinary links", () => {
    renderHeader()
    const trigger = servicesButton()
    const panelId = trigger.getAttribute("aria-controls")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(panelId).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Profile Recovery" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()

    openServices()
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    const panel = document.getElementById(panelId!)
    expect(panel).not.toHaveAttribute("hidden")
    expect(within(panel!).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Profile Recovery", "/business-profile-recovery"],
      ["Review Protection", "/review-protection"],
      ["Relaunch Guard", "/relaunch-guard"],
    ])
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("link", { name: "Relaunch Guard" })).not.toBeInTheDocument()
  })

  it("returns focus to Services when Escape closes the disclosure", () => {
    renderHeader()
    openServices()
    servicesButton().focus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(servicesButton()).toHaveAttribute("aria-expanded", "false")
    expect(servicesButton()).toHaveFocus()
    expect(screen.queryByRole("link", { name: "Profile Recovery" })).not.toBeInTheDocument()
  })

  it("closes on outside interaction without moving focus back to Services", () => {
    render(
      <>
        <Header />
        <button type="button">Outside</button>
      </>,
    )
    openServices()
    screen.getByRole("link", { name: "Profile Recovery" }).focus()
    expect(servicesButton()).not.toHaveFocus()
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }))
    expect(servicesButton()).toHaveAttribute("aria-expanded", "false")
    expect(servicesButton()).not.toHaveFocus()
  })

  it("closes when keyboard focus leaves the disclosure", () => {
    render(
      <>
        <Header />
        <button type="button">Outside</button>
      </>,
    )
    openServices()
    const disclosure = servicesButton().parentElement
    fireEvent.blur(disclosure!, { relatedTarget: screen.getByRole("button", { name: "Outside" }) })
    expect(servicesButton()).toHaveAttribute("aria-expanded", "false")
  })

  it("closes the disclosure when the route changes", () => {
    const view = renderHeader()
    openServices()
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toBeInTheDocument()
    pathname = "/pricing"
    view.rerender(<Header />)
    expect(servicesButton()).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("link", { name: "Relaunch Guard" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("aria-current", "page")
  })

  it("marks the current service page on the matching link, not the Services button", () => {
    pathname = "/relaunch-guard"
    renderHeader()
    const trigger = servicesButton()
    expect(trigger).not.toHaveAttribute("aria-current")
    expect(trigger.className).toContain("nav-link-active")
    openServices()
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Profile Recovery" })).not.toHaveAttribute("aria-current")
  })

  it("shows the mobile service links immediately and closes on selection", () => {
    renderHeader()
    openMobile()
    const mobile = screen.getByRole("navigation", { name: "Mobile" })
    expect(within(mobile).getByText("Services").tagName).toBe("P")
    expect(within(mobile).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Profile Recovery", "/business-profile-recovery"],
      ["Review Protection", "/review-protection"],
      ["Relaunch Guard", "/relaunch-guard"],
      ["How It Works", "/how-it-works"],
      ["Pricing", "/pricing"],
      ["Resources", "/resources"],
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Get Help", "/get-help"],
    ])
    fireEvent.click(within(mobile).getByRole("link", { name: "Relaunch Guard" }))
    expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument()
  })

  it("closes stale desktop and mobile navigation when the viewport crosses 1024px", () => {
    renderHeader()
    openServices()
    openMobile()
    expect(servicesButton()).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("navigation", { name: "Mobile" })).toBeInTheDocument()
    act(() => {
      media.crossBreakpoint()
    })
    expect(servicesButton()).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument()
    expect(servicesButton()).not.toHaveFocus()
    expect(screen.getByRole("button", { name: "Open navigation" })).not.toHaveFocus()
  })

  it("places a ghost Customer login before Get Help and keeps the services menu", () => {
    render(<Header portalHref={DEV_CUSTOMER_PORTAL_HREF} />)
    const login = screen.getByRole("link", { name: "Customer login" })
    const help = screen.getByRole("link", { name: /^Get Help/ })
    expect(login).toHaveAttribute("href", DEV_CUSTOMER_PORTAL_HREF)
    expect(login).toHaveAttribute("rel", "noopener noreferrer")
    expect(login.className).toContain("customer-login")
    expect(login.className).not.toContain("button-primary")
    expect(help.className).toContain("button-primary")
    expect(login.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    login.focus()
    expect(login).toHaveFocus()
    expect(document.querySelector("input, form")).toBeNull()

    openServices()
    expect(screen.getByRole("link", { name: "Profile Recovery" })).toHaveAttribute("href", "/business-profile-recovery")
    expect(screen.getByRole("link", { name: "Review Protection" })).toHaveAttribute("href", "/review-protection")
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toHaveAttribute("href", "/relaunch-guard")
  })

  it("shows Customer login in the mobile menu, separated from marketing links, and closes on selection", () => {
    render(<Header portalHref={PRODUCTION_CUSTOMER_PORTAL_HREF} />)
    openMobile()
    const mobile = screen.getByRole("navigation", { name: "Mobile" })
    const links = within(mobile).getAllByRole("link")
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute("href")])).toEqual([
      ["Profile Recovery", "/business-profile-recovery"],
      ["Review Protection", "/review-protection"],
      ["Relaunch Guard", "/relaunch-guard"],
      ["How It Works", "/how-it-works"],
      ["Pricing", "/pricing"],
      ["Resources", "/resources"],
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Customer login", PRODUCTION_CUSTOMER_PORTAL_HREF],
      ["Get Help", "/get-help"],
    ])
    const login = within(mobile).getByRole("link", { name: "Customer login" })
    expect(login.className).toContain("customer-login")
    expect(login.className).not.toContain("mobile-nav-cta")
    expect(within(mobile).getByRole("link", { name: "Get Help" }).className).toContain("mobile-nav-cta")
    expect(login.previousElementSibling?.tagName).toBe("HR")
    fireEvent.click(login)
    expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument()
  })

  it("omits Customer login when the destination is missing or not an approved portal URL", () => {
    const { rerender } = render(<Header />)
    expect(screen.queryByRole("link", { name: "Customer login" })).not.toBeInTheDocument()
    for (const href of [
      "https://evil.example/portal",
      "https://customer.profilerelaunch.com/login",
      "https://customer.profilerelaunch.com/portal?next=https://evil.example",
      "https://profilerelaunch-customer-git-feature-clientcove.vercel.app/portal",
      "/portal",
    ]) {
      rerender(<Header portalHref={href} />)
      expect(screen.queryByRole("link", { name: "Customer login" })).not.toBeInTheDocument()
    }
  })
})
