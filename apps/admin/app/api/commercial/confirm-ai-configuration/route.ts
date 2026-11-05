import { NextRequest } from "next/server"
import { confirmAiConfigurationCommand } from "@/lib/commercial/confirm-ai-configuration"

export const POST = (request: NextRequest) => confirmAiConfigurationCommand(request)
