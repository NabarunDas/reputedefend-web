import "server-only"
import { cookies } from "next/headers"
import { requireStaff } from "../require-staff"
import { sessionCookie } from "../auth/config"
import { backend, tokenHash } from "../auth/backend"
import type { IntegrationHealthView } from "./model"
import { type ConnectionSnapshot, googleIntegrationHealth } from "./status"

type StoredConnection = {
  status?: string | null
  connectedAt?: string | null
  revokedAt?: string | null
  tokenExpiresAt?: string | null
  lastSuccessAt?: string | null
  lastErrorCode?: string | null
}

type StatusResponse = {
  connections?: StoredConnection[] | null
  lastSuccessAt?: string | null
}

// The Step 21 tables arrive with an unapplied migration, so the RPC is absent
// in every environment today. A missing or failing status read degrades to the
// configuration-only view rather than breaking the Settings page.
async function readStatus(): Promise<StatusResponse | null> {
  try {
    const token = (await cookies()).get(sessionCookie)?.value
    if (!token) return null
    return await backend().rpc<StatusResponse | null>("admin_integration_status_v1", {
      p_token: tokenHash(token),
    })
  } catch {
    return null
  }
}

// Only the newest connection matters to the Admin surface, and only the
// non-secret fields of it. Ciphertext is never part of the RPC response.
export function newestConnection(response: StatusResponse | null): ConnectionSnapshot | null {
  const rows = response?.connections ?? []
  const live = rows.find(row => row.status === "CONNECTED") ?? rows[0]
  if (!live) return null
  return {
    status: live.status ?? null,
    connectedAt: live.connectedAt ?? null,
    revokedAt: live.revokedAt ?? null,
    tokenExpiresAt: live.tokenExpiresAt ?? null,
    lastSuccessAt: live.lastSuccessAt ?? response?.lastSuccessAt ?? null,
    lastErrorCode: live.lastErrorCode ?? null,
  }
}

export async function loadGoogleIntegrationHealth(): Promise<IntegrationHealthView> {
  await requireStaff()
  const stored = await readStatus()
  return googleIntegrationHealth({ connection: newestConnection(stored) })
}
