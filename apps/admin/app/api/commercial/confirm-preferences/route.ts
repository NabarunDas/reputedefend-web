import { NextRequest } from "next/server"
import { confirmPreferencesCommand } from "@/lib/commercial/confirm-preferences"

export const POST = (request: NextRequest) => confirmPreferencesCommand(request)
