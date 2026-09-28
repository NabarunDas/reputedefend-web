import { NextRequest } from "next/server"
import { authorizationCommand } from "@/lib/authorization/command"

export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  return authorizationCommand(request)
}
