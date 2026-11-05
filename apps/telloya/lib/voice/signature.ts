import { createHmac, timingSafeEqual } from "node:crypto"

import { RETELL_SIGNATURE_HEADER } from "./types"

/** Retell's published replay window: more than five minutes is rejected. */
export const RETELL_SIGNATURE_WINDOW_MS = 5 * 60 * 1000

export type SignatureInput = {
  rawBody: string
  apiKey: string
  signature: string | null
  nowMs: number
}

/**
 * Retell secure webhook, as published on 4 November 2026.
 * Header `x-retell-signature`: `v={unix ms},d={hex}`.
 * Digest: HMAC-SHA256 of the raw body concatenated with the `v` timestamp,
 * keyed by the webhook-authorised API key. Not a standalone signing secret.
 */
export function signRetellSignature(rawBody: string, apiKey: string, timestampMs: string): string {
  const digest = createHmac("sha256", apiKey).update(`${rawBody}${timestampMs}`, "utf8").digest("hex")
  return `v=${timestampMs},d=${digest}`
}

export function verifyRetellSignature(input: SignatureInput): boolean {
  if (!input.apiKey || input.signature == null || !Number.isFinite(input.nowMs)) return false
  const match = /^v=(\d{1,16}),d=([0-9a-f]+)$/.exec(input.signature)
  if (!match) return false
  const timestamp = match[1]
  const presented = match[2]
  if (presented.length !== 64) return false
  const timestampMs = Number(timestamp)
  if (!Number.isSafeInteger(timestampMs)) return false
  if (Math.abs(input.nowMs - timestampMs) > RETELL_SIGNATURE_WINDOW_MS) return false
  const expected = createHmac("sha256", input.apiKey).update(`${input.rawBody}${timestamp}`, "utf8").digest("hex")
  const left = Buffer.from(presented, "utf8")
  const right = Buffer.from(expected, "utf8")
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function signatureHeaderName(): string {
  return RETELL_SIGNATURE_HEADER
}
