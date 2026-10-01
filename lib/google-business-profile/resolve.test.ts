import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { providerModes } from "./capability"
import {
  configuredCapabilityState,
  configuredStatusLabel,
  resolveGoogleBusinessProfileProvider,
} from "./resolve"
import { googleBusinessProfileProvider } from "./google-adapter"
import { mockGoogleBusinessProfileProvider } from "./testing/mock-adapter"
import type { ProviderConnectionState } from "./provider"

const liveEnv = {
  GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
  GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true",
  GOOGLE_BUSINESS_PROFILE_CLIENT_ID: "client-id",
  GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "client-secret",
  GOOGLE_BUSINESS_PROFILE_REDIRECT_URI: "https://admin.example.com/api/integrations/google/callback",
  GOOGLE_BUSINESS_PROFILE_TOKEN_KEY: "0123456789abcdef0123456789abcdef",
}

const connected: ProviderConnectionState = {
  status: "CONNECTED",
  connectionRef: "connection-1",
  grantedScopes: ["https://www.googleapis.com/auth/business.manage"],
  connectedAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/**
 * Every module specifier a source file loads, read from the parsed syntax
 * tree rather than matched in text.
 *
 * Only a specifier pulls a module into a build, so the mock guard below asks
 * about specifiers: a readiness catalogue may record the mock's path without
 * that record making the mock reachable. Matching specifier syntax by regex
 * invites exactly the gap this replaced, where a side-effect `import "..."`
 * carried no `from` and so passed. The parser knows every form instead.
 */
function moduleSpecifiers(source: string, fileName = "source.ts"): string[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const specifiers: string[] = []
  const visit = (node: ts.Node) => {
    // `import ... from`, bare `import "..."`, `export ... from`, `export * from`.
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }
    // `import x = require("...")`.
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const reference = node.moduleReference.expression
      if (ts.isStringLiteralLike(reference)) specifiers.push(reference.text)
    }
    // `import("...")` and `require("...")`.
    if (ts.isCallExpression(node)) {
      const loader =
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require")
      const [argument] = node.arguments
      if (loader && argument && ts.isStringLiteralLike(argument)) specifiers.push(argument.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return specifiers
}

const loadsTheMock = (specifier: string) => /mock-adapter|testing\/mock/.test(specifier)

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === "coverage") continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path)
  }
  return found
}

describe("provider resolution", () => {
  it("never offers mock as a configurable mode", () => {
    expect([...providerModes]).toEqual(["manual", "google"])
    expect((providerModes as readonly string[]).includes("mock")).toBe(false)
  })

  it("resolves manual for an unconfigured production environment", () => {
    const resolution = resolveGoogleBusinessProfileProvider({ env: {} })
    expect(resolution.provider.kind).toBe("manual")
    expect(resolution.requestedMode).toBe("manual")
    expect(resolution.fallbackReason).toBe("provider_mode_manual")
  })

  it("cannot be talked into the mock provider by any environment value", () => {
    for (const value of ["mock", "MOCK", "test", "fake", "mock-adapter"]) {
      const resolution = resolveGoogleBusinessProfileProvider({
        env: { ...liveEnv, GOOGLE_BUSINESS_PROFILE_PROVIDER: value },
      })
      expect(resolution.provider.kind, value).toBe("manual")
    }
  })

  it("refuses to promote an injected mock even when every gate passes", () => {
    const resolution = resolveGoogleBusinessProfileProvider({
      env: liveEnv,
      liveProvider: mockGoogleBusinessProfileProvider(),
    })
    expect(resolution.provider.kind).toBe("manual")
    expect(resolution.fallbackReason).toBe("live_provider_rejected")
  })

  it("fails closed when every gate passes but no live transport exists", () => {
    const resolution = resolveGoogleBusinessProfileProvider({ env: liveEnv })
    expect(resolution.configuration.configured).toBe(true)
    expect(resolution.provider.kind).toBe("manual")
    expect(resolution.fallbackReason).toBe("live_transport_unavailable")
  })

  it("stays manual while a single live condition is unmet", () => {
    for (const key of Object.keys(liveEnv)) {
      const env = { ...liveEnv, [key]: "" }
      const resolution = resolveGoogleBusinessProfileProvider({
        env,
        liveProvider: googleBusinessProfileProvider({
          transport: { get: async () => ({ status: 200, body: {} }) },
          connection: connected,
        }),
      })
      expect(resolution.provider.kind, key).toBe("manual")
    }
  })

  it("uses an injected Google adapter only once every condition passes", () => {
    const resolution = resolveGoogleBusinessProfileProvider({
      env: liveEnv,
      liveProvider: googleBusinessProfileProvider({
        transport: { get: async () => ({ status: 200, body: {} }) },
        connection: connected,
      }),
    })
    expect(resolution.provider.kind).toBe("google")
    expect(resolution.fallbackReason).toBeNull()
  })

  it("reports a configuration-only capability and label", () => {
    expect(configuredCapabilityState({})).toBe("MANUAL")
    expect(configuredStatusLabel({})).toBe("Manual mode")
    expect(configuredStatusLabel({ GOOGLE_BUSINESS_PROFILE_PROVIDER: "google" })).toBe("Disabled")
    expect(configuredStatusLabel(liveEnv)).toBe("Not configured")
  })

  it("is not imported by any non-test source file", () => {
    const offenders: string[] = []
    for (const path of sourceFiles(repoRoot)) {
      const name = relative(repoRoot, path)
      if (/\.test\.tsx?$/.test(name)) continue
      if (name.includes(join("google-business-profile", "testing"))) continue
      if (moduleSpecifiers(readFileSync(path, "utf8"), path).some(loadsTheMock)) offenders.push(name)
    }
    expect(offenders).toEqual([])
  })

  it("recognises every form that loads a module, and no mere mention", () => {
    const loads = (source: string) => moduleSpecifiers(source).some(loadsTheMock)

    expect(loads(`import { mockGoogleBusinessProfileProvider } from "./testing/mock-adapter"`)).toBe(true)
    expect(loads(`import type { MockOptions } from "./testing/mock-adapter"`)).toBe(true)
    expect(loads(`import "./testing/mock-adapter"`)).toBe(true)
    expect(loads(`const m = await import("../google-business-profile/testing/mock-adapter")`)).toBe(true)
    expect(loads(`const m = require("./testing/mock-adapter")`)).toBe(true)
    expect(loads(`import m = require("./testing/mock-adapter")`)).toBe(true)
    expect(loads(`export { mockGoogleBusinessProfileProvider } from "./testing/mock-adapter"`)).toBe(true)
    expect(loads(`export * from "./testing/mock-adapter"`)).toBe(true)
    expect(loads(`export * as mock from "@/lib/google-business-profile/testing/mock"`)).toBe(true)

    // A catalogue may record the file without making it reachable.
    expect(loads(`readBy: ["lib/google-business-profile/testing/mock-adapter.ts"]`)).toBe(false)
    expect(loads(`const note = "see testing/mock-adapter for the fake"`)).toBe(false)
    expect(loads(`import { resolve } from "./resolve"`)).toBe(false)
  })
})
