// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../layout"
import { AccountUnavailable, AccountView } from "./account-view"
import type { CustomerAccount } from "@/lib/portal/account/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/account" }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => router }))

const account: CustomerAccount = {
  name: "Alex Customer",
  email: "alex@example.com",
  phone: "+447700900111",
  emailVerified: true,
  phoneVerified: false,
}

afterEach(() => {
  cleanup()
  nav.pathname = "/portal/account"
})

describe("account page", () => {
  it("shows the signed-in customer's contact details and a keyboard sign-out control", () => {
    render(<PortalLayout><AccountView account={account} /></PortalLayout>)
    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeTruthy()
    expect(screen.getByText("Alex Customer")).toBeTruthy()
    expect(screen.getByText("alex@example.com")).toBeTruthy()
    expect(screen.getByText("Verified")).toBeTruthy()
    expect(screen.getByText("+447700900111")).toBeTruthy()
    expect(screen.getByText("Not verified")).toBeTruthy()
    expect(screen.getByText(/contact ProfileRelaunch/)).toBeTruthy()
    expect(screen.getByText(/This page cannot change those details/)).toBeTruthy()
    const buttons = screen.getAllByRole("button", { name: "Sign out" })
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(button.tagName).toBe("BUTTON")
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page")
    expect(document.querySelector("input, textarea, select")).toBeNull()
    expect(document.body.textContent).not.toMatch(/customer id|auth user|record version|portal actor|verification row/i)
  })

  it("omits phone when the customer has none", () => {
    render(<AccountView account={{ ...account, phone: null, phoneVerified: false }} />)
    expect(screen.queryByText("Phone")).toBeNull()
    expect(screen.queryByText("Phone verification")).toBeNull()
    expect(screen.getByText("Verified")).toBeTruthy()
  })

  it("shows a load failure without inventing an empty profile", () => {
    render(<AccountUnavailable />)
    expect(screen.getByRole("heading", { name: "We couldn't load your account" })).toBeTruthy()
    expect(screen.queryByText("Alex Customer")).toBeNull()
  })
})
