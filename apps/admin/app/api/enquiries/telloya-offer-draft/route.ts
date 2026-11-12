import { NextRequest } from "next/server"
import { telloyaOfferDraftCommand } from "@/lib/commercial/telloya-offer-draft-command"

export const runtime = "nodejs"
export const POST = (request: NextRequest) => telloyaOfferDraftCommand(request)
