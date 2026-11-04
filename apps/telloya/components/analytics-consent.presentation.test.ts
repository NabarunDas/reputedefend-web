import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Telloya consent presentation", () => {
  it("keeps Accept and Reject the same size on desktop and stacks them on small screens", () => {
    const css = readFileSync(resolve(process.cwd(), "components/analytics-consent.module.css"), "utf8")
    const sharedButtons = css.slice(css.indexOf(".accept,"), css.indexOf(".accept:focus-visible"))
    expect(sharedButtons).toContain(".reject,")
    expect(sharedButtons).toContain(".settings")
    expect(sharedButtons).toContain("min-height: 44px")
    expect(sharedButtons).toContain("min-width: 172px")
    expect(css).toContain(".accept,\n.reject {\n  width: 172px;\n}")
    const mobile = css.slice(css.indexOf("@media (max-width: 767px)"))
    expect(mobile).toContain(".accept,")
    expect(mobile).toContain(".reject,")
    expect(mobile).toContain("width: 100%")
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")

    const cookies = readFileSync(resolve(process.cwd(), "app/cookies/cookies.module.css"), "utf8")
    expect(cookies).toContain("@media (max-width: 767px)")
    expect(cookies).toContain("clamp(")
  })
})