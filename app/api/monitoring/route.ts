import { NextResponse } from "next/server"
import { readSubmissionKey } from "@/lib/cases/submission-key"
import { persistMonitoringRequest } from "@/lib/monitoring/intake"
import { isMonitoringPersistenceEnabled, MONITORING_UNAVAILABLE } from "@/lib/monitoring/persistence-config"
import { validateMonitoringRequest } from "@/lib/monitoring/validation"
import { checkEnquiryRateLimit, enquiryClientKey } from "@/lib/enquiry-rate-limit"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json()
    const checked = validateMonitoringRequest(raw)
    if (!checked.valid) {
      return NextResponse.json(
        { ok: false, message: checked.error, errors: checked.errors },
        { status: 400 },
      )
    }

    if (!checkEnquiryRateLimit(enquiryClientKey(request)).ok) {
      return NextResponse.json({ ok: false, message: MONITORING_UNAVAILABLE }, { status: 429 })
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
    return NextResponse.json({ ok: false, message: "Unable to process this request right now." }, { status: 400 })
  }
}
