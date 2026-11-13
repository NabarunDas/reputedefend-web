import { NextRequest } from "next/server"
import { telloyaDemoCommand } from "@/lib/commercial/telloya-demo-command"

export const runtime = "nodejs"
export const POST = (request: NextRequest) => telloyaDemoCommand(request)
