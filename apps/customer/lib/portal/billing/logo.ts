import "server-only"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const logoFile = fileURLToPath(new URL("../../../public/brand/profile-relaunch-logo.png", import.meta.url))

export function billingLogo(): Uint8Array {
  try {
    return readFileSync(logoFile)
  } catch {
    throw new Error("ProfileRelaunch logo is not available")
  }
}
