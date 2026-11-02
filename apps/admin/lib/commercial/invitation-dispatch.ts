import type { EnvMap } from "../jobs/config"
import { backend } from "../auth/backend"
import { centralDispatchLaneOpen } from "../communications/central-dispatch"
import { devCustomerPortalOrigin } from "../communications/dev-lane"
import { settleDevSendEmailClaim, type DevSendClaim } from "../communications/dev-send"
import { outgoingFromAddress } from "../communications/gate"
import { currentLinkKeyVersion, prepareCustomerInvitationLink } from "../communications/link"
import type { OutgoingMailProvider } from "../communications/mail"
import { composeCustomerInvitationEmail, customerInvitationSubject } from "../../../../lib/email/customer-invitation"

export function invitationDispatchEnabled(env: EnvMap = process.env): boolean {
  return env.CUSTOMER_INVITATION_DISPATCH_ENABLED === "true"
}

export function invitationDispatchReady(): boolean {
  return invitationDispatchEnabled()
    && outgoingFromAddress() !== null
    && devCustomerPortalOrigin() !== null
    && currentLinkKeyVersion() >= 1
    && prepareCustomerInvitationLink("00000000-0000-4000-8000-000000000001", 1) !== null
}

export function prepareInvitationHashes(requestId: string): string[] | null {
  const version = currentLinkKeyVersion()
  const hashes = [1, 2, 3].map(generation => prepareCustomerInvitationLink(requestId, generation, undefined, version)?.tokenHash ?? null)
  if (hashes.some(hash => !hash)) return null
  return hashes as string[]
}

export function invitationMessage(input: { origin: string; reference?: string | null }): {
  subject: string
  text: string
  html: string
  sender: string
  origin: string
  linkKeyVersion: number
} | null {
  const sender = outgoingFromAddress()
  const version = currentLinkKeyVersion()
  const composed = composeCustomerInvitationEmail({ origin: input.origin, reference: input.reference })
  if (!sender || !composed || composed.subject !== customerInvitationSubject) return null
  return { ...composed, sender, origin: input.origin, linkKeyVersion: version }
}

/** Claims one queued invitation and settles it with the existing email handler. */
export async function dispatchQueuedInvitation(input: {
  requestId: string
  provider?: OutgoingMailProvider
}): Promise<"accepted" | "queued" | "unavailable"> {
  if (!invitationDispatchEnabled()) return "unavailable"
  if (!input.provider && !centralDispatchLaneOpen()) return "queued"
  const origin = devCustomerPortalOrigin()
  if (!origin) return "queued"
  let claim: DevSendClaim
  try {
    claim = await backend().rpc<DevSendClaim>("dev_mail_dispatch_claim_invitation_v1", {
      p_request: input.requestId,
      p_customer_origin: origin,
    })
  } catch {
    return "unavailable"
  }
  if (claim.status !== "success" || claim.replay === true || claim.jobType !== "SEND_EMAIL") return "queued"
  try {
    const settled = await settleDevSendEmailClaim({
      rpc: backend(),
      claim,
      provider: input.provider,
    })
    return settled === "succeeded" ? "accepted" : "queued"
  } catch {
    return "unavailable"
  }
}
