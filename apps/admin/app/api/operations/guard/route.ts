import { guardCommand } from "@/lib/guard/command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return guardCommand(request as never)
}
