import { describe, expect, it } from "vitest"
import { csvEscape, exportFilename, neutralizeCsvCell, toCsv } from "./csv"

describe("CSV formula neutralization", () => {
  it("prefixes formula-leading text and leaves numeric cells alone", () => {
    expect(neutralizeCsvCell("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")")
    expect(neutralizeCsvCell("+SUM(1,1)")).toBe("'+SUM(1,1)")
    expect(neutralizeCsvCell("-1+2")).toBe("'-1+2")
    expect(neutralizeCsvCell("@cmd")).toBe("'@cmd")
    expect(neutralizeCsvCell("  =cmd")).toBe("'  =cmd")
    expect(neutralizeCsvCell("\t=payload")).toBe("'\t=payload")
    expect(neutralizeCsvCell("\r=payload")).toBe("'\r=payload")
    expect(neutralizeCsvCell("\n=payload")).toBe("'\n=payload")
    expect(neutralizeCsvCell("-1200", true)).toBe("-1200")
    expect(neutralizeCsvCell("plain")).toBe("plain")
  })

  it("escapes commas, quotes, multiline values and Unicode", () => {
    expect(csvEscape("a,b")).toBe("\"a,b\"")
    expect(csvEscape("say \"hi\"")).toBe("\"say \"\"hi\"\"\"")
    expect(csvEscape("line1\nline2")).toBe("\"line1\nline2\"")
    expect(csvEscape("café")).toBe("café")
    expect(csvEscape("")).toBe("")
    expect(csvEscape(null)).toBe("")
    const long = "x".repeat(4000)
    expect(csvEscape(long)).toBe(long)
  })

  it("builds a complete CSV and a safe filename", () => {
    const csv = toCsv(["id", "label", "amountMinor"], [["1", "=HYPERLINK(1)", 100], ["2", "ok,value", null]], [2])
    expect(csv).toContain("'=HYPERLINK(1)")
    expect(csv).toContain("\"ok,value\"")
    expect(csv.endsWith("\r\n")).toBe(true)
    expect(exportFilename("overdue_work", new Date("2026-03-29T12:00:00Z"))).toBe("admin-overdue_work-2026-03-29.csv")
    expect(exportFilename("../secret", new Date("2026-03-29T12:00:00Z"))).toBe("admin-secret-2026-03-29.csv")
  })
})
