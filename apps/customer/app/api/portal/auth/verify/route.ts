import { NextRequest } from "next/server"
import { verifyLogin } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return verifyLogin(request) }
