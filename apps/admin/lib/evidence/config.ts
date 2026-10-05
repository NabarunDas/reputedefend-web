import "server-only"

export type EvidenceAwsConfig = { region: string; bucket: string; roleArn: string }

export const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
export const PROD_EVIDENCE_BUCKET = "profilerelaunch-evidence-prod-euw2-337909767363"

function evidenceEnvironmentMatches(bucket: string, roleArn: string) {
  const environment = process.env.VERCEL_ENV
  if (environment === "production") {
    return bucket === PROD_EVIDENCE_BUCKET && roleArn.endsWith("/ProfileRelaunchProdAdminEvidence")
  }
  if (environment === "preview" || environment === "development") {
    return bucket === DEV_EVIDENCE_BUCKET && !roleArn.endsWith("/ProfileRelaunchProdAdminEvidence")
  }
  return true
}

export function evidenceAwsConfig(): EvidenceAwsConfig | null {
  if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SESSION_TOKEN) return null
  const region = process.env.AWS_REGION, bucket = process.env.AWS_EVIDENCE_BUCKET, roleArn = process.env.AWS_EVIDENCE_ROLE_ARN
  if (!region || !bucket || !roleArn) return null
  if (!/^arn:aws:iam::\d+:role\/[A-Za-z0-9+=,.@_-]+$/.test(roleArn)) return null
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null
  if (!evidenceEnvironmentMatches(bucket, roleArn)) return null
  return { region, bucket, roleArn }
}
