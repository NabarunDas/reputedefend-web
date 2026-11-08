import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("footer text-enlargement layout", () => {
  it("keeps four columns only when the footer container is wide enough", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
    const footer = css.slice(css.indexOf("/* Footer */"), css.indexOf("/* Hero Section */"))

    expect(footer).toContain("container-name: telloya-footer")
    expect(footer).toContain("container-type: inline-size")
    expect(footer).toContain("@container telloya-footer (min-width: 34rem)")
    expect(footer).toContain("grid-template-columns: 1fr 1fr")
    expect(footer).toContain("grid-template-columns: 1.5fr 1fr 1fr 1fr")
    expect(footer).not.toMatch(/overflow(?:-x)?\s*:\s*(?:hidden|clip)/)
  })
})
