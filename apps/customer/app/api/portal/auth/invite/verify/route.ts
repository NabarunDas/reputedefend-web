import { NextRequest } from "next/server"
import { verifyInvitedLogin } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return verifyInvitedLogin(request) }
