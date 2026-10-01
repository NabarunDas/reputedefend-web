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
    expect(allSources.filter(file => /NEXT_PUBLIC_/.test(read(file))).map(relative)).toEqual([])
  })

  it("marks every module that holds the service key as server-only", () => {
    // `import "server-only"` makes the mistake a build failure rather than a
    // disclosure, so the modules that can reach Supabase must all carry it.
    const privileged = allSources.filter(file => /SUPABASE_SECRET_KEY|createClient\(/.test(read(file)))
    expect(privileged.length).toBeGreaterThan(0)
    expect(privileged.filter(file => !/server-only/.test(read(file))).map(relative)).toEqual([])
  })
})
