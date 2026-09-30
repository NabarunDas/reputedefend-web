import { paymentCommand } from "@/lib/action/payment"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return paymentCommand(request as never)
}
