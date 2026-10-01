import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { containsSecret, scanForSecrets, secretPatterns } from "./secrets"

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))

/**
 * The artifacts a release produces: the readiness modules, the cutover
 * document and the operator SQL. All three are committed, reviewed and
 * quoted, so none of them may contain anything that could authenticate.
 *
 * Test files are deliberately excluded. They carry obviously fake credential
 * shapes on purpose, which is how the scanner itself is tested.
 */
function releaseArtifacts(): string[] {
  const files: string[] = []
  const walk = (directory: string, accept: (name: string) => boolean) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path, accept)
      else if (accept(name)) files.push(path)
    }
  }
  walk(join(repoRoot, "apps/admin/lib/release"), name => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  walk(join(repoRoot, "docs/admin/operator-sql"), name => name.endsWith(".sql") || name.endsWith(".md"))
  files.push(join(repoRoot, "docs/admin/production-cutover-readiness.md"))
  return files
}

describe("secret patterns", () => {
  it("recognises a credential shape from every provider this system touches", () => {
    const samples: Record<string, string> = {
      stripe_key: "sk_test_51Abcdefghijklmnopqrstuvwx",
      stripe_webhook: "whsec_Abcdefghijklmnopqrstuvwxyz",
      resend_key: "re_Abcdefghij_klmnopqrstuvwxyz",
      google_oauth_client_secret: "GOCSPX-abcdefghijklmnop",
      google_oauth_client_id: "123456789012-abcdefghijklmnopqrstuvwxyz01.apps.googleusercontent.com",
      aws_access_key_id: "AKIAIOSFODNN7EXAMPLE",
      jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      supabase_api_key: "sb_secret_abcdefghijklmnopqrstuvwxyz",
      github_token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      private_key_block: "-----BEGIN PRIVATE KEY-----",
      postgres_url_password: "postgresql://user:hunter2@db.example.com:5432/postgres",
      basic_auth_url: "https://user:hunter2@example.com/path",
      assigned_secret_variable: "CRON_SECRET=a1b2c3d4e5f6g7h8",
    }
    expect(Object.keys(samples).sort()).toEqual(secretPatterns.map(pattern => pattern.id).sort())
    for (const [id, sample] of Object.entries(samples)) {
      expect({ id, found: scanForSecrets(sample).map(finding => finding.patternId) }).toEqual({ id, found: [id] })
    }
  })

  it("reports the pattern and the line but never the matched text", () => {
    const findings = scanForSecrets(["first line", "second line", "AKIAIOSFODNN7EXAMPLE"].join("\n"))
    expect(findings).toEqual([{ patternId: "aws_access_key_id", description: "AWS access key id", line: 3 }])
    expect(JSON.stringify(findings)).not.toContain("AKIA")
  })

  it("lets a checklist name a secret variable, describe it and show it unset", () => {
    const prose = [
      "Set `CRON_SECRET` in the Vercel production environment.",
      "| CRON_SECRET | PROVIDER_SECRET | present |",
      "CRON_SECRET=",
      "CRON_SECRET: <at least sixteen characters>",
      "COMMUNICATIONS_LINK_SECRET is unset, so EVIDENCE_REQUEST cannot be drafted.",
      "STRIPE_SECRET_KEY must be absent at cutover.",
      "Accepted prefixes are sk_test_ and rk_test_.",
    ].join("\n")
    expect(scanForSecrets(prose)).toEqual([])
  })

  it("catches a secret-named variable that has been given a real-looking value", () => {
    expect(containsSecret("GOOGLE_BUSINESS_PROFILE_TOKEN_KEY=7f3a9c1e5b8d2041")).toBe(true)
    expect(containsSecret("RESEND_WEBHOOK_SECRET: whsec0a1b2c3d4e5f")).toBe(true)
  })
})

describe("release artifacts", () => {
  const artifacts = releaseArtifacts()

  it("includes the readiness modules, the cutover document and the operator SQL", () => {
    const paths = artifacts.map(file => relative(repoRoot, file).replaceAll("\\", "/")).sort()
    expect(paths).toContain("apps/admin/lib/release/readiness.ts")
    expect(paths).toContain("apps/admin/lib/release/environment.ts")
    expect(paths).toContain("docs/admin/production-cutover-readiness.md")
    expect(paths.some(path => path.startsWith("docs/admin/operator-sql/"))).toBe(true)
  })

  it("contains nothing that could authenticate", () => {
    const findings = artifacts.flatMap(file =>
      scanForSecrets(readFileSync(file, "utf8")).map(finding => ({
        file: relative(repoRoot, file).replaceAll("\\", "/"),
        pattern: finding.patternId,
        line: finding.line,
      })),
    )
    expect(findings).toEqual([])
  })
})
