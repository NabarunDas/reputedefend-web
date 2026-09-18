import { isUuid } from "../records/model"
export const enquiryStates = { new: "New", open: "In progress", waiting: "Waiting for a reply", closed: "Closed", spam: "Spam", converted: "Converted to work" } as const
export const emailStates = { SENDING: "Not confirmed", SENT: "Accepted by email provider", FAILED: "Failed", UNKNOWN: "Outcome unknown", SKIPPED: "Not requested" } as const
export type EnquiryStatus = keyof typeof enquiryStates
export type EmailStatus = keyof typeof emailStates
export type EnquiryPayload = { fullName: string; email: string; phone: string; businessName: string; country: string; subject: string; service: string; details: string; websiteUrl: string; businessProfileUrl: string; reviewUrl: string; source: string }
export type EnquiryRow = { id: string; name: string; email: string; business: string; subject: string; source: string; status: EnquiryStatus; assigned: boolean; createdAt: string; nextActionAt: string | null; internalStatus: EmailStatus; ackStatus: EmailStatus }
export type EnquiryDetail = Omit<EnquiryRow,"name" | "email" | "business" | "subject"> & { payload: EnquiryPayload; version: number; nextAction: string; caseRef: string | null; caseId: string | null; monitoringId: string | null; events: { id: string; event: string; note: string; createdAt: string }[] }
export type EnquiryFilters = { state: string; q: string; time: string | null; before: string | null; filter: string }
export const validTime = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x))
export function enquiryFilters(raw: Record<string,string | string[] | undefined>): EnquiryFilters | null {
  const {state="active",q="",time,before,filter="all"}=raw
  if(typeof state!=="string" || !["active","all",...Object.keys(enquiryStates)].includes(state) || typeof q!=="string" || q.length>100 || typeof filter!=="string" || !["all","unassigned","assigned","email","overdue"].includes(filter) || ((time===undefined)!==(before===undefined)) || (time!==undefined && !validTime(time)) || (before!==undefined && !isUuid(before))) return null
  return {state,q:q.trim(),time:time || null,before:before || null,filter}
}
