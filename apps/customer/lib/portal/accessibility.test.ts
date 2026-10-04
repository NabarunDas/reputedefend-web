import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const customerRoot = new URL("../..", import.meta.url)

function files(directory: URL, match: (name: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const next = new URL(`${entry.name}/`, directory)
    if (entry.isDirectory()) found.push(...files(next, match))
    else if (match(entry.name)) found.push(`${directory.pathname}${entry.name}`)
  }
  return found
}

const sources = [
  ...files(new URL("app/portal/", customerRoot), name => name.endsWith(".tsx") && !name.includes(".test.")),
  ...files(new URL("app/login/", customerRoot), name => name.endsWith(".tsx") && !name.includes(".test.")),
  new URL("app/layout.tsx", customerRoot).pathname,
  new URL("components/customer-header.tsx", customerRoot).pathname,
  new URL("components/customer-footer.tsx", customerRoot).pathname,
]

function relative(file: string) {
  return file.replace(customerRoot.pathname, "")
}

describe("customer portal accessibility invariants", () => {
  it("sets the language, skip link, and a named portal navigation", () => {
    const layout = readFileSync(new URL("app/layout.tsx", customerRoot), "utf8")
    expect(layout).toContain('lang="en-GB"')
    expect(layout).toContain('className="skip-link" href="#main-content"')
    expect(layout).toContain('id="main-content"')
    const nav = readFileSync(new URL("app/portal/portal-nav.tsx", customerRoot), "utf8")
    expect(nav).toContain('aria-label="Customer portal"')
    expect(nav).toContain('aria-current": "page"')
    expect(nav).not.toMatch(/tabIndex=\{?[1-9]/)
  })

  it("gives images alternative text and does not leave an empty control", () => {
    const missingAlt = sources.flatMap(file => {
      const source = readFileSync(file, "utf8")
      return [...source.matchAll(/<(?:img|Image)\b[^>]*>/g)]
        .filter(match => !/\balt=/.test(match[0]))
        .map(match => `${relative(file)}: ${match[0].slice(0, 80)}`)
    })
    expect(missingAlt).toEqual([])
    const emptyButtons = sources.flatMap(file => {
      const source = readFileSync(file, "utf8")
      return [...source.matchAll(/<button\b([^>]*)>\s*<\/button>/g)]
        .filter(match => !/aria-label=/.test(match[1]))
        .map(match => `${relative(file)}: ${match[0].slice(0, 80)}`)
    })
    expect(emptyButtons).toEqual([])
    const positive = sources.flatMap(file => [...readFileSync(file, "utf8").matchAll(/tabIndex=(?:\{[1-9][^}]*\}|"[1-9][^"]*")/g)].map(match => `${relative(file)}: ${match[0]}`))
    expect(positive).toEqual([])
  })

  it("labels visible fields and does not use a placeholder as the only label", () => {
    const unlabelled: string[] = []
    for (const file of sources) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const tag = match[0]
        if (/type="hidden"/.test(tag) || /aria-label[=}]/.test(tag)) continue
        const id = tag.match(/\bid=\{?["']?([^"'}]+)/)?.[1]
        const before = source.slice(Math.max(0, (match.index ?? 0) - 500), match.index)
        const wrapped = /<label[^>]*>[^<]*$/.test(before) || /<label[^>]*>/.test(before.slice(before.lastIndexOf("</label>") + 1))
        const referenced = id ? source.includes(`htmlFor={${id}}`) || source.includes(`htmlFor="${id}"`) || source.includes(`htmlFor={'${id}'}`) : false
        if (!wrapped && !referenced) unlabelled.push(`${relative(file)}: ${tag.slice(0, 80)}`)
        if (/placeholder=/.test(tag) && !wrapped && !referenced && !/aria-label[=}]/.test(tag)) {
          unlabelled.push(`${relative(file)} placeholder: ${tag.slice(0, 80)}`)
        }
      }
    }
    expect(unlabelled).toEqual([])
  })

  it("uses an alert for a failed action and does not mark static copy as live", () => {
    const login = readFileSync(new URL("app/login/login-client.tsx", customerRoot), "utf8")
    expect(login).toContain('role="alert"')
    expect(login).toContain('role="status"')
    const staticLive = sources.flatMap(file => {
      const source = readFileSync(file, "utf8")
      if (file.endsWith("login-client.tsx")) return []
      return [...source.matchAll(/<(p|div|span)\b[^>]*role="status"[^>]*>/g)]
        .filter(match => !/error|notice|status|message/i.test(source.slice(Math.max(0, (match.index ?? 0) - 80), (match.index ?? 0) + match[0].length)))
        .map(match => `${relative(file)}: ${match[0]}`)
    })
    expect(staticLive).toEqual([])
  })
})
