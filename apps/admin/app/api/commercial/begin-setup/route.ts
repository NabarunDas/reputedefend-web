import { NextRequest } from "next/server"
import { beginSetupCommand } from "@/lib/commercial/begin-setup"

export const POST = (request: NextRequest) => beginSetupCommand(request)
