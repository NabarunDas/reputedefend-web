import { NextRequest } from "next/server"
import { solicitorApprovalCommand } from "@/lib/commercial/solicitor-approval-command"

export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  return solicitorApprovalCommand(request)
}
