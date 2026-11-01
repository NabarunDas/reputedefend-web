import { NextRequest } from "next/server"
import { readPortalSession } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function GET(request: NextRequest) { return readPortalSession(request) }
