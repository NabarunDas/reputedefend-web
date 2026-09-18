import { NextRequest } from "next/server"
import { evidenceCommand } from "@/lib/evidence/command"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return evidenceCommand(request)
}
