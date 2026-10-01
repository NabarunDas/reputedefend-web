import { integrationCommand } from "@/lib/integrations/command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return integrationCommand(request as never)
}
