/**
 * Two independent Supabase clients race through the production claim against
 * a disposable PostgreSQL database and real PostgREST. Resend is mocked.
 * This does not connect to the DEV or Production projects, and it does not
 * read or change case PR-26-RZYCE4.
 */
import { execFile as execFileCb, spawn, type ChildProcess } from "node:child_process"
import { createHmac } from "node:crypto"
import { createServer as createNetServer } from "node:net"
import { createServer, request as httpRequest } from "node:http"
import { existsSync, readdirSync } from "node:fs"
import { mkdtemp, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { retryStoredIntakeMail, type CaseIntakeRpcResult } from "@/lib/cases/intake"
import { buildIntakeSnapshot } from "@/lib/cases/snapshot"
import type { EnquiryInput } from "@/lib/enquiry"
import type { EnquiryProvider } from "@/lib/enquiry-provider"
import type { Database } from "@/lib/supabase/database"

vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

const execFile = promisify(execFileCb)
const pgRoot = "/usr/lib/postgresql"
const pgBin = existsSync(pgRoot)
  ? readdirSync(pgRoot).sort().reverse().map(version => join(pgRoot, version, "bin")).find(dir => existsSync(join(dir, "initdb")))
  : undefined
const postgrestBin = ["/usr/local/bin/postgrest", "/usr/bin/postgrest"].find(path => existsSync(path))
const jwtSecret = "intake-mail-claim-test-secret-32b"

const caseInput = {
  fullName: "Alex Example",
  email: "alex@example.com",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  phone: "",
  service: "profile-recovery",
  websiteUrl: "",
  businessProfileUrl: "",
  reviewUrl: "",
  details: "The profile was suspended on Monday.",
  informationAccurate: true,
  privacyAccepted: true,
  source: "get-help",
  subject: "",
} satisfies EnquiryInput

const emailConfig = {
  apiKey: "re_test_key",
  fromEmail: "enquiries@example.com",
  toEmail: "owner@example.com",
  sendCustomerAck: false,
  ready: true,
} as const

const liveColumns = `
ALTER TABLE public.communications ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE public.communications ADD COLUMN monitoring_request_id uuid;
ALTER TABLE public.communications ADD CONSTRAINT communications_exactly_one_parent
  CHECK (num_nonnulls(case_id, monitoring_request_id) = 1);
ALTER TABLE public.communications
  ADD COLUMN lifecycle text,
  ADD COLUMN delivery_status text,
  ADD COLUMN template_key text,
  ADD COLUMN template_version integer,
  ADD COLUMN content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN record_version integer NOT NULL DEFAULT 1,
  ADD COLUMN content_locked boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT communications_lifecycle_check CHECK (
    lifecycle IS NULL OR lifecycle IN ('DRAFT', 'REVIEWED', 'QUEUED', 'CANCELLED')
  ),
  ADD CONSTRAINT communications_delivery_check CHECK (
    delivery_status IS NULL OR delivery_status IN (
      'NONE', 'ACCEPTANCE_UNKNOWN', 'PROVIDER_ACCEPTED', 'DELIVERED',
      'BOUNCED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE', 'COMPLAINED', 'SUPPRESSED', 'FAILED'
    )
  ),
  ADD CONSTRAINT communications_template_check CHECK (
    (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
    OR (lifecycle IS NOT NULL AND template_key IN ('EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT') AND template_version >= 1)
  ),
  ADD CONSTRAINT communications_content_version_check CHECK (content_version >= 1 AND record_version >= 1);

CREATE SCHEMA IF NOT EXISTS admin_private;
CREATE FUNCTION admin_private.protect_communication_snapshot_v1() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifecycle IS NULL THEN RETURN NEW; END IF;
  IF OLD.content_locked IS TRUE AND NEW.recipient IS DISTINCT FROM OLD.recipient THEN
    RAISE EXCEPTION 'Reviewed communication snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER communications_protect_snapshot
  BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_communication_snapshot_v1();

CREATE TABLE public.intake_mail_test_flags (pause_claim boolean NOT NULL DEFAULT false);
INSERT INTO public.intake_mail_test_flags VALUES (false);
CREATE FUNCTION public.pause_intake_claim() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.metadata->>'intakeState' = 'sending'
     AND OLD.metadata->>'intakeClaim' IS NULL
     AND (SELECT pause_claim FROM public.intake_mail_test_flags) THEN
    PERFORM pg_sleep(0.15);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER communications_pause_intake_claim
  BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public.pause_intake_claim();

CREATE SEQUENCE public.fail_accepted_budget;
SELECT setval('public.fail_accepted_budget', 100);
CREATE FUNCTION public.fail_first_accepted_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'SENT' AND nextval('public.fail_accepted_budget') = 1 THEN
    RAISE EXCEPTION 'accepted write failed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER communications_fail_first_accepted_write
  BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public.fail_first_accepted_write();

GRANT SELECT, UPDATE ON public.intake_mail_test_flags TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.fail_accepted_budget TO service_role;
`

type Client = SupabaseClient<Database>
type MailRow = { status: string; provider_message_id: string | null; metadata: Record<string, unknown> }

let root = ""
let dataDir = ""
let socketDir = ""
let pgPort = 0
let postgrestPort = 0
let proxyPort = 0
let postgrest: ChildProcess | null = null
let proxy: ReturnType<typeof createServer> | null = null
let caseId = ""
let publicRef = ""
let communicationId = ""
const seenUrls: string[] = []

function serviceToken() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "service_role", exp: 2_000_000_000 })}`
  return `${body}.${createHmac("sha256", jwtSecret).update(body).digest("base64url")}`
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createNetServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

async function psql(sql: string) {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", String(pgPort), "-U", "postgres", "-d", "intake_mail",
    "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql,
  ])
  return result.stdout.trim()
}

function uuidLine(value: string) {
  return value.split("\n").map(line => line.trim()).find(line => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(line)) ?? ""
}

async function psqlFile(path: string) {
  await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", String(pgPort), "-U", "postgres", "-d", "intake_mail",
    "-v", "ON_ERROR_STOP=1", "-f", path,
  ])
}

function client(): Client {
  return createClient<Database>(`http://127.0.0.1:${proxyPort}`, serviceToken(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function intake(id: string): CaseIntakeRpcResult {
  return {
    case_id: caseId,
    public_ref: publicRef,
    case_type: "PROFILE_RECOVERY",
    customer_id: caseId,
    business_id: caseId,
    location_id: caseId,
    customer_communication_id: id,
    internal_communication_id: null,
    was_existing: true,
    customer_communication_status: "FAILED",
    internal_communication_status: null,
    intake_snapshot: buildIntakeSnapshot(caseInput),
    customer_communication_recipient: "alex@example.com",
    internal_communication_recipient: null,
  }
}

function deliveryOptions(supabase: Client, send: EnquiryProvider["send"]): Parameters<typeof retryStoredIntakeMail>[1] {
  return {
    supabaseClient: supabase,
    loadIntake: async () => intake(communicationId),
    audit: async () => {},
    provider: { send },
    emailConfig,
    nodeEnv: "production",
  }
}

async function readRow(): Promise<MailRow> {
  const { data, error } = await client().from("communications")
    .select("status, provider_message_id, metadata")
    .eq("id", communicationId)
    .single()
  if (error || !data) throw new Error("claim row was not readable")
  return data as MailRow
}

describe.skipIf(!pgBin || !postgrestBin)("intake mail claim against PostgREST", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "intake-mail-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    pgPort = await freePort()
    postgrestPort = await freePort()
    proxyPort = await freePort()
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${pgPort} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", String(pgPort), "-U", "postgres", "intake_mail"])
    await psql("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;")
    await psqlFile(new URL("../../supabase/migrations/20260915120000_core_data_foundation_v1.sql", import.meta.url).pathname)
    await psql(liveColumns)
    const seeded = await psql(`
      WITH customer AS (
        INSERT INTO public.customers (full_name, email) VALUES ('Alex Example', 'alex@example.com') RETURNING id
      ), business AS (
        INSERT INTO public.businesses (display_name) VALUES ('Harbour Bakery') RETURNING id
      ), location AS (
        INSERT INTO public.locations (business_id, country)
        SELECT id, 'United Kingdom' FROM business RETURNING id, business_id
      )
      INSERT INTO public.cases (case_type, customer_id, business_id, location_id, issue_description)
      SELECT 'PROFILE_RECOVERY', customer.id, location.business_id, location.id, 'Historical profile issue.'
      FROM customer, location
      RETURNING id || '|' || public_ref
    `)
    const seededLine = seeded.split("\n").map(line => line.trim()).find(line => line.includes("|")) ?? ""
    const [seededId, seededRef] = seededLine.split("|")
    caseId = seededId ?? ""
    publicRef = seededRef ?? ""
    expect(publicRef).toMatch(/^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/)

    postgrest = spawn(postgrestBin!, [], {
      env: {
        ...process.env,
        PGRST_DB_URI: `postgresql://postgres@/intake_mail?host=${socketDir}&port=${pgPort}`,
        PGRST_DB_SCHEMAS: "public",
        PGRST_DB_ANON_ROLE: "service_role",
        PGRST_JWT_SECRET: jwtSecret,
        PGRST_SERVER_PORT: String(postgrestPort),
        PGRST_SERVER_HOST: "127.0.0.1",
      },
      stdio: "ignore",
    })
    proxy = createServer((req, res) => {
      const url = req.url ?? "/"
      seenUrls.push(url)
      const path = url.replace(/^\/rest\/v1/, "") || "/"
      const headers = { ...req.headers }
      delete headers.host
      const upstream = httpRequest({
        hostname: "127.0.0.1",
        port: postgrestPort,
        path,
        method: req.method,
        headers,
      }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      })
      upstream.on("error", () => {
        res.writeHead(502)
        res.end()
      })
      req.pipe(upstream)
    })
    await new Promise<void>((resolve, reject) => {
      proxy!.once("error", reject)
      proxy!.listen(proxyPort, "127.0.0.1", () => resolve())
    })
    const deadline = Date.now() + 10000
    let ready = false
    while (Date.now() < deadline) {
      const { error } = await client().from("communications").select("id").limit(1)
      if (!error) {
        ready = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!ready) throw new Error("PostgREST did not become ready")
  }, 120000)

  afterAll(async () => {
    await new Promise<void>(resolve => {
      if (!proxy) return resolve()
      proxy.close(() => resolve())
    })
    postgrest?.kill()
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await import("node:fs/promises").then(fs => fs.rm(root, { recursive: true, force: true }))
    }
  })

  beforeEach(async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("RESEND_API_KEY", "")
    seenUrls.length = 0
    await psql("update public.intake_mail_test_flags set pause_claim = false")
    await psql("select setval('public.fail_accepted_budget', 100)")
    await psql("delete from public.communications")
    communicationId = uuidLine(await psql(`
      insert into public.communications (case_id, communication_type, recipient, status, metadata)
      values ('${caseId}', 'CASE_RECEIVED_CUSTOMER', 'alex@example.com', 'FAILED', '{}'::jsonb)
      returning id
    `))
    expect(communicationId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it("lets one of two independent clients send, and records the PostgREST null-claim predicate", async () => {
    await psql("update public.intake_mail_test_flags set pause_claim = true")
    const send = vi.fn<EnquiryProvider["send"]>(async () => ({ ok: true, id: "provider-accepted-1" }))
    const identity = { caseId, publicRef }
    const [first, second] = await Promise.all([
      retryStoredIntakeMail(identity, deliveryOptions(client(), send)),
      retryStoredIntakeMail(identity, deliveryOptions(client(), send)),
    ])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0].idempotencyKey).toBe(`case-intake:${communicationId}`)
    expect([first.receiptEmailStatus, second.receiptEmailStatus].sort()).toEqual(["sent", "unavailable"])
    const row = await readRow()
    expect(row.status).toBe("SENT")
    expect(row.provider_message_id).toBe("provider-accepted-1")
    expect(row.metadata.intakeState).toBe("accepted")
    expect(seenUrls.some(url => url.includes("metadata-%3E%3EintakeClaim=is.null"))).toBe(true)
    send.mockClear()
    await Promise.all([
      retryStoredIntakeMail(identity, deliveryOptions(client(), send)),
      retryStoredIntakeMail(identity, deliveryOptions(client(), send)),
    ])
    expect(send).not.toHaveBeenCalled()
  }, 20000)

  it("keeps the claim after a provider error and does not send again", async () => {
    const send = vi.fn<EnquiryProvider["send"]>(async () => ({ ok: false, reason: "error" }))
    const identity = { caseId, publicRef }
    const first = await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    const row = await readRow()
    expect(first.receiptEmailStatus).toBe("unavailable")
    expect(row.status).toBe("FAILED")
    expect(row.provider_message_id).toBeNull()
    expect(row.metadata.intakeState).toBe("unknown")
    expect(typeof row.metadata.intakeClaim).toBe("string")
    const second = await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    expect(second.receiptEmailStatus).toBe("unavailable")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("allows another attempt after a definite rejection and stops at the third", async () => {
    const send = vi.fn<EnquiryProvider["send"]>(async () => ({ ok: false, reason: "rejected" }))
    const identity = { caseId, publicRef }
    await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    const rejected = await readRow()
    expect(rejected.metadata.intakeState).toBe("rejected")
    expect(rejected.metadata.intakeClaim).toBeNull()
    expect(rejected.metadata.intakeAttempts).toBe(1)
    await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    const exhausted = await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    expect(exhausted.receiptEmailStatus).toBe("unavailable")
    expect(send).toHaveBeenCalledTimes(3)
    expect((await readRow()).metadata.intakeAttempts).toBe(3)
  })

  it("does not send again when the provider accepts and the acceptance write fails", async () => {
    await psql("select setval('public.fail_accepted_budget', 1, false)")
    const send = vi.fn<EnquiryProvider["send"]>(async () => ({ ok: true, id: "provider-accepted-unknown" }))
    const identity = { caseId, publicRef }
    const first = await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    const row = await readRow()
    expect(first.receiptEmailStatus).toBe("unavailable")
    expect(row.status).toBe("FAILED")
    expect(row.provider_message_id).toBeNull()
    expect(row.metadata.intakeState).toBe("unknown")
    expect(typeof row.metadata.intakeClaim).toBe("string")
    const second = await retryStoredIntakeMail(identity, deliveryOptions(client(), send))
    expect(second.receiptEmailStatus).toBe("unavailable")
    expect(send).toHaveBeenCalledTimes(1)
  })
})
