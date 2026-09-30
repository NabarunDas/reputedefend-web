import { guardSubscriptionCommand } from "@/lib/action/guard-subscription"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return guardSubscriptionCommand(request as never)
}
