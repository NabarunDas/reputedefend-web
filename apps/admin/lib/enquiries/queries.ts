import "server-only"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { isUuid } from "../records/model"
import type { OnboardingView } from "../commercial/onboarding"
import type { InvitationMail } from "../commercial/invitation-mail"
import { invitationDispatchEnabled } from "../commercial/invitation-dispatch"
import { telloyaDemoWriteAvailable } from "../commercial/telloya-demo-status"
import { emptyTelloyaOfferDraft, parseTelloyaDraftPlanTier, type TelloyaOfferDraftPanel } from "../commercial/telloya-offer-draft"
import type { TelloyaDemoPanel } from "../../app/enquiries/telloya-journey"
import type { TelloyaOfferLocation, TelloyaOfferPanel, TelloyaOfferPlan } from "../../app/enquiries/telloya-offer-actions"
import type { EnquiryDetail, EnquiryFilters, EnquiryRow } from "./model"
async function read<T>(name: string, args: Record<string,unknown>): Promise<T> {
  await requireStaff()
  const token=(await cookies()).get(sessionCookie)!.value
  const result=await backend().rpc<T | null>(name,{...args,p_token:tokenHash(token)})
  if(result===null) redirect("/login")
  return result
}
export function listEnquiries(f: EnquiryFilters) { return read<EnquiryRow[]>("admin_enquiry_list_v1",{p_status:f.state,p_search:f.q,p_before_time:f.time,p_before_id:f.before,p_filter:f.filter}) }
export async function getEnquiry(id: string): Promise<EnquiryDetail> {
  if(!isUuid(id)) notFound()
  const result=await read<EnquiryDetail | {missing:true}>("admin_enquiry_detail_v1",{p_id:id})
  if("missing" in result) notFound()
  return result
}
function controlFlow(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ""
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: unknown }).digest) : ""
  return message.includes("NEXT_REDIRECT") || message.includes("NEXT_NOT_FOUND") || digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")
}

export async function getInvitationMail(id: string): Promise<InvitationMail | null> {
  if (!invitationDispatchEnabled() || !isUuid(id)) return null
  try {
    const result = await read<InvitationMail | { missing: true }>("admin_customer_invitation_view_v1", { p_enquiry: id })
    if ("missing" in result) return null
    return result
  } catch (error) {
    if (controlFlow(error)) throw error
    return {
      status: "unavailable",
      detail: "Invitation sending is not available yet.",
      canSend: false,
      canResend: false,
      canProcess: false,
      canRevoke: false,
    }
  }
}
export async function getTelloyaDemo(id: string): Promise<TelloyaDemoPanel> {
  if (!telloyaDemoWriteAvailable() || !isUuid(id)) return { availability: "closed" }
  try {
    const result = await read<{
      status?: string
      demo_status?: "NOT_BOOKED" | "BOOKED" | "COMPLETED"
      version?: number
      scheduled_at?: string | null
      completed_at?: string | null
      timezone?: string
    } | null>("telloya_admin_demo_v1", { p_enquiry_id: id })
    if (!result || result.status !== "ready" || !result.demo_status || !Number.isInteger(result.version)) {
      return { availability: "unavailable" }
    }
    return {
      availability: "ready",
      enquiryId: id,
      status: result.demo_status,
      version: result.version as number,
      scheduledAt: result.scheduled_at ?? null,
      completedAt: result.completed_at ?? null,
      timezone: result.timezone ?? "",
    }
  } catch (error) {
    if (controlFlow(error)) throw error
    return { availability: "unavailable" }
  }
}

export async function getTelloyaOffer(id: string): Promise<TelloyaOfferPanel> {
  if (!telloyaDemoWriteAvailable() || !isUuid(id)) return { availability: "closed" }
  try {
    const result = await read<{
      status?: string
      subscriptionId?: string
      offerRef?: string
      state?: string
      version?: number
      amendments?: { id: string; status: string; version: number; text: string }[]
      planVersionId?: string
      amountMinor?: number
      tier?: string | null
      enquiryRef?: string | null
      plans?: TelloyaOfferPlan[]
      locations?: TelloyaOfferLocation[]
      emailQueued?: boolean
      emailLifecycle?: string | null
      emailDeliveryStatus?: string | null
      emailRecipient?: string | null
      agreementAccepted?: boolean
      paymentStatus?: "none" | "verifying" | "paid"
      provisionState?: string | null
    } | null>("telloya_offer_admin_v1", { p_enquiry: id })
    if (!result) return { availability: "unavailable" }
    if (result.status === "no_offer") return { availability: "no_offer" }
    if (result.status !== "ready" || !result.subscriptionId || !result.offerRef || !result.state || !Number.isInteger(result.version)) {
      return { availability: "unavailable" }
    }
    return {
      availability: "ready",
      subscriptionId: result.subscriptionId,
      offerRef: result.offerRef,
      state: result.state,
      version: result.version as number,
      amendments: Array.isArray(result.amendments) ? result.amendments : [],
      planVersionId: result.planVersionId,
      amountMinor: result.amountMinor,
      tier: result.tier,
      enquiryRef: result.enquiryRef,
      plans: Array.isArray(result.plans) ? result.plans : [],
      locations: Array.isArray(result.locations) ? result.locations : [],
      emailQueued: result.emailQueued === true,
      emailLifecycle: typeof result.emailLifecycle === "string" ? result.emailLifecycle : null,
      emailDeliveryStatus: typeof result.emailDeliveryStatus === "string" ? result.emailDeliveryStatus : null,
      emailRecipient: typeof result.emailRecipient === "string" ? result.emailRecipient : null,
      agreementAccepted: result.agreementAccepted === true,
      paymentStatus: result.paymentStatus,
      provisionState: result.provisionState ?? null,
    }
  } catch (error) {
    if (controlFlow(error)) throw error
    return { availability: "unavailable" }
  }
}

export async function getTelloyaOfferDraft(id: string, planTierPrefill?: string | null): Promise<TelloyaOfferDraftPanel> {
  if (!telloyaDemoWriteAvailable() || !isUuid(id)) return { availability: "closed" }
  try {
    const result = await read<{
      status?: string
      locked?: boolean
      draft?: {
        planTier?: string | null
        customAmountPence?: number | null
        customIncludedMinutes?: number | null
        customRequirements?: string
        proposedGuardQuantity?: number
        guardLocationIds?: string[]
        overageOptIn?: boolean
        overageCapPence?: number | null
        notes?: string
        version?: number
      } | null
      version?: number
    } | null>("telloya_offer_draft_v1", { p_enquiry_id: id })
    if (!result || result.status !== "ready") return { availability: "unavailable" }
    if (result.locked) return { availability: "locked" }
    const fallback = emptyTelloyaOfferDraft(planTierPrefill)
    const draft = result.draft
    if (!draft) {
      return { availability: "ready", ...fallback, version: Number.isInteger(result.version) ? result.version as number : 0 }
    }
    const guardLocationIds = Array.isArray(draft.guardLocationIds) ? draft.guardLocationIds.filter(isUuid) : []
    const planTier = parseTelloyaDraftPlanTier(draft.planTier) ?? fallback.planTier
    const customAmountPence = planTier === "custom"
      && Number.isInteger(draft.customAmountPence)
      && (draft.customAmountPence as number) > 0
      ? draft.customAmountPence as number
      : null
    const customIncludedMinutes = planTier === "custom"
      && Number.isInteger(draft.customIncludedMinutes)
      && (draft.customIncludedMinutes as number) >= 1
      ? draft.customIncludedMinutes as number
      : null
    return {
      availability: "ready",
      planTier,
      customAmountPence,
      customIncludedMinutes,
      customRequirements: planTier === "custom" && typeof draft.customRequirements === "string"
        ? draft.customRequirements.slice(0, 1000)
        : "",
      proposedGuardQuantity: Number.isInteger(draft.proposedGuardQuantity) ? Math.max(0, Math.min(50, draft.proposedGuardQuantity as number)) : 0,
      guardLocationIds,
      overageOptIn: draft.overageOptIn === true,
      overageCapPence: draft.overageOptIn === true && Number.isInteger(draft.overageCapPence) && (draft.overageCapPence as number) > 0
        ? draft.overageCapPence as number
        : null,
      notes: typeof draft.notes === "string" ? draft.notes.slice(0, 1000) : "",
      version: Number.isInteger(draft.version) ? draft.version as number : 0,
    }
  } catch (error) {
    if (controlFlow(error)) throw error
    return { availability: "unavailable" }
  }
}

export async function getOnboarding(id: string): Promise<OnboardingView> {
  if(!isUuid(id)) notFound()
  const result = await read<OnboardingView | { missing: true }>("admin_commercial_onboarding_v1", { p_enquiry: id })
  if("missing" in result) notFound()
  return result
}
