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
 * the supported forms are a closed set and everything else is reported. Both
 * the process environment and the injected `env` object are held to that same
 * set, because a dynamic, copied or renamed read hides a variable name just as
 * well whichever object it came from.
 *
 * Handing a whole environment object to a function is not a supported form.
 * `process.env` may never be passed at all, and the injected `env` may be
 * passed only where `env-handoff-exceptions.ts` names that exact callee in
 * that exact file. Nothing is inferred from the call site: a callee is only a
 * name, and a name proves nothing about what the function behind it reads,
 * copies or forwards. Every other hand-off is reported, which is what keeps
 * the inventory from going quietly out of date.
 *
 * Its one acknowledged limit: `Record<string, string | undefined>` is also
 * used for things that are not the environment, so a parameter of that shape
 * is only required to be called `env` in a file that reaches the environment
 * at all. A named environment type — `EnvMap`, or any alias ending in `Env` —
 * is required to be called `env` everywhere.
 */

import { isReviewedHandoff } from "./env-handoff-exceptions"

/** The ways this codebase is allowed to reach the environment. */
export type EnvAccessForm =
  /** `process.env.NAME` or `env.NAME` */
  | "dotted"
  /** `process.env["NAME"]` or `env["NAME"]` */
  | "bracket"
  /** ``env[`PREFIX_${n}`]``, a declared family of computed names */
  | "family"
  /** `const { NAME } = process.env` or `const { NAME } = env` */
  | "destructured"
  /** `function f(env: EnvMap = process.env)`, the injectable configuration pattern */
  | "injected"
  /** `f(env)` where this callee, in this file, is a reviewed exception */
  | "exception"

export type EnvAccess = {
  /** The recognised form, or `null` when the syntax is not a supported one. */
  form: EnvAccessForm | null
  /** The variable read, for the forms that read a single name. */
  name: string | null
  /** The static prefix, for the computed-family form. */
  family: string | null
  /** The callee this object was handed to, for the exception form. */
  callee: string | null
  /** A single-line excerpt, for a failure message. Never a value. */
  excerpt: string
}

/**
 * The source with comments and the contents of strings, template literals and
 * regular expressions replaced by spaces.
 *
 * A pattern that describes environment access is not environment access, and
 * a comma inside a string is not an argument separator. Length and line
 * breaks are preserved, so an offset in the mask is the same offset in the
 * original and a key such as the one in `env["NAME"]` can still be read from
 * the original text.
 */
export function maskLiterals(source: string): string {
  const masked = source.split("")
  const blank = (from: number, to: number) => {
    for (let at = from; at < to && at < masked.length; at += 1) if (masked[at] !== "\n") masked[at] = " "
  }
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
    let end = -1
    if (here === "/" && source[at + 1] === "/") {
      const line = source.indexOf("\n", at)
      end = line === -1 ? source.length : line
    } else if (here === "/" && source[at + 1] === "*") end = endOf(at + 2, "*/")
    else if (here === '"' || here === "'" || here === "`") end = endOf(at + 1, here)
    else if (here === "/" && beforeRegex.test(source.slice(0, at))) end = endOf(at + 1, "/")
    if (end === -1) continue
    // Quotes stay so the shape of a bracket key is still visible.
    blank(here === "/" ? at : at + 1, here === "/" ? end : end - 1)
    at = end - 1
  }
  return masked.join("")
}

const identifier = "[A-Za-z_$][\\w$]*"

/** Where the environment object is reached, whichever spelling was used. */
const environmentObject = new RegExp(
  [
    // `process.env`, and the spellings that reach the same object.
    "process\\s*(?:\\?\\.|\\.)\\s*env\\b",
    "process\\s*\\??\\s*\\[\\s*[\"'`] *[\"'`]\\s*\\]",
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
 * The call an argument sits in: the callee exactly as written, and the
 * position of the argument.
 *
 * A member callee keeps its receiver, so `entry.live(env)` is a different
 * exception from `live(env)` and has to be reviewed as one. A callee that is
 * not a plain name or member path — a call on a call, an index, a parenthesis
 * — resolves to nothing and can never match an exception.
 */
export function enclosingCall(masked: string, at: number): { callee: string; position: number } | null {
  let position = 0
  let depth = 0
  for (let index = at - 1; index >= 0; index -= 1) {
    const character = masked[index]
    if (character === ")" || character === "]" || character === "}") depth += 1
    else if (character === "[" || character === "{") depth -= 1
    else if (character === "," && depth === 0) position += 1
    else if (character === "(") {
      if (depth > 0) {
        depth -= 1
        continue
      }
      const path = `(?:${identifier}\\s*\\??\\s*\\.\\s*)*${identifier}`
      const callee = new RegExp(`(?:^|\\.\\.\\.|[^.?\\w$])(${path})\\s*$`).exec(masked.slice(0, index))
      return callee ? { callee: callee[1].replace(/\s*\??\s*\.\s*/g, "."), position } : null
    }
  }
  return null
}

/**
 * Every access to the environment object, classified. An access with a `null`
 * form is syntax this scanner cannot certify, which includes an undeclared
 * dynamic key, optional chaining, a spread, a copy, an alias, and handing the
 * whole object to a function that is not a reviewed exception.
 *
 * `path` is the file being scanned, repository-relative. Without it no
 * hand-off can be matched against the exception table, so every hand-off is
 * reported — which is the right answer for a snippet with no file behind it.
 */
export function processEnvAccesses(source: string, path?: string): EnvAccess[] {
  const masked = maskLiterals(source)
  const accesses: EnvAccess[] = []
  const add = (access: Partial<EnvAccess> & { excerpt: string }) =>
    accesses.push({ form: null, name: null, family: null, callee: null, ...access })

  for (const match of masked.matchAll(environmentObject)) {
    const start = match.index
    const end = start + match[0].length
    const before = masked.slice(0, start)
    const after = masked.slice(end, end + 120)
    const keyed = source.slice(end, end + 120)
    const excerpt = source.slice(Math.max(0, start - 48), end + 32).replace(/\s+/g, " ").trim()
    const isProcessEnv = /process/.test(match[0])

    // Masking hides which property a bracket names, so `process["cwd"]` and
    // `process["env"]` look alike until the original text is consulted.
    if (match[0].includes("[") && !/^process\s*\??\s*\[\s*["'`]env["'`]/.test(source.slice(start))) continue

    // `process["env"]` and `process?.env` reach the same object by a spelling
    // the rest of this scanner does not follow, so they are never supported.
    if (isProcessEnv && !supportedProcessEnv.test(match[0].replace(/\s+/g, ""))) {
      add({ excerpt })
      continue
    }
    // The injected object being named rather than read: the parameter that
    // introduces it, or the binding it is assigned to.
    if (!isProcessEnv && isDeclaration(before, after)) continue

    const dotted = new RegExp(`^\\.(${identifier})`).exec(after)
    // A key the reader can see. A template literal carrying an interpolation
    // is a computed key, handled separately, not one of these.
    const bracket = /^\[\s*["'`]([^"'`${}]+)["'`]\s*\]/.exec(keyed)
    const family = /^\[\s*`([A-Za-z_][\w]*)\$\{[^`]*\}`\s*\]/.exec(keyed)
    const isBracket = /^\[\s*["'`]/.test(after)

    // Handing the whole environment to a function is unsupported by default.
    // `process.env` is never allowed to travel; the injected `env` travels
    // only along an edge somebody has reviewed and written down.
    const handedTo = isProcessEnv ? null : reviewedCallee(masked, start, end, path)

    if (dotted) add({ form: "dotted", name: dotted[1], excerpt })
    else if (isBracket && bracket) add({ form: "bracket", name: bracket[1], excerpt })
    else if (isBracket && family) add({ form: "family", family: family[1], excerpt })
    else if (/\{[^{}]*\}\s*=\s*$/.test(before)) add({ form: "destructured", excerpt })
    else if (isProcessEnv && isBoundToEnv(before)) add({ form: "injected", excerpt })
    else if (handedTo) add({ form: "exception", callee: handedTo, excerpt })
    else add({ excerpt })
  }

  // A template literal is masked wholesale, so an environment read written
  // inside an interpolation would be masked with it. Report it instead.
  for (const interpolation of source.matchAll(/\$\{[^}]*\}/g)) {
    if (/\benv\b/.test(interpolation[0])) {
      add({ excerpt: interpolation[0].replace(/\s+/g, " ").slice(0, 80) })
    }
  }
  return accesses
}

/** The callee of a reviewed hand-off at this position, if that is what it is. */
function reviewedCallee(masked: string, start: number, end: number, path: string | undefined): string | null {
  if (!/^\s*[),]/.test(masked.slice(end))) return null
  const call = enclosingCall(masked, start)
  if (!call || !isReviewedHandoff(call.callee, path)) return null
  return call.callee
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
 * A reviewed hand-off is reviewed on the understanding that the receiving
 * function reads the environment in forms this scanner can see. That only
 * holds while the parameter is still called `env` on the other side, so the
 * naming rule is asserted on every definition.
 */
export function misnamedEnvParameters(source: string): string[] {
  const masked = maskLiterals(source)
  const named = [...masked.matchAll(namedEnvType)]
  // The anonymous shape is ambiguous, so it is only held to the naming rule
  // in a file that reaches the environment at all.
  const reachesEnvironment = processEnvAccesses(source).length > 0
  const anonymous = reachesEnvironment ? [...masked.matchAll(anonymousEnvType)] : []
  return [...named, ...anonymous].filter(match => match[1] !== "env").map(match => match[0].replace(/\s+/g, " ").trim())
}

/** Environment access this scanner cannot certify, as source excerpts. */
export function unsupportedEnvironmentAccess(source: string, path?: string): string[] {
  const unsupported = processEnvAccesses(source, path)
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
  const masked = maskLiterals(source)
  const names: string[] = []
  const push = (name: string) => {
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.push(name)
  }
  for (const access of processEnvAccesses(source)) if (access.name) push(access.name)
  // Identifiers survive masking, so the destructured names can be read from
  // the mask and a `{ NAME }` written inside a string is left out.
  const destructured = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:process\.)?env\b/g
  for (const match of masked.matchAll(destructured)) {
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
  return renamed.test(maskLiterals(source))
}
