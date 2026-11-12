import { NextRequest } from "next/server"
import { telloyaAmendmentCommand } from "@/lib/portal/onboarding/telloya-amendment-command"

export const runtime = "nodejs"
export const POST = (request: NextRequest) => telloyaAmendmentCommand(request)
