import { savedFilterCommand } from "@/lib/reports/command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return savedFilterCommand(request as never)
}
