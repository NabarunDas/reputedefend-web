#!/usr/bin/env node
/**
 * Operator evidence SHA-256 check, backfill and restore verification.
 *
 * Default mode is check, which reads objects and writes nothing.
 * apply records a digest only where none is stored, and only for the DEV bucket.
 * restore compares recovered bytes with the stored digest and writes nothing.
 *
 * An object entity tag is not a content digest. The digest is SHA-256 of the GetObject bytes.
 * Output is version id, outcome and sizes. Filenames, keys, digests and bytes
 * are not printed.
 *
 * Usage:
 *   node --experimental-strip-types scripts/evidence-sha256.mjs [--mode check|apply|restore] [--after uuid] [--limit n] [--recovery-bucket name]
 *
 * check and restore enumerate every uploaded version. A stored scan that is
 * not clean is not_clean and is not fetched. A clean row is fetched only after
 * the live GuardDuty tag is NO_THREATS_FOUND. apply reads only clean rows that
 * have no digest. Reads stop at 10 MB. There is no background worker.
 *
 * Credentials are Vercel OIDC, or a web-identity token file whose role ARN is
 * exactly AWS_EVIDENCE_ROLE_ARN. Static AWS keys are refused. This process
 * never writes an object.
 *
 * A recovery bucket is optional and only for check or restore. Metadata must
 * name the canonical DEV or Production bucket. The recovery name must be a
 * separate bucket for that same environment. The Admin role cannot read it
 * until s3:GetObject and s3:GetObjectTagging are granted on that bucket's
 * cases/* prefix. This script does not change IAM.
 */

import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { GetObjectCommand, GetObjectTaggingCommand, S3Client } from "@aws-sdk/client-s3"
import { fromWebToken } from "@aws-sdk/credential-provider-web-identity"
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider"
import { createClient } from "@supabase/supabase-js"
import {
  assertApplyAllowed,
  assertCredentialMode,
  assertRecoveryMapping,
  byteIntegrityProven,
  integrityExitCode,
  readBoundedObjectBody,
  resolveReadBucket,
  runIntegrityPass,
} from "../apps/admin/lib/evidence/integrity.ts"

const GUARDDUTY_TAG = "GuardDutyMalwareScanStatus"
const missingCodes = new Set(["NoSuchKey", "NotFound"])

function usage() {
  console.log("usage: node --experimental-strip-types scripts/evidence-sha256.mjs [--mode check|apply|restore] [--after uuid] [--limit n] [--recovery-bucket name]")
}

function argument(argv, name) {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  return argv[index + 1]
}

function errorCode(error) {
  if (!error || typeof error !== "object") return undefined
  const value = error
  for (const field of ["name", "Code", "code"]) {
    if (typeof value[field] === "string" && value[field] && value[field] !== "Error") return value[field]
  }
  return undefined
}

function isMissing(error) {
  const code = errorCode(error)
  return !!code && missingCodes.has(code)
}

function countField(value, name) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  throw new Error(`evidence page ${name} is invalid`)
}

export function parseArgs(argv) {
  const mode = argument(argv, "--mode") ?? "check"
  const after = argument(argv, "--after") ?? null
  const limitText = argument(argv, "--limit")
  const limit = limitText === undefined ? undefined : Number(limitText)
  const recoveryBucket = argument(argv, "--recovery-bucket") ?? null
  if (!["check", "apply", "restore"].includes(mode)) throw new Error("mode must be check, apply or restore")
  if (after !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after)) {
    throw new Error("after must be a version id")
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 5000)) throw new Error("limit must be 1..5000")
  if (recoveryBucket !== null && (!recoveryBucket || recoveryBucket.startsWith("--"))) throw new Error("recovery bucket is required")
  return { mode, after, limit, recoveryBucket }
}

function credentialsFor(env, region, roleArn) {
  const credentialMode = assertCredentialMode({
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: env.AWS_SESSION_TOKEN,
    AWS_WEB_IDENTITY_TOKEN_FILE: env.AWS_WEB_IDENTITY_TOKEN_FILE,
    AWS_ROLE_ARN: env.AWS_ROLE_ARN,
    AWS_EVIDENCE_ROLE_ARN: roleArn,
  })
  if (credentialMode === "vercel-oidc") {
    return awsCredentialsProvider({ roleArn, clientConfig: { region } })
  }
  let token = ""
  try {
    token = readFileSync(env.AWS_WEB_IDENTITY_TOKEN_FILE, "utf8").trim()
  } catch {
    throw new Error("web identity token could not be read")
  }
  if (!token) throw new Error("web identity token could not be read")
  return fromWebToken({ roleArn, webIdentityToken: token, clientConfig: { region } })
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes("--help") || argv.includes("-h")) {
    usage()
    return 0
  }
  const args = parseArgs(argv)
  const supabaseUrl = env.SUPABASE_URL ?? ""
  const secret = env.SUPABASE_SECRET_KEY ?? ""
  const region = env.AWS_REGION ?? ""
  const bucket = env.AWS_EVIDENCE_BUCKET ?? ""
  const roleArn = env.AWS_EVIDENCE_ROLE_ARN ?? ""
  if (!supabaseUrl || !secret || !region || !bucket || !roleArn) throw new Error("evidence integrity environment is incomplete")
  assertApplyAllowed({ mode: args.mode, bucket, vercelEnv: env.VERCEL_ENV, supabaseUrl })
  assertRecoveryMapping({ mode: args.mode, metadataBucket: bucket, recoveryBucket: args.recoveryBucket })
  const readBucket = resolveReadBucket(bucket, args.recoveryBucket)
  const supabase = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const client = new S3Client({
    region,
    credentials: credentialsFor(env, region, roleArn),
  })
  const result = await runIntegrityPass({
    mode: args.mode,
    bucket,
    recoveryBucket: args.recoveryBucket,
    after: args.after,
    maxVersions: args.limit,
    async page(after) {
      const { data, error } = await supabase.rpc("evidence_content_sha256_page_v1", {
        p_after: after,
        p_limit: 50,
        p_unverified_only: args.mode === "apply",
      })
      if (error || !data || data.status !== "success" || !Array.isArray(data.versions)) {
        throw new Error("evidence page failed")
      }
      return {
        versions: data.versions,
        uploadedCount: countField(data.uploadedCount, "uploadedCount"),
        excludedPendingUploadCount: countField(data.excludedPendingUploadCount, "excludedPendingUploadCount"),
        excludedFailedCount: countField(data.excludedFailedCount, "excludedFailedCount"),
      }
    },
    async readObject(version) {
      if (version.scanStatus !== "NO_THREATS_FOUND") return { kind: "not_clean" }
      try {
        const tagging = await client.send(new GetObjectTaggingCommand({ Bucket: readBucket, Key: version.storageKey }))
        const tag = tagging.TagSet?.find(item => item.Key === GUARDDUTY_TAG)?.Value
        if (tag !== "NO_THREATS_FOUND") return { kind: "not_clean" }
      } catch (error) {
        if (isMissing(error)) return { kind: "missing" }
        return { kind: "unreadable" }
      }
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: readBucket, Key: version.storageKey }))
        return await readBoundedObjectBody(object.Body, object.ContentLength)
      } catch (error) {
        if (isMissing(error)) return { kind: "missing" }
        return { kind: "unreadable" }
      }
    },
    async record(version, digest, byteLength, write) {
      const { data, error } = await supabase.rpc("evidence_content_sha256_v1", {
        p_version: version.versionId,
        p_sha256: digest,
        p_byte_length: byteLength,
        p_write: write,
      })
      if (error || !data || typeof data.status !== "string") return { status: "invalid" }
      return { status: data.status }
    },
  })
  const counts = {}
  for (const finding of result.findings) {
    counts[finding.outcome] = (counts[finding.outcome] ?? 0) + 1
    console.log(JSON.stringify({
      versionId: finding.versionId,
      outcome: finding.outcome,
      declaredSizeBytes: finding.declaredSizeBytes,
      objectSizeBytes: finding.objectSizeBytes,
    }))
  }
  console.log(JSON.stringify({
    mode: args.mode,
    counts,
    cursor: result.cursor,
    stoppedEarly: result.stoppedEarly,
    byteIntegrityProven: byteIntegrityProven(result.findings),
    expectedUploaded: result.expectedUploaded,
    covered: result.covered,
    coverageComplete: result.coverageComplete,
    resumed: result.resumed,
    excludedPendingUploadCount: result.excludedPendingUploadCount,
    excludedFailedCount: result.excludedFailedCount,
  }))
  return integrityExitCode(args.mode, result)
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invoked) {
  main().then(code => {
    process.exitCode = code
  }).catch(error => {
    const message = error instanceof Error ? error.message : "evidence integrity failed"
    console.error(message)
    process.exitCode = 2
  })
}
