import { NextRequest } from "next/server"
import { onboardingCommand } from "@/lib/commercial/command"
export const runtime = "nodejs"
export const POST = (request: NextRequest) => onboardingCommand(request)
