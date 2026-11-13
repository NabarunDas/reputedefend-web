import { NextRequest } from "next/server"
import { telloyaSalesContextCommand } from "@/lib/commercial/telloya-sales-context-command"

export const runtime = "nodejs"
export const POST = (request: NextRequest) => telloyaSalesContextCommand(request)
