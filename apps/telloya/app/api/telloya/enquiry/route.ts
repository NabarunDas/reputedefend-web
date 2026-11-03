import { NextResponse } from "next/server"
import { validateTelloyaEnquiry } from "@/lib/telloya-enquiry"
import { persistTelloyaEnquiry } from "@/lib/telloya-enquiry-intake"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import { legalIdentity } from "@/lib/legal"

export const runtime = "nodejs"
export const maxDuration = 60

// UUID validation pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    // Extract and validate submission key
    const input = body.value as Record<string, unknown>
    const submissionKey = typeof input.submissionKey === "string" 
      ? input.submissionKey.trim() 
      : ""

    if (!submissionKey || !UUID_PATTERN.test(submissionKey)) {
      return NextResponse.json(
        { ok: false, message: "Invalid submission. Please reload the page and try again." },
        { status: 400 }
      )
    }

    // Persist enquiry to database
    const result = await persistTelloyaEnquiry(data, submissionKey)

    // Reject any response that is not genuinely persisted
    if (!result.ok || result.simulated || !result.persisted) {
      return NextResponse.json(
        { ok: false, message: result.message || "Unable to process this enquiry right now." },
        { status: 503 }
      )
    }

    // Successful submission must have a valid TY reference
    if (!result.enquiryRef || !/^TY-\d\d-[A-HJ-NP-Z2-9]{6}$/.test(result.enquiryRef)) {
      console.error("[telloya-enquiry] Success without valid TY reference", { 
        ref: result.enquiryRef, 
        simulated: result.simulated 
      })
      return NextResponse.json(
        { ok: false, message: "Unable to complete this enquiry right now." },
        { status: 500 }
      )
    }

    // Return success with enquiry reference and email status
    return NextResponse.json(
      { 
        ok: true, 
        message: result.message,
        enquiryRef: result.enquiryRef,
        receiptEmailSent: result.receiptEmailSent,
        receiptEmailStatus: result.receiptEmailStatus,
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
