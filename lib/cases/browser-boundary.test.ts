import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const clientFiles = [
  "../../components/case-intake-form.tsx",
  "../../components/enquiry-form.tsx",
  "../../components/contact-form.tsx",
  "../../components/header.tsx",
  "../../components/honeypot-field.tsx",
  "../../components/analytics-consent.tsx",
  "../../components/analytics-root.tsx",
  "../../components/google-analytics.tsx",
]

describe("browser modules", () => {
  it("do not import Supabase keys or the server case-intake path", () => {
    for (const relative of clientFiles) {
      const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")
      expect(source, relative).not.toMatch(/SUPABASE_SECRET_KEY|SUPABASE_URL|createSupabaseServerClient/)
      expect(source, relative).not.toMatch(/CASE_PERSISTENCE_ENABLED|persistGetHelpCase|create_case_intake_v1/)
      expect(source, relative).not.toMatch(/NEXT_PUBLIC_SUPABASE/)
    }
  })
})
