/**
 * The scanner two security guards depend on, tested directly.
 *
 * Both guards recognise a read rather than a mention, which is only safe
 * while the set of recognised reads is closed. These cases pin the forms the
 * repository uses and prove that the ways around them — a dynamic key, a
 * copy, an alias, a different spelling of the same object, or handing the
 * whole object to a function — are reported instead of passing silently.
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { envHandoffExceptions } from "./env-handoff-exceptions"
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
})

describe("whole-environment hand-off", () => {
  // Nothing about a call site says what the function behind the name does
  // with the object, so nothing is inferred from one. Passing the whole
  // environment is unsupported unless the exception table names that exact
  // callee in that exact file.
  const rejects = (source: string, path?: string) =>
    expect(unsupportedEnvironmentAccess(source, path)).not.toHaveLength(0)

  it("rejects handing the whole process environment to a function", () => {
    rejects(`readConfig(process.env)`)
    rejects(`const config = readConfig(process.env)`)
    rejects(`readConfig(request, process.env, stack)`)
  })

  it("rejects handing the whole injected environment to a function", () => {
    rejects(`readConfig(env)`)
    rejects(`externalHelper(env)`)
    rejects(`foo(request, env)`)
    rejects(`foo(env, stack)`)
  })

  it("rejects a hand-off however visible the receiving function is", () => {
    // The definition is right there and its parameter reads the service key.
    // That changes nothing: the rule is the table, not the reader's guess.
    const visible = `function readConfig(x) { return x.${key} }\nreadConfig(env)`
    rejects(visible)
    expect(readsVariable(visible, key)).toBe(false)

    const named = `function readConfig(env: EnvMap) { return env.${key} }\nreadConfig(env)`
    rejects(named)
  })

  it("rejects an imported function receiving the whole environment", () => {
    rejects(`import { externalHelper } from "some-package"\nexport function gate(env: EnvMap) { return externalHelper(env) }`)
    rejects(`import { localHelper } from "./helper"\nexport function gate(env: EnvMap) { return localHelper(env) }`)
  })

  it("accepts only the exact callee named in the exact file", () => {
    const file = "apps/admin/lib/jobs/config.ts"
    expect(unsupportedEnvironmentAccess(`export function f(env: EnvMap) { return resolveProviderMode(env) }`, file)).toEqual([])
    // The same callee from a file the table does not list for it.
    rejects(`export function f(env: EnvMap) { return resolveProviderMode(env) }`, "apps/admin/lib/auth/config.ts")
    // A different callee in a file that does hold exceptions.
    rejects(`export function f(env: EnvMap) { return readConfig(env) }`, file)
    // And with no file at all there is nothing to match against.
    rejects(`export function f(env: EnvMap) { return resolveProviderMode(env) }`)
  })

  it("never lets the process environment travel, exception or not", () => {
    const file = "apps/admin/lib/jobs/config.ts"
    rejects(`resolveProviderMode(process.env)`, file)
  })

  it("keeps a member callee distinct from a plain one", () => {
    // The capability table stores each gate as a function, so the release
    // check calls `entry.live`. That is its own reviewed exception; the bare
    // name is not, and neither is the same call from elsewhere.
    const gates = "apps/admin/lib/release/gates.ts"
    expect(unsupportedEnvironmentAccess(`export function f(env: EnvMap) { return entry.live(env) }`, gates)).toEqual([])
    rejects(`export function f(env: EnvMap) { return live(env) }`, gates)
    rejects(`export function f(env: EnvMap) { return entry.live(env) }`, "apps/admin/lib/settings/system-status.ts")
  })

  it("resolves no callee at all from a call this scanner cannot name", () => {
    rejects(`export function f(env: EnvMap) { return handlers[name](env) }`, "apps/admin/lib/jobs/config.ts")
    rejects(`export function f(env: EnvMap) { return build()(env) }`, "apps/admin/lib/jobs/config.ts")
  })
})

describe("rejected environment access", () => {
  const rejects = (source: string) => expect(unsupportedEnvironmentAccess(source)).not.toHaveLength(0)

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
    // A reviewed hand-off is reviewed on the understanding that the receiving
    // function reads in forms this scanner can see, which only holds while
    // the parameter is still called `env` on the other side.
    expect(misnamedEnvParameters(`function readConfig(cfg: EnvMap) { return cfg.${key} }`)).toHaveLength(1)
    rejects(`function readConfig(cfg: EnvMap) { return cfg.${key} }`)
    rejects(`function readConfig(cfg: GoogleBusinessProfileEnv) {}`)
    // The anonymous shape is held to the rule in a file that reaches the
    // environment, and left alone in one that uses it for something else.
    rejects(`function gate(env: EnvMap) { return env.${key} }
      function readConfig(settings: Record<string, string | undefined>) { return settings.ADMIN_ORIGIN }`)
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

  it("does not treat the exception table's own text as a hand-off", () => {
    // It names callees in strings. A name in a string calls nothing.
    const table = readFileSync(new URL("./env-handoff-exceptions.ts", import.meta.url), "utf8")
    expect(unsupportedEnvironmentAccess(table, "apps/admin/lib/release/env-handoff-exceptions.ts")).toEqual([])
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

describe("the exception table", () => {
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
  const ignored = new Set(["node_modules", ".git", ".next", "dist", "coverage", "out"])
  const isTestFile = (path: string) => /\.test\.|\/testing\/|^test\/|^scripts\//.test(path)

  const walk = (directory: string, found: string[] = []): string[] => {
    for (const name of readdirSync(directory)) {
      if (ignored.has(name)) continue
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path, found)
      else if (/\.(ts|tsx|mjs|js|jsx)$/.test(name)) found.push(path)
    }
    return found
  }

  /** Every hand-off the sweep actually accepted, as callee and file. */
  const accepted = new Set<string>()
  for (const file of walk(repoRoot)) {
    const path = relative(repoRoot, file).replaceAll("\\", "/")
    if (isTestFile(path)) continue
    for (const access of processEnvAccesses(readFileSync(file, "utf8"), path)) {
      if (access.form === "exception" && access.callee) accepted.add(`${access.callee} in ${path}`)
    }
  }

  it("holds no entry production source no longer uses", () => {
    // A permission nobody needs is a permission nobody is reviewing.
    const declared = envHandoffExceptions.flatMap(entry => entry.files.map(file => `${entry.helper} in ${file}`))
    expect(declared.filter(entry => !accepted.has(entry))).toEqual([])
  })

  it("covers the gate compositions it exists for", () => {
    expect(accepted.has("resolveProviderMode in apps/admin/lib/jobs/config.ts")).toBe(true)
    expect(accepted.has("entry.live in apps/admin/lib/release/gates.ts")).toBe(true)
    expect(accepted.size).toBeGreaterThan(50)
  })

  it("gives every entry a reason somebody wrote", () => {
    const thin = envHandoffExceptions.filter(entry => entry.reason.trim().length < 40 || entry.files.length === 0)
    expect(thin).toEqual([])
    const duplicated = envHandoffExceptions.map(entry => entry.helper)
    expect(new Set(duplicated).size).toBe(duplicated.length)
  })
})

describe("scanner mechanics", () => {
  it("answers about a family of names as one question", () => {
    expect(readsVariable(`const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID`, "NEXT_PUBLIC_[A-Z0-9_]*")).toBe(true)
    expect(readsVariable(`const id = process.env.ADMIN_ORIGIN`, "NEXT_PUBLIC_[A-Z0-9_]*")).toBe(false)
  })

  it("classifies each access with the form that was used", () => {
    const source = [
      `const a = process.env.${key}`,
      `const b = process.env["ADMIN_ORIGIN"]`,
      `const { SUPABASE_URL } = process.env`,
      `function f(env: EnvMap = process.env) { return resolveProviderMode(env) }`,
    ].join("\n")
    const forms = processEnvAccesses(source, "apps/admin/lib/jobs/config.ts").map(access => access.form)
    expect(forms).toEqual(["dotted", "bracket", "destructured", "injected", "exception"])
  })

  it("never puts a value in an excerpt it reports", () => {
    const [access] = processEnvAccesses(`const cfg = process.env`)
    expect(access.form).toBeNull()
    expect(access.excerpt).toContain("const cfg")
  })
})
