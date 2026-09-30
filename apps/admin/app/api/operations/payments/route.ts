import { paymentCommand } from "@/lib/payments/command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return paymentCommand(request as never)
}
