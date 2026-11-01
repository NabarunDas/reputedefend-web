import "server-only"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { isUuid } from "../records/model"
import type { OnboardingView } from "../commercial/onboarding"
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
export async function getOnboarding(id: string): Promise<OnboardingView> {
  if(!isUuid(id)) notFound()
  const result = await read<OnboardingView | { missing: true }>("admin_commercial_onboarding_v1", { p_enquiry: id })
  if("missing" in result) notFound()
  return result
}
