import { NextRequest } from "next/server"
import { evidenceCommand } from "@/lib/evidence/command"
export const runtime = "nodejs"
export const POST = (request: NextRequest) => evidenceCommand(request)
