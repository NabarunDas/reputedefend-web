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

describe("workspace accessibility invariants", () => {
  it("finds the pages and components these checks cover", () => {
    expect(pages.length).toBeGreaterThan(30)
    expect(components.length).toBeGreaterThan(pages.length)
  })

  it("gives every page exactly one top-level heading", () => {
    // Pages use the shared PageHeader, which renders the single h1. A page
    // that writes its own h1 is fine; a page with neither is not.
    const headless = pages.filter(file => !/<h1|<PageHeader/.test(read(file))).map(relative)
    expect(headless).toEqual([])
    const doubled = pages.filter(file => (read(file).match(/<h1/g) ?? []).length > 1).map(relative)
    expect(doubled).toEqual([])
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
