import { NextRequest } from "next/server"
import { initiateAgentTestCallCommand } from "@/lib/commercial/initiate-agent-test-call"

export const POST = (request: NextRequest) => initiateAgentTestCallCommand(request)
