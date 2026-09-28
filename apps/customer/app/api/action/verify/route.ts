import { NextRequest } from "next/server"
import { verifyOtp } from "@/lib/action/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return verifyOtp(request) }
