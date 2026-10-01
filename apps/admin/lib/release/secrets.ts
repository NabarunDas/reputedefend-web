/**
 * A release artifact describes what production should contain. It is read by
 * people, committed to git and pasted into review comments, so the one thing
 * it must never contain is a value that could actually authenticate.
 *
 * This module recognises credential shapes rather than specific strings, so a
 * key that has never been seen before is still caught. `secrets.test.ts` runs
 * it over the release modules, the cutover document and the operator SQL.
 */

export type SecretPattern = {
  id: string
  /** What the shape belongs to, so a failure names the provider. */
  description: string
  pattern: RegExp
}

export const secretPatterns: readonly SecretPattern[] = [
  { id: "stripe_key", description: "Stripe API or restricted key", pattern: /\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]{16,}\b/ },
  { id: "stripe_webhook", description: "Stripe webhook signing secret", pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
  { id: "resend_key", description: "Resend API key", pattern: /\bre_[A-Za-z0-9_-]{16,}\b/ },
  { id: "google_oauth_client_secret", description: "Google OAuth client secret", pattern: /\bGOCSPX-[A-Za-z0-9_-]{10,}\b/ },
  { id: "google_oauth_client_id", description: "Google OAuth client id", pattern: /\b\d{10,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com\b/ },
  { id: "aws_access_key_id", description: "AWS access key id", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id: "jwt", description: "JSON Web Token, including a Supabase legacy key", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: "supabase_api_key", description: "Supabase publishable or secret key", pattern: /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{16,}\b/ },
  { id: "github_token", description: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { id: "private_key_block", description: "PEM private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: "postgres_url_password", description: "PostgreSQL connection string carrying a password", pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/ },
  { id: "basic_auth_url", description: "URL carrying inline credentials", pattern: /\bhttps:\/\/[^\s:@/]+:[^\s@/]+@/ },
  {
    id: "assigned_secret_variable",
    description: "A secret-named environment variable given a value",
    // NAME=value or NAME: value, where the name ends in a credential word and
    // the value looks like credential material rather than prose: at least
    // twelve characters from a credential alphabet, containing a digit. A
    // checklist can still name the variable, describe it and show it unset.
    pattern: /\b[A-Z][A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL)S?\s*[=:]\s*["'`]?(?=[A-Za-z0-9_\-+/=.]*\d)[A-Za-z0-9_\-+/=.]{12,}/,
  },
]

export type SecretFinding = {
  patternId: string
  description: string
  /** 1-based line number within the scanned text. */
  line: number
}

/**
 * Findings are reported by pattern and line only. The matched text is never
 * returned, because a scanner that echoes what it found would leak the value
 * into the very report that is meant to be safe to publish.
 */
export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  const lines = text.split("\n")
  lines.forEach((content, index) => {
    for (const { id, description, pattern } of secretPatterns) {
      if (new RegExp(pattern.source, pattern.flags.replace("g", "")).test(content)) {
        findings.push({ patternId: id, description, line: index + 1 })
      }
    }
  })
  return findings
}

export function containsSecret(text: string): boolean {
  return scanForSecrets(text).length > 0
}
