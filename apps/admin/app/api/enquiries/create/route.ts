import { NextRequest } from "next/server"
import { enquiryCommand } from "@/lib/enquiries/command"
export const runtime="nodejs"
export const POST=(request:NextRequest)=>enquiryCommand(request,"create")
