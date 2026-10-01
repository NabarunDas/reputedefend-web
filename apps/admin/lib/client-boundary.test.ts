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
import { readsVariable, unsupportedEnvironmentAccess } from "./release/source-scan"

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

// A variable only reaches a bundle, or a module, when something reads it, so
// these checks look for a read rather than a mention: a catalogue that names a
// variable without reading it holds nothing and publishes nothing. Recognising
// reads is only safe while every way of reaching the environment is a
// recognised read, which `lib/release/source-scan.ts` enforces and this file
// re-asserts over the Admin tree below.

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

  it("still finds the service key read this check exists to catch", () => {
    // Keying on a read rather than a mention is only safe while the real
    // reader is still found. The read forms themselves are driven directly in
    // `lib/release/source-scan.test.ts`.
    const privileged = allSources.filter(file => readsVariable(read(file), "SUPABASE_SECRET_KEY")).map(relative)
    expect(privileged).toContain("lib/auth/config.ts")
    expect(readsVariable(`{ name: "SUPABASE_SECRET_KEY" }`, "SUPABASE_SECRET_KEY")).toBe(false)
  })

  it("reaches the environment only through forms these checks can see", () => {
    // Fail closed: an alias of the whole environment object, or any syntax the
    // scanner does not understand, would hide reads from the two checks above.
    const offenders = allSources
      .map(file => ({ file: relative(file), unsupported: unsupportedEnvironmentAccess(read(file)) }))
      .filter(entry => entry.unsupported.length > 0)
    expect(offenders).toEqual([])
  })
})
