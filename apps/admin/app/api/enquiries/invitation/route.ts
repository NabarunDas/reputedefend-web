import { NextRequest } from "next/server"
import { invitationCommand } from "@/lib/commercial/invitation-command"
export const runtime = "nodejs"
export const POST = (request: NextRequest) => invitationCommand(request)
