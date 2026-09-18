import { NextRequest } from "next/server"
import { sendOtp } from "@/lib/action/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return sendOtp(request) }
