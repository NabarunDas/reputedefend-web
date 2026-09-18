import "server-only"

export type EvidenceAwsConfig = { region: string; bucket: string; roleArn: string }

export function evidenceAwsConfig(): EvidenceAwsConfig | null {
  if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SESSION_TOKEN) return null
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return null
  const region = process.env.AWS_REGION, bucket = process.env.AWS_EVIDENCE_BUCKET, roleArn = process.env.AWS_EVIDENCE_ROLE_ARN
  if (!region || !bucket || !roleArn) return null
  if (!/^arn:aws:iam::\d+:role\/[A-Za-z0-9+=,.@_-]+$/.test(roleArn)) return null
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null
  return { region, bucket, roleArn }
}
