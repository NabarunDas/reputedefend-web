import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, migrationSql, preparePlatform } from "../recovery/harness"

const migration = "20261004080853_customer_portal_messages_account_v1.sql"
const db = new PGlite()

const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const sam = "77777777-7777-4777-8777-777777777777"
const pat = "99999999-9999-4999-8999-999999999999"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const samAuth = "88888888-8888-4888-8888-888888888888"
const patAuth = "99999999-9999-4999-8999-999999999991"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const alexCase = "55555555-5555-4555-8555-555555555555"
const samCase = "55555555-5555-4555-8555-555555555556"
const patCase = "55555555-5555-4555-8555-555555555557"

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const alias = () => randomBytes(16).toString("hex")

type Thread = {
  selector: string
  subject: string
  caseReference?: string
  businessName?: string
  locationName?: string
  activityAt: string
  state: string
  preview: string
}
type Entry = { role: string; at: string; subject?: string; body: string; delivery?: string }
type MessagePage = { threads: Thread[]; complete: boolean; nextCursor?: { activityAt: string; selector: string } }
type MessageDetail = { found: boolean; thread?: Thread & { entries: Entry[]; complete: boolean } }
type Account = { name: string; email: string; phone?: string; emailVerified: boolean; phoneVerified: boolean }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}
async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}
async function selector(prefix: "mc-" | "mm-", id: string) {
  return (await rows<{ value: string }>(
    "select admin_private.customer_portal_message_selector_v1($1, $2::uuid) as value",
    [prefix, id],
  ))[0].value
}
async function releaseCooldown(email: string) {
  await db.query(
    `update admin_private.customer_portal_login_rate r
     set last_requested_at = now() - interval '61 seconds',
         window_started_at = case
           when r.send_count >= 5 then now() - interval '31 minutes'
           else least(r.window_started_at, now() - interval '61 seconds')
         end
     from public.customers c
     where c.id = r.customer_id and lower(c.email) = $1`,
    [email],
  )
}
async function portalSession(email: string, authUser: string) {
  await releaseCooldown(email)
  const pending = hash(token())
  await rpc("customer_portal_begin_login_v1", [email, pending])
  await rpc("customer_portal_confirm_otp_sent_v1", [pending])
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(finished.status)
  return sessionHash
}
async function verifyEmail(id: string, email: string) {
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email',$2,$3,$4)
     on conflict (customer_id, channel) do update set verified_value = excluded.verified_value, verified_by = excluded.verified_by, evidence = excluded.evidence`,
    [id, email, admin, "Verified from a live call with the customer."],
  )
}
async function openCase(id: string, customerId: string) {
  await db.query(
    `insert into public.cases(id, case_type, customer_id, business_id, location_id, issue_description, information_accurate_at, privacy_accepted_at, service_track)
     values ($1,'PROFILE_RECOVERY',$2,$3,$4,'Profile suspended',now(),now(),'MANAGED')`,
    [id, customerId, business, location],
  )
  return (await rows<{ public_ref: string }>("select public_ref from public.cases where id = $1", [id]))[0].public_ref
}
async function conversation(state: string, caseId: string | null, customerId: string | null, subject: string, extra = "") {
  const id = randomUUID()
  await db.query(
    `insert into public.conversations(id, state, case_id, customer_id, business_id, location_id, assigned_admin_id, reply_alias, subject, needs_attention, unmatched_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)`,
    [id, state, caseId, customerId, caseId ? business : null, caseId ? location : null, admin, alias(), subject, extra || null],
  )
  return id
}
async function outbound(input: {
  caseId: string
  customerId: string | null
  conversationId?: string | null
  subject: string
  body: string | null
  html?: string | null
  lifecycle: string
  delivery: string
  locked: boolean
  at?: string | null
  providerMessageId?: string | null
  rfc?: string | null
}) {
  const id = randomUUID()
  await db.query(
    `insert into public.communications(
      id, case_id, customer_id, conversation_id, communication_type, direction, recipient, subject, status,
      lifecycle, delivery_status, template_key, template_version, body_text, body_html, content_locked,
      sender_address, queued_at, provider_accepted_at, delivered_at, provider, provider_message_id, rfc_message_id
    ) values (
      $1,$2,$3,$4,'CASE_UPDATE','OUTBOUND','alex@example.com',$5,'SENT',
      $6,$7,'CASE_UPDATE',1,$8,$9,$10,
      'hidden-sender@profilerelaunch.test',$11,$12,$13,$14,$15,$16
    )`,
    [
      id, input.caseId, input.customerId, input.conversationId ?? null, input.subject,
      input.lifecycle, input.delivery, input.body, input.html ?? null, input.locked,
      input.lifecycle === "QUEUED" ? input.at ?? "2026-09-01T12:00:00Z" : null,
      input.delivery === "PROVIDER_ACCEPTED" || input.delivery === "DELIVERED" ? input.at ?? "2026-09-01T12:00:00Z" : null,
      input.delivery === "DELIVERED" ? input.at ?? "2026-09-01T12:00:00Z" : null,
      input.providerMessageId ? "resend" : null,
      input.providerMessageId ?? null,
      input.rfc ?? null,
    ],
  )
  return id
}
async function inbound(input: {
  conversationId: string
  sender: string
  body: string
  html?: string | null
  status?: string
  loop?: string
  match?: string
  at?: string
  kind?: string
  subject?: string
}) {
  const id = randomUUID()
  const email = input.kind === "PHONE_NOTE"
  await db.query(
    `insert into public.conversation_messages(
      id, conversation_id, kind, import_status, provider, provider_email_id, sender_address, subject,
      body_text, body_html_source, received_at, sender_match, loop_class, rfc_message_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      input.conversationId,
      input.kind ?? "INBOUND_EMAIL",
      input.status ?? "IMPORTED",
      email ? null : "resend",
      email ? null : randomUUID(),
      email ? null : input.sender,
      email ? null : input.subject ?? "Re: About your case",
      input.body,
      input.html ?? null,
      input.at ?? "2026-09-03T12:00:00Z",
      input.match ?? "NONE",
      input.loop ?? "NONE",
      email ? null : `<${randomUUID()}@mail.test>`,
    ],
  )
  return id
}

const secrets = [
  "DRAFT_SECRET_BODY",
  "REVIEWED_SECRET_BODY",
  "CANCELLED_SECRET_BODY",
  "BOUNCED_SECRET_BODY",
  "UNKNOWN_ACCEPTANCE_SECRET",
  "FAILED_SECRET_BODY",
  "HTML_ONLY_SECRET",
  "PHONE_NOTE_SECRET",
  "LOOP_SECRET_BODY",
  "REJECTED_SECRET_BODY",
  "THIRD_PARTY_SECRET",
  "SECRET_HTML_SOURCE",
  "HIDDEN_UNMATCHED_BODY",
  "MISMATCHED_CUSTOMER_BODY",
  "hidden-sender@profilerelaunch.test",
  "secret-bucket-name",
  "secret/storage/key/path",
  "att-provider-secret",
  "needs-attention-marker",
  "msg_provider_secret_id",
  "rfc-secret-outbound@mail.test",
  "SAM_ONLY_BODY",
  admin,
  alex,
  sam,
]

let alexSession = ""
let samSession = ""
let patSession = ""
let alexRef = ""
let alexConversation = ""
let samConversation = ""
let closedConversation = ""
let phoneOnlyConversation = ""
let deliveredId = ""
let acceptedId = ""
let standaloneId = ""

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now()),
      ('${patAuth}', 'pat@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.customers(id, full_name, email, phone) values
      ('${alex}', 'Alex Customer', 'alex@example.com', '+447700900111'),
      ('${sam}', 'Sam Customer', 'sam@example.com', '+447700900222'),
      ('${pat}', 'Pat Customer', 'pat@example.com', null);
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
  await verifyEmail(alex, "alex@example.com")
  await verifyEmail(sam, "sam@example.com")
  await verifyEmail(pat, "pat@example.com")
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'phone','+447700900111',$2,'Phone confirmed on a live call with the customer.')`,
    [alex, admin],
  )
  alexRef = await openCase(alexCase, alex)
  await openCase(samCase, sam)
  await openCase(patCase, pat)
  alexConversation = await conversation("OPEN", alexCase, alex, "About your case", "needs-attention-marker")
  samConversation = await conversation("OPEN", samCase, sam, "About your case")
  closedConversation = await conversation("CLOSED", alexCase, alex, "Earlier case note")
  phoneOnlyConversation = await conversation("OPEN", alexCase, alex, "Phone only")
  const unmatched = await conversation("UNMATCHED", null, null, "Unmatched mail")

  deliveredId = await outbound({
    caseId: alexCase, customerId: alex, conversationId: alexConversation, subject: "About your case",
    body: "PLAIN_UPDATE_BODY", html: "<p>SECRET_HTML_SOURCE</p>", lifecycle: "QUEUED", delivery: "DELIVERED",
    locked: true, at: "2026-09-01T12:00:00Z", providerMessageId: "msg_provider_secret_id", rfc: "<rfc-secret-outbound@mail.test>",
  })
  acceptedId = await outbound({
    caseId: alexCase, customerId: alex, conversationId: alexConversation, subject: "About your case",
    body: "ACCEPTED_UPDATE_BODY", lifecycle: "QUEUED", delivery: "PROVIDER_ACCEPTED", locked: true, at: "2026-09-02T12:00:00Z",
    providerMessageId: "msg_accepted_only",
  })
  standaloneId = await outbound({
    caseId: alexCase, customerId: null, subject: "A note from ProfileRelaunch",
    body: "STANDALONE_UPDATE_BODY", lifecycle: "QUEUED", delivery: "DELIVERED", locked: true, at: "2026-09-04T12:00:00Z",
    providerMessageId: "msg_standalone",
  })
  await outbound({
    caseId: alexCase, customerId: alex, conversationId: closedConversation, subject: "Earlier case note",
    body: "CLOSED_THREAD_BODY", lifecycle: "QUEUED", delivery: "DELIVERED", locked: true, at: "2026-08-01T12:00:00Z",
    providerMessageId: "msg_closed_conversation",
  })
  await outbound({
    caseId: samCase, customerId: sam, conversationId: samConversation, subject: "About your case",
    body: "SAM_ONLY_BODY", lifecycle: "QUEUED", delivery: "DELIVERED", locked: true, at: "2026-09-05T12:00:00Z",
    providerMessageId: "msg_sam_only",
  })
  for (const hidden of [
    { body: "DRAFT_SECRET_BODY", lifecycle: "DRAFT", delivery: "NONE", locked: false },
    { body: "REVIEWED_SECRET_BODY", lifecycle: "REVIEWED", delivery: "NONE", locked: true },
    { body: "CANCELLED_SECRET_BODY", lifecycle: "CANCELLED", delivery: "NONE", locked: true },
    { body: "BOUNCED_SECRET_BODY", lifecycle: "QUEUED", delivery: "BOUNCED", locked: true },
    { body: "UNKNOWN_ACCEPTANCE_SECRET", lifecycle: "QUEUED", delivery: "ACCEPTANCE_UNKNOWN", locked: true },
    { body: "FAILED_SECRET_BODY", lifecycle: "QUEUED", delivery: "FAILED", locked: true },
  ]) {
    await outbound({
      caseId: alexCase, customerId: alex, conversationId: alexConversation, subject: "About your case",
      lifecycle: hidden.lifecycle, delivery: hidden.delivery, locked: hidden.locked, body: hidden.body,
    })
  }
  await outbound({
    caseId: alexCase, customerId: alex, conversationId: alexConversation, subject: "About your case",
    body: null, html: "<p>HTML_ONLY_SECRET</p>", lifecycle: "QUEUED", delivery: "DELIVERED", locked: true,
    providerMessageId: "msg_html_only",
  })
  await outbound({
    caseId: alexCase, customerId: sam, conversationId: alexConversation, subject: "About your case",
    body: "MISMATCHED_CUSTOMER_BODY", lifecycle: "QUEUED", delivery: "DELIVERED", locked: true,
    providerMessageId: "msg_mismatched_customer",
  })
  await outbound({
    caseId: alexCase, customerId: alex, conversationId: unmatched, subject: "Unmatched mail",
    body: "HIDDEN_UNMATCHED_BODY", lifecycle: "QUEUED", delivery: "DELIVERED", locked: true,
    providerMessageId: "msg_unmatched",
  })
  const visibleInbound = await inbound({
    conversationId: alexConversation, sender: "alex@example.com", body: "Thanks, this is my reply.",
    html: "<p>SECRET_HTML_SOURCE</p>", match: "MATCHES_VERIFIED_CONTACT", at: "2026-09-03T12:00:00Z",
  })
  await inbound({
    conversationId: alexConversation, sender: "other.person@example.com", body: "THIRD_PARTY_SECRET",
    match: "MATCHES_VERIFIED_CONTACT",
  })
  await inbound({ conversationId: alexConversation, sender: "alex@example.com", body: "LOOP_SECRET_BODY", status: "LOOP", loop: "OWNED_SENDER" })
  await inbound({ conversationId: alexConversation, sender: "alex@example.com", body: "REJECTED_SECRET_BODY", status: "REJECTED" })
  await inbound({ conversationId: alexConversation, sender: "alex@example.com", body: "PHONE_NOTE_SECRET", kind: "PHONE_NOTE" })
  await inbound({ conversationId: phoneOnlyConversation, sender: "alex@example.com", body: "PHONE_NOTE_SECRET", kind: "PHONE_NOTE" })
  await db.query(
    `insert into public.conversation_attachments(
      message_id, conversation_id, provider_attachment_id, original_filename, declared_mime, size_bytes,
      storage_bucket, storage_key, ingestion_status, scan_status, validation_status
    ) values ($1,$2,'att-provider-secret','note.txt','text/plain',12,'secret-bucket-name','secret/storage/key/path','STORED','PENDING','PENDING')`,
    [visibleInbound, alexConversation],
  )
  for (let index = 0; index < 21; index += 1) {
    await outbound({
      caseId: patCase, customerId: pat, subject: "Paged note",
      body: `page-item-${String(index).padStart(2, "0")}`, lifecycle: "QUEUED", delivery: "DELIVERED", locked: true,
      at: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00Z`, providerMessageId: `msg_page_${index}`,
    })
  }
  alexSession = await portalSession("alex@example.com", alexAuth)
  samSession = await portalSession("sam@example.com", samAuth)
  patSession = await portalSession("pat@example.com", patAuth)
}, 180000)

afterAll(async () => { await db.close() })

function leak(value: unknown) {
  const serialised = JSON.stringify(value)
  expect(serialised).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  for (const secret of secrets) expect(serialised).not.toContain(secret)
  expect(serialised).not.toMatch(/\b(read|seen|opened)\b/i)
  expect(serialised).not.toMatch(/\bYou\b/)
  expect(serialised).not.toContain("MATCHES_VERIFIED_CONTACT")
  expect(serialised).not.toMatch(/authenticated sender|confirmed sender|confirmed customer|verified sender|sent by you/i)
  expect(serialised).not.toMatch(/PROVIDER_ACCEPTED|DELIVERED|DRAFT|REVIEWED|PHONE_NOTE|INBOUND_EMAIL|needs_attention|reply_alias/)
  return serialised
}

describe("customer portal messages", () => {
  it("shows only the signed-in customer's visible communication", async () => {
    const alexView = await rpc<MessagePage>("customer_portal_messages_v1", [alexSession, null, null])
    const samView = await rpc<MessagePage>("customer_portal_messages_v1", [samSession, null, null])
    expect(alexView.threads.map(item => item.preview)).toEqual([
      "STANDALONE_UPDATE_BODY",
      "Thanks, this is my reply.",
      "CLOSED_THREAD_BODY",
    ])
    expect(alexView.complete).toBe(true)
    expect(alexView.nextCursor).toBeUndefined()
    expect(alexView.threads[0]).toMatchObject({
      selector: await selector("mm-", standaloneId),
      subject: "A note from ProfileRelaunch",
      caseReference: alexRef,
      businessName: "Harbour Bakery",
      locationName: "High Street",
      state: "Message from ProfileRelaunch",
    })
    expect(alexView.threads[1]).toMatchObject({
      selector: await selector("mc-", alexConversation),
      subject: "Re: About your case",
      state: "Open conversation",
      caseReference: alexRef,
      businessName: "Harbour Bakery",
      locationName: "High Street",
    })
    expect(alexView.threads[2].state).toBe("Previous conversation")
    expect(samView.threads).toHaveLength(1)
    expect(samView.threads[0].preview).toBe("SAM_ONLY_BODY")
    expect(samView.threads[0].businessName).toBe("Harbour Bakery")
    expect(samView.threads[0].locationName).toBe("High Street")
    leak(alexView)
    expect(await rpc("customer_portal_message_v1", [alexSession, samView.threads[0].selector])).toEqual({ found: false })
    const guessed = await selector("mc-", randomUUID())
    expect(await rpc("customer_portal_message_v1", [alexSession, guessed])).toEqual({ found: false })
    expect(await rpc("customer_portal_message_v1", [alexSession, await selector("mc-", phoneOnlyConversation)])).toEqual({ found: false })
  })

  it("shows customer-safe thread entries and factual delivery wording", async () => {
    const detail = await rpc<MessageDetail>("customer_portal_message_v1", [alexSession, await selector("mc-", alexConversation)])
    expect(detail.found).toBe(true)
    expect(detail.thread?.complete).toBe(true)
    expect(detail.thread?.entries.map(item => item.body)).toEqual([
      "PLAIN_UPDATE_BODY",
      "ACCEPTED_UPDATE_BODY",
      "Thanks, this is my reply.",
    ])
    expect(detail.thread?.entries[0]).toMatchObject({ role: "ProfileRelaunch", delivery: "Delivered by email" })
    expect(detail.thread?.entries[1]).toMatchObject({
      role: "ProfileRelaunch",
      delivery: "Accepted by the email provider. Delivery is not confirmed.",
    })
    expect(detail.thread?.subject).toBe("Re: About your case")
    expect(detail.thread?.entries[2]).toMatchObject({
      role: "From your verified email address",
      body: "Thanks, this is my reply.",
    })
    expect(detail.thread?.entries[2].delivery).toBeUndefined()
    expect(detail.thread?.entries[1].delivery).not.toMatch(/delivered/i)
    leak(detail)
    expect(deliveredId).toBeTruthy()
    expect(acceptedId).toBeTruthy()
  })

  it("uses a visible subject and omits an outbound whose case parent disagrees", async () => {
    const otherCase = randomUUID()
    await openCase(otherCase, alex)
    const secretConversation = await conversation("OPEN", alexCase, alex, "THIRD_PARTY_SUBJECT_SECRET")
    await inbound({
      conversationId: secretConversation,
      sender: "other.person@example.com",
      subject: "THIRD_PARTY_SUBJECT_SECRET",
      body: "THIRD_PARTY_SECRET",
      at: "2026-09-08T12:00:00Z",
    })
    await outbound({
      caseId: alexCase,
      customerId: alex,
      conversationId: secretConversation,
      subject: "Visible case update",
      body: "VISIBLE_CASE_UPDATE_BODY",
      lifecycle: "QUEUED",
      delivery: "DELIVERED",
      locked: true,
      at: "2026-09-07T12:00:00Z",
      providerMessageId: "msg_visible_case_update",
    })
    await outbound({
      caseId: otherCase,
      customerId: alex,
      conversationId: secretConversation,
      subject: "MISPARENTED_SUBJECT_SECRET",
      body: "MISPARENTED_BODY_SECRET",
      lifecycle: "QUEUED",
      delivery: "DELIVERED",
      locked: true,
      at: "2026-09-09T12:00:00Z",
      providerMessageId: "msg_misparented_case",
    })
    const list = await rpc<MessagePage>("customer_portal_messages_v1", [alexSession, null, null])
    const listed = list.threads.find(item => item.preview === "VISIBLE_CASE_UPDATE_BODY")
    expect(listed).toMatchObject({
      selector: await selector("mc-", secretConversation),
      subject: "Visible case update",
      state: "Open conversation",
    })
    const detail = await rpc<MessageDetail>(
      "customer_portal_message_v1",
      [alexSession, listed?.selector ?? ""],
    )
    expect(detail.found).toBe(true)
    expect(detail.thread?.subject).toBe("Visible case update")
    expect(detail.thread?.entries.map(item => item.body)).toEqual(["VISIBLE_CASE_UPDATE_BODY"])
    const serialised = `${JSON.stringify(list)}\n${JSON.stringify(detail)}`
    expect(serialised).not.toContain("THIRD_PARTY_SUBJECT_SECRET")
    expect(serialised).not.toContain("MISPARENTED_SUBJECT_SECRET")
    expect(serialised).not.toContain("MISPARENTED_BODY_SECRET")
    expect(serialised).not.toContain("THIRD_PARTY_SECRET")
    leak(list)
    leak(detail)
  })

  it("keeps a delivered message after the case is closed and still refuses a new send", async () => {
    await db.query("update public.cases set status = 'CLOSED', closed_at = now() where id = $1", [alexCase])
    try {
      const detail = await rpc<MessageDetail>("customer_portal_message_v1", [alexSession, await selector("mc-", alexConversation)])
      expect(detail.thread?.entries.some(item => item.body === "PLAIN_UPDATE_BODY")).toBe(true)
      await expect(outbound({
        caseId: alexCase, customerId: alex, subject: "Too late", body: "SHOULD_NOT_INSERT",
        lifecycle: "QUEUED", delivery: "DELIVERED", locked: true, providerMessageId: "msg_after_close",
      })).rejects.toThrow(/closed_case_send_refused/)
    } finally {
      await db.query("update public.cases set status = 'RECEIVED', closed_at = null where id = $1", [alexCase])
    }
  })

  it("fails closed for a bad, expired, revoked, or stale session", async () => {
    expect(await rpc("customer_portal_messages_v1", [hash(token()), null, null])).toBeNull()
    expect(await rpc("customer_portal_message_v1", [hash(token()), await selector("mc-", alexConversation)])).toBeNull()
    expect(await rpc("customer_portal_account_v1", [hash(token())])).toBeNull()
    expect(await rpc("customer_portal_messages_v1", [alexSession, "2026-09-04T12:00:00Z", null])).toBeNull()
    const expired = await portalSession("alex@example.com", alexAuth)
    await db.query(
      `update admin_private.customer_portal_sessions
       set authenticated_at = now() - interval '3 hours', created_at = now() - interval '3 hours', expires_at = now() - interval '1 minute'
       where token_hash = $1`,
      [expired],
    )
    expect(await rpc("customer_portal_messages_v1", [expired, null, null])).toBeNull()
    const revoked = await portalSession("alex@example.com", alexAuth)
    await db.query(
      "update admin_private.customer_portal_sessions set revoked_at = now(), revocation_reason = 'test' where token_hash = $1",
      [revoked],
    )
    expect(await rpc("customer_portal_message_v1", [revoked, await selector("mm-", standaloneId)])).toBeNull()
    try {
      await db.query("update public.customers set email = 'alex.moved@example.com' where id = $1", [alex])
      await verifyEmail(alex, "alex.moved@example.com")
      await db.query("update auth.users set email = 'alex.moved@example.com' where id = $1", [alexAuth])
      expect(await rpc("customer_portal_messages_v1", [alexSession, null, null])).toBeNull()
      expect(await rpc("customer_portal_account_v1", [alexSession])).toBeNull()
      const moved = await portalSession("alex.moved@example.com", alexAuth)
      const movedView = await rpc<MessagePage>("customer_portal_messages_v1", [moved, null, null])
      expect(JSON.stringify(movedView)).not.toContain("Thanks, this is my reply.")
      await inbound({
        conversationId: alexConversation, sender: "alex.moved@example.com", body: "MOVED_ADDRESS_REPLY", at: "2026-09-06T12:00:00Z",
      })
      const after = await rpc<MessageDetail>("customer_portal_message_v1", [moved, await selector("mc-", alexConversation)])
      expect(after.thread?.entries.some(item => item.body === "MOVED_ADDRESS_REPLY")).toBe(true)
      expect(after.thread?.entries.some(item => item.body === "Thanks, this is my reply.")).toBe(false)
    } finally {
      await db.query("update public.customers set email = 'alex@example.com' where id = $1", [alex])
      await verifyEmail(alex, "alex@example.com")
      await db.query("update auth.users set email = 'alex@example.com' where id = $1", [alexAuth])
    }
    const restored = await rpc<MessageDetail>("customer_portal_message_v1", [alexSession, await selector("mc-", alexConversation)])
    expect(restored.thread?.entries.some(item => item.body === "Thanks, this is my reply.")).toBe(true)
    expect(JSON.stringify(restored)).not.toContain("MOVED_ADDRESS_REPLY")
  })

  it("pages a bounded history in a stable order and does not call a short page complete", async () => {
    const first = await rpc<MessagePage>("customer_portal_messages_v1", [patSession, null, null])
    expect(first.complete).toBe(false)
    expect(first.threads).toHaveLength(20)
    expect(first.threads[0].preview).toBe("page-item-20")
    expect(first.threads[19].preview).toBe("page-item-01")
    expect(first.nextCursor).toEqual({ activityAt: first.threads[19].activityAt, selector: first.threads[19].selector })
    const second = await rpc<MessagePage>("customer_portal_messages_v1", [patSession, first.nextCursor?.activityAt, first.nextCursor?.selector])
    expect(second.complete).toBe(true)
    expect(second.threads.map(item => item.preview)).toEqual(["page-item-00"])
    expect(second.nextCursor).toBeUndefined()
    const again = await rpc<MessagePage>("customer_portal_messages_v1", [patSession, null, null])
    expect(again.threads.map(item => item.selector)).toEqual(first.threads.map(item => item.selector))
  })

  it("says a long thread is incomplete instead of returning every entry", async () => {
    const bulk = await conversation("OPEN", alexCase, alex, "Long thread")
    for (let index = 0; index < 51; index += 1) {
      await outbound({
        caseId: alexCase, customerId: alex, conversationId: bulk, subject: "Long thread",
        body: `bulk-${String(index).padStart(2, "0")}`, lifecycle: "QUEUED", delivery: "DELIVERED", locked: true,
        at: new Date(Date.UTC(2026, 5, 1, index)).toISOString(),
        providerMessageId: `msg_bulk_${index}`,
      })
    }
    const detail = await rpc<MessageDetail>("customer_portal_message_v1", [alexSession, await selector("mc-", bulk)])
    expect(detail.found).toBe(true)
    expect(detail.thread?.complete).toBe(false)
    expect(detail.thread?.entries).toHaveLength(50)
    const bodies = detail.thread?.entries.map(item => item.body) ?? []
    expect(bodies).not.toContain("bulk-00")
    expect(bodies.at(-1)).toBe("bulk-50")
    expect(bodies[0]).toBe("bulk-01")
  })

  it("does not add a customer compose command or a message table", async () => {
    const sql = migrationSql(migration)
    expect(sql).not.toMatch(/create table/i)
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on/i)
    expect(sql).not.toMatch(/execute\s+['$]/i)
    expect(sql).not.toMatch(/\bformat\s*\(/i)
    expect(sql).not.toMatch(/admin_record_save_v1|admin_contact_verify_v1|draft_reply/)
    expect(await rows<{ n: number }>(
      `select count(*)::int as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where proname in ('customer_portal_message_command_v1','customer_portal_account_command_v1','customer_portal_compose_v1')`,
    )).toEqual([{ n: 0 }])
    expect(await rows<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema = 'public' and table_name in ('portal_messages','messages','support_tickets')",
    )).toEqual([])
  })
})

describe("customer portal account", () => {
  it("derives the signed-in customer and hides internal identity", async () => {
    const alexAccount = await rpc<Account>("customer_portal_account_v1", [alexSession])
    const samAccount = await rpc<Account>("customer_portal_account_v1", [samSession])
    const patAccount = await rpc<Account>("customer_portal_account_v1", [patSession])
    expect(alexAccount).toEqual({
      name: "Alex Customer",
      email: "alex@example.com",
      phone: "+447700900111",
      emailVerified: true,
      phoneVerified: true,
    })
    expect(samAccount).toEqual({
      name: "Sam Customer",
      email: "sam@example.com",
      phone: "+447700900222",
      emailVerified: true,
      phoneVerified: false,
    })
    expect(patAccount).toEqual({
      name: "Pat Customer",
      email: "pat@example.com",
      emailVerified: true,
      phoneVerified: false,
    })
    expect(JSON.stringify(alexAccount)).not.toContain("22222222")
    expect(JSON.stringify(alexAccount)).not.toContain("Verified from a live call")
    expect(JSON.stringify(alexAccount)).not.toContain(admin)
    expect(JSON.stringify(alexAccount)).not.toContain("+447700900222")
    expect(await rpc("customer_portal_account_v1", [hash(token())])).toBeNull()
  })

  it("signs out only the current portal session", async () => {
    const current = await portalSession("alex@example.com", alexAuth)
    const other = await portalSession("sam@example.com", samAuth)
    expect(await rpc("customer_portal_sign_out_v1", [current])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_portal_account_v1", [current])).toBeNull()
    expect(await rpc("customer_portal_messages_v1", [current, null, null])).toBeNull()
    expect(await rpc<Account>("customer_portal_account_v1", [other])).toMatchObject({ email: "sam@example.com" })
    expect(await rpc<Account>("customer_portal_account_v1", [alexSession])).toMatchObject({ email: "alex@example.com" })
    const stored = await rows<{ revoked_at: string | null }>(
      "select revoked_at from admin_private.customer_portal_sessions where token_hash = $1",
      [current],
    )
    expect(stored[0].revoked_at).toBeTruthy()
  })
})

describe("portal message privileges", () => {
  const publicFns = [
    "public.customer_portal_messages_v1(text,timestamp with time zone,text)",
    "public.customer_portal_message_v1(text,text)",
    "public.customer_portal_account_v1(text)",
  ]
  const privateFns = [
    "admin_private.customer_portal_message_selector_v1(text,uuid)",
    "admin_private.customer_portal_outbound_visible_v1(public.communications,uuid)",
    "admin_private.customer_portal_inbound_visible_v1(public.conversation_messages,uuid)",
    "admin_private.customer_portal_message_threads_v1(uuid)",
    "admin_private.customer_portal_message_entries_v1(uuid,uuid,uuid)",
  ]

  async function canExecute(role: string, signature: string) {
    return (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
  }

  it("lets service_role execute only the public portal functions", async () => {
    for (const role of ["public", "anon", "authenticated"]) {
      for (const signature of [...publicFns, ...privateFns]) expect(await canExecute(role, signature)).toBe(false)
    }
    for (const signature of publicFns) expect(await canExecute("service_role", signature)).toBe(true)
    for (const signature of privateFns) expect(await canExecute("service_role", signature)).toBe(false)
  })
})
