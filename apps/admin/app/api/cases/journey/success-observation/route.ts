import { recordSuccessObservation } from "@/lib/payments/success-observation"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return recordSuccessObservation(request as never)
}
