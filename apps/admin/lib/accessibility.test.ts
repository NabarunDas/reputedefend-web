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

const providersUsed = (source: string) =>
  Object.keys(h1Providers).filter(name => new RegExp(`<${name}[\\s/>]`).test(source))

/**
 * Whether a page provides its heading, provides more than one, or provides
 * none. A provider counts as a heading, because that is what it renders.
 *
 * Literal `<h1>`s are counted one by one. Providers are counted once per
 * distinct component rather than once per occurrence: several pages return
 * the same `PageHeader` from alternative branches — an empty state and a
 * populated one — and render exactly one of them. Repeating one provider is
 * that pattern. A literal heading beside a provider, or two different
 * providers, is not, and is reported. Reading source cannot prove those are
 * mutually exclusive either, so the check errs towards being told: no page
 * does it today, and one that needs to can be looked at rather than passing
 * in silence.
 */
function pageHeading(source: string): "ok" | "missing" | "duplicate" {
  const headings = literalH1s(source) + providersUsed(source).length
  if (headings === 0) return "missing"
  return headings === 1 ? "ok" : "duplicate"
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

  it("counts a page's headings whether it writes them or delegates them", () => {
    const page = (body: string) => `export default function Page() { return ${body} }`
    const literal = "<h1>Title</h1>"
    const viaPage = "<PageHeader title=\"Title\" />"
    const viaCase = "<CaseHeader c={c} flow={flow} />"

    expect({
      none: pageHeading(page("<p>nothing</p>")),
      // The regression the allowlist exists for: a component nobody has
      // checked is not a heading, however it is named.
      unknownProvider: pageHeading(page("<FooHeader />")),
      otherUnknownProvider: pageHeading(page("<SectionHeader title=\"x\" />")),

      literal: pageHeading(page(literal)),
      pageHeader: pageHeading(page(viaPage)),
      caseHeader: pageHeading(page(viaCase)),
      // Alternative branches of one provider are one heading.
      sameProviderTwice: pageHeading(page(`a ? ${viaPage} : ${viaPage}`)),

      twoLiterals: pageHeading(page(`<>${literal}${literal}</>`)),
      literalAndPageHeader: pageHeading(page(`<>${literal}${viaPage}</>`)),
      literalAndCaseHeader: pageHeading(page(`<>${literal}${viaCase}</>`)),
      twoProviders: pageHeading(page(`<>${viaPage}${viaCase}</>`)),
    }).toEqual({
      none: "missing",
      unknownProvider: "missing",
      otherUnknownProvider: "missing",

      literal: "ok",
      pageHeader: "ok",
      caseHeader: "ok",
      sameProviderTwice: "ok",

      twoLiterals: "duplicate",
      literalAndPageHeader: "duplicate",
      literalAndCaseHeader: "duplicate",
      twoProviders: "duplicate",
    })
  })

  it("labels every visible input, select and textarea", () => {
    // A wrapping <label>, an htmlFor label or an aria-label all count. A
    // hidden input needs none of them.
    const unlabelled: string[] = []
    for (const file of components) {
      const source = read(file)
      for (const match of source.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const tag = match[0]
        if (/type="hidden"/.test(tag) || /aria-label[=}]/.test(tag) || /\bid=(?:"|\{)/.test(tag)) continue
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
    const model = read(new URL("app/admin-nav-model.ts", adminRoot).pathname)
    expect(nav).toMatch(/aria-label="Admin workspace"/)
    expect(nav).toMatch(/aria-current=\{link\.match\(pathname\) \? "page" : undefined\}/)
    expect(nav.match(/aria-current=/g)).toHaveLength(1)
    expect(nav).not.toMatch(/<summary[^>]*aria-current/)
    expect(model).toMatch(/function guardOverview/)
    expect(model).toMatch(/!section\(pathname, "\/guard\/checks"\)/)
    expect(model).toMatch(/!section\(pathname, "\/guard\/alerts"\)/)
    const layout = read(new URL("app/layout.tsx", adminRoot).pathname)
    const shell = read(new URL("app/admin-shell.tsx", adminRoot).pathname)
    expect(layout).toMatch(/className="skip-link" href="#main-content"/)
    expect(shell).toMatch(/id="main-content"/)
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

  it("gives every image alternative text, including an empty alternative for decoration", () => {
    const missing = components
      .flatMap(file => [...read(file).matchAll(/<img\b[^>]*>/g)].map(match => ({ file, tag: match[0] })))
      .filter(entry => !/\balt=/.test(entry.tag))
      .map(entry => `${relative(entry.file)}: ${entry.tag.slice(0, 80)}`)
    expect(missing).toEqual([])
  })

  it("does not put a control earlier in the tab order than the document", () => {
    const positive = components
      .flatMap(file => [...read(file).matchAll(/tabIndex=(?:\{[1-9][^}]*\}|"[1-9][^"]*")/g)].map(match => `${relative(file)}: ${match[0]}`))
    expect(positive).toEqual([])
  })

  it("does not leave a button without an accessible name", () => {
    const empty = components
      .flatMap(file => [...read(file).matchAll(/<button\b([^>]*)>\s*<\/button>/g)].map(match => ({ file, tag: match[0], attrs: match[1] })))
      .filter(entry => !/aria-label=/.test(entry.attrs))
      .map(entry => `${relative(entry.file)}: ${entry.tag.slice(0, 80)}`)
    expect(empty).toEqual([])
  })

  it("says when a link opens in a new tab", () => {
    const silent = components.flatMap(file => {
      const source = read(file)
      return [...source.matchAll(/<a\b[^>]*target="_blank"[^>]*>[\s\S]*?<\/a>/g)]
        .filter(match => !/new tab/i.test(match[0]))
        .map(match => `${relative(file)}: ${match[0].replace(/\s+/g, " ").slice(0, 120)}`)
    })
    expect(silent).toEqual([])
  })

  it("does not use placeholder text as the only label", () => {
    const placeholderOnly: string[] = []
    for (const file of components) {
      const source = read(file)
      for (const match of source.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const tag = match[0]
        if (!/placeholder=/.test(tag) || /type="hidden"/.test(tag) || /aria-label[=}]/.test(tag)) continue
        const before = source.slice(Math.max(0, match.index - 500), match.index)
        const inLabel = /<label[^>]*>[^<]*$/.test(before) || /<label[^>]*>/.test(before.slice(before.lastIndexOf("</label>") + 1))
        if (inLabel) continue
        const id = tag.match(/\bid="([^"]+)"/)?.[1]
        if (id && (source.includes(`htmlFor="${id}"`) || source.includes(`htmlFor={'${id}'}`) || source.includes(`htmlFor={"${id}"}`))) continue
        placeholderOnly.push(`${relative(file)}: ${tag.slice(0, 80)}`)
      }
    }
    expect(placeholderOnly).toEqual([])
  })
})
