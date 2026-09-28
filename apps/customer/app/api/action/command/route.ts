import { NextRequest } from "next/server"
import { command } from "@/lib/action/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return command(request) }
