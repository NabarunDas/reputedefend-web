"use client"
import { CommandForm } from "../records/forms"

export function TelloyaDemoForm({
  enquiryId,
  version,
  status,
  timezone,
}: {
  enquiryId: string
  version: number
  status: "NOT_BOOKED" | "BOOKED" | "COMPLETED"
  timezone: string
}) {
  if (status === "COMPLETED") return null
  const next = status === "NOT_BOOKED" ? "BOOKED" : "COMPLETED"
  const label = next === "BOOKED" ? "Mark demo booked" : "Mark demo completed"
  return <CommandForm
    endpoint="demo"
    actionUrl="/api/enquiries/demo"
    submitLabel={label}
    payload={form => {
      const at = form.get("at")
      return {
        enquiryId,
        expectedVersion: version,
        status: next,
        at: typeof at === "string" && at ? new Date(`${at}:00Z`).toISOString() : null,
        timezone: form.get("timezone"),
        note: form.get("note"),
      }
    }}
  >
    <p>This records an offline demonstration. It does not book, place, or provision a Retell demonstration.</p>
    <label>Time (UTC)<input name="at" type="datetime-local" required /></label>
    <label>Time zone<input name="timezone" required maxLength={80} defaultValue={timezone || "Europe/London"} /></label>
    <label>Note<textarea name="note" maxLength={500} rows={2} /></label>
  </CommandForm>
}
