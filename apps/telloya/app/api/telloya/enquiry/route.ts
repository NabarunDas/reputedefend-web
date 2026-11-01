import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

// Telloya enquiry API endpoint
// This validates enquiry data and prepares for database persistence
// Note: Full persistence depends on database schema from Phase 02B

type TelloyaEnquiryInput = {
  product: "telloya" | "complete" | ""
  businessName: string
  country: string
  trade: string
  locations: string
  websiteUrl: string
  fullName: string
  email: string
  phone: string
  missedCallProblem: string
  phoneSetup: string
  contactPreference: string
  privacyAccepted: boolean
}

function normalizeText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
}

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

function validateTelloyaEnquiry(raw: unknown): { valid: boolean; data?: TelloyaEnquiryInput; errors?: Record<string, string> } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: { _error: "Invalid request format" } }
  }

  const input = raw as Record<string, unknown>
  const errors: Record<string, string> = {}

  const product = normalizeText(String(input.product || ""))
  if (!product || (product !== "telloya" && product !== "complete")) {
    errors.product = "Please select a product option."
  }

  const businessName = normalizeText(String(input.businessName || ""))
  if (!businessName) {
    errors.businessName = "Please enter your business name."
  } else if (businessName.length > 160) {
    errors.businessName = "Business name is too long."
  }

  const country = normalizeText(String(input.country || ""))
  if (!country) {
    errors.country = "Please enter your country."
  } else if (country.length > 80) {
    errors.country = "Country is too long."
  }

  const trade = normalizeText(String(input.trade || ""))
  if (!trade) {
    errors.trade = "Please describe your trade or service."
  } else if (trade.length > 100) {
    errors.trade = "Trade description is too long."
  }

  const email = normalizeText(String(input.email || ""))
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "Please enter a valid email address."
  } else if (email.length > 254) {
    errors.email = "Email address is too long."
  }

  const phone = normalizeText(String(input.phone || ""))
  if (!phone || !/^[+]?[\d\s().-]{7,}$/.test(phone)) {
    errors.phone = "Please enter a valid phone number."
  } else if (phone.length > 40) {
    errors.phone = "Phone number is too long."
  }

  const fullName = normalizeText(String(input.fullName || ""))
  if (!fullName) {
    errors.fullName = "Please enter your name."
  } else if (fullName.length > 100) {
    errors.fullName = "Name is too long."
  }

  if (input.privacyAccepted !== true) {
    errors.privacyAccepted = "Please confirm you have read the privacy notice."
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    data: {
      product: product as "telloya" | "complete",
      businessName,
      country,
      trade,
      locations: normalizeText(String(input.locations || "")),
      websiteUrl: normalizeText(String(input.websiteUrl || "")),
      fullName,
      email,
      phone,
      missedCallProblem: normalizeText(String(input.missedCallProblem || "")),
      phoneSetup: normalizeText(String(input.phoneSetup || "")),
      contactPreference: normalizeText(String(input.contactPreference || "")),
      privacyAccepted: true,
    },
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request)
  if (!body.ok) {
    const message = body.status === 413
      ? "Please keep your message within the form limits."
      : "Unable to process this enquiry right now."
    return NextResponse.json({ ok: false, message }, { status: body.status })
  }

  try {
    const validation = validateTelloyaEnquiry(body.value)
    
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, message: "Please correct the highlighted fields.", errors: validation.errors },
        { status: 400 }
      )
    }

    // TODO: Persist to database once schema is available
    // For now, return success with generated reference
    // Real implementation will use `create_telloya_enquiry_v1` RPC
    // and send customer acknowledgement + admin notification emails
    
    const mockRef = `TY-${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random() * 900000 + 100000)}`

    return NextResponse.json({
      ok: true,
      message: "Your enquiry has been received.",
      enquiryRef: mockRef,
    })
  } catch (error) {
    console.error("[telloya-enquiry] Submission error:", error)
    return NextResponse.json(
      { ok: false, message: "Unable to process this enquiry right now." },
      { status: 500 }
    )
  }
}
