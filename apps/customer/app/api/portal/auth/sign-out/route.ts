import { NextRequest } from "next/server"
import { signOutPortal } from "@/lib/portal/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return signOutPortal(request) }
