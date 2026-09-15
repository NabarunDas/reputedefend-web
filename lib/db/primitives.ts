import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database"

export type DataClient = SupabaseClient<Database>

function escapeIlikeExact(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

function fail(context: string): never {
  throw new Error(`${context} failed.`)
}

/**
 * Single-table primitives for a future server-side intake path.
 *
 * Do not wire these into `/api/enquiry` in this phase.
 * Do not compose them into a pretend multi-request transaction.
 *
 * Creating customer, business, location, case, CASE_RECEIVED event and the
 * initial communication must eventually happen as ONE durable database
 * transaction before email is attempted. The next phase may use a PostgreSQL
 * RPC/function or another genuinely atomic server/database mechanism.
 */
export async function findCustomerByNormalizedEmail(client: DataClient, email: string) {
  const { data, error } = await client
    .from("customers")
    .select("*")
    .ilike("email", escapeIlikeExact(email.trim()))
    .maybeSingle()
  if (error) fail("Customer lookup")
  return data
}

export async function insertCustomer(
  client: DataClient,
  values: Database["public"]["Tables"]["customers"]["Insert"],
) {
  const { data, error } = await client.from("customers").insert(values).select("*").single()
  if (error || !data) fail("Customer insert")
  return data
}

export async function insertBusiness(
  client: DataClient,
  values: Database["public"]["Tables"]["businesses"]["Insert"],
) {
  const { data, error } = await client.from("businesses").insert(values).select("*").single()
  if (error || !data) fail("Business insert")
  return data
}

export async function insertLocation(
  client: DataClient,
  values: Database["public"]["Tables"]["locations"]["Insert"],
) {
  const { data, error } = await client.from("locations").insert(values).select("*").single()
  if (error || !data) fail("Location insert")
  return data
}

export async function insertCase(
  client: DataClient,
  values: Database["public"]["Tables"]["cases"]["Insert"],
) {
  const { data, error } = await client.from("cases").insert(values).select("*").single()
  if (error || !data) fail("Case insert")
  return data
}

export async function insertCaseEvent(
  client: DataClient,
  values: Database["public"]["Tables"]["case_events"]["Insert"],
) {
  const { data, error } = await client.from("case_events").insert(values).select("*").single()
  if (error || !data) fail("Case event insert")
  return data
}

export async function insertCommunication(
  client: DataClient,
  values: Database["public"]["Tables"]["communications"]["Insert"],
) {
  const { data, error } = await client.from("communications").insert(values).select("*").single()
  if (error || !data) fail("Communication insert")
  return data
}

export async function updateCommunication(
  client: DataClient,
  id: string,
  values: Database["public"]["Tables"]["communications"]["Update"],
) {
  const { data, error } = await client
    .from("communications")
    .update(values)
    .eq("id", id)
    .select("*")
    .single()
  if (error || !data) fail("Communication update")
  return data
}
