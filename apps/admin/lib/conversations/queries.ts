import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { isUuid } from "../records/model"
import { CONVERSATION_FILTERS, type CaseConversationRead, type ConversationDetail, type ConversationFilter, type ConversationList } from "./model"

export async function loadConversations(filter?: string | null): Promise<ConversationList> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const selected = filter && (CONVERSATION_FILTERS as readonly string[]).includes(filter) ? filter as ConversationFilter : null
  const result = await backend().rpc<ConversationList | null>("admin_conversation_list_v1", {
    p_token: tokenHash(token),
    p_filter: selected,
  })
  if (result === null) redirect("/login")
  return result
}

/** Conversations linked to one case. This does not load the global inbox. */
export async function loadCaseConversations(caseId: string): Promise<CaseConversationRead | null> {
  await requireStaff()
  if (!isUuid(caseId)) return null
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<CaseConversationRead | null>("admin_case_conversations_v1", {
    p_token: tokenHash(token),
    p_case: caseId,
  })
  if (result === null) redirect("/login")
  return result.status === "success" ? result : null
}

export async function loadConversation(id?: string | null): Promise<ConversationDetail | null> {
  await requireStaff()
  if (!id || !isUuid(id)) return null
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<ConversationDetail | null>("admin_conversation_detail_v1", {
    p_token: tokenHash(token),
    p_conversation: id,
  })
  if (result === null) redirect("/login")
  return result.status === "success" ? result : null
}
