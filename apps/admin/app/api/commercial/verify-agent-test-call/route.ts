import { NextRequest } from "next/server"
import { verifyAgentTestCallCommand } from "@/lib/commercial/verify-agent-test-call"

export const POST = (request: NextRequest) => verifyAgentTestCallCommand(request)
