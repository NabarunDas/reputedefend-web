import { NextRequest } from "next/server"
import { touchPortalSession } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return touchPortalSession(request) }
