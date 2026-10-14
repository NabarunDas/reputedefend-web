import { NextResponse } from "next/server"
import { readSubmissionKey } from "@/lib/cases/submission-key"
import { persistMonitoringRequest } from "@/lib/monitoring/intake"
import { isMonitoringPersistenceEnabled, MONITORING_UNAVAILABLE } from "@/lib/monitoring/persistence-config"
import { validateMonitoringRequest } from "@/lib/monitoring/validation"
import { consumePublicRateLimit } from "@/lib/enquiry-rate-limit"
import { readBoundedJson } from "@/lib/public-body"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await readBoundedJson(request)
  if (!body.ok) {
    const message = body.status === 413
      ? "Please keep your message within the form limits."
      : "Unable to process this request right now."
    return NextResponse.json({ ok: false, message }, { status: body.status })
  }

  try {
    const raw = body.value
    const checked = validateMonitoringRequest(raw)
    if (!checked.valid) {
      return NextResponse.json(
        { ok: false, message: checked.error, errors: checked.errors },
        { status: 400 },
      )
    }

    const limit = await consumePublicRateLimit(request)
    if (!limit.ok) {
      return NextResponse.json({ ok: false, message: MONITORING_UNAVAILABLE }, { status: limit.status })
    }

    if (!isMonitoringPersistenceEnabled()) {
      return NextResponse.json({ ok: false, message: MONITORING_UNAVAILABLE }, { status: 503 })
    }

    const submissionKey = readSubmissionKey(raw)
    if (!submissionKey) {
      return NextResponse.json(
        { ok: false, message: "Please submit the setup request again." },
        { status: 400 },
      )
    }

    const result = await persistMonitoringRequest(checked.data, submissionKey)
    return NextResponse.json(result, { status: result.ok ? 200 : 503 })
  } catch {
    return NextResponse.json({ ok: false, message: MONITORING_UNAVAILABLE }, { status: 503 })
  }
}
