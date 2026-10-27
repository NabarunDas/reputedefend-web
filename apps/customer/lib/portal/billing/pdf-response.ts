import { NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { buildBillingPdf } from "../../../../../lib/billing/document-pdf"
import type { BillingDocument } from "../../../../../lib/billing/document"
import { billingLogo } from "./logo"

export function billingPdfResponse(document: BillingDocument, filename: string) {
  const pdf = buildBillingPdf(document, billingLogo())
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      ...privateResponseHeaders,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}
