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
 *   node --experimental-strip-types scripts/evidence-sha256.mjs [--mode check|apply|restore] [--after uuid] [--limit n]
 *
 * Each clean uploaded object costs one GetObjectTagging and one GetObject of
 * at most 10 MB. apply reads only rows that have no digest. There is no
 * background worker. The Admin evidence role already used for validation must
 * allow s3:GetObject and s3:GetObjectTagging. This process never writes an object.
 */

import { pathToFileURL } from "node:url"
import { GetObjectCommand, GetObjectTaggingCommand, S3Client } from "@aws-sdk/client-s3"
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider"
import { createClient } from "@supabase/supabase-js"
import {
  assertApplyAllowed,
  byteIntegrityProven,
  integrityExitCode,
  runIntegrityPass,
} from "../apps/admin/lib/evidence/integrity.ts"

const GUARDDUTY_TAG = "GuardDutyMalwareScanStatus"
const missingCodes = new Set(["NoSuchKey", "NotFound"])

function usage() {
  console.log("usage: node --experimental-strip-types scripts/evidence-sha256.mjs [--mode check|apply|restore] [--after uuid] [--limit n]")
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

export function parseArgs(argv) {
  const mode = argument(argv, "--mode") ?? "check"
  const after = argument(argv, "--after") ?? null
  const limitText = argument(argv, "--limit")
  const limit = limitText === undefined ? undefined : Number(limitText)
  if (!["check", "apply", "restore"].includes(mode)) throw new Error("mode must be check, apply or restore")
  if (after !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after)) {
    throw new Error("after must be a version id")
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 5000)) throw new Error("limit must be 1..5000")
  return { mode, after, limit }
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
  if (env.AWS_ACCESS_KEY_ID || env.AWS_SECRET_ACCESS_KEY || env.AWS_SESSION_TOKEN) {
    throw new Error("static AWS keys are refused")
  }
  const supabase = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const client = new S3Client({
    region,
    credentials: awsCredentialsProvider({ roleArn, clientConfig: { region } }),
  })
  const result = await runIntegrityPass({
    mode: args.mode,
    bucket,
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
      return data.versions
    },
    async readObject(version) {
      try {
        const tagging = await client.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: version.storageKey }))
        const tag = tagging.TagSet?.find(item => item.Key === GUARDDUTY_TAG)?.Value
        if (tag !== "NO_THREATS_FOUND") return { kind: "not_clean" }
      } catch (error) {
        if (isMissing(error)) return { kind: "missing" }
        return { kind: "unreadable" }
      }
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: version.storageKey }))
        const bytes = await object.Body?.transformToByteArray()
        if (!bytes) return { kind: "unreadable" }
        return { kind: "bytes", bytes: Uint8Array.from(bytes) }
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
  }))
  return integrityExitCode(result)
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
