/**
 * The scanner two security guards depend on, tested directly.
 *
 * Both guards recognise a read rather than a mention, which is only safe
 * while the set of recognised reads is closed. These cases pin the forms the
 * repository uses and prove that the ways around them — a dynamic key, a
 * copy, an alias, a different spelling of the same object, or a handoff into
 * a parameter under another name — are reported instead of passing silently.
 */

import { describe, expect, it } from "vitest"
import {
  environmentFamilies,
  environmentReads,
  misnamedEnvParameters,
  processEnvAccesses,
  readsVariable,
  unsupportedEnvironmentAccess,
} from "./source-scan"

const key = "SUPABASE_SECRET_KEY"

describe("supported environment reads", () => {
  it("reads the dotted form on either object", () => {
    expect(environmentReads(`const a = process.env.${key}`)).toEqual([key])
    expect(environmentReads(`const a = env.${key}`)).toEqual([key])
    expect(readsVariable(`const a = process.env.${key}`, key)).toBe(true)
    expect(readsVariable(`const a = env.${key}`, key)).toBe(true)
  })

  it("reads the bracket form on either object", () => {
    expect(environmentReads(`const a = process.env["${key}"]`)).toEqual([key])
    expect(environmentReads(`const a = env["${key}"]`)).toEqual([key])
    expect(readsVariable(`const a = process.env['${key}']`, key)).toBe(true)
    expect(readsVariable(`const a = env['${key}']`, key)).toBe(true)
  })

  it("reads the destructured form on either object", () => {
    expect(environmentReads(`const { ${key} } = process.env`)).toEqual([key])
    expect(environmentReads(`const { ${key} } = env`)).toEqual([key])
    expect(readsVariable(`const { ${key}: secret } = process.env`, key)).toBe(true)
    expect(readsVariable(`const { ${key}: secret } = env`, key)).toBe(true)
  })

  it("reads the injectable binding", () => {
    const source = `export function gate(env: EnvMap = process.env) { return env.${key} }`
    expect(environmentReads(source)).toContain(key)
    expect(readsVariable(source, key)).toBe(true)
    expect(unsupportedEnvironmentAccess(source)).toEqual([])
  })

  it("accepts an override falling back to the process environment", () => {
    const source = `const env = options.env ?? process.env\nconst mode = env.${key}`
    expect(unsupportedEnvironmentAccess(source)).toEqual([])
    expect(readsVariable(source, key)).toBe(true)
  })

  it("reports a computed name family by its static prefix", () => {
    // The one dynamic read the codebase makes. It is not certified here: it
    // is surfaced as a family so the inventory can require it to be declared.
    const source = "const named = env[`COMMUNICATIONS_LINK_SECRET_V${version}`]"
    expect(environmentFamilies(source)).toEqual(["COMMUNICATIONS_LINK_SECRET_V"])
    expect(unsupportedEnvironmentAccess(source)).toEqual([])
    expect(environmentReads(source)).toEqual([])
  })

  it("accepts the injected environment composing through plainly named gates", () => {
    // How the gates are built: one gate asks another, and the parameter it
    // lands in is also called `env`, so its reads stay visible.
    const source = `export function sendEnabled(env: EnvMap) { return providerMode(env) === "production" && env.${key} }`
    expect(unsupportedEnvironmentAccess(source)).toEqual([])
    expect(environmentReads(source)).toEqual([key])
  })
})

describe("rejected environment access", () => {
  const rejects = (source: string) => expect(unsupportedEnvironmentAccess(source)).not.toHaveLength(0)

  it("rejects handing the whole process environment to a function", () => {
    // The scanner cannot prove what the receiving function does with it, and
    // a parameter called something else would read it invisibly.
    rejects(`readConfig(process.env)`)
    rejects(`const config = readConfig(process.env)`)
    rejects(`readConfig(request, process.env, stack)`)
    expect(readsVariable(`function readConfig(cfg) { return cfg.${key} }\nreadConfig(process.env)`, key)).toBe(false)
  })

  it("rejects a dynamic key on either object", () => {
    rejects(`const a = process.env[name]`)
    rejects(`const a = env[name]`)
    rejects(`const a = env["prefix" + suffix]`)
  })

  it("rejects an environment read hidden inside a template interpolation", () => {
    rejects("const url = `${process.env.ADMIN_ORIGIN}/sign-in`")
  })

  it("rejects optional chaining on either object", () => {
    rejects(`const a = process.env?.${key}`)
    rejects(`const a = env?.${key}`)
    rejects(`const a = env?.["${key}"]`)
  })

  it("rejects copying either object", () => {
    rejects(`const all = { ...process.env }`)
    rejects(`const all = { ...env }`)
    rejects(`const names = Object.keys(env)`)
    rejects(`const pairs = Object.entries(env)`)
    rejects(`const copy = Object.assign({}, env)`)
    rejects(`const copy = structuredClone(env).${key}`)
  })

  it("rejects aliasing either object", () => {
    const aliased = `const cfg = process.env\nconst secret = cfg.${key}`
    expect(readsVariable(aliased, key)).toBe(false)
    rejects(aliased)
    for (const keyword of ["let", "var"]) rejects(`${keyword} cfg = process.env`)
    rejects(`const cfg = env\nconst secret = cfg.${key}`)
    rejects(`const cfg = (process.env)`)
    rejects(`const cfg = options.env ?? process.env`)
  })

  it("rejects an alternate spelling of the process environment", () => {
    rejects(`const a = process["env"].${key}`)
    rejects(`const a = process['env']['${key}']`)
    rejects(`const a = process[\`env\`].${key}`)
    rejects(`const a = process?.env.${key}`)
    expect(readsVariable(`const a = process["env"].${key}`, key)).toBe(false)
  })

  it("rejects a parameter that receives the environment under another name", () => {
    // What makes a handoff safe without following it: the parameter it lands
    // in has to be called `env` too.
    expect(misnamedEnvParameters(`function readConfig(cfg: EnvMap) { return cfg.${key} }`)).toHaveLength(1)
    rejects(`function readConfig(cfg: EnvMap) { return cfg.${key} }`)
    rejects(`function readConfig(cfg: GoogleBusinessProfileEnv) {}`)
    // The anonymous shape is held to the rule in a file that reaches the
    // environment, and left alone in one that uses it for something else.
    rejects(`function gate(env: EnvMap) { return readConfig(env) }
      function readConfig(settings: Record<string, string | undefined>) { return settings.${key} }`)
    expect(misnamedEnvParameters(`function href(extra: Record<string, string | undefined>) {}`)).toEqual([])
    expect(misnamedEnvParameters(`function gate(env: EnvMap = process.env) {}`)).toEqual([])
  })
})

describe("mentions are not reads", () => {
  it("does not read a variable a catalogue merely names", () => {
    expect(readsVariable(`{ name: "${key}", readBy: ["lib/auth/config.ts"] }`, key)).toBe(false)
    expect(environmentReads(`const rows = ["${key}", "ADMIN_ORIGIN"]`)).toEqual([])
    expect(unsupportedEnvironmentAccess(`{ name: "${key}" }`)).toEqual([])
    expect(unsupportedEnvironmentAccess(`controls: "Set in the Vercel environment for the admin project."`)).toEqual([])
  })

  it("ignores a commented-out read", () => {
    expect(environmentReads(`// const a = process.env.${key}`)).toEqual([])
    expect(environmentReads(`/* const a = process.env.${key} */`)).toEqual([])
  })

  it("does not treat a property called env on something else as the environment", () => {
    expect(unsupportedEnvironmentAccess(`const chosen = options.env`)).toEqual([])
    expect(environmentReads(`const chosen = options.env`)).toEqual([])
  })
})

describe("scanner mechanics", () => {
  it("answers about a family of names as one question", () => {
    expect(readsVariable(`const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID`, "NEXT_PUBLIC_[A-Z0-9_]*")).toBe(true)
    expect(readsVariable(`const id = process.env.ADMIN_ORIGIN`, "NEXT_PUBLIC_[A-Z0-9_]*")).toBe(false)
  })

  it("classifies each access with the form that was used", () => {
    const forms = processEnvAccesses(
      [
        `const a = process.env.${key}`,
        `const b = process.env["ADMIN_ORIGIN"]`,
        `const { SUPABASE_URL } = process.env`,
        `function f(env: EnvMap = process.env) { return providerMode(env) }`,
      ].join("\n"),
    ).map(access => access.form)
    expect(forms).toEqual(["dotted", "bracket", "destructured", "injected", "handoff"])
  })

  it("never puts a value in an excerpt it reports", () => {
    const [access] = processEnvAccesses(`const cfg = process.env`)
    expect(access.form).toBeNull()
    expect(access.excerpt).toContain("const cfg")
  })
})
