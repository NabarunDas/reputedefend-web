/**
 * The operator SQL runbook, held to what the README promises about it.
 *
 * These scripts are pasted into the Supabase SQL Editor by a person during a
 * cutover, so a psql meta-command would make a script that reads as runnable
 * fail at the point of use, and a statement that changes the database would
 * turn an inspection into an edit. Both are cheap to assert and expensive to
 * discover live.
 */

import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const directory = fileURLToPath(new URL("../../../../docs/admin/operator-sql/", import.meta.url))
const scripts = readdirSync(directory)
  .filter(name => name.endsWith(".sql"))
  .map(name => ({ name, source: readFileSync(`${directory}${name}`, "utf8") }))

/** The script with its commentary removed, so only SQL is left. */
function uncommented(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ")
}

/** Statements, with commentary and string literals removed. */
function executable(source: string): string {
  return uncommented(source).replace(/'(?:[^']|'')*'/g, "''")
}

describe("operator SQL", () => {
  it("covers the scripts this check is meant to cover", () => {
    expect(scripts.map(script => script.name)).toContain("legacy-object-inspection.sql")
  })

  it("uses no psql meta-command, so it runs in a plain SQL console", () => {
    const offenders = scripts
      .filter(script => script.source.split("\n").some(line => /^\s*\\/.test(line)))
      .map(script => script.name)
    expect(offenders).toEqual([])
  })

  it("executes nothing that changes the database", () => {
    const changes = /\b(?:create|alter|drop|delete|insert|update|truncate|grant|revoke|execute|do|call|refresh|vacuum|reindex|comment\s+on)\b/i
    const offenders = scripts
      .filter(script => changes.test(executable(script.source)))
      .map(script => script.name)
    expect(offenders).toEqual([])
  })

  it("never uses CASCADE, not even in a statement it only prints", () => {
    // Commentary is free to explain why CASCADE is refused, so this looks at
    // the SQL, which includes the string the removal section generates.
    const offenders = scripts
      .filter(script => /\bcascade\b/i.test(uncommented(script.source)))
      .map(script => script.name)
    expect(offenders).toEqual([])
  })

  it("keeps the generated removal statement inside a string it returns", () => {
    // Section 5 is allowed to return `DROP FUNCTION …` as text. The check
    // above proves it is text, because stripping string literals leaves no
    // DROP behind; this proves the text is still actually generated.
    const inspection = scripts.find(script => script.name === "legacy-object-inspection.sql")
    expect(inspection?.source).toContain("DROP FUNCTION")
    expect(executable(inspection?.source ?? "")).not.toMatch(/\bdrop\b/i)
  })

  it("labels every section with a portable select", () => {
    const inspection = scripts.find(script => script.name === "legacy-object-inspection.sql")?.source ?? ""
    const labels = [...inspection.matchAll(/select\s+'([^']+)'\s+as\s+inspection_section;/g)].map(match => match[1])
    expect(labels).toHaveLength(5)
    expect(labels.every(label => /^\d\. /.test(label))).toBe(true)
  })

  it("is not referenced by any application, build or deploy path", () => {
    const packageJson = readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")
    expect(packageJson).not.toContain("operator-sql")
    const adminPackageJson = readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    expect(adminPackageJson).not.toContain("operator-sql")
  })
})
