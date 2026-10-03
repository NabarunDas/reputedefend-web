import { NextRequest } from "next/server"
import { resendLogin } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return resendLogin(request) }
