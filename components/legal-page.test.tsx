/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { legalIdentity } from "@/lib/legal"
import { LegalPage } from "./legal-page"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

vi.mock("./legal-page.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}))

afterEach(() => {
  cleanup()
})

describe("LegalPage", () => {
  it("uses the shared legal date when updated is not overridden", () => {
    render(
      <LegalPage
        eyebrow="Terms"
        title="Website terms"
        lead="Lead"
        currentPath="/terms"
        sections={[{ id: "about", title: "About", content: <p>Body</p> }]}
      />,
    )
    expect(screen.getByText(`Last updated ${legalIdentity.noticeUpdated}`)).toBeInTheDocument()
    expect(legalIdentity.noticeUpdated).toBe("13 September 2026")
  })
})
