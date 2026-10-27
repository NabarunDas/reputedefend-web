import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { openSync } from "fontkit"
import { billingLogo } from "./logo"

describe("customer billing assets", () => {
  it("installs fontkit in the customer workspace and opens a static face", () => {
    const manifest = new URL("../../../package.json", import.meta.url)
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { dependencies?: Record<string, string> }
    expect(pkg.dependencies?.fontkit).toMatch(/^\^?\d+\.\d+\.\d+/)
    const resolved = createRequire(manifest).resolve("fontkit")
    expect(resolved).toContain("fontkit")
    const face = openSync(fileURLToPath(new URL("../../../../../lib/billing/fonts/NotoSans-Regular.ttf", import.meta.url))) as { glyphForCodePoint: (code: number) => { id: number } }
    expect(face.glyphForCodePoint(0x41).id).not.toBe(0)
  })

  it("reads the brand logo from its static file and traces only the billing assets", () => {
    const logo = billingLogo()
    expect(Buffer.from(logo.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a")
    const config = readFileSync(new URL("../../../next.config.mjs", import.meta.url), "utf8")
    expect(config).toContain("outputFileTracingIncludes")
    for (const asset of [
      "NotoSans-Regular.ttf",
      "NotoSans-Bold.ttf",
      "NotoSansBengali-Regular.ttf",
      "NotoSansDevanagari-Regular.ttf",
      "NotoNaskhArabic-Regular.ttf",
      "NotoSansSC-VF.ttf",
      "./public/brand/profile-relaunch-logo.png",
    ]) {
      expect(config).toContain(asset)
    }
  })
})
