import { NextResponse } from "next/server"
import { deliverEnquiry, validateEnquiry } from "@/lib/enquiry"

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json()
    const checked = validateEnquiry(raw)
    if (!checked.valid) {
      return NextResponse.json(
        { ok: false, message: checked.error, errors: checked.errors },
        { status: 400 },
      )
    }

    const result = await deliverEnquiry(checked.data)
    return NextResponse.json(result, { status: result.ok ? 200 : 503 })
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to process this enquiry right now." }, { status: 400 })
  }
}
