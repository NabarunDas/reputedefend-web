import "server-only"
import { getVercelOidcToken } from "@vercel/oidc"
import type { PaymentHandoverReason } from "./handover"

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const DEVELOP_CUSTOMER_BRANCH = /^profilerelaunch-customer-git-develop-([a-z0-9-]+)\.vercel\.app$/
const DISPATCH_HEADER = "x-vercel-trusted-oidc-idp-token"

export type CentralDispatchStatus =
  | "accepted"
  | "held"
  | "conflict"
  | "retry"
  | "unknown"
  | "dead"
  | "unavailable"
  | "disabled"

function branchTeam(host: string | undefined): string | null {
  const team = DEVELOP_CUSTOMER_BRANCH.exec(host ?? "")?.[1]
  if (!team || team.startsWith("-") || team.endsWith("-")) return null
  return team
}

/** Develop customer Preview pinned to the DEV database, before the origin check. */
export function customerDispatchPreview(): boolean {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  return process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "develop"
    && url === DEV_SUPABASE_URL
}

/** Develop customer Preview pinned to the DEV database. This does not send mail. */
export function customerDispatchLaneOpen(): boolean {
  const team = branchTeam(process.env.VERCEL_BRANCH_URL)
  if (!team || !customerDispatchPreview()) return false
  return process.env.CUSTOMER_ORIGIN === `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
}

export function adminDevelopDispatchOrigin(): string | null {
  const team = branchTeam(process.env.VERCEL_BRANCH_URL)
  if (!team) return null
  return `https://profilerelaunch-admin-git-develop-${team}.vercel.app`
}

function handoverForStatus(status: CentralDispatchStatus): PaymentHandoverReason {
  if (status === "accepted") return "provider_accepted"
  if (status === "held") return "dispatch_held"
  if (status === "conflict") return "dispatch_conflict"
  if (status === "retry") return "provider_retryable"
  if (status === "unknown") return "acceptance_unknown"
  if (status === "dead") return "provider_dead"
  if (status === "disabled") return "dispatch_not_configured"
  return "queue_unavailable"
}

/**
 * Asks the Admin develop Preview to dispatch the email stored for this queue
 * request. The body is only the request id. The customer process does not
 * choose a recipient, name a communication, or call the email provider.
 */
export async function requestCentralDispatch(input: {
  requestId: string
  fetchImpl?: typeof fetch
  oidcToken?: string | null
}): Promise<PaymentHandoverReason> {
  if (!customerDispatchLaneOpen()) return "dispatch_not_configured"
  const admin = adminDevelopDispatchOrigin()
  if (!admin) return "dispatch_not_configured"
  let token = input.oidcToken
  if (token === undefined) {
    try {
      token = await getVercelOidcToken()
    } catch {
      token = null
    }
  }
  if (!token) return "dispatch_not_configured"
  try {
    const response = await (input.fetchImpl ?? fetch)(`${admin}/api/internal/mail/dispatch`, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "content-type": "application/json",
        [DISPATCH_HEADER]: token,
      },
      body: JSON.stringify({ requestId: input.requestId }),
    })
    let payload: { status?: CentralDispatchStatus } | null = null
    try {
      payload = await response.json() as { status?: CentralDispatchStatus }
    } catch {
      payload = null
    }
    if (payload?.status) return handoverForStatus(payload.status)
    return "queue_unavailable"
  } catch {
    return "queue_unavailable"
  }
}
