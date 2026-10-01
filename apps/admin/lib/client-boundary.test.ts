/**
 * Step 23 security acceptance: nothing privileged crosses into the browser.
 *
 * The Admin workspace holds the service key, the session cookie and presigned
 * storage URLs. None of those may reach a client component, and no value may
 * be published through a `NEXT_PUBLIC_` variable, which Next.js inlines into
 * the bundle. These checks read the source tree so a future client component
 * that reaches for a server module fails here rather than in a bundle.
 */

import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

const adminRoot = new URL("../", import.meta.url)

function sourceFiles(directory: URL, extensions = [".ts", ".tsx"]): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...sourceFiles(new URL(`${entry.name}/`, directory), extensions))
    else if (extensions.some(extension => entry.name.endsWith(extension)) && !entry.name.includes(".test."))
      found.push(`${directory.pathname}${entry.name}`)
  }
  return found
}

const read = (file: string) => readFileSync(file, "utf8")
const relative = (file: string) => file.replace(new URL(".", adminRoot).pathname, "")

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[^\n"'`]*\/\/.*$/gm, " ")

// A variable only reaches a bundle, or a module, when something reads it, so
// these checks look for a read rather than a mention. The three forms below
// are every way the workspace reaches the environment: dotted access, bracket
// access and destructuring. A catalogue that names a variable without reading
// it — the release environment contract — holds nothing and publishes nothing.
function readsVariable(source: string, name: string): boolean {
  const bare = withoutComments(source)
  return (
    new RegExp(`(?:process\\.env|\\benv)\\s*\\.\\s*${name}\\b`).test(bare) ||
    new RegExp(`(?:process\\.env|\\benv)\\s*\\[\\s*["'\`]${name}`).test(bare) ||
    new RegExp(`\\{[^{}]*\\b${name}\\b[^{}]*\\}\\s*=\\s*(?:process\\.env|\\benv\\b)`).test(bare)
  )
}

const allSources = [...sourceFiles(new URL("app/", adminRoot)), ...sourceFiles(new URL("lib/", adminRoot))]
const clientComponents = allSources.filter(file => /^(?:"use client"|'use client')/.test(read(file).trimStart()))

describe("client boundary", () => {
  it("finds the client components this check is meant to cover", () => {
    expect(clientComponents.length).toBeGreaterThan(10)
  })

  it("keeps server-only modules out of every client component", () => {
    const leaking = clientComponents
      .filter(file => /from "[^"]*(?:auth\/backend|auth\/config|require-staff)"|server-only/.test(read(file)))
      .map(relative)
    expect(leaking).toEqual([])
  })

  it("reads no environment variable from a client component", () => {
    // A client component that reads process.env gets the value inlined at
    // build time, which is how a secret ends up in a JavaScript bundle.
    expect(clientComponents.filter(file => /process\.env/.test(read(file))).map(relative)).toEqual([])
  })

  it("publishes nothing through NEXT_PUBLIC_, anywhere in the workspace", () => {
    expect(allSources.filter(file => readsVariable(read(file), "NEXT_PUBLIC_[A-Z0-9_]*")).map(relative)).toEqual([])
  })

  it("marks every module that holds the service key as server-only", () => {
    // `import "server-only"` makes the mistake a build failure rather than a
    // disclosure, so the modules that can reach Supabase must all carry it.
    const privileged = allSources.filter(
      file => readsVariable(read(file), "SUPABASE_SECRET_KEY") || /createClient\(/.test(read(file)),
    )
    expect(privileged.length).toBeGreaterThan(0)
    expect(privileged.filter(file => !/server-only/.test(read(file))).map(relative)).toEqual([])
  })

  it("still recognises the reads these two checks exist to catch", () => {
    // Keying on a read rather than a mention is only safe while the read forms
    // the workspace actually uses are still recognised, so the real service
    // key reader is asserted here and each form is driven directly.
    const privileged = allSources.filter(file => readsVariable(read(file), "SUPABASE_SECRET_KEY")).map(relative)
    expect(privileged).toContain("lib/auth/config.ts")

    expect(readsVariable(`const a = process.env.SUPABASE_SECRET_KEY`, "SUPABASE_SECRET_KEY")).toBe(true)
    expect(readsVariable(`const a = env["SUPABASE_SECRET_KEY"]`, "SUPABASE_SECRET_KEY")).toBe(true)
    expect(readsVariable(`const { SUPABASE_SECRET_KEY } = process.env`, "SUPABASE_SECRET_KEY")).toBe(true)
    expect(readsVariable(`const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID`, "NEXT_PUBLIC_[A-Z0-9_]*")).toBe(true)
    expect(readsVariable(`{ name: "SUPABASE_SECRET_KEY" }`, "SUPABASE_SECRET_KEY")).toBe(false)
  })
})
