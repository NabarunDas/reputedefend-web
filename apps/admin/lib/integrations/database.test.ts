import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { encryptTokenPayload } from "../../../../lib/google-business-profile/token-crypto"
import { hashOAuthState, issueOAuthState } from "../../../../lib/google-business-profile/oauth"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const sessionBinding = createHash("sha256").update("binding").digest("hex")
const redirectUri = "https://admin.example.com/api/integrations/google/callback"
const encryptionKey = "0123456789abcdef0123456789abcdef"

type Json = Record<string, unknown> & {
  status?: string
  reason?: string
  connection?: Record<string, unknown>
  connections?: Array<Record<string, unknown>>
  recentEvents?: Array<Record<string, unknown>>
  liveConnections?: number
  pendingConnects?: number
}

async function rpc(name: string, args: unknown[] = []): Promise<Json | null> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(",")
  return (await db.query<{ value: Json | null }>(`select public.${name}(${placeholders}) as value`, args)).rows[0].value
}

function command(operation: string, payload: Record<string, unknown>) {
  return rpc("admin_integration_command_v1", [token, key(), operation, payload])
}

function beginPayload(overrides: Record<string, unknown> = {}) {
  const issued = issueOAuthState({ now: new Date() })
  return {
    state: issued.state,
    payload: {
      stateHash: issued.stateHash,
      sessionBinding,
      redirectUri,
      expiresAt: issued.expiresAt,
      customerId: customer,
      ...overrides,
    },
  }
}

const encrypted = encryptTokenPayload({
  payload: { accessToken: "ya29.synthetic-access", refreshToken: "1//synthetic-refresh" },
  key: encryptionKey,
  keyVersion: "v1",
})

function storePayload(overrides: Record<string, unknown> = {}) {
  return {
    customerId: customer,
    accountRef: "accounts/1",
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  }
}

async function freshSession() {
  await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
}

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, dir), "utf8")
  const find = (suffix: string) => readdirSync(dir).find(n => n.endsWith(suffix))!
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)'; CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')'; CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';"))
  for (const name of [
    "20260916000000_relaunch_guard_data_foundation_v1.sql",
    "20260917080553_single_admin_auth_v1.sql",
    "20260917160740_admin_audit_foundation_v1.sql",
    "20260917183422_admin_client_workspace_v1.sql",
    find("_admin_enquiry_triage_v1.sql"),
    find("_admin_case_workflows_v1.sql"),
    find("_admin_evidence_foundation_v1.sql"),
    find("_admin_evidence_workspace_v1.sql"),
    find("_admin_prepared_packs_v1.sql"),
    find("_admin_customer_actions_v1.sql"),
    find("_customer_case_pack_access_v1.sql"),
    find("_customer_evidence_upload_v1.sql"),
    find("_jobs_outbox_operational_health_v1.sql"),
    find("_communications_outgoing_mail_v1.sql"),
    find("_incoming_mail_conversations_v1.sql"),
    find("_catalogue_quotes_orders_v1.sql"),
    find("_stripe_payments_v1.sql"),
    find("_guard_onboarding_activation_v1.sql"),
    find("_guard_subscriptions_billing_v1.sql"),
    find("_guard_manual_checks_v1.sql"),
    find("_guard_alerts_escalation_v1.sql"),
    find("_admin_dashboard_search_reports_v1.sql"),
    find("_admin_settings_privacy_operations_v1.sql"),
    find("_google_integration_readiness_v1.sql"),
  ]) await db.exec(read(name))
  await db.exec(`insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    alter table public.admin_identity disable trigger admin_identity_protect;
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
    alter table public.admin_identity enable trigger admin_identity_protect;
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email,phone) values('${customer}','Alex Baker','alex@example.com','+441234567890');`)
}, 180000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.provider_connection_events disable trigger provider_connection_events_protect;
    delete from public.provider_connection_events;
    alter table public.provider_connection_events enable trigger provider_connection_events_protect;
    alter table public.provider_connections disable trigger provider_connections_protect;
    delete from public.provider_connections;
    alter table public.provider_connections enable trigger provider_connections_protect;
    alter table public.provider_oauth_states disable trigger provider_oauth_states_protect;
    delete from public.provider_oauth_states;
    alter table public.provider_oauth_states enable trigger provider_oauth_states_protect;
    alter table public.admin_audit_events disable trigger admin_audit_immutable;
    delete from public.admin_audit_events;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;`)
  await freshSession()
})

describe("provider oauth state storage", () => {
  it("records only the state hash and never the state itself", async () => {
    const { state, payload } = beginPayload()
    expect((await command("begin_connect", payload))?.status).toBe("success")
    const rows = await db.query<{ state_hash: string }>("select state_hash from public.provider_oauth_states")
    expect(rows.rows[0].state_hash).toBe(hashOAuthState(state))
    const dump = JSON.stringify(rows.rows)
    expect(dump).not.toContain(state)
  })

  it("rejects a malformed hash, a non-https redirect and an implausible expiry", async () => {
    const { payload } = beginPayload()
    expect((await command("begin_connect", { ...payload, stateHash: "nope" }))?.status).toBe("invalid")
    expect((await command("begin_connect", { ...payload, redirectUri: "http://admin.example.com/cb" }))?.reason).toBe("redirect_uri")
    expect((await command("begin_connect", { ...payload, expiresAt: new Date(Date.now() - 1000).toISOString() }))?.reason).toBe("expiry")
    expect((await command("begin_connect", { ...payload, expiresAt: new Date(Date.now() + 7_200_000).toISOString() }))?.reason).toBe("expiry")
  })

  it("accepts a correct callback exactly once and refuses the replay", async () => {
    const { state, payload } = beginPayload()
    await command("begin_connect", payload)
    const consume = { stateHash: hashOAuthState(state), sessionBinding, redirectUri }
    expect((await command("consume_state", consume))?.status).toBe("accepted")
    expect(await command("consume_state", consume)).toMatchObject({ status: "rejected", reason: "state_replayed" })
  })

  it("rejects a forged state without creating anything", async () => {
    const forged = issueOAuthState({ now: new Date() })
    expect(await command("consume_state", { stateHash: forged.stateHash, sessionBinding, redirectUri }))
      .toMatchObject({ status: "rejected", reason: "state_unknown" })
    expect(await command("consume_state", { stateHash: "short", sessionBinding, redirectUri }))
      .toMatchObject({ status: "rejected", reason: "state_malformed" })
  })

  it("rejects an expired state and still consumes it", async () => {
    const { state, payload } = beginPayload()
    await command("begin_connect", payload)
    // Ageing the row needs the trigger off precisely because the trigger
    // refuses to let an expiry be rewritten in normal operation.
    await db.exec(`alter table public.provider_oauth_states disable trigger provider_oauth_states_protect;
      update public.provider_oauth_states set created_at = now() - interval '1 hour', expires_at = now() - interval '1 minute';
      alter table public.provider_oauth_states enable trigger provider_oauth_states_protect;`)
    expect(await command("consume_state", { stateHash: hashOAuthState(state), sessionBinding, redirectUri }))
      .toMatchObject({ status: "rejected", reason: "state_expired" })
    const row = await db.query<{ consumed_at: string | null; outcome: string }>(
      "select consumed_at, outcome from public.provider_oauth_states",
    )
    expect(row.rows[0].consumed_at).not.toBeNull()
    expect(row.rows[0].outcome).toBe("REJECTED")
  })

  it("rejects a callback from a different session or a different redirect", async () => {
    for (const [field, value, reason] of [
      ["sessionBinding", createHash("sha256").update("other").digest("hex"), "context_mismatch"],
      ["redirectUri", "https://admin.example.com/other", "redirect_mismatch"],
    ] as const) {
      const { state, payload } = beginPayload()
      await command("begin_connect", payload)
      const consume = { stateHash: hashOAuthState(state), sessionBinding, redirectUri, [field]: value }
      expect(await command("consume_state", consume), field).toMatchObject({ status: "rejected", reason })
    }
  })

  it("refuses to rewrite a consumed state or delete a live one", async () => {
    const { state, payload } = beginPayload()
    await command("begin_connect", payload)
    await expect(db.query("delete from public.provider_oauth_states")).rejects.toThrow(/live OAuth state/)
    await command("consume_state", { stateHash: hashOAuthState(state), sessionBinding, redirectUri })
    await expect(db.query("update public.provider_oauth_states set outcome = 'ACCEPTED'")).rejects.toThrow(/single use/)
  })
})

describe("provider connection storage", () => {
  it("stores only encrypted material and never returns it", async () => {
    const result = await command("store_connection", storePayload())
    expect(result?.status).toBe("success")
    expect(JSON.stringify(result)).not.toMatch(/ya29\.|1\/\/|ciphertext|authTag|encryptionKeyVersion/)
    expect(Object.keys(result!.connection!).sort()).toEqual([
      "businessId", "connectedAt", "customerId", "grantedScopes", "id", "lastErrorAt", "lastErrorCode",
      "lastSuccessAt", "locationId", "provider", "recordVersion", "revokedAt", "status", "tokenExpiresAt",
    ])
    const stored = await db.query<{ token_ciphertext: string }>("select token_ciphertext from public.provider_connections")
    expect(stored.rows[0].token_ciphertext).toBe(encrypted.ciphertext)
    expect(stored.rows[0].token_ciphertext).not.toContain("ya29.")
  })

  it("refuses a plaintext OAuth token offered as ciphertext", async () => {
    for (const plaintext of ["ya29.a-real-looking-access-token", "1//a-real-looking-refresh-token"]) {
      await expect(db.query(
        `insert into public.provider_connections(provider,customer_id,token_ciphertext,token_iv,token_auth_tag,encryption_key_version,created_by)
         values('GOOGLE_BUSINESS_PROFILE',$1,$2,'iv','tag','v1',$3)`,
        [customer, plaintext, uid],
      ), plaintext).rejects.toThrow(/ciphertext_opaque/)
    }
  })

  it("requires encrypted material and at least one granted scope", async () => {
    expect(await command("store_connection", storePayload({ ciphertext: "" })))
      .toMatchObject({ status: "invalid", reason: "encrypted_payload_required" })
    expect(await command("store_connection", storePayload({ scopes: [] })))
      .toMatchObject({ status: "invalid", reason: "scopes_required" })
  })

  it("supersedes an earlier live connection rather than keeping two", async () => {
    await command("store_connection", storePayload())
    await command("store_connection", storePayload())
    const rows = await db.query<{ status: string }>("select status from public.provider_connections order by connected_at")
    expect(rows.rows.map(row => row.status).sort()).toEqual(["CONNECTED", "REVOKED"])
  })

  it("keeps token material immutable and refuses to reopen a revoked connection", async () => {
    const created = await command("store_connection", storePayload())
    const id = created!.connection!.id as string
    await expect(db.query(
      "update public.provider_connections set token_ciphertext = 'swapped', record_version = record_version + 1 where id = $1",
      [id],
    )).rejects.toThrow(/immutable/)
    await expect(db.query("delete from public.provider_connections where id = $1", [id])).rejects.toThrow(/not deleted/)
    expect((await command("revoke_connection", { id, version: 1 }))?.status).toBe("success")
    await expect(db.query(
      "update public.provider_connections set status = 'CONNECTED', revoked_at = null, record_version = record_version + 1 where id = $1",
      [id],
    )).rejects.toThrow(/cannot be reopened/)
  })

  it("enforces the record version when revoking", async () => {
    const created = await command("store_connection", storePayload())
    const id = created!.connection!.id as string
    expect((await command("revoke_connection", { id, version: 9 }))?.status).toBe("conflict")
    expect((await command("revoke_connection", { id, version: 1 }))?.status).toBe("success")
  })

  it("records a normalised fault classification and nothing else", async () => {
    const created = await command("store_connection", storePayload())
    const id = created!.connection!.id as string
    const faulted = await command("record_fault", { id, code: "QUOTA_EXCEEDED" })
    expect(faulted?.connection).toMatchObject({ lastErrorCode: "QUOTA_EXCEEDED", status: "CONNECTED" })
    const revoked = await command("record_fault", { id, code: "AUTH_REVOKED" })
    expect(revoked?.connection).toMatchObject({ status: "REVOKED", lastErrorCode: "AUTH_REVOKED" })
  })

  it("moves a scope or permission failure to needs re-authorization", async () => {
    for (const code of ["INSUFFICIENT_SCOPE", "PERMISSION_DENIED"]) {
      await db.exec(`alter table public.provider_connection_events disable trigger provider_connection_events_protect;
        alter table public.provider_connections disable trigger provider_connections_protect;
        delete from public.provider_connections;
        alter table public.provider_connections enable trigger provider_connections_protect;
        alter table public.provider_connection_events enable trigger provider_connection_events_protect;`)
      const created = await command("store_connection", storePayload())
      const result = await command("record_fault", { id: created!.connection!.id as string, code })
      expect(result?.connection, code).toMatchObject({ status: "AUTH_REQUIRED", lastErrorCode: code })
    }
  })

  it("refuses an error code outside the normalised set", async () => {
    const created = await command("store_connection", storePayload())
    await expect(command("record_fault", { id: created!.connection!.id as string, code: "GOOGLE_SAID_NO" }))
      .rejects.toThrow()
  })
})

describe("provider connection history and audit", () => {
  it("writes an append-only event for each lifecycle change", async () => {
    const { state, payload } = beginPayload()
    await command("begin_connect", payload)
    await command("consume_state", { stateHash: hashOAuthState(state), sessionBinding, redirectUri })
    const created = await command("store_connection", storePayload())
    await command("disconnect_connection", { id: created!.connection!.id as string, version: 1 })
    const events = await db.query<{ kind: string }>("select kind from public.provider_connection_events order by id")
    expect(events.rows.map(row => row.kind)).toEqual([
      "CONNECTION_INITIATED", "CONNECTION_ESTABLISHED", "CONNECTION_DISCONNECTED",
    ])
    await expect(db.query("update public.provider_connection_events set kind = 'CONNECTION_ESTABLISHED'"))
      .rejects.toThrow(/append-only/)
    await expect(db.query("delete from public.provider_connection_events")).rejects.toThrow(/append-only/)
  })

  it("records a rejected callback without storing the reason as a secret", async () => {
    const forged = issueOAuthState({ now: new Date() })
    await command("consume_state", { stateHash: forged.stateHash, sessionBinding, redirectUri })
    const events = await db.query<{ kind: string; detail: string }>("select kind, detail from public.provider_connection_events")
    // An unknown state is rejected before any row exists, so nothing is logged.
    expect(events.rows).toEqual([])
    const { state, payload } = beginPayload()
    await command("begin_connect", payload)
    await command("consume_state", { stateHash: hashOAuthState(state), sessionBinding, redirectUri: "https://admin.example.com/other" })
    const after = await db.query<{ kind: string; detail: string }>(
      "select kind, detail from public.provider_connection_events where kind = 'CALLBACK_REJECTED'",
    )
    expect(after.rows[0]).toEqual({ kind: "CALLBACK_REJECTED", detail: "redirect_mismatch" })
  })

  it("audits the operation and outcome but never a code, token or ciphertext", async () => {
    const { state, payload } = beginPayload()
    await command("begin_connect", payload)
    await command("consume_state", { stateHash: hashOAuthState(state), sessionBinding, redirectUri })
    await command("store_connection", storePayload())
    const audit = await db.query<{ action: string; outcome: string; details: Record<string, unknown> }>(
      "select action, outcome, details from public.admin_audit_events order by created_at",
    )
    expect(audit.rows.map(row => row.action)).toEqual(["INTEGRATION_CHANGED", "INTEGRATION_CHANGED", "INTEGRATION_CHANGED"])
    // Integration statuses map onto the existing audit outcome vocabulary.
    expect(audit.rows.map(row => row.outcome)).toEqual(["success", "success", "success"])
    const dump = JSON.stringify(audit.rows)
    expect(dump).not.toMatch(/ya29\.|1\/\/|authorization-code/)
    expect(dump).not.toContain(state)
    expect(dump).not.toContain(encrypted.ciphertext)
    for (const row of audit.rows) {
      expect(Object.keys(row.details).sort()).toEqual(["operation", "provider"])
    }
  })

  it("reports Admin-safe integration status with no token material", async () => {
    const created = await command("store_connection", storePayload())
    await command("record_fault", { id: created!.connection!.id as string, code: "TRANSIENT_FAILURE" })
    const status = await rpc("admin_integration_status_v1", [token])
    expect(status?.liveConnections).toBe(1)
    expect(status?.connections).toHaveLength(1)
    expect(status?.recentEvents?.length).toBeGreaterThan(0)
    const dump = JSON.stringify(status)
    expect(dump).not.toMatch(/ya29\.|1\/\/|token_ciphertext|authTag|encryption_key_version/)
    expect(dump).not.toContain(encrypted.ciphertext)
    expect(dump).not.toContain(encryptionKey)
  })

  it("counts a pending connect and stops counting it once consumed", async () => {
    const { state, payload } = beginPayload()
    await command("begin_connect", payload)
    expect((await rpc("admin_integration_status_v1", [token]))?.pendingConnects).toBe(1)
    await command("consume_state", { stateHash: hashOAuthState(state), sessionBinding, redirectUri })
    expect((await rpc("admin_integration_status_v1", [token]))?.pendingConnects).toBe(0)
  })
})

describe("integration command access control", () => {
  it("refuses an unknown session", async () => {
    expect(await rpc("admin_integration_command_v1", ["b".repeat(64), key(), "begin_connect", beginPayload().payload]))
      .toMatchObject({ status: "unauthorized" })
    expect(await rpc("admin_integration_status_v1", ["b".repeat(64)])).toBeNull()
  })

  it("requires a fresh re-authentication", async () => {
    await db.query("update public.admin_sessions set created_at = now() - interval '30 minutes'")
    expect(await command("begin_connect", beginPayload().payload)).toMatchObject({ status: "reauth_required" })
    await freshSession()
    expect((await command("begin_connect", beginPayload().payload))?.status).toBe("success")
  })

  it("refuses an unknown operation and a missing request id", async () => {
    expect(await command("exchange_token", {})).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_integration_command_v1", [token, null, "begin_connect", beginPayload().payload]))
      .toMatchObject({ status: "invalid" })
  })

  it("keeps every integration function away from anon and authenticated", async () => {
    const grants = await db.query<{ routine_name: string; grantee: string }>(
      `select routine_name, grantee from information_schema.role_routine_grants
       where routine_schema in ('public','admin_private')
         and (routine_name like 'provider_%' or routine_name like 'admin_integration_%')`,
    )
    expect(grants.rows.filter(row => ["anon", "authenticated", "PUBLIC"].includes(row.grantee))).toEqual([])
    expect(grants.rows.filter(row => row.grantee === "service_role").map(row => row.routine_name).sort())
      .toEqual(["admin_integration_command_v1", "admin_integration_status_v1"])
  })

  it("keeps the new tables locked down with row level security", async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('provider_oauth_states','provider_connections','provider_connection_events')`,
    )
    expect(tables.rows.every(row => row.relrowsecurity)).toBe(true)
    const grants = await db.query<{ table_name: string; grantee: string }>(
      `select table_name, grantee from information_schema.role_table_grants
       where table_name in ('provider_oauth_states','provider_connections','provider_connection_events')
         and grantee in ('PUBLIC','anon','authenticated','service_role')`,
    )
    expect(grants.rows).toEqual([])
  })
})

describe("Guard is untouched by the Step 21 migration", () => {
  it("still refuses any capture method other than MANUAL", async () => {
    const check = await db.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition from pg_constraint
       where conrelid = 'public.guard_check_observations'::regclass and conname like '%capture_method%'`,
    )
    expect(check.rows.map(row => row.definition).join(" ")).toContain("'MANUAL'")
    expect(check.rows.map(row => row.definition).join(" ")).not.toContain("PROVIDER")
  })
})
