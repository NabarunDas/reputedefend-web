// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import AdminError from "./error"
import NotFound from "./not-found"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => cleanup())

describe("Admin failure pages", () => {
  it("tells the operator what to do without repeating the error back", () => {
    // The boundary deliberately ignores the error it is given. A thrown
    // database message or a Next.js digest rendered here would put internal
    // detail, and sometimes a parameter value, on the screen and in the DOM.
    const reset = vi.fn()
    render(<AdminError reset={reset} />)
    expect(screen.getByRole("heading", { name: "We couldn’t load this page" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/digest|stack|sql|pg_|supabase|rpc/i)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("answers an unknown or guessed address with a way back rather than a dead end", () => {
    render(<NotFound />)
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Go to Today" }).getAttribute("href")).toBe("/")
  })
})
