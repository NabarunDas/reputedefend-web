import { resolveProviderMode, type EnvMap } from "../jobs/config"

export function inboundWebhookSecret(env: EnvMap = process.env): string | null {
  const raw = env.RESEND_INBOUND_WEBHOOK_SECRET
  if (!raw || raw.length < 16) return null
  return raw
}

export function inboundMailDomain(env: EnvMap = process.env): string | null {
  const raw = (env.INBOUND_MAIL_DOMAIN || "").trim().toLowerCase()
  if (!raw || raw === "profilerelaunch.com") return null
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(raw) || raw.length > 253) return null
  return raw
}

export function inboundOwnedAddresses(env: EnvMap = process.env): string[] {
  const configured = (env.INBOUND_OWNED_ADDRESSES || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(item => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item) && item.length <= 254)
  const from = env.COMMUNICATIONS_FROM_EMAIL?.trim().toLowerCase()
  if (from && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) configured.push(from)
  return [...new Set(configured)].slice(0, 20)
}

export function communicationsInboundEnabled(env: EnvMap = process.env): boolean {
  return env.VERCEL_ENV === "production"
    && env.COMMUNICATIONS_INBOUND_ENABLED === "true"
    && env.JOB_WORKER_ENABLED === "true"
    && resolveProviderMode(env) === "production"
    && !!env.RESEND_API_KEY
    && !!inboundMailDomain(env)
}

export function inboundDisabledReason(): string {
  return "Inbound customer mail is not enabled. The Google Workspace inbox on profilerelaunch.com is unchanged."
}

export type InboundStorageConfig = { region: string; bucket: string; roleArn: string }

export function inboundStorageConfig(env: EnvMap = process.env): InboundStorageConfig | null {
  if (env.AWS_ACCESS_KEY_ID || env.AWS_SECRET_ACCESS_KEY || env.AWS_SESSION_TOKEN) return null
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return null
  const region = env.AWS_REGION
  const bucket = env.AWS_INBOUND_MAIL_BUCKET
  const roleArn = env.AWS_INBOUND_MAIL_ROLE_ARN
  if (!region || !bucket || !roleArn) return null
  if (!/^arn:aws:iam::\d+:role\/[A-Za-z0-9+=,.@_-]+$/.test(roleArn)) return null
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null
  return { region, bucket, roleArn }
}
