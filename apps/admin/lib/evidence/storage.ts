import "server-only"
import { GetObjectCommand, GetObjectTaggingCommand, S3Client } from "@aws-sdk/client-s3"
import { createPresignedPost } from "@aws-sdk/s3-presigned-post"
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider"
import { evidenceAwsConfig } from "./config"
import { GUARDDUTY_TAG, MAX_EVIDENCE_BYTES, UPLOAD_EXPIRES_SECONDS, mapGuardDutyStatus, type ScanStatus } from "./model"

export type PresignedUpload = { url: string; fields: Record<string, string>; expiresSeconds: number; conditions: unknown[] }
export type ObjectProbe = { exists: boolean; scan: ScanStatus }
export type EvidenceStorage = {
  bucket: string
  createUpload(input: { key: string; contentType: string }): Promise<PresignedUpload>
  probeObject(key: string): Promise<ObjectProbe>
  readScannedObject(key: string): Promise<Uint8Array | null>
}

const missingObjectCodes = new Set(["NoSuchKey", "NotFound"])

function s3ErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const value = error as { name?: unknown; Code?: unknown; code?: unknown }
  for (const field of ["name", "Code", "code"] as const) {
    if (typeof value[field] === "string" && value[field] && value[field] !== "Error") return value[field]
  }
  return undefined
}

export function isMissingS3Object(error: unknown): boolean {
  const code = s3ErrorCode(error)
  return !!code && missingObjectCodes.has(code)
}

export function probeFromTaggingError(error: unknown): ObjectProbe {
  if (isMissingS3Object(error)) return { exists: false, scan: "PENDING" }
  throw error
}

export function presignedPostInput(key: string, contentType: string) {
  return {
    Key: key,
    Expires: UPLOAD_EXPIRES_SECONDS,
    Fields: { key, "Content-Type": contentType },
    Conditions: [
      ["eq", "$key", key],
      ["eq", "$Content-Type", contentType],
      ["content-length-range", 1, MAX_EVIDENCE_BYTES],
    ] as Array<["eq", string, string] | ["content-length-range", number, number]>,
  }
}

export function createEvidenceStorage(): EvidenceStorage | null {
  const config = evidenceAwsConfig()
  if (!config) return null
  const client = new S3Client({
    region: config.region,
    credentials: awsCredentialsProvider({ roleArn: config.roleArn, clientConfig: { region: config.region } }),
  })
  return {
    bucket: config.bucket,
    async createUpload({ key, contentType }) {
      const policy = presignedPostInput(key, contentType)
      const post = await createPresignedPost(client, { Bucket: config.bucket, ...policy })
      return { url: post.url, fields: post.fields, expiresSeconds: policy.Expires, conditions: policy.Conditions }
    },
    async probeObject(key) {
      try {
        const result = await client.send(new GetObjectTaggingCommand({ Bucket: config.bucket, Key: key }))
        const tag = result.TagSet?.find(item => item.Key === GUARDDUTY_TAG)?.Value
        return { exists: true, scan: mapGuardDutyStatus(tag) }
      } catch (error) {
        return probeFromTaggingError(error)
      }
    },
    async readScannedObject(key) {
      const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
      const bytes = await object.Body?.transformToByteArray()
      return bytes ? Uint8Array.from(bytes) : null
    },
  }
}
