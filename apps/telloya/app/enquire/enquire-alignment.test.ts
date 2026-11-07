import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("enquiry next-step alignment", () => {
  const css = readFileSync(resolve(process.cwd(), "app/enquire/enquire.module.css"), "utf8")
  const listItem = css.match(/\.process li \{[^}]*\}/)?.[0] ?? ""
  const paragraph = css.match(/\.process li p \{[^}]*\}/)?.[0] ?? ""

  it("shares the first-line baseline without shifting the description", () => {
    expect(listItem).toContain("display: grid")
    expect(listItem).toContain("grid-template-columns: 40px minmax(0, 1fr)")
    expect(listItem).toContain("column-gap: 16px")
    expect(listItem).toContain("align-items: baseline")
    expect(listItem).toContain("line-height: 1.58")
    expect(paragraph).toContain("padding-top: 0")
    expect(paragraph).toContain("line-height: 1.58")
    expect(css).not.toMatch(/\.process[\s\S]{0,400}margin(?:-top)?:\s*-/)
  })
})
