import { NextRequest } from "next/server"
import { recordCommand } from "@/lib/records/command"
export const runtime = "nodejs"
export const POST = (request: NextRequest) => recordCommand(request, "verify")
