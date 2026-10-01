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
 * the supported forms are a closed set and anything else is reported as
 * unsupported rather than quietly ignored. An alias such as a binding of the
 * whole environment object to a new name would hide its reads from both
 * guards, so it is rejected here instead of being followed.
 */

/** The ways this codebase is allowed to reach the process environment. */
export type EnvAccessForm =
  /** `process.env.NAME` or `env.NAME` */
  | "dotted"
  /** `process.env["NAME"]` or `env["NAME"]` */
  | "bracket"
  /** `const { NAME } = process.env` */
  | "destructured"
  /** `function f(env: EnvMap = process.env)`, the injectable configuration pattern */
  | "injected"
  /** `f(process.env)`, handing the whole environment to an injected parameter */
  | "argument"

export type EnvAccess = {
  /** The recognised form, or `null` when the syntax is not a supported one. */
  form: EnvAccessForm | null
  /** The variable read, for the forms that read a single name. */
  name: string | null
  /** A single-line excerpt, for a failure message. Never a value. */
  excerpt: string
}

const blockComment = /\/\*[\s\S]*?\*\//g
// A line comment only when nothing earlier on the line could have quoted it,
// which keeps a URL inside a string from truncating real code.
const lineComment = /^[^\n"'`]*?\/\/.*$/gm

export function withoutComments(source: string): string {
  return source.replace(blockComment, " ").replace(lineComment, " ")
}

const identifier = "[A-Za-z_$][\\w$]*"

/**
 * Every access to the whole process environment, classified. An access with a
 * `null` form is syntax this scanner does not understand well enough to call
 * safe, which includes optional chaining, spreading and aliasing.
 */
export function processEnvAccesses(source: string): EnvAccess[] {
  const bare = withoutComments(source)
  const accesses: EnvAccess[] = []
  for (const match of bare.matchAll(/process\.env/g)) {
    const start = match.index
    const end = start + match[0].length
    const before = bare.slice(0, start)
    const after = bare.slice(end, end + 80)
    const excerpt = bare.slice(Math.max(0, start - 48), end + 32).replace(/\s+/g, " ").trim()

    const dotted = new RegExp(`^\\.(${identifier})`).exec(after)
    const bracket = /^\[\s*["'`]([^"'`]+)["'`]\s*\]/.exec(after)
    let form: EnvAccessForm | null = null
    let name: string | null = null

    if (dotted) {
      form = "dotted"
      name = dotted[1]
    } else if (bracket) {
      form = "bracket"
      name = bracket[1]
    } else if (/\{[^{}]*\}\s*=\s*$/.test(before)) {
      form = "destructured"
    } else if (isBoundToEnv(before)) {
      form = "injected"
    } else if (isCallArgument(before, after)) {
      form = "argument"
    }

    accesses.push({ form, name, excerpt })
  }
  return accesses
}

/**
 * The whole environment may be bound to the name `env` and to no other,
 * because reads through `env` are recognised and reads through a new name
 * would not be. A fallback is allowed on the way, which is how the provider
 * resolver takes an override and defaults to the process environment.
 */
function isBoundToEnv(before: string): boolean {
  return /\benv\s*(?::[^=;]*)?=\s*(?:[^=;{}]*(?:\?\?|\|\|)\s*)?$/.test(before)
}

/**
 * Handing the whole environment to a function is safe because the receiving
 * parameter is the injectable one, which this scanner already reads. That
 * holds for a call on a plain function, so the callee has to be one: a
 * parenthesised assignment has no callee at all, and a method such as
 * `Object.keys` copies the environment somewhere this scanner cannot see.
 */
function isCallArgument(before: string, after: string): boolean {
  if (!/[(,]\s*$/.test(before) || !/^\s*[),]/.test(after)) return false
  const callee = new RegExp(`(?:^|[^.\\w$])${identifier}\\s*$`)
  let depth = 0
  for (let at = before.length - 1; at >= 0; at -= 1) {
    const character = before[at]
    if (character === ")" || character === "]" || character === "}") depth += 1
    else if (character === "[" || character === "{") depth -= 1
    else if (character === "(") {
      if (depth === 0) return callee.test(before.slice(0, at))
      depth -= 1
    }
  }
  return false
}

/** Environment access this scanner cannot certify, as source excerpts. */
export function unsupportedEnvironmentAccess(source: string): string[] {
  const bare = withoutComments(source)
  const unsupported = processEnvAccesses(source)
    .filter(access => access.form === null)
    .map(access => access.excerpt)

  // Binding the injectable environment parameter to a second name hides its
  // reads just as effectively as aliasing the process environment would.
  const aliasOfEnv = new RegExp(`(?:const|let|var)\\s+(${identifier})\\s*(?::[^=]*)?=\\s*env\\s*(?=[;,)\\n])`, "g")
  for (const match of bare.matchAll(aliasOfEnv)) {
    if (match[1] !== "env") unsupported.push(match[0].replace(/\s+/g, " ").trim())
  }
  return unsupported
}

/** Every variable name the source reads, through any supported form. */
export function environmentReads(source: string): string[] {
  const bare = withoutComments(source)
  const names: string[] = []
  const push = (name: string) => {
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.push(name)
  }
  // The injectable parameter is read by its own name. The lookbehind keeps a
  // `process.env.NAME` read from being counted a second time here.
  for (const access of processEnvAccesses(source)) if (access.name) push(access.name)
  for (const match of bare.matchAll(new RegExp(`(?<!process\\.)\\benv\\.(${identifier})`, "g"))) push(match[1])
  for (const match of bare.matchAll(/(?<!process\.)\benv\[\s*["'`]([^"'`]+)["'`]\s*\]/g)) push(match[1])
  for (const match of bare.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:process\.)?env\b/g)) {
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
  return new RegExp(`\\{[^{}]*\\b${name}\\b[^{}]*\\}\\s*=\\s*(?:process\\.)?env\\b`).test(withoutComments(source))
}
