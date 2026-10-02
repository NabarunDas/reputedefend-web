/**
 * One definition of how this codebase is allowed to reach configuration.
 *
 * Two guards depend on recognising every environment read: the client boundary
 * check, which requires any module holding the service key to be server-only,
 * and the Step 24 environment inventory, which requires every variable the
 * code reads to be classified. Both previously carried their own patterns, so
 * a read form one knew about could be invisible to the other.
 *
 * The scanner recognises reads rather than mentions, because a catalogue that
 * records a variable name holds nothing and publishes nothing. That is only
 * safe while every way of reaching the environment is a recognised read, so
 * the supported forms are a closed set and everything else is reported.
 *
 * Both the process environment and the injected `env` object are held to that
 * same closed set, because a dynamic, copied or renamed read hides a variable
 * name just as well whichever object it came from. The environment object may
 * therefore be bound to one name, `env`, and may travel only into a plainly
 * named function. Nothing here follows a value across a function boundary;
 * what makes a handoff safe is the companion rule that a parameter receiving
 * the environment must itself be called `env`, which `misnamedEnvParameters`
 * enforces locally in every file.
 *
 * Its one acknowledged limit: `Record<string, string | undefined>` is also
 * used for things that are not the environment, so a parameter of that shape
 * is only required to be called `env` in a file that reaches the environment
 * at all. A named environment type — `EnvMap`, or any alias ending in `Env` —
 * is required to be called `env` everywhere.
 */

/** The ways this codebase is allowed to reach the environment. */
export type EnvAccessForm =
  /** `process.env.NAME` or `env.NAME` */
  | "dotted"
  /** `process.env["NAME"]` or `env["NAME"]` */
  | "bracket"
  /** `env[`PREFIX_${n}`]`, a declared family of computed names */
  | "family"
  /** `const { NAME } = process.env` or `const { NAME } = env` */
  | "destructured"
  /** `function f(env: EnvMap = process.env)`, the injectable configuration pattern */
  | "injected"
  /** `f(env)`, handing the environment to a function that must also call it `env` */
  | "handoff"

export type EnvAccess = {
  /** The recognised form, or `null` when the syntax is not a supported one. */
  form: EnvAccessForm | null
  /** The variable read, for the forms that read a single name. */
  name: string | null
  /** The static prefix, for the computed-family form. */
  family: string | null
  /** A single-line excerpt, for a failure message. Never a value. */
  excerpt: string
}

type Range = [number, number]

/**
 * Where comments, strings, template literals and regular expressions sit.
 *
 * A pattern that describes environment access is not environment access, so
 * matches landing inside one of these are not accesses either. Positions are
 * reported rather than blanked, because the key in `env["NAME"]` lives inside
 * a literal while the access itself does not.
 */
export function literalRanges(source: string): Range[] {
  const ranges: Range[] = []
  const endOf = (from: number, terminator: string) => {
    for (let at = from; at < source.length; at += 1) {
      if (source[at] === "\\") at += 1
      else if (source.startsWith(terminator, at)) return at + terminator.length
    }
    return source.length
  }
  // A slash opens a regular expression only where a value may begin.
  const beforeRegex = /[=(,:[!&|?{};+\-*%~^]\s*$|\breturn\s*$|^\s*$/

  for (let at = 0; at < source.length; at += 1) {
    const here = source[at]
    if (here === "/" && source[at + 1] === "/") {
      const end = source.indexOf("\n", at)
      ranges.push([at, end === -1 ? source.length : end])
      at = (end === -1 ? source.length : end) - 1
    } else if (here === "/" && source[at + 1] === "*") {
      const end = endOf(at + 2, "*/")
      ranges.push([at, end])
      at = end - 1
    } else if (here === '"' || here === "'" || here === "`") {
      const end = endOf(at + 1, here)
      ranges.push([at, end])
      at = end - 1
    } else if (here === "/" && beforeRegex.test(source.slice(0, at))) {
      const end = endOf(at + 1, "/")
      ranges.push([at, end])
      at = end - 1
    }
  }
  return ranges
}

const inside = (ranges: Range[], at: number) => ranges.some(([from, to]) => at >= from && at < to)

const identifier = "[A-Za-z_$][\\w$]*"

/** Where the environment object is reached, whichever spelling was used. */
const environmentObject = new RegExp(
  [
    // `process.env`, and the spellings that reach the same object.
    "process\\s*(?:\\?\\.|\\.)\\s*env\\b",
    "process\\s*\\??\\s*\\[\\s*[\"'`]env[\"'`]\\s*\\]",
    // The injected parameter, but not a property called `env` on something
    // else. A spread is listed on its own because its dots look like one.
    "(?<=\\.\\.\\.)env\\b",
    "(?<![.\\w$])env\\b",
  ].join("|"),
  "g",
)

/** Only the plain `process.env` spelling is a supported starting point. */
const supportedProcessEnv = /^process\.env$/

/** `env` being declared rather than read: a parameter or a binding target. */
function isDeclaration(before: string, after: string): boolean {
  return /^\s*\??\s*(?::|=>)/.test(after) || /\b(?:const|let|var|function)\s+$/.test(before)
}

/** Globals that would read the whole object somewhere this scanner cannot. */
const copyingGlobals = ["structuredClone"]

/**
 * Every access to the environment object, classified. An access with a `null`
 * form is syntax this scanner cannot certify, which includes an undeclared
 * dynamic key, optional chaining, a spread, a copy and an alias.
 */
export function processEnvAccesses(source: string): EnvAccess[] {
  const ranges = literalRanges(source)
  const accesses: EnvAccess[] = []
  const add = (access: EnvAccess) => accesses.push(access)

  for (const match of source.matchAll(environmentObject)) {
    const start = match.index
    if (inside(ranges, start)) continue
    const end = start + match[0].length
    const before = source.slice(0, start)
    const after = source.slice(end, end + 120)
    const excerpt = source.slice(Math.max(0, start - 48), end + 32).replace(/\s+/g, " ").trim()
    const isProcessEnv = /process/.test(match[0])

    // `process["env"]` and `process?.env` reach the same object by a spelling
    // the rest of this scanner does not follow, so they are never supported.
    if (isProcessEnv && !supportedProcessEnv.test(match[0].replace(/\s+/g, ""))) {
      add({ form: null, name: null, family: null, excerpt })
      continue
    }
    // The injected object being named rather than read: the parameter that
    // introduces it, or the binding it is assigned to.
    if (!isProcessEnv && isDeclaration(before, after)) continue

    const dotted = new RegExp(`^\\.(${identifier})`).exec(after)
    // A key the reader can see. A template literal carrying an interpolation
    // is a computed key, handled separately, not one of these.
    const bracket = /^\[\s*["'`]([^"'`${}]+)["'`]\s*\]/.exec(after)
    const family = /^\[\s*`([A-Za-z_][\w]*)\$\{[^`]*\}`\s*\]/.exec(after)

    if (dotted) add({ form: "dotted", name: dotted[1], family: null, excerpt })
    else if (bracket) add({ form: "bracket", name: bracket[1], family: null, excerpt })
    else if (family) add({ form: "family", name: null, family: family[1], excerpt })
    else if (/\{[^{}]*\}\s*=\s*$/.test(before)) add({ form: "destructured", name: null, family: null, excerpt })
    else if (isProcessEnv && isBoundToEnv(before)) add({ form: "injected", name: null, family: null, excerpt })
    // Handing the whole process environment to a function is not supported:
    // the receiving parameter might read it under any name. Only the injected
    // `env` object may travel, because the parameter it lands in must also be
    // called `env`.
    else if (!isProcessEnv && isHandedToPlainFunction(before, after)) {
      add({ form: "handoff", name: null, family: null, excerpt })
    } else add({ form: null, name: null, family: null, excerpt })
  }

  // A template literal is skipped wholesale, so an environment read written
  // inside an interpolation would be skipped with it. Report it instead.
  for (const [from, to] of ranges) {
    if (source[from] !== "`") continue
    const span = source.slice(from, to)
    if (/\$\{[^}]*\benv\b/.test(span)) {
      add({ form: null, name: null, family: null, excerpt: span.replace(/\s+/g, " ").trim().slice(0, 80) })
    }
  }
  return accesses
}

/**
 * The process environment may be bound to the name `env` and to no other,
 * because reads through `env` are recognised and reads through a new name
 * would not be. A fallback is allowed on the way, which is how the provider
 * resolver takes an override and defaults to the process environment.
 */
function isBoundToEnv(before: string): boolean {
  return /\benv\s*\??\s*(?::[^=;]*)?=\s*(?:[^=;{}]*(?:\?\?|\|\|)\s*)?$/.test(before)
}

/**
 * The injected environment may be passed to a plainly named function, which
 * is how the gates compose. It may not be passed to a method, because
 * `Object.keys`, `Object.entries` and `Object.assign` all read the whole
 * object somewhere this scanner cannot see, and it may not be parenthesised
 * into an assignment, which is an alias wearing a call's punctuation.
 */
function isHandedToPlainFunction(before: string, after: string): boolean {
  if (!/[(,]\s*$/.test(before) || !/^\s*[),]/.test(after)) return false
  const plainCallee = new RegExp(`(?:^|\\.\\.\\.|[^.?\\w$])(${identifier})\\s*$`)
  let depth = 0
  for (let at = before.length - 1; at >= 0; at -= 1) {
    const character = before[at]
    if (character === ")" || character === "]" || character === "}") depth += 1
    else if (character === "[" || character === "{") depth -= 1
    else if (character === "(") {
      if (depth > 0) {
        depth -= 1
        continue
      }
      const callee = plainCallee.exec(before.slice(0, at))
      return callee !== null && !copyingGlobals.includes(callee[1])
    }
  }
  return false
}

/** Type annotations that always mean the environment. */
const namedEnvType = new RegExp(`(${identifier})\\s*\\??\\s*:\\s*(?:EnvMap\\b|${identifier}Env\\b)`, "g")
/** The same shape spelled out, which is also used for other string maps. */
const anonymousEnvType = new RegExp(
  `(${identifier})\\s*\\??\\s*:\\s*Record<\\s*string\\s*,\\s*string\\s*\\|\\s*undefined\\s*>`,
  "g",
)

/**
 * Parameters that receive the environment under some other name.
 *
 * This is what lets `f(env)` be safe without following the value into `f`.
 * A parameter typed as the environment must be called `env`, so a handed-off
 * environment can only land somewhere this scanner already reads.
 */
export function misnamedEnvParameters(source: string): string[] {
  const ranges = literalRanges(source)
  const named = [...source.matchAll(namedEnvType)]
  // The anonymous shape is ambiguous, so it is only held to the naming rule
  // in a file that reaches the environment at all.
  const reachesEnvironment = processEnvAccesses(source).length > 0
  const anonymous = reachesEnvironment ? [...source.matchAll(anonymousEnvType)] : []
  return [...named, ...anonymous]
    .filter(match => !inside(ranges, match.index) && match[1] !== "env")
    .map(match => match[0].replace(/\s+/g, " ").trim())
}

/** Environment access this scanner cannot certify, as source excerpts. */
export function unsupportedEnvironmentAccess(source: string): string[] {
  const unsupported = processEnvAccesses(source)
    .filter(access => access.form === null)
    .map(access => access.excerpt)
  return [...unsupported, ...misnamedEnvParameters(source)]
}

/** Static prefixes of computed name families the source reads. */
export function environmentFamilies(source: string): string[] {
  return processEnvAccesses(source)
    .map(access => access.family)
    .filter((prefix): prefix is string => prefix !== null)
}

/** Every variable name the source reads, through any supported form. */
export function environmentReads(source: string): string[] {
  const ranges = literalRanges(source)
  const names: string[] = []
  const push = (name: string) => {
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.push(name)
  }
  for (const access of processEnvAccesses(source)) if (access.name) push(access.name)
  const destructured = new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*(?:process\\.)?env\\b`, "g")
  for (const match of source.matchAll(destructured)) {
    if (inside(ranges, match.index)) continue
    for (const part of match[1].split(",")) push(part.split(":")[0].trim())
  }
  return names
}

/**
 * Whether the source reads the named variable. `name` is a pattern, so a
 * family such as `NEXT_PUBLIC_[A-Z0-9_]*` can be asked about as one question.
 */
export function readsVariable(source: string, name: string): boolean {
  const matcher = new RegExp(`^${name}$`)
  if (environmentReads(source).some(read => matcher.test(read))) return true
  // Destructuring is also spelled out directly, because a renamed binding
  // (`{ NAME: local }`) keeps the variable name only on the left.
  const renamed = new RegExp(`\\{[^{}]*\\b${name}\\b[^{}]*\\}\\s*=\\s*(?:process\\.)?env\\b`)
  const match = renamed.exec(source)
  return match !== null && !inside(literalRanges(source), match.index)
}
