import { NextRequest } from "next/server"
import { exchange } from "@/lib/action/http"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return exchange(request) }
