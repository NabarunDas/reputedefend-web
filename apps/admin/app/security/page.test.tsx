// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "a".repeat(64) }) }),
}))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/auth/backend", () => ({
  tokenHash: (token: string) => `hash:${token}`,
  backend: () => ({ rpc }),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import SecurityPage from "./page"
import { requireStaff } from "@/lib/require-staff"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => rpc.mockReset())

describe("Security route", () => {
  it("preserves session review without showing the admin email", async () => {
    rpc.mockResolvedValue([
      { id: "current", createdAt: "2026-09-17T10:00:00Z", lastSeenAt: "2026-09-17T10:20:00Z", expiresAt: "2026-09-17T22:00:00Z", current: true },
      { id: "other", createdAt: "2026-09-16T09:00:00Z", lastSeenAt: "2026-09-16T09:10:00Z", expiresAt: "2026-09-16T21:00:00Z", current: false },
    ])
    render(await SecurityPage())
    expect(requireStaff).toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Security" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "ProfileRelaunch Administrator" })).toBeTruthy()
    expect(screen.getByText("This session")).toBeTruthy()
    expect(screen.getByText("Another session")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sign out all devices" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /End session signed in/ })).toBeTruthy()
    expect(document.body.textContent).not.toContain("admin@profilerelaunch.com")
    expect(rpc).toHaveBeenCalledWith("admin_list_sessions_v1", { p_token: `hash:${"a".repeat(64)}` })
  })
})
