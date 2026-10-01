import { privacyExportCommand } from "@/lib/settings/command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return privacyExportCommand(request as never)
}
