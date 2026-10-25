"use client"
import { CommandForm, Reason } from "../../../records/forms"
import type { CaseDetail } from "@/lib/cases/model"

export function GuidedCloseForm({ c }: { c: CaseDetail }) {
  return <CommandForm
    endpoint="guided-close"
    actionUrl="/api/cases/guided-close"
    submitClass="danger"
    submitLabel="Close the Guided preparation"
    payload={form => ({
      id: c.id,
      version: c.version,
      summary: form.get("summary"),
      note: form.get("note"),
    })}
  >
    <p>The completed pack is already available to the customer. Closing records that the Guided preparation is delivered. It does not record a Google decision, and it does not enrol Relaunch Guard.</p>
    <label>Customer summary<textarea name="summary" required minLength={10} maxLength={2000} /></label>
    <Reason name="note" label="Supporting note" />
    <label className="checkbox"><input type="checkbox" required />I reviewed the customer summary. The customer submits this pack to Google. ProfileRelaunch does not.</label>
  </CommandForm>
}

export function RecoverCompletionForm({ c, summary }: { c: CaseDetail; summary: string }) {
  return <CommandForm
    endpoint="guided-close"
    actionUrl="/api/cases/guided-close"
    submitLabel="Send completion update"
    payload={() => ({
      id: c.id,
      version: c.version,
      summary,
      note: "Send the completion update that was not queued when the preparation was closed.",
    })}
  >
    <p>The Guided preparation is already closed. This queues the completion update that was not sent. It does not close the case again, and it does not send another copy if one is already queued.</p>
  </CommandForm>
}
