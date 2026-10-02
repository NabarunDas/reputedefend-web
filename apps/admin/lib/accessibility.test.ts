/**
 * Step 23 accessibility acceptance: the invariants that hold across the whole
 * workspace rather than inside one component.
 *
 * The component tests check behaviour page by page. These check the shape of
 * the tree, so a page added without a heading, an input added without a label
 * or a form added without a live region fails here instead of being found by
 * someone using a screen reader.
 */

import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

const adminRoot = new URL("../", import.meta.url)
const read = (file: string) => readFileSync(file, "utf8")
const relative = (file: string) => file.replace(new URL(".", adminRoot).pathname, "")

function files(directory: URL, match: (name: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...files(new URL(`${entry.name}/`, directory), match))
    else if (match(entry.name)) found.push(`${directory.pathname}${entry.name}`)
  }
  return found
}

const pages = files(new URL("app/", adminRoot), name => name === "page.tsx")
const components = files(new URL("app/", adminRoot), name => name.endsWith(".tsx") && !name.includes(".test."))

/**
 * The components a page may delegate its single `<h1>` to, and the file each
 * one lives in. This is a closed list rather than a naming convention: a
 * component called `EmptyHeader` would satisfy a convention while rendering
 * no heading at all, so an unlisted component counts for nothing however it
 * is named. The list is itself checked against the source below, so adding a
 * name here is not enough either — the component has to render the heading.
 */
const h1Providers: Record<string, string> = {
  PageHeader: "app/ui.tsx",
  CaseHeader: "app/cases/[id]/cockpit/header.tsx",
}

const literalH1s = (source: string) => (source.match(/<h1/g) ?? []).length

const delegatesH1 = (source: string) =>
  Object.keys(h1Providers).some(name => new RegExp(`<${name}[\\s/>]`).test(source))

/**
 * Whether a page provides its heading, writes two of them, or provides none.
 *
 * Only a literal `<h1>` is counted for duplication. Several pages return a
 * `PageHeader` from more than one branch — an empty state and a populated
 * one, say — and render exactly one of them.
 */
function pageHeading(source: string): "ok" | "missing" | "duplicate" {
  if (literalH1s(source) > 1) return "duplicate"
  return literalH1s(source) === 1 || delegatesH1(source) ? "ok" : "missing"
}

describe("workspace accessibility invariants", () => {
  it("finds the pages and components these checks cover", () => {
    expect(pages.length).toBeGreaterThan(30)
    expect(components.length).toBeGreaterThan(pages.length)
  })

  it("gives every page exactly one top-level heading", () => {
    const headless = pages.filter(file => pageHeading(read(file)) === "missing").map(relative)
    expect(headless).toEqual([])
    const doubled = pages.filter(file => pageHeading(read(file)) === "duplicate").map(relative)
    expect(doubled).toEqual([])
  })

  it("accepts a heading only from a component that renders one", () => {
    // Guards the allowlist rather than the pages: a listed component that
    // stops rendering its h1, or starts rendering two, fails here.
    const headings = Object.fromEntries(Object.entries(h1Providers).map(([name, file]) => {
      const source = read(new URL(file, adminRoot).pathname)
      return [name, new RegExp(`function ${name}\\b`).test(source) ? literalH1s(source) : "not declared there"]
    }))
    expect(headings).toEqual(Object.fromEntries(Object.keys(h1Providers).map(name => [name, 1])))
  })

  it("does not treat an unknown header component as a heading", () => {
    // The regression the allowlist exists for: a page whose only heading-ish
    // element is a component nobody has checked has no heading.
    expect(pageHeading("export default function Page() { return <FooHeader /> }")).toBe("missing")
    expect(pageHeading("export default function Page() { return <SectionHeader title=\"x\" /> }")).toBe("missing")
    expect(pageHeading("export default function Page() { return <p>nothing</p> }")).toBe("missing")
    expect(pageHeading("export default function Page() { return <PageHeader title=\"x\" /> }")).toBe("ok")
    expect(pageHeading("export default function Page() { return <CaseHeader c={c} flow={flow} /> }")).toBe("ok")
    expect(pageHeading("export default function Page() { return <h1>Title</h1> }")).toBe("ok")
    expect(pageHeading("export default function Page() { return <><h1>One</h1><h1>Two</h1></> }")).toBe("duplicate")
  })

  it("labels every visible input, select and textarea", () => {
    // A wrapping <label>, an htmlFor label or an aria-label all count. A
    // hidden input needs none of them.
    const unlabelled: string[] = []
    for (const file of components) {
      const source = read(file)
      for (const match of source.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const tag = match[0]
        if (/type="hidden"/.test(tag) || /aria-label[=}]/.test(tag) || /\bid="/.test(tag)) continue
        const before = source.slice(Math.max(0, match.index - 400), match.index)
        if (/<label[^>]*>[^<]*$|<label[^>]*>\s*$/.test(before)) continue
        if (/<label[^>]*>/.test(before.slice(before.lastIndexOf("</label>") + 1))) continue
        unlabelled.push(`${relative(file)}: ${tag.slice(0, 60)}`)
      }
    }
    expect(unlabelled).toEqual([])
  })

  it("gives every client form a live region for its outcome", () => {
    // Without one, a refusal is visible to a sighted operator and silent to
    // everyone else. A search form navigates rather than reporting an outcome
    // in place, so it has nothing to announce.
    const silent = components
      .filter(file => /^(?:"use client"|'use client')/.test(read(file).trimStart()))
      .filter(file => [...read(file).matchAll(/<form\b[^>]*>/g)].some(match => !/role="search"/.test(match[0])))
      .filter(file => !/role="status"/.test(read(file)))
      .map(relative)
    expect(silent).toEqual([])
  })

  it("marks the current page in the navigation landmark", () => {
    const nav = read(new URL("app/admin-nav.tsx", adminRoot).pathname)
    expect(nav).toMatch(/aria-label="Admin workspace"/)
    expect(nav).toMatch(/aria-current=\{item\.match\(pathname\) \? "page" : undefined\}/)
  })

  it("keeps every scrollable table reachable from the keyboard", () => {
    // A region that scrolls but cannot be focused is unreachable without a
    // mouse, so each one is a labelled region with a tab stop.
    const unreachable = components
      .flatMap(file => [...read(file).matchAll(/<div className="table-scroll"[^>]*>/g)].map(match => ({ file, tag: match[0] })))
      .filter(entry => !/tabIndex=\{0\}/.test(entry.tag) || !/aria-label=/.test(entry.tag))
      .map(entry => `${relative(entry.file)}: ${entry.tag.slice(0, 70)}`)
    expect(unreachable).toEqual([])
  })
})
