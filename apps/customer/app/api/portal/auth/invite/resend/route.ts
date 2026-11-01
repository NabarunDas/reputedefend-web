import { NextRequest } from "next/server"
import { resendInvitedLogin } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return resendInvitedLogin(request) }
