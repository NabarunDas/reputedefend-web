import { GetObjectTaggingCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider"
import { validateEvidenceBytes } from "../evidence/content"
import { GUARDDUTY_TAG, MAX_EVIDENCE_BYTES, fileExtension, isAllowedMime, mapGuardDutyStatus, rejectedExtensions, type AllowedMime, type ScanStatus } from "../evidence/model"
import { declaredUpload } from "../evidence/validation"
import { isMissingS3Object } from "../evidence/storage"
import type { EnvMap } from "../jobs/config"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"
import { communicationsInboundEnabled, inboundStorageConfig } from "./gate"

export const MAX_INBOUND_ATTACHMENT_BYTES = MAX_EVIDENCE_BYTES

export type InboundAttachmentBytes = {
  id: string
  filename?: string | null
  contentType?: string | null
  size?: number | null
  bytes: Uint8Array
}

export type InboundAttachmentProvider = {
  getReceivedAttachment(emailId: string, attachmentId: string): Promise<InboundAttachmentBytes | null>
}

export type InboundObjectStore = {
  bucket: string
  hasObject(key: string): Promise<boolean>
  putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  probeScan(key: string): Promise<ScanStatus>
}

type LoadedAttachment = {
  status?: string
  alreadyImported?: boolean
  stored?: boolean
  id?: string
  conversationId?: string
  messageId?: string
  providerAttachmentId?: string
  filename?: string
  mimeType?: string
  sizeBytes?: number
  storageBucket?: string | null
  storageKey?: string | null
  ingestionStatus?: string
}

export function inboundAttachmentObjectKey(conversationId: string, messageId: string, attachmentId: string): string {
  return `inbound/${conversationId}/${messageId}/${attachmentId}`
}

export function isOpaqueInboundAttachmentKey(key: string): boolean {
  return /^inbound\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
}

export function declaredInboundAttachment(filename: string, mimeType: string, sizeBytes: number): { filename: string; contentType: AllowedMime; size: number } | null {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_INBOUND_ATTACHMENT_BYTES) return null
  const extension = fileExtension(filename)
  if ((rejectedExtensions as readonly string[]).includes(extension) || !isAllowedMime(mimeType)) return null
  return declaredUpload(filename, mimeType, sizeBytes)
}

export function createDisabledInboundAttachmentProvider(): InboundAttachmentProvider {
  return { async getReceivedAttachment() { return null } }
}

export function createIdempotentInboundAttachmentProvider(
  files: Record<string, InboundAttachmentBytes>,
): InboundAttachmentProvider & { calls: number } {
  let calls = 0
  return {
    get calls() { return calls },
    async getReceivedAttachment(emailId, attachmentId) {
      calls += 1
      return files[`${emailId}:${attachmentId}`] ?? files[attachmentId] ?? null
    },
  }
}

export function resolveInboundAttachmentProvider(env: EnvMap = process.env, override?: InboundAttachmentProvider): InboundAttachmentProvider | "disabled" {
  if (override) return override
  if (!communicationsInboundEnabled(env)) return "disabled"
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) return "disabled"
  return createResendInboundAttachmentProvider(apiKey)
}

export type InboundAttachmentFailureCode = "oversized" | "malformed" | "unavailable" | "retryable"

export class InboundAttachmentError extends Error {
  constructor(readonly code: InboundAttachmentFailureCode) {
    super(code)
    this.name = "InboundAttachmentError"
  }
}

export type ResendAttachmentError = { message?: string; statusCode?: number | null; name?: string }

export function classifyResendAttachmentError(error: ResendAttachmentError | null | undefined): InboundAttachmentFailureCode {
  const status = error?.statusCode
  const name = (error?.name || "").toLowerCase()
  const message = error?.message || ""
  if (status === 429 || name === "rate_limit_exceeded" || name === "daily_quota_exceeded" || name === "monthly_quota_exceeded") {
    return "retryable"
  }
  if ((typeof status === "number" && status >= 500 && status <= 599) || name === "internal_server_error" || name === "application_error") {
    return "retryable"
  }
  if (/timeout|temporar|unavailable|unable to fetch|network|econnreset|etimedout|rate|429/i.test(message)) return "retryable"
  if (status === 404 || name === "not_found") return "unavailable"
  return "malformed"
}

export function classifyDownloadStatus(status: number): InboundAttachmentFailureCode | null {
  if (status === 429 || status >= 500) return "retryable"
  if (status === 404) return "unavailable"
  if (status >= 400) return "malformed"
  return null
}

export async function readBoundedAttachmentBytes(
  response: Response,
  maxBytes = MAX_INBOUND_ATTACHMENT_BYTES,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") || "")
  if (Number.isFinite(declared) && declared > maxBytes) throw new InboundAttachmentError("oversized")
  const reader = response.body?.getReader()
  if (!reader) throw new InboundAttachmentError("malformed")
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new InboundAttachmentError("oversized")
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof InboundAttachmentError) throw error
    throw new InboundAttachmentError("retryable")
  }
  if (total < 1) throw new InboundAttachmentError("malformed")
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

type ResendAttachmentClient = {
  emails: {
    receiving: {
      attachments: {
        get: (options: { emailId: string; id: string }) => Promise<{
          data?: { id?: string; filename?: string | null; content_type?: string; size?: number; download_url?: string } | null
          error?: ResendAttachmentError | null
        }>
      }
    }
  }
}

export function createResendInboundAttachmentProvider(
  apiKey: string,
  client?: ResendAttachmentClient,
  fetchImpl: typeof fetch = fetch,
): InboundAttachmentProvider {
  return {
    async getReceivedAttachment(emailId, attachmentId) {
      const resend = client ?? new (await import("resend")).Resend(apiKey)
      let result: Awaited<ReturnType<ResendAttachmentClient["emails"]["receiving"]["attachments"]["get"]>>
      try {
        result = await resend.emails.receiving.attachments.get({ emailId, id: attachmentId })
      } catch {
        throw new InboundAttachmentError("retryable")
      }
      if (result.error) throw new InboundAttachmentError(classifyResendAttachmentError(result.error))
      const data = result.data
      if (!data) throw new InboundAttachmentError("retryable")
      const url = data.download_url
      if (!url || !/^https:\/\//i.test(url)) throw new InboundAttachmentError("malformed")
      if (typeof data.size === "number" && data.size > MAX_INBOUND_ATTACHMENT_BYTES) {
        throw new InboundAttachmentError("oversized")
      }
      let response: Response
      try {
        response = await fetchImpl(url)
      } catch {
        throw new InboundAttachmentError("retryable")
      }
      const downloadFailure = classifyDownloadStatus(response.status)
      if (downloadFailure) throw new InboundAttachmentError(downloadFailure)
      const raw = await readBoundedAttachmentBytes(response)
      return {
        id: data.id || attachmentId,
        filename: data.filename,
        contentType: data.content_type,
        size: data.size,
        bytes: raw,
      }
    },
  }
}

export function createMemoryInboundStore(): InboundObjectStore & { uploads: number; objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  let uploads = 0
  return {
    bucket: "inbound-private-test",
    objects,
    get uploads() { return uploads },
    async hasObject(key) { return objects.has(key) },
    async putObject(key, bytes) {
      if (objects.has(key)) return
      objects.set(key, bytes)
      uploads += 1
    },
    async probeScan(key) { return objects.has(key) ? "NO_THREATS_FOUND" : "PENDING" },
  }
}

export function createInboundObjectStore(env: EnvMap = process.env, override?: InboundObjectStore): InboundObjectStore | "disabled" {
  if (override) return override
  const config = inboundStorageConfig(env)
  if (!config) return "disabled"
  const client = new S3Client({
    region: config.region,
    credentials: awsCredentialsProvider({ roleArn: config.roleArn, clientConfig: { region: config.region } }),
  })
  return {
    bucket: config.bucket,
    async hasObject(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
        return true
      } catch (error) {
        if (isMissingS3Object(error)) return false
        throw error
      }
    },
    async putObject(key, bytes, contentType) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
        return
      } catch (error) {
        if (!isMissingS3Object(error)) throw error
      }
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }))
    },
    async probeScan(key) {
      try {
        const result = await client.send(new GetObjectTaggingCommand({ Bucket: config.bucket, Key: key }))
        return mapGuardDutyStatus(result.TagSet?.find(item => item.Key === GUARDDUTY_TAG)?.Value)
      } catch (error) {
        if (isMissingS3Object(error)) return "PENDING"
        throw error
      }
    },
  }
}

function terminalFromScan(scan: ScanStatus, validation: "VALID" | "INVALID" | "ERROR"): { ingestionStatus: string; validationStatus: string; scanStatus: ScanStatus } | "pending" {
  if (scan === "PENDING") return "pending"
  if (scan === "NO_THREATS_FOUND" && validation === "VALID") {
    return { ingestionStatus: "CLEAN", validationStatus: "VALID", scanStatus: scan }
  }
  if (scan === "THREATS_FOUND") return { ingestionStatus: "MALWARE", validationStatus: "INVALID", scanStatus: scan }
  if (scan === "UNSUPPORTED") return { ingestionStatus: "UNSUPPORTED", validationStatus: "INVALID", scanStatus: scan }
  return { ingestionStatus: "FAILED", validationStatus: validation === "VALID" ? "ERROR" : validation, scanStatus: scan }
}

async function applyResult(
  rpc: NonNullable<JobHandlerInput["rpc"]>,
  attachmentId: string,
  payload: Record<string, unknown>,
  error: string,
): Promise<JobHandlerResult> {
  const marked = await rpc.rpc<{ status?: string }>("inbound_attachment_apply_v1", {
    p_payload: { attachmentId, ...payload },
  })
  if (marked?.status !== "success") return { ok: false, retryable: false, error }
  return { ok: true }
}

async function finishScan(
  rpc: NonNullable<JobHandlerInput["rpc"]>,
  store: InboundObjectStore,
  attachmentId: string,
  key: string,
): Promise<JobHandlerResult> {
  const terminal = terminalFromScan(await store.probeScan(key), "VALID")
  if (terminal === "pending") return { ok: false, retryable: true, error: "Inbound attachment scan is pending" }
  return applyResult(rpc, attachmentId, { ...terminal, operation: "mark_result" }, "Inbound attachment scan update failed")
}

export function importInboundAttachmentHandler(
  env: EnvMap = process.env,
  provider?: InboundAttachmentProvider | "disabled",
  store?: InboundObjectStore | "disabled",
): JobHandler {
  return {
    jobType: "IMPORT_INBOUND_ATTACHMENT",
    async execute(input: JobHandlerInput): Promise<JobHandlerResult> {
      const attachmentId = typeof input.payload.attachmentId === "string" ? input.payload.attachmentId : ""
      const emailId = typeof input.payload.providerEmailId === "string" ? input.payload.providerEmailId : ""
      const providerAttachmentId = typeof input.payload.providerAttachmentId === "string" ? input.payload.providerAttachmentId : ""
      if (!attachmentId || !emailId || !providerAttachmentId || !input.rpc) {
        return { ok: false, retryable: false, error: "Invalid inbound attachment job" }
      }
      const loaded = await input.rpc.rpc<LoadedAttachment>("inbound_attachment_load_import_v1", { p_attachment: attachmentId })
      if (loaded?.status !== "success" || !loaded.id || !loaded.conversationId || !loaded.messageId) {
        return { ok: false, retryable: false, error: "Inbound attachment is unavailable" }
      }
      if (loaded.alreadyImported) return { ok: true }
      const key = loaded.storageKey || inboundAttachmentObjectKey(loaded.conversationId, loaded.messageId, loaded.id)
      if (!isOpaqueInboundAttachmentKey(key)) return { ok: false, retryable: false, error: "Inbound attachment key is invalid" }
      const objectStore = store ?? createInboundObjectStore(env)
      if (objectStore === "disabled") return { ok: false, retryable: true, error: "Inbound attachment storage is not configured" }

      if (loaded.stored && loaded.storageBucket && loaded.storageKey) {
        return finishScan(input.rpc, objectStore, loaded.id, loaded.storageKey)
      }

      const declared = declaredInboundAttachment(loaded.filename || "", loaded.mimeType || "", Number(loaded.sizeBytes))
      if (!declared) {
        return applyResult(input.rpc, loaded.id, {
          operation: "mark_result",
          scanStatus: "UNSUPPORTED",
          validationStatus: "INVALID",
          ingestionStatus: "UNSUPPORTED",
        }, "Inbound attachment rejection failed")
      }

      if (await objectStore.hasObject(key)) {
        const stored = await input.rpc.rpc<{ status?: string }>("inbound_attachment_apply_v1", {
          p_payload: {
            operation: "record_storage",
            attachmentId: loaded.id,
            storageBucket: objectStore.bucket,
            storageKey: key,
          },
        })
        if (stored?.status !== "success") return { ok: false, retryable: false, error: "Inbound attachment storage update failed" }
        return finishScan(input.rpc, objectStore, loaded.id, key)
      }

      const started = await input.rpc.rpc<{ status?: string }>("inbound_attachment_apply_v1", {
        p_payload: { operation: "start_storage", attachmentId: loaded.id },
      })
      if (started?.status !== "success") return { ok: false, retryable: false, error: "Inbound attachment start failed" }

      const inbound = provider ?? resolveInboundAttachmentProvider(env)
      if (inbound === "disabled") return { ok: false, retryable: true, error: "Inbound mail is not enabled" }
      let downloaded: InboundAttachmentBytes | null
      try {
        downloaded = await inbound.getReceivedAttachment(emailId, providerAttachmentId)
      } catch (error) {
        if (error instanceof InboundAttachmentError && error.code === "retryable") {
          return { ok: false, retryable: true, error: "Inbound attachment download failed" }
        }
        if (error instanceof InboundAttachmentError) {
          return applyResult(input.rpc, loaded.id, {
            operation: "mark_result",
            scanStatus: error.code === "oversized" ? "UNSUPPORTED" : "FAILED",
            validationStatus: error.code === "oversized" ? "INVALID" : "ERROR",
            ingestionStatus: error.code === "oversized" ? "UNSUPPORTED" : "FAILED",
          }, "Inbound attachment rejection failed")
        }
        return { ok: false, retryable: true, error: "Inbound attachment download failed" }
      }
      if (!downloaded || downloaded.bytes.byteLength < 1) {
        return applyResult(input.rpc, loaded.id, {
          operation: "mark_result",
          scanStatus: "FAILED",
          validationStatus: "ERROR",
          ingestionStatus: "FAILED",
        }, "Inbound attachment failure update failed")
      }
      if (downloaded.bytes.byteLength > MAX_INBOUND_ATTACHMENT_BYTES) {
        return applyResult(input.rpc, loaded.id, {
          operation: "mark_result",
          scanStatus: "UNSUPPORTED",
          validationStatus: "INVALID",
          ingestionStatus: "UNSUPPORTED",
        }, "Inbound attachment rejection failed")
      }
      if (validateEvidenceBytes(downloaded.bytes, declared.contentType)) {
        return applyResult(input.rpc, loaded.id, {
          operation: "mark_result",
          scanStatus: "UNSUPPORTED",
          validationStatus: "INVALID",
          ingestionStatus: "UNSUPPORTED",
        }, "Inbound attachment rejection failed")
      }
      await objectStore.putObject(key, downloaded.bytes, declared.contentType)
      const stored = await input.rpc.rpc<{ status?: string }>("inbound_attachment_apply_v1", {
        p_payload: {
          operation: "record_storage",
          attachmentId: loaded.id,
          storageBucket: objectStore.bucket,
          storageKey: key,
        },
      })
      if (stored?.status !== "success") return { ok: false, retryable: false, error: "Inbound attachment storage update failed" }
      return finishScan(input.rpc, objectStore, loaded.id, key)
    },
  }
}
