import { persistGeneralEnquiry } from "@/lib/enquiries/intake"
import { NextResponse } from "next/server"
import { persistGetHelpCase } from "@/lib/cases/intake"
import { isCasePersistenceEnabled } from "@/lib/cases/persistence-config"
import { readSubmissionKey } from "@/lib/cases/submission-key"
import { validateEnquiry } from "@/lib/enquiry"
import { ENQUIRY_UNAVAILABLE, deliverEnquiry } from "@/lib/enquiry-delivery"
import { consumePublicRateLimit } from "@/lib/enquiry-rate-limit"
import { readBoundedJson } from "@/lib/public-body"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await readBoundedJson(request)
  if (!body.ok) {
    const message = body.status === 413
      ? "Please keep your message within the form limits."
      : "Unable to process this enquiry right now."
    return NextResponse.json({ ok: false, message }, { status: body.status })
  }
  try {
    const raw = body.value
    const checked = validateEnquiry(raw)
    if (!checked.valid) {
      return NextResponse.json(
        { ok: false, message: checked.error, errors: checked.errors },
        { status: 400 },
      )
    }

    const limit = await consumePublicRateLimit(request)
    if (!limit.ok) {
      return NextResponse.json({ ok: false, message: ENQUIRY_UNAVAILABLE }, { status: limit.status })
    }

    if (checked.data.source === "get-help" && isCasePersistenceEnabled()) {
      const submissionKey = readSubmissionKey(raw)
      if (!submissionKey) {
        return NextResponse.json(
          { ok: false, message: "Please submit the assessment again." },
          { status: 400 },
        )
      }

      const result = await persistGetHelpCase(checked.data, submissionKey)
      return NextResponse.json(result, { status: result.ok ? 200 : 503 })
    }

    if (checked.data.source === "contact" || checked.data.source === "homepage") {
      const key = readSubmissionKey(raw)
      if (!key) return NextResponse.json({ ok: false, message: "Please reload the form and submit your enquiry again." }, { status: 400 })
      const result = await persistGeneralEnquiry(checked.data, key)
      return NextResponse.json(result, { status: result.ok ? 200 : 503 })
    }
    const result = await deliverEnquiry(checked.data)
    return NextResponse.json(result, { status: result.ok ? 200 : 503 })
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to process this enquiry right now." }, { status: 400 })
  }
}
