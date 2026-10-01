import { settingsCommand } from "@/lib/settings/command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return settingsCommand(request as never)
}
