import "server-only"

import { buildMonitoringIntakeSnapshot, type MonitoringIntakeInput } from "@/lib/monitoring/snapshot"
import { readSupabaseConfig } from "@/lib/supabase/config"
import type { Database, Json } from "@/lib/supabase/database"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type CreateMonitoringRequestV1Args = Database["public"]["Functions"]["create_monitoring_request_v1"]["Args"]

export type MonitoringIntakeRpcResult = {
  monitoring_request_id: string
  customer_id: string
  business_id: string
  location_id: string
  status: string
  number_of_locations: number
  was_existing: boolean
  customer_communication_id: string | null
  customer_communication_status: string | null
  customer_communication_recipient: string | null
  internal_communication_id: string | null
  internal_communication_status: string | null
  internal_communication_recipient: string | null
  intake_snapshot: unknown
}

export type PersistMonitoringRequestOptions = {
  createRequest?: (args: CreateMonitoringRequestV1Args) => Promise<MonitoringIntakeRpcResult>
  internalRecipient: string
}

function asRpcRow(data: unknown): MonitoringIntakeRpcResult | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") return null
  const value = row as MonitoringIntakeRpcResult
  if (!value.monitoring_request_id || !value.customer_id || !value.business_id || !value.location_id) {
    return null
  }
  if (typeof value.status !== "string" || typeof value.number_of_locations !== "number") {
    return null
  }
  return value
}

async function defaultCreateRequest(args: CreateMonitoringRequestV1Args): Promise<MonitoringIntakeRpcResult> {
  const client = createSupabaseServerClient()
  const { data, error } = await client.rpc("create_monitoring_request_v1", args)
  if (error) {
    console.error("[monitoring-intake] rpc failed")
    throw new Error("MONITORING_INTAKE_RPC_FAILED")
  }
  const row = asRpcRow(data)
  if (!row) {
    console.error("[monitoring-intake] rpc returned no monitoring request")
    throw new Error("MONITORING_INTAKE_RPC_FAILED")
  }
  return row
}

/**
 * Calls the atomic create_monitoring_request_v1 RPC.
 * Does not send email. Does not write customers/businesses/locations itself.
 */
export async function persistMonitoringRequest(
  data: MonitoringIntakeInput,
  submissionKey: string,
  options: PersistMonitoringRequestOptions,
): Promise<MonitoringIntakeRpcResult> {
  if (!options.createRequest && !readSupabaseConfig().ready) {
    throw new Error("MONITORING_INTAKE_RPC_FAILED")
  }

  const args: CreateMonitoringRequestV1Args = {
    p_submission_key: submissionKey,
    p_full_name: data.fullName,
    p_email: data.email,
    p_phone: data.phone || null,
    p_business_name: data.businessName,
    p_country: data.country,
    p_website_url: data.websiteUrl || null,
    p_business_profile_url: data.businessProfileUrl,
    p_number_of_locations: data.numberOfLocations,
    p_terms_accepted: data.termsAccepted,
    p_intake_snapshot: buildMonitoringIntakeSnapshot(data) as Json,
    p_internal_recipient: options.internalRecipient,
  }

  return (options.createRequest ?? defaultCreateRequest)(args)
}
