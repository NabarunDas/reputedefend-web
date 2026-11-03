// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ProductSwitch } from "./product-switch"
import type { ProductSwitchChoice } from "@/lib/portal/products/switch"

const nav = vi.hoisted(() => ({ pathname: "/portal/recovery" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))

const open: ProductSwitchChoice[] = [
  { key: "recovery", name: "Recovery & Review Support", kind: "open", href: "/portal/recovery", note: null },
  { key: "guard", name: "Relaunch Guard", kind: "open", href: "/portal/guard", note: null },
  { key: "telloya", name: "Telloya", kind: "pending", note: "There is no Telloya workspace to open yet." },
]

afterEach(() => {
  cleanup()
  nav.pathname = "/portal/recovery"
})

describe("Switch product", () => {
  it("marks the current workspace and does not offer a Telloya dashboard", () => {
    render(<ProductSwitch initial={open} />)
    fireEvent.click(screen.getByRole("button", { name: "Switch product" }))
    const recovery = screen.getByRole("menuitem", { name: "Recovery & Review Support" })
    expect(recovery).toHaveAttribute("href", "/portal/recovery")
    expect(recovery).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("menuitem", { name: "Relaunch Guard" })).toHaveAttribute("href", "/portal/guard")
    expect(screen.getByRole("menuitem", { name: "Relaunch Guard" })).not.toHaveAttribute("aria-current")
    expect(screen.getByText("There is no Telloya workspace to open yet.")).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: "Telloya" })).toBeNull()
    expect(document.body.innerHTML).not.toContain("/portal/telloya")
    expect(screen.getByRole("menuitem", { name: "My Products" })).toHaveAttribute("href", "/portal/products")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menu", { name: "Products" })).toBeNull()
    expect(screen.getByRole("button", { name: "Switch product" })).toHaveFocus()
  })

  it("offers contact actions when a dashboard is not available", () => {
    nav.pathname = "/portal/guard"
    const choices: ProductSwitchChoice[] = [
      { key: "recovery", name: "Recovery & Review Support", kind: "contact", action: { label: "Start an assessment", href: "https://profilerelaunch.com/get-help" }, note: null },
      { key: "guard", name: "Relaunch Guard", kind: "contact", action: { label: "Enquire about Relaunch Guard", href: "https://profilerelaunch.com/get-help" }, note: null },
      { key: "telloya", name: "Telloya", kind: "contact", action: { label: "Email us about Telloya", href: "mailto:contact@profilerelaunch.com" }, note: "Telloya is not open in your portal yet." },
    ]
    render(<ProductSwitch initial={choices} />)
    fireEvent.click(screen.getByRole("button", { name: "Switch product" }))
    expect(screen.queryByRole("link", { name: "Open dashboard" })).toBeNull()
    expect(screen.getByRole("menuitem", { name: "Start an assessment" })).toHaveAttribute("href", "https://profilerelaunch.com/get-help")
    expect(screen.getByRole("menuitem", { name: "Enquire about Relaunch Guard" })).toHaveAttribute("href", "https://profilerelaunch.com/get-help")
    expect(screen.getByRole("menuitem", { name: "Email us about Telloya" })).toHaveAttribute("href", "mailto:contact@profilerelaunch.com")
    const guardRow = screen.getByText("Relaunch Guard").closest("li")
    expect(guardRow).toHaveAttribute("aria-current", "true")
  })

  it("keeps an unconfirmed read from being described as inactive", () => {
    render(<ProductSwitch initial={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Switch product" }))
    expect(screen.getByText("We couldn't confirm your services just now.")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "My Products" })).toHaveAttribute("href", "/portal/products")
    expect(screen.queryByText("Not subscribed")).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "Telloya" })).toBeNull()
  })

  it("moves focus with the arrow keys and closes on Escape", () => {
    render(<ProductSwitch initial={open} />)
    const button = screen.getByRole("button", { name: "Switch product" })
    fireEvent.click(button)
    const recovery = screen.getByRole("menuitem", { name: "Recovery & Review Support" })
    expect(recovery).toHaveFocus()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(screen.getByRole("menuitem", { name: "Relaunch Guard" })).toHaveFocus()
    fireEvent.keyDown(document, { key: "End" })
    expect(screen.getByRole("menuitem", { name: "My Products" })).toHaveFocus()
    fireEvent.keyDown(document, { key: "Home" })
    expect(recovery).toHaveFocus()
  })
})
