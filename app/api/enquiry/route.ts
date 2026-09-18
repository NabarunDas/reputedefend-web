import { persistGeneralEnquiry } from "@/lib/enquiries/intake"
import { NextResponse } from "next/server"
import { persistGetHelpCase } from "@/lib/cases/intake"
import { isCasePersistenceEnabled } from "@/lib/cases/persistence-config"
import { readSubmissionKey } from "@/lib/cases/submission-key"
import { validateEnquiry } from "@/lib/enquiry"
import { ENQUIRY_UNAVAILABLE, deliverEnquiry } from "@/lib/enquiry-delivery"
import { checkEnquiryRateLimit, enquiryClientKey } from "@/lib/enquiry-rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    let rawText = "", size = 0
    const reader = request.body?.getReader(), decoder = new TextDecoder()
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) { await reader.cancel(); return NextResponse.json({ ok: false, message: "Please keep your message within the form limits." }, { status: 413 }) }
      rawText += decoder.decode(value, { stream: true })
    }
    rawText += decoder.decode()
    const raw: unknown = JSON.parse(rawText)
    const checked = validateEnquiry(raw)
    if (!checked.valid) {
      return NextResponse.json(
        { ok: false, message: checked.error, errors: checked.errors },
        { status: 400 },
      )
    }

    if (!checkEnquiryRateLimit(enquiryClientKey(request)).ok) {
      return NextResponse.json({ ok: false, message: ENQUIRY_UNAVAILABLE }, { status: 429 })
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
