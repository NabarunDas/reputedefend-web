import { NextResponse } from "next/server"
import { isCasePublicRef } from "@/lib/cases/domain"
import { retryPersistedGetHelpMail } from "@/lib/cases/intake"
import { devMarketingMailLane } from "@/lib/cases/persistence-config"
import { readBoundedJson } from "@/lib/public-body"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * One retry of stored Get Help mail for a case that already exists.
 * Available only on the develop DEV Preview. The body may name a public
 * reference and nothing else. Recipients stay the ones already stored.
 */
export async function POST(request: Request) {
  if (!devMarketingMailLane()) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }
  const body = await readBoundedJson(request)
  if (!body.ok || !body.value || typeof body.value !== "object") {
    return NextResponse.json({ ok: false }, { status: 404 })
  }
  const publicRef = (body.value as { publicRef?: unknown }).publicRef
  if (typeof publicRef !== "string" || !isCasePublicRef(publicRef)) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const result = await retryPersistedGetHelpMail(publicRef)
  if (!result.ok) return NextResponse.json({ ok: false }, { status: 404 })
  return NextResponse.json({
    ok: true,
    persisted: true,
    receiptEmailStatus: result.receiptEmailStatus,
  })
}
