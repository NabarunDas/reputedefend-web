import { ukDate } from "@/lib/admin/activity"
import type { SetupQueueItem } from "@/lib/commercial/setup-queue"
import { Badge, EmptyState } from "../../ui"

const futureCommands = [
  "Begin setup",
  "Confirm business preferences",
  "Confirm AI configuration",
  "Record provider and number allocation",
  "Record successful test call",
  "Request customer forwarding confirmation",
  "Approve activation",
] as const

function money(minor: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100)
}

function operationalLabel(status: SetupQueueItem["operationalStatus"]): string {
  if (status === "not_started") return "Setup not started"
  if (status === "setup_started") return "Setup in progress"
  return "Awaiting final verification"
}

export function SetupQueueView({ items }: { items: readonly SetupQueueItem[] }) {
  return <>
    {items.length === 0 ? <EmptyState>No paid Telloya or Complete subscription is waiting for setup.</EmptyState> : (
      <div className="table-scroll" role="region" aria-label="Paid subscriptions awaiting setup" tabIndex={0}>
        <table>
          <caption>Paid subscriptions whose service is not active. Payment is taken from stored evidence.</caption>
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Subscription</th>
              <th scope="col">Locations</th>
              <th scope="col">Payment</th>
              <th scope="col">Setup</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.reference}>
                <td>
                  <span>{item.customerName}</span><br />
                  <span>{item.businessName}</span>
                </td>
                <td>
                  <Badge tone="info">{item.product}</Badge><br />
                  {item.reference}<br />
                  <span className="muted">{item.plan} · {money(item.monthlyPriceMinor)} a month</span>
                </td>
                <td>
                  {item.locations.length === 0 ? "No location selected" : item.locations.map(location => location.locationName).join(", ")}
                  {item.guard.included ? (
                    <>
                      <br />
                      <span className="muted">
                        Guard locations included: {item.guard.quantity}. Monitoring has not started.
                        {item.guard.assignment === "pending_confirmation"
                          ? " Location assignment is pending confirmation."
                          : ` Assigned: ${item.guard.locations.map(location => location.locationName).join(", ")}.`}
                      </span>
                    </>
                  ) : null}
                </td>
                <td>
                  <Badge tone="success">Verified initial settlement</Badge><br />
                  <span className="muted">{ukDate(item.paymentConfirmedAt)}</span><br />
                  <span className="muted">{ukDate(item.periodStart)} to {ukDate(item.periodEnd)}. A later period is not shown as paid.</span>
                </td>
                <td>
                  {operationalLabel(item.operationalStatus)}<br />
                  {item.customerDisplay}<br />
                  <span className="muted">Next action: {item.nextAction}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <h2>Later setup commands</h2>
    <p>These actions are not available from this page. A later phase can record each one as its own audited command. None of them runs because a subscription is financially active.</p>
    <ul>
      {futureCommands.map(command => <li key={command}>{command}</li>)}
    </ul>
  </>
}
