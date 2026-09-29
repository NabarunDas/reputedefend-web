import { createHash, createHmac } from "node:crypto"
import type { EnvMap } from "../jobs/config"

export const COMMUNICATION_ACCESS_KIND = "COMMUNICATION_ACCESS"
const TOKEN_CONTEXT = "communication-access"
const ACTION_ID_NAMESPACE = "9c1e0a11-c0ff-5ee1-8a11-000000000011"
const ACTION_ID_NAME = "communication-access-action"

export function linkSecret(env: EnvMap = process.env): string | null {
  const raw = env.COMMUNICATIONS_LINK_SECRET
  if (!raw || raw.length < 32) return null
  return raw
}

export function currentLinkKeyVersion(env: EnvMap = process.env): number {
  const raw = env.COMMUNICATIONS_LINK_KEY_VERSION
  if (raw == null || raw === "") return 1
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return 1
  return parsed
}

export function linkSecretForVersion(version: number, env: EnvMap = process.env): string | null {
  if (!Number.isInteger(version) || version < 1) return null
  if (version === currentLinkKeyVersion(env)) return linkSecret(env)
  const named = env[`COMMUNICATIONS_LINK_SECRET_V${version}`]
  if (!named || named.length < 32) return null
  return named
}

export function deriveCommunicationAccessToken(actionId: string, secret: string, version = 1): string {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${actionId}:v${version}`).digest("hex")
}

export function communicationAccessTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function deriveCommunicationActionId(requestId: string): string {
  const hex = ACTION_ID_NAMESPACE.replace(/-/g, "")
  const namespace = Buffer.from(hex, "hex")
  const hash = createHash("sha1").update(namespace).update(`${ACTION_ID_NAME}:${requestId}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const id = hash.subarray(0, 16).toString("hex")
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`
}

export function prepareCommunicationAccessLink(
  actionId: string,
  env: EnvMap = process.env,
  version = currentLinkKeyVersion(env),
): { token: string; tokenHash: string; version: number } | null {
  const secret = linkSecretForVersion(version, env)
  if (!secret || !actionId) return null
  const token = deriveCommunicationAccessToken(actionId, secret, version)
  return { token, tokenHash: communicationAccessTokenHash(token), version }
}

export function materializeUploadUrl(body: string, actionId: string, origin: string, token: string): string | null {
  if (!body || !actionId || !origin || !token) return null
  if (body.includes("#t=")) return null
  const base = `${origin}/action/${actionId}`
  if (!body.includes(base)) return null
  return body.split(base).join(`${base}#t=${token}`)
}

export function snapshotUploadUrl(origin: string, actionId: string): string | null {
  if (!origin || !actionId) return null
  return `${origin}/action/${actionId}`
}
