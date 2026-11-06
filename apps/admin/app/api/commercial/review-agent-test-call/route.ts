import { NextRequest } from "next/server"
import { reviewAgentTestCallCommand } from "@/lib/commercial/review-agent-test-call"

export const POST = (request: NextRequest) => reviewAgentTestCallCommand(request)
