/** @vitest-environment jsdom */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { getHelpRoutes } from "./content"
import GetHelpPage from "./page"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("./get-help.module.css", () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

vi.mock("@/components/case-intake-form", () => ({
  CaseIntakeForm({ initialService }: { initialService: string | undefined }) {
    return <form aria-label="assessment">{initialService || "none"}</form>
  },
}))

const pageSource = readFileSync(join(process.cwd(), "app/get-help/page.tsx"), "utf8")

afterEach(() => {
  cleanup()
})

describe("/get-help Google connection", () => {
  it("renders a genuinely disabled Connect Google control without changing the assessment form", async () => {
    render(await GetHelpPage({ searchParams: Promise.resolve({}) }))
    const button = screen.getByRole("button", { name: "Connect Google" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveAttribute("aria-describedby", "get-help-google-connection-note")
    expect(button.closest("a")).toBeNull()
    expect(screen.getByText(getHelpRoutes.future.note)).toHaveAttribute("id", "get-help-google-connection-note")
    expect(screen.getByRole("form", { name: "assessment" })).toHaveTextContent("none")
    expect(pageSource).not.toMatch(/onClick|oauth|window\.location|fetch\(/i)
    expect(pageSource).not.toContain("NEXT_PUBLIC_")
    expect(pageSource).toContain("CaseIntakeForm")
    expect(pageSource).toContain("initialService")
  })

  it("keeps service-query preselection on the assessment form", async () => {
    render(await GetHelpPage({ searchParams: Promise.resolve({ service: "profile-recovery" }) }))
    expect(screen.getByRole("form", { name: "assessment" })).toHaveTextContent("profile-recovery")
  })
})
