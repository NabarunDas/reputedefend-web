"use client"
import { CommandForm } from "../../../records/forms"
import type { CaseDetail } from "@/lib/cases/model"

export function ManagedNoticeForm({ c, kind }: { c: CaseDetail; kind: "submission" | "result" | "invoice" | "completion" }) {
  return <CommandForm
    endpoint="managed-notice"
    actionUrl="/api/cases/journey/managed-notice"
    submitLabel="Queue the customer update"
    payload={() => ({ id: c.id, kind })}
  >
    <p>This queues one customer email for the next update that has not been sent. Queued is not delivered. If that update is already queued, another copy is not sent. It does not submit anything to Google and it does not charge a card.</p>
  </CommandForm>
}
