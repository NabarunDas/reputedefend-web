import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { findMigration, manifestFilenames } from "./manifest"

const root = new URL("../../../../", import.meta.url)
const scriptPath = "supabase/dev-only/dev_ledger_reconcile_guided_pack_and_outcome_v1.sql"
const packName = "20261031120000_guided_pack_ready_dispatch_v1.sql"
const outcomeName = "20261031140000_guided_customer_outcome_v1.sql"
const packHash = "90fb457505352f538ca5553a90d940939e653e912d9dfb4889e0b54fd6d0fd11"
const outcomeHash = "3f22f59c86b5bed9b67f96165910fc19c981bd9151a789533d34f1540e390d9c"

function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8")
}

function between(text: string, openTag: string, closeTag: string): string {
  const start = text.indexOf(openTag)
  const end = text.indexOf(closeTag, start + openTag.length)
  return text.slice(start + openTag.length, end)
}

function executableRemainder(script: string, pack: string, outcome: string): string {
  const embeddedPack = between(script, "$pr_dev_ledger_pack_source$", "$pr_dev_ledger_pack_source$;")
  const embeddedOutcome = between(script, "$pr_dev_ledger_outcome_source$", "$pr_dev_ledger_outcome_source$;")
  expect(embeddedPack).toBe(pack)
  expect(embeddedOutcome).toBe(outcome)
  const withoutSources = script
    .replace("$pr_dev_ledger_pack_source$" + pack + "$pr_dev_ledger_pack_source$", "")
    .replace("$pr_dev_ledger_outcome_source$" + outcome + "$pr_dev_ledger_outcome_source$", "")
  return withoutSources
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .join("\n")
}

const fixture = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS admin_private;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

-- PGlite has no pgcrypto. This fixture answers extensions.digest(bytea, text)
-- only for the two repository files. Any other payload hashes as zeroes, so a
-- changed embed fails the script's reviewed-hash guard. DEV itself uses
-- pgcrypto in the extensions schema; this stand-in is not part of the script.
CREATE TABLE admin_private.ledger_reconcile_digest_fixture (
  id integer PRIMARY KEY,
  payload bytea NOT NULL,
  digest bytea NOT NULL
);
CREATE FUNCTION extensions.digest(source_bytes bytea, algorithm text)
RETURNS bytea
LANGUAGE plpgsql
AS $$
DECLARE
  found bytea;
BEGIN
  IF algorithm IS DISTINCT FROM 'sha256' THEN
    RAISE EXCEPTION 'fixture digest only implements sha256';
  END IF;
  SELECT fixture.digest INTO found
  FROM admin_private.ledger_reconcile_digest_fixture fixture
  WHERE fixture.payload = source_bytes;
  IF found IS NULL THEN
    RETURN decode(repeat('00', 32), 'hex');
  END IF;
  RETURN found;
END
$$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES
  ('20261030130000', 'guided_assessment_pack_basis_v1', ARRAY['earlier-basis']::text[]),
  ('20261030200000', 'guided_payment_request_after_acceptance_v1', ARRAY['earlier-payment']::text[]);

CREATE TABLE admin_private.dev_mail_dispatch_activation (
  id integer PRIMARY KEY,
  active_from timestamptz
);
CREATE TABLE admin_private.jobs (
  id integer PRIMARY KEY,
  status text,
  job_type text
);
CREATE TABLE admin_private.dev_mail_pack_retry_http (
  id smallint PRIMARY KEY CHECK (id = 1),
  request_id bigint NOT NULL,
  requested_at timestamptz NOT NULL
);
ALTER TABLE admin_private.dev_mail_pack_retry_http ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.case_documents (id uuid PRIMARY KEY);
CREATE TABLE public.guided_customer_reports (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  submitted_on date,
  google_reference text,
  task_id uuid,
  outcome text,
  decided_on date,
  evidence_document_id uuid,
  CONSTRAINT guided_customer_reports_kind_check CHECK (kind IN ('CORRECTION', 'GOOGLE_SUBMISSION', 'GOOGLE_OUTCOME')),
  CONSTRAINT guided_customer_reports_shape_check CHECK (
    kind = 'GOOGLE_OUTCOME' OR kind IN ('CORRECTION', 'GOOGLE_SUBMISSION')
  ),
  CONSTRAINT guided_customer_reports_evidence_fk FOREIGN KEY (evidence_document_id) REFERENCES public.case_documents(id)
);

CREATE FUNCTION admin_private.dev_mail_pack_send_reason_v1(uuid) RETURNS text
LANGUAGE sql AS $$ SELECT 'ledger-reconcile-stub'::text $$;
CREATE FUNCTION admin_private.dev_mail_lease_queued_send_v1(uuid, text, boolean) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION admin_private.dev_mail_pack_retry_due_v1() RETURNS TABLE(communication_id uuid, pack_id uuid)
LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::uuid WHERE false $$;
CREATE FUNCTION public.dev_mail_dispatch_claim_pack_retry_v1(text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION admin_private.dev_mail_pack_retry_wake_credentials_v1(text, text, text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION public.dev_mail_pack_retry_recovery_v1() RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION admin_private.dev_mail_pack_retry_wake_v1() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER dev_mail_pack_retry_wake
  AFTER UPDATE OF status ON admin_private.jobs
  FOR EACH ROW EXECUTE FUNCTION admin_private.dev_mail_pack_retry_wake_v1();

CREATE FUNCTION public.customer_portal_case_documents_v1(text, text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION admin_private.fulfilment_snapshot_reason_v1(uuid, text, text, text, text, text) RETURNS text
LANGUAGE sql AS $$ SELECT 'ledger-reconcile-stub'::text $$;
CREATE FUNCTION public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION admin_private.customer_portal_case_timeline_v1(uuid, uuid) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;
CREATE FUNCTION public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"ledger-reconcile-stub":true}'::jsonb $$;

REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_send_reason_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.dev_mail_lease_queued_send_v1(uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_retry_due_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_pack_retry_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_retry_wake_credentials_v1(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dev_mail_pack_retry_recovery_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_retry_wake_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.customer_portal_case_documents_v1(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_private.fulfilment_snapshot_reason_v1(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_private.customer_portal_case_timeline_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_pack_retry_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_pack_retry_recovery_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_case_documents_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb) TO service_role;
`

async function expectRefusal(db: PGlite, sql: string, pattern: RegExp) {
  await expect(db.exec(sql)).rejects.toThrow(pattern)
  await db.exec("ROLLBACK")
}

async function database(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(fixture)
  await db.query(
    "INSERT INTO admin_private.ledger_reconcile_digest_fixture(id, payload, digest) VALUES (1, convert_to($1, 'UTF8'), decode($2, 'hex')), (2, convert_to($3, 'UTF8'), decode($4, 'hex'))",
    [read(`supabase/migrations/${packName}`), packHash, read(`supabase/migrations/${outcomeName}`), outcomeHash],
  )
  return db
}

describe("the DEV ledger reconciliation script", () => {
  const script = read(scriptPath)
  const pack = read(`supabase/migrations/${packName}`)
  const outcome = read(`supabase/migrations/${outcomeName}`)

  it("embeds both repository files unchanged while the manifest records them as applied", () => {
    expect(createHash("sha256").update(pack).digest("hex")).toBe(packHash)
    expect(createHash("sha256").update(outcome).digest("hex")).toBe(outcomeHash)
    expect(script).toContain(packHash)
    expect(script).toContain(outcomeHash)
    expect(between(script, "$pr_dev_ledger_pack_source$", "$pr_dev_ledger_pack_source$;")).toBe(pack)
    expect(between(script, "$pr_dev_ledger_outcome_source$", "$pr_dev_ledger_outcome_source$;")).toBe(outcome)
    expect(manifestFilenames()).not.toContain(scriptPath)
    expect(manifestFilenames()).not.toContain("dev_ledger_reconcile_guided_pack_and_outcome_v1.sql")
    expect(findMigration(packName)).toMatchObject({ appliedToDev: true, safeToReplay: false })
    expect(findMigration(outcomeName)).toMatchObject({ appliedToDev: true, safeToReplay: false })
  })

  it("has no executable replay and writes only the two new history rows", () => {
    const remainder = executableRemainder(script, pack, outcome)
    for (const token of [
      "CREATE FUNCTION",
      "CREATE OR REPLACE",
      "CREATE TABLE",
      "CREATE TRIGGER",
      "ALTER TABLE",
      "GRANT ",
      "REVOKE ",
      "DROP ",
      "UPDATE ",
      "DELETE ",
      "NOTIFY",
      "cron.schedule",
      "cron.unschedule",
      "net.http",
      "EXECUTE FUNCTION",
    ]) {
      expect(remainder, token).not.toContain(token)
    }
    const inserts = [...remainder.matchAll(/INSERT INTO\s+([^\s(]+)/g)].map(match => match[1])
    expect(inserts).toEqual([
      "supabase_migrations.schema_migrations",
      "supabase_migrations.schema_migrations",
    ])
  })

  it("records both statements once and leaves earlier history, grants, and stubs unchanged", async () => {
    const db = await database()
    await db.exec(script)
    await db.exec(script)
    const recorded = await db.query<{
      version: string
      name: string
      statement_count: number
      statement_bytes: number
      statement_sha256: string
      hash_matches_reviewed_source: boolean
      statement: string
    }>(`
      SELECT version,
             name,
             array_length(statements, 1) AS statement_count,
             octet_length(convert_to(statements[1], 'UTF8')) AS statement_bytes,
             encode(extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex') AS statement_sha256,
             encode(extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex') = CASE version
               WHEN '20261031120000' THEN '${packHash}'
               WHEN '20261031140000' THEN '${outcomeHash}'
             END AS hash_matches_reviewed_source,
             statements[1] AS statement
      FROM supabase_migrations.schema_migrations
      WHERE version IN ('20261031120000', '20261031140000')
      ORDER BY version
    `)
    expect(recorded.rows).toMatchObject([
      {
        version: "20261031120000",
        name: "guided_pack_ready_dispatch_v1",
        statement_count: 1,
        statement_bytes: Buffer.byteLength(pack),
        statement_sha256: packHash,
        hash_matches_reviewed_source: true,
        statement: pack,
      },
      {
        version: "20261031140000",
        name: "guided_customer_outcome_v1",
        statement_count: 1,
        statement_bytes: Buffer.byteLength(outcome),
        statement_sha256: outcomeHash,
        hash_matches_reviewed_source: true,
        statement: outcome,
      },
    ])
    const earlier = await db.query<{ version: string; name: string; statement: string }>(`
      SELECT version, name, statements[1] AS statement
      FROM supabase_migrations.schema_migrations
      WHERE version < '20261031120000'
      ORDER BY version
    `)
    expect(earlier.rows).toEqual([
      { version: "20261030130000", name: "guided_assessment_pack_basis_v1", statement: "earlier-basis" },
      { version: "20261030200000", name: "guided_payment_request_after_acceptance_v1", statement: "earlier-payment" },
    ])
    const bodies = await db.query<{ body: string }>(`
      SELECT pg_get_functiondef('public.dev_mail_dispatch_claim_pack_v1(uuid, text)'::regprocedure) AS body
      UNION ALL
      SELECT pg_get_functiondef('public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb)'::regprocedure)
    `)
    expect(bodies.rows.every(row => row.body.includes("ledger-reconcile-stub"))).toBe(true)
    expect(await db.query("SELECT count(*)::int AS n FROM admin_private.dev_mail_dispatch_activation")).toMatchObject({
      rows: [{ n: 0 }],
    })
    await db.close()
  })

  it("rolls back when the predecessor is missing and does not insert either version", async () => {
    const db = await database()
    await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261030200000'")
    await expectRefusal(db, script, /predecessor 20261030200000 is not recorded/)
    const versions = await db.query<{ version: string }>(
      "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
    )
    expect(versions.rows.map(row => row.version)).toEqual(["20261030130000"])
    await db.close()
  })

  it("refuses a different stored statement and does not change earlier history", async () => {
    const db = await database()
    await db.exec(`
      INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
      VALUES ('20261031120000', 'guided_pack_ready_dispatch_v1', ARRAY['different statement']::text[])
    `)
    await expectRefusal(db, script, /20261031120000 is already recorded with different history/)
    const rows = await db.query<{ version: string; statement: string }>(`
      SELECT version, statements[1] AS statement
      FROM supabase_migrations.schema_migrations
      ORDER BY version
    `)
    expect(rows.rows).toEqual([
      { version: "20261030130000", statement: "earlier-basis" },
      { version: "20261030200000", statement: "earlier-payment" },
      { version: "20261031120000", statement: "different statement" },
    ])
    await db.close()
  })

  it("refuses an unexpected version between the predecessor and the two canonical rows", async () => {
    const db = await database()
    await db.exec(`
      INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
      VALUES ('20261031130000', 'something_else_v1', ARRAY['not these files']::text[])
    `)
    await expectRefusal(db, script, /an unexpected version follows 20261030200000/)
    const versions = await db.query<{ version: string }>(
      "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
    )
    expect(versions.rows.map(row => row.version)).toEqual([
      "20261030130000",
      "20261030200000",
      "20261031130000",
    ])
    await db.close()
  })

  it("refuses to record history when a reviewed routine is absent", async () => {
    const db = await database()
    await db.exec("DROP FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text)")
    await expectRefusal(db, script, /pack dispatch objects are not fully installed/)
    const count = await db.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations
      WHERE version IN ('20261031120000', '20261031140000')
    `)
    expect(count.rows[0].n).toBe(0)
    const earlier = await db.query<{ statement: string }>(`
      SELECT statements[1] AS statement FROM supabase_migrations.schema_migrations
      WHERE version = '20261030200000'
    `)
    expect(earlier.rows[0].statement).toBe("earlier-payment")
    await db.close()
  })
})
