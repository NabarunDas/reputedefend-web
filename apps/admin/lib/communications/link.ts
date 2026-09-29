import { createHash, createHmac } from "node:crypto"
import type { EnvMap } from "../jobs/config"

export const COMMUNICATION_ACCESS_KIND = "COMMUNICATION_ACCESS"
const TOKEN_CONTEXT = "communication-access"

export function linkSecret(env: EnvMap = process.env): string | null {
  const raw = env.COMMUNICATIONS_LINK_SECRET
  if (!raw || raw.length < 32) return null
  return raw
}

export function deriveCommunicationAccessToken(actionId: string, secret: string, version = 1): string {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${actionId}:v${version}`).digest("hex")
}

export function communicationAccessTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function prepareCommunicationAccessLink(actionId: string, env: EnvMap = process.env): { token: string; tokenHash: string } | null {
  const secret = linkSecret(env)
  if (!secret || !actionId) return null
  const token = deriveCommunicationAccessToken(actionId, secret)
  return { token, tokenHash: communicationAccessTokenHash(token) }
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
