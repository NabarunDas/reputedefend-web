import { NextRequest } from "next/server"
import { recordForwardingInstructionsCommand } from "@/lib/commercial/record-forwarding-instructions"

export const POST = (request: NextRequest) => recordForwardingInstructionsCommand(request)
