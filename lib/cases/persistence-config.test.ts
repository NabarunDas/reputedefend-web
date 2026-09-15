import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { isCasePersistenceEnabled } from "@/lib/cases/persistence-config"

describe("isCasePersistenceEnabled", () => {
  it("defaults to false when unset", () => {
    expect(isCasePersistenceEnabled({})).toBe(false)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: undefined })).toBe(false)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "" })).toBe(false)
  })

  it("enables only the exact value true", () => {
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "true" })).toBe(true)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: " true " })).toBe(true)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "TRUE" })).toBe(false)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "1" })).toBe(false)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "yes" })).toBe(false)
    expect(isCasePersistenceEnabled({ CASE_PERSISTENCE_ENABLED: "false" })).toBe(false)
  })

  it("is server-only and is not a public env var", () => {
    const source = readFileSync(fileURLToPath(new URL("./persistence-config.ts", import.meta.url)), "utf8")
    expect(source).toMatch(/^import "server-only"/m)
    expect(source).not.toContain("NEXT_PUBLIC_")
    const envExample = readFileSync(fileURLToPath(new URL("../../.env.example", import.meta.url)), "utf8")
    expect(envExample).toContain("CASE_PERSISTENCE_ENABLED=false")
    expect(envExample).not.toContain("NEXT_PUBLIC_CASE_PERSISTENCE")
  })
})
