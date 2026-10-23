import type { EnvMap } from "../jobs/config"

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
const DEVELOP_ADMIN_BRANCH = /^profilerelaunch-admin-git-develop-([a-z0-9-]+)\.vercel\.app$/

function branchTeam(host: string | undefined): string | null {
  const team = DEVELOP_ADMIN_BRANCH.exec(host ?? "")?.[1]
  if (!team || team.startsWith("-") || team.endsWith("-")) return null
  return team
}

/** Customer develop Preview in the same Vercel team as this Admin branch. */
export function devCustomerPortalOrigin(env: EnvMap = process.env): string | null {
  const team = branchTeam(env.VERCEL_BRANCH_URL)
  if (!team) return null
  return `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
}

/**
 * Admin develop Preview whose database is the DEV Supabase project.
 * Production and every other preview are outside this lane.
 */
export function devAdminOutgoingMailLane(env: EnvMap = process.env): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && url === DEV_SUPABASE_URL
    && branchTeam(env.VERCEL_BRANCH_URL) !== null
}

/** DEV portal origin and DEV evidence bucket, both required before a send is offered. */
export function devPreviewMailConfigured(env: EnvMap = process.env): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  const team = branchTeam(env.VERCEL_BRANCH_URL)
  if (!team) return false
  const portal = `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && url === DEV_SUPABASE_URL
    && env.CUSTOMER_ORIGIN === portal
    && env.AWS_EVIDENCE_BUCKET === DEV_EVIDENCE_BUCKET
}

/** Email eligibility comes from the database's verified customer and current business relationship.
 * DEV restrictions concern resource separation, not a single customer mailbox.
 */
export function devEvidenceUploadOriginAllowed(env: EnvMap, origin: string | null | undefined): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  const team = branchTeam(env.VERCEL_BRANCH_URL)
  if (!(env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "develop" && url === DEV_SUPABASE_URL && team)) {
    return true
  }
  return origin === `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
}
