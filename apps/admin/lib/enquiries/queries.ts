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
import type { TelloyaDemoPanel } from "../../app/enquiries/telloya-journey"
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

export async function getOnboarding(id: string): Promise<OnboardingView> {
  if(!isUuid(id)) notFound()
  const result = await read<OnboardingView | { missing: true }>("admin_commercial_onboarding_v1", { p_enquiry: id })
  if("missing" in result) notFound()
  return result
}
