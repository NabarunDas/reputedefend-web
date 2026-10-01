import { guardAlertCommand } from "@/lib/guard/alerts-command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return guardAlertCommand(request as never)
}
