import { reportExportCommand } from "@/lib/reports/command"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return reportExportCommand(request as never)
}
