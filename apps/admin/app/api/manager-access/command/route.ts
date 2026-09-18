import { NextRequest } from "next/server"
import { managerAccessCommand } from "@/lib/authorization/command"

export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  return managerAccessCommand(request)
}
