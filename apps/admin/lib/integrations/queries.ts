import "server-only"
import { cookies } from "next/headers"
import { requireStaff } from "../require-staff"
import { sessionCookie } from "../auth/config"
import { backend, tokenHash } from "../auth/backend"
import type { IntegrationHealthView } from "./model"
import { type ConnectionSnapshot, googleIntegrationHealth } from "./status"

type StatusResponse = {
  status?: string
  connection?: ConnectionSnapshot | null
  lastManualCheckAt?: string | null
}

// The Step 21 tables arrive with an unapplied migration, so the RPC is absent
// in every environment today. A missing or failing status read degrades to the
// configuration-only view rather than breaking the Settings page.
async function readConnection(): Promise<StatusResponse | null> {
  try {
    const token = (await cookies()).get(sessionCookie)?.value
    if (!token) return null
    return await backend().rpc<StatusResponse | null>("admin_integration_status_v1", {
      p_token: tokenHash(token),
      p_provider: "google_business_profile",
    })
  } catch {
    return null
  }
}

export async function loadGoogleIntegrationHealth(): Promise<IntegrationHealthView> {
  await requireStaff()
  const stored = await readConnection()
  return googleIntegrationHealth({
    connection: stored?.connection ?? null,
    lastManualCheckAt: stored?.lastManualCheckAt ?? null,
  })
}
