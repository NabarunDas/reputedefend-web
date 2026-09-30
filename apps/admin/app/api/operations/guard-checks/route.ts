import { guardCheckCommand } from "@/lib/guard/checks-command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return guardCheckCommand(request as never)
}
