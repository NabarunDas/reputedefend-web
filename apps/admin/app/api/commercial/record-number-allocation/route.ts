import { NextRequest } from "next/server"
import { recordNumberAllocationCommand } from "@/lib/commercial/record-number-allocation"

export const POST = (request: NextRequest) => recordNumberAllocationCommand(request)
