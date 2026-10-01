import { googleCallbackResponse } from "@/lib/integrations/command"

export const dynamic = "force-dynamic"

// Reachable only if Google ever redirects here. With live integration
// disabled it refuses without contacting Google and without reading the code.
export async function GET(request: Request) {
  return googleCallbackResponse(request as never)
}
