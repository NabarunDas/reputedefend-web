export type ScenarioMark = {
  id: number
  status: "mock_passed" | "not_executed"
  detail: string
}

/**
 * Scenario 8's live outage is not executed. The delivered failure event and
 * a silent store are mocked. Scenarios 1, 10, and 11 are not executed at all.
 */
export const ACCEPTANCE_SCENARIOS: readonly ScenarioMark[] = [
  { id: 1, status: "not_executed", detail: "NOT EXECUTED. An answered call needs the telephone network and never reaches this webhook." },
  { id: 2, status: "mock_passed", detail: "Signed call_analyzed fixture creates one completed lead." },
  { id: 3, status: "mock_passed", detail: "Caller-supplied callback number is kept. Network CLI is not." },
  { id: 4, status: "mock_passed", detail: "Preference is recorded. No appointment is promised. Hours rule is still unapproved." },
  { id: 5, status: "mock_passed", detail: "Early hang-up stays incomplete and does not invent a number." },
  { id: 6, status: "mock_passed", detail: "Identical call_ended retry keeps one receipt and does not notify." },
  { id: 7, status: "mock_passed", detail: "Invalid x-retell-signature is rejected before field extraction." },
  { id: 8, status: "not_executed", detail: "NOT EXECUTED for a live provider outage. Failure-event and silence fixtures are mocked separately." },
  { id: 9, status: "mock_passed", detail: "Notification failure keeps one lead and one idempotency key. No Resend call." },
  { id: 10, status: "not_executed", detail: "NOT EXECUTED. Emergency and abusive-call handling waits on the owner." },
  { id: 11, status: "not_executed", detail: "NOT EXECUTED. Provider recording and transcript settings are not in this repository." },
  { id: 12, status: "mock_passed", detail: "Tenant reader is scoped. Unknown or disagreeing number and agent create no lead." },
  { id: 13, status: "mock_passed", detail: "call_ended then call_analyzed share one lead. Different hashes are not a conflict." },
  { id: 14, status: "mock_passed", detail: "call_ended after analysis does not downgrade the lead." },
  { id: 15, status: "mock_passed", detail: "Duplicate call_analyzed keeps one notification intent." },
  { id: 16, status: "mock_passed", detail: "A conflicting retry of the same event does not overwrite." },
  { id: 17, status: "mock_passed", detail: "Explicit fallback finalises a partial call. No timer is implemented." },
  { id: 18, status: "mock_passed", detail: "Transcript and recording URL are absent from the stored receipt and lead." },
  { id: 19, status: "mock_passed", detail: "Unknown usage and concurrency do not authorise a charge or stop a call." },
  { id: 20, status: "mock_passed", detail: "Usage gaps are exceptions. A missing call is not zero minutes." },
]

export function scenarioMark(id: number): ScenarioMark {
  const mark = ACCEPTANCE_SCENARIOS.find((item) => item.id === id)
  if (!mark) throw new Error(`missing scenario ${id}`)
  return mark
}
