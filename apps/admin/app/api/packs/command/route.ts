import { NextRequest } from "next/server"
import { packCommand } from "@/lib/packs/command"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return packCommand(request)
}
