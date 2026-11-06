import { NextRequest } from "next/server"
import { cancelAgentTestCallCommand } from "@/lib/commercial/cancel-agent-test-call"

export const POST = (request: NextRequest) => cancelAgentTestCallCommand(request)
