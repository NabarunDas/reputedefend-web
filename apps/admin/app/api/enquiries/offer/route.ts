import { NextRequest } from "next/server"
import { telloyaOfferCommand } from "@/lib/commercial/telloya-offer-command"

export const runtime = "nodejs"
export const POST = (request: NextRequest) => telloyaOfferCommand(request)
