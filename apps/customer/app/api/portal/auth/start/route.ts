import { NextRequest } from "next/server"
import { startLogin } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return startLogin(request) }
