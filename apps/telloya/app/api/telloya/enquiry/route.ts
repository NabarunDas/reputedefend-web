import { NextResponse } from "next/server"
import { validateTelloyaEnquiry, type TelloyaEnquiryInput } from "@/lib/telloya-enquiry"
import { persistTelloyaEnquiry } from "@/lib/telloya-enquiry-intake"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import { legalIdentity } from "@/lib/legal"

export const runtime = "nodejs"
export const maxDuration = 60

async function readJsonBody(request: Request): Promise<{ ok: boolean; value?: unknown; status: number }> {
  try {
    const text = await request.text()
    if (text.length > 100000) {
      return { ok: false, status: 413 }
    }
    const value = JSON.parse(text)
    return { ok: true, value, status: 200 }
  } catch {
    return { ok: false, status: 400 }
  }
}

export async function POST(request: Request) {
  // Check if enquiry submission is enabled
  const capabilities = getEnquiryCapabilities()
  if (!capabilities.submissionEnabled) {
    return NextResponse.json(
      {
        ok: false,
        message: `The enquiry system is being prepared for launch. Please email us at ${legalIdentity.contactEmail} to discuss your requirements.`,
        code: "SERVICE_UNAVAILABLE",
      },
      { status: 503 }
    )
  }

  // Read and validate request body
  const body = await readJsonBody(request)
  if (!body.ok) {
    const message = body.status === 413
      ? "Please keep your message within the form limits."
      : "Unable to process this enquiry right now."
    return NextResponse.json({ ok: false, message }, { status: body.status })
  }

  try {
    // Validate enquiry data
    const validation = validateTelloyaEnquiry(body.value)
    
    if (!validation.valid) {
      return NextResponse.json(
        { 
          ok: false, 
          message: validation.error,
          errors: validation.errors 
        },
        { status: 400 }
      )
    }

    const data = validation.data

    // Extract submission key
    const input = body.value as any
    const submissionKey = typeof input.submissionKey === "string" 
      ? input.submissionKey.trim() 
      : ""

    if (!submissionKey || submissionKey.length < 10) {
      return NextResponse.json(
        { ok: false, message: "Invalid submission. Please reload the page and try again." },
        { status: 400 }
      )
    }

    // Persist enquiry to database
    const result = await persistTelloyaEnquiry(data, submissionKey)

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.simulated ? 200 : 503 }
      )
    }

    // Return success with enquiry reference
    return NextResponse.json(
      { 
        ok: true, 
        message: result.message,
        enquiryRef: result.enquiryRef,
        simulated: result.simulated,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[telloya-enquiry] Submission error:", error)
    return NextResponse.json(
      { ok: false, message: "Unable to process this enquiry right now." },
      { status: 500 }
    )
  }
}
