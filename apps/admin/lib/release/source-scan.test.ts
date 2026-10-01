/**
 * The scanner two security guards depend on, tested directly.
 *
 * Both guards recognise a read rather than a mention, which is only safe
 * while the set of recognised reads is complete. These cases pin the forms
 * the repository uses and prove that the ways around them are reported
 * instead of passing silently.
 */

import { describe, expect, it } from "vitest"
import { environmentReads, processEnvAccesses, readsVariable, unsupportedEnvironmentAccess } from "./source-scan"

const key = "SUPABASE_SECRET_KEY"

describe("environment access scanning", () => {
  it("reads the dotted form", () => {
    expect(environmentReads(`const a = process.env.${key}`)).toEqual([key])
    expect(readsVariable(`const a = process.env.${key}`, key)).toBe(true)
  })

  it("reads the bracket form", () => {
    expect(environmentReads(`const a = process.env["${key}"]`)).toEqual([key])
    expect(environmentReads(`const a = env["${key}"]`)).toEqual([key])
    expect(readsVariable(`const a = process.env['${key}']`, key)).toBe(true)
  })

  it("reads the injected parameter form", () => {
    const source = `export function gate(env: EnvMap = process.env) { return env.${key} }`
    expect(environmentReads(source)).toContain(key)
    expect(readsVariable(source, key)).toBe(true)
    expect(unsupportedEnvironmentAccess(source)).toEqual([])
  })

  it("accepts an override falling back to the process environment", () => {
    // How the provider resolver takes an injected environment, binding to the
    // one name whose reads this scanner recognises.
    const source = `const env = options.env ?? process.env\nconst mode = env.${key}`
    expect(unsupportedEnvironmentAccess(source)).toEqual([])
    expect(readsVariable(source, key)).toBe(true)
    expect(unsupportedEnvironmentAccess(`const cfg = options.env ?? process.env`)).toHaveLength(1)
  })

  it("reads the destructured form, including a renamed binding", () => {
    expect(environmentReads(`const { ${key} } = process.env`)).toEqual([key])
    expect(readsVariable(`const { ${key} } = process.env`, key)).toBe(true)
    expect(readsVariable(`const { ${key}: secret } = process.env`, key)).toBe(true)
  })

  it("accepts the whole environment being handed to an injected parameter", () => {
    expect(unsupportedEnvironmentAccess(`const state = systemConfigurationStatus(process.env)`)).toEqual([])
    expect(unsupportedEnvironmentAccess(`const state = resolve(request, process.env)`)).toEqual([])
  })

  it("reports an alias of the process environment rather than following it", () => {
    // The bypass this scanner exists to close: a second name for the whole
    // object would hide every read made through it from both guards.
    const aliased = `const cfg = process.env\nconst secret = cfg.${key}`
    expect(readsVariable(aliased, key)).toBe(false)
    expect(unsupportedEnvironmentAccess(aliased)).toHaveLength(1)
    for (const keyword of ["let", "var"]) {
      expect(unsupportedEnvironmentAccess(`${keyword} cfg = process.env`)).toHaveLength(1)
    }
    expect(unsupportedEnvironmentAccess(`const cfg = (process.env)`)).toHaveLength(1)
  })

  it("reports an alias of the injected environment parameter", () => {
    const aliased = `function gate(env: EnvMap = process.env) { const cfg = env; return cfg.${key} }`
    expect(readsVariable(aliased, key)).toBe(false)
    expect(unsupportedEnvironmentAccess(aliased)).toHaveLength(1)
  })

  it("reports syntax it does not understand instead of ignoring it", () => {
    // Optional chaining and spreading are unused today. Failing closed means
    // introducing one is a test failure rather than a silent gap.
    expect(unsupportedEnvironmentAccess(`const a = process.env?.${key}`)).toHaveLength(1)
    expect(unsupportedEnvironmentAccess(`const all = { ...process.env }`)).toHaveLength(1)
    expect(unsupportedEnvironmentAccess(`const names = Object.keys(process.env).sort()`)).toHaveLength(1)
    expect(unsupportedEnvironmentAccess(`const a = process.env[name]`)).toHaveLength(1)
  })

  it("does not read a variable a catalogue merely names", () => {
    expect(readsVariable(`{ name: "${key}", readBy: ["lib/auth/config.ts"] }`, key)).toBe(false)
    expect(environmentReads(`const rows = ["${key}", "ADMIN_ORIGIN"]`)).toEqual([])
    expect(unsupportedEnvironmentAccess(`{ name: "${key}" }`)).toEqual([])
  })

  it("ignores a commented-out read", () => {
    expect(environmentReads(`// const a = process.env.${key}`)).toEqual([])
    expect(environmentReads(`/* const a = process.env.${key} */`)).toEqual([])
  })

  it("answers about a family of names as one question", () => {
    expect(readsVariable(`const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID`, "NEXT_PUBLIC_[A-Z0-9_]*")).toBe(true)
    expect(readsVariable(`const id = process.env.ADMIN_ORIGIN`, "NEXT_PUBLIC_[A-Z0-9_]*")).toBe(false)
  })

  it("classifies each access with the form that was used", () => {
    const forms = processEnvAccesses(
      `const a = process.env.${key}\nconst b = process.env["ADMIN_ORIGIN"]\nconst { SUPABASE_URL } = process.env\nfunction f(env: EnvMap = process.env) {}\nf(process.env)`,
    ).map(access => access.form)
    expect(forms).toEqual(["dotted", "bracket", "destructured", "injected", "argument"])
  })

  it("never puts a value in an excerpt it reports", () => {
    const [access] = processEnvAccesses(`const cfg = process.env`)
    expect(access.form).toBeNull()
    expect(access.excerpt).toContain("const cfg")
  })
})
