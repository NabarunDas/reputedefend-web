import "server-only"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export function billingLogo(): Uint8Array {
  const candidates = [
    join(process.cwd(), "public/brand/profile-relaunch-logo.png"),
    join(process.cwd(), "apps/customer/public/brand/profile-relaunch-logo.png"),
  ]
  for (const path of candidates) {
    try {
      return readFileSync(path)
    } catch {
      // The customer app and the workspace root keep the same brand file.
    }
  }
  throw new Error("ProfileRelaunch logo is not available")
}
