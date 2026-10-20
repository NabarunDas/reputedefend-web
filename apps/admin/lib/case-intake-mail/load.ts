import "server-only"
import { createClient } from "@supabase/supabase-js"
import { authConfig } from "../auth/config"
import { devCaseJourneyPreviewEnabled } from "../case-journey/gate"
import { isUuid } from "../records/model"
import { intakeMailRetryOffer, type StoredIntakeMail } from "./offer"

/**
 * Reads the two stored initial case emails for the develop DEV Preview.
 * A missing read hides the retry control. It does not send anything.
 */
export async function loadIntakeMailRetryOffer(caseId: string) {
  if (!devCaseJourneyPreviewEnabled() || !isUuid(caseId)) return null
  const config = authConfig()
  if (!config) return null
  try {
    const client = createClient(config.url, config.secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await client
      .from("communications")
      .select("communication_type, recipient, status, provider_message_id, metadata")
      .eq("case_id", caseId)
      .in("communication_type", ["CASE_RECEIVED_CUSTOMER", "CASE_RECEIVED_INTERNAL"])
    if (error || !data) return null
    const rows: StoredIntakeMail[] = data.map(row => ({
      communicationType: String(row.communication_type),
      recipient: String(row.recipient),
      status: row.status == null ? null : String(row.status),
      providerMessageId: row.provider_message_id == null ? null : String(row.provider_message_id),
      metadata: row.metadata,
    }))
    return intakeMailRetryOffer(rows)
  } catch {
    return null
  }
}
