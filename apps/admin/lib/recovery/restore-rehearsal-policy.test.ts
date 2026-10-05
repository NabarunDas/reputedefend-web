import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(
  new URL("../../../../.github/workflows/prod-db-restore-rehearsal.yml", import.meta.url),
  "utf8",
)

describe("production database restore rehearsal policy", () => {
  it("is manual-only and pins the approved throwaway project", () => {
    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).not.toContain("schedule:")
    expect(workflow).toContain("EXPECTED_TARGET_PROJECT_REF: mguynvowyhupycznwbyd")
    expect(workflow).toContain("PRODUCTION_PROJECT_REF: cxwwekdzkkjjbiyofrov")
    expect(workflow).toContain("Refusing to restore to the production Supabase project.")
  })

  it("uses the independent S3 backup and verifies it before restore", () => {
    expect(workflow).toContain("aws-actions/configure-aws-credentials@v6.3.0")
    expect(workflow).toContain('sha256sum "$archive"')
    expect(workflow).toContain('.migration_aligned == true')
    expect(workflow).toContain('source_project_ref == $source')
  })

  it("refuses a non-empty target and uses transactional Supabase restore order", () => {
    expect(workflow).toContain("Restore target is not empty")
    expect(workflow).toContain("--single-transaction")
    expect(workflow).toContain("--file /restore/roles.sql")
    expect(workflow).toContain("--file /restore/schema.sql")
    expect(workflow).toContain('SET session_replication_role = replica')
    expect(workflow).toContain("--file /restore/data.sql")
    expect(workflow).toContain("--file /restore/history_schema.sql")
    expect(workflow).toContain("--file /restore/history_data.sql")
  })

  it("requires the restore secret to point to the approved Session pooler", () => {
    expect(workflow).toContain("RESTORE_SUPABASE_DB_URL")
    expect(workflow).toContain('RESTORE_DB_URL" != *"$EXPECTED_TARGET_PROJECT_REF"*')
    expect(workflow).toContain('RESTORE_DB_URL" != *":5432/postgres"*')
  })
})
