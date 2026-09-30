import { ukDate } from "@/lib/admin/activity"
import { loadGuard } from "@/lib/guard/queries"
import { formatGbp } from "@/lib/commerce/model"
import { billingStateLabel, coverageStateLabel, requestProgressLabel } from "@/lib/guard/model"
import { Badge, EmptyState, PageHeader } from "../ui"
import {
  AcknowledgeExceptionForm, ApproveRefundForm, CoverageActionForm, CreateContinuationForm, CreateDirectCoverageForm, CreateIncludedOfferForm,
  IdentifyLocationForm, IssuePermissionForm, IssuePriceChangeForm, IssueSubscriptionStartForm, MappingActionForm, RecordBaselineForm,
  RevokePermissionForm, SubscriptionActionForm,
} from "./forms"

export const metadata = { title: "Guard" }

export default async function GuardPage() {
  const guard = await loadGuard()
  return <section className="page">
    <PageHeader title="Guard" description="Per-location onboarding, permission, baseline, rota, activation and subscription billing. A monitoring request is intake history only. Live monitoring, Stripe, refunds and twice-daily checks remain disabled. There is no Mark paid, Mark refunded, or override paid-through control." actions={<a href="/guard/checks">Open Guard checks</a>} />
    <section className="panel">
      <h2>Monitoring requests</h2>
      {!guard.requests.length ? <EmptyState>No monitoring requests.</EmptyState> : guard.requests.map(request => <article key={request.id} className="stack">
        <h3>{request.businessName} · {request.locationName}</h3>
        <p>{request.customerName}. Intake status {request.status}.</p>
        <p><Badge tone={request.stillRequired ? "warning" : "success"}>{requestProgressLabel(request)}</Badge></p>
        <p className="muted">Received {ukDate(request.createdAt)}. Requested count is not coverage.</p>
        {request.mappings.map(mapping => <div key={mapping.id}>
          <p>{mapping.locationName || mapping.locationId} · {mapping.source} · {mapping.status}</p>
          {mapping.source !== "INTAKE_PRIMARY" && <MappingActionForm mappingId={mapping.id} version={mapping.version} operation="remove_location" label="Remove identified location" />}
          {mapping.status === "IDENTIFIED" && <MappingActionForm mappingId={mapping.id} version={mapping.version} operation="mark_mapping_ready" label="Mark ready for onboarding" />}
          <CreateDirectCoverageForm
            mappingId={mapping.id}
            orders={guard.guardOrders.filter(order => order.locationId === mapping.locationId)}
          />
        </div>)}
        <IdentifyLocationForm
          monitoringRequestId={request.id}
          locations={guard.locations.filter(location => location.businessId === request.businessId && !request.mappings.some(mapping => mapping.locationId === location.id))}
        />
      </article>)}
    </section>
    <section className="panel">
      <h2>Included 30-day offer</h2>
      <p>Eligibility requires a restored Managed Relaunch on the same location, an accepted Managed order, and approved success evidence. The customer must choose it.</p>
      <CreateIncludedOfferForm />
    </section>
    <section className="panel">
      <h2>Coverages</h2>
      {!guard.coverages.length ? <EmptyState>No Guard coverages.</EmptyState> : <div className="table-scroll" role="region" aria-label="Guard coverages" tabIndex={0}>
        <table>
          <thead><tr><th>Location</th><th>Coverage</th><th>Billing</th><th>Readiness</th><th>Next action</th></tr></thead>
          <tbody>{guard.coverages.map(row => <tr key={row.id}>
            <td>{row.locationName}<br /><span className="muted">{row.businessName} · {row.customerName}</span></td>
            <td>
              <Badge tone={row.state === "ACTIVE" ? "success" : "neutral"}>{coverageStateLabel(row.state)}</Badge>
              <p className="muted">{row.coverageBasis === "INCLUDED" ? "Included recovery" : "Direct Guard"}</p>
              {row.activatedAt && <p>Activated {ukDate(row.activatedAt)}</p>}
              {row.includedStartAt && row.includedEndAt && <p>Included {ukDate(row.includedStartAt)} to {ukDate(row.includedEndAt)}</p>}
            </td>
            <td>
              <Badge tone={row.billingState === "CURRENT" || row.billingState === "NOT_REQUIRED" ? "success" : "warning"}>{billingStateLabel(row.billingState)}</Badge>
              {row.coverageBasis === "DIRECT_GUARD" && <p className="muted">Paid entitlement begins only after a confirmed recurring invoice. Subscription active is not enough. No Mark paid.</p>}
              {row.coverageBasis === "INCLUDED" && <p className="muted">Included 30 days never create a subscription or automatic charge.</p>}
            </td>
            <td>
              {row.readiness.readyToActivate ? <Badge tone="success">Ready to activate</Badge> : <Badge tone="warning">Blocked</Badge>}
              {!row.readiness.readyToActivate && <p className="muted">{(row.readiness.blockerCodes || []).join(", ") || "Not ready"}</p>}
              {row.exceptionId && <p>Open exception {row.exceptionStatus}</p>}
            </td>
            <td>
              {row.state !== "ENDED" && row.state !== "ACTIVE" && <>
                <IssuePermissionForm coverageId={row.id} />
                <RecordBaselineForm coverageId={row.id} version={row.version} />
                <CoverageActionForm coverageId={row.id} version={row.version} operation="assign_rota" label="Assign monitoring rota" />
                <CoverageActionForm coverageId={row.id} version={row.version} operation="activate" label="Activate Guard" />
                <CoverageActionForm coverageId={row.id} version={row.version} operation="record_activation_exception" label="Record activation exception" />
                <RevokePermissionForm coverageId={row.id} version={row.version} />
              </>}
              {row.exceptionId && <AcknowledgeExceptionForm exceptionId={row.exceptionId} />}
              {row.coverageBasis === "DIRECT_GUARD" && row.state !== "ENDED" && <IssueSubscriptionStartForm coverageId={row.id} />}
              {row.coverageBasis === "INCLUDED" && row.state !== "ENDED" && <>
                <CreateContinuationForm
                  coverageId={row.id}
                  orders={guard.guardOrders.filter(order => order.locationId === row.locationId)}
                />
              </>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    <section className="panel">
      <h2>Subscriptions</h2>
      <p>One Stripe subscription per location. Cancelling one location cannot change another. Checkout return and subscription active do not grant CURRENT entitlement.</p>
      {!(guard.subscriptions || []).length ? <EmptyState>No Guard subscriptions.</EmptyState> : <div className="table-scroll" role="region" aria-label="Guard subscriptions" tabIndex={0}>
        <table>
          <thead><tr><th>Location</th><th>Coverage / billing</th><th>Provider</th><th>Paid through</th><th>Exceptions</th><th>Next action</th></tr></thead>
          <tbody>{(guard.subscriptions || []).map(row => <tr key={row.id}>
            <td>{row.locationName}<br /><span className="muted">{row.businessName} · {row.customerName}</span></td>
            <td>
              <Badge>{row.coverageState || "No paid coverage yet"}</Badge>
              <p>{billingStateLabel(row.billingState || "PENDING")}</p>
              <p className="muted">{formatGbp(row.amountMinor)} {row.currency} / month</p>
            </td>
            <td>
              <p>{row.lifecycleState} · Stripe {row.providerStatus}</p>
              <p className="muted">{row.stripePriceId || "No mapped Price yet"}</p>
              {row.cancelAtPeriodEnd && <p>Scheduled cancellation</p>}
            </td>
            <td>
              {row.paidThroughAt ? <p>{ukDate(row.paidThroughAt)}</p> : <p className="muted">No confirmed invoice</p>}
              {row.currentPeriodEnd && <p className="muted">Period end {ukDate(row.currentPeriodEnd)}</p>}
              {row.latestPaidInvoiceId && <p className="muted">Invoice {row.latestPaidInvoiceId}</p>}
              {row.latestInvoiceFailure && <p>Failure {row.latestInvoiceFailure}</p>}
            </td>
            <td>
              {row.refundStatus && <p>Refund {row.refundStatus}</p>}
              {row.disputeStatus && <p>Dispute {row.disputeStatus} — urgent Finance work</p>}
              {row.priceChangeStatus && <p>Price change {row.priceChangeStatus}</p>}
              {row.reconciliationOpen && <p>Reconciliation mismatch</p>}
            </td>
            <td>
              {row.coverageId && <IssueSubscriptionStartForm coverageId={row.coverageId} />}
              {row.continuationId && !row.coverageId && <IssueSubscriptionStartForm continuationId={row.continuationId} />}
              <SubscriptionActionForm subscriptionId={row.id} version={row.version} operation="schedule_period_end_cancellation" label="Schedule period-end cancellation" />
              {row.cancelAtPeriodEnd && <SubscriptionActionForm subscriptionId={row.id} version={row.version} operation="undo_scheduled_cancellation" label="Undo scheduled cancellation" />}
              <SubscriptionActionForm subscriptionId={row.id} version={row.version} operation="request_immediate_cancellation" label="Request immediate cancellation review" requireReason />
              <SubscriptionActionForm subscriptionId={row.id} version={row.version} operation="approve_immediate_cancellation" label="Approve immediate cancellation" />
              <IssuePriceChangeForm subscriptionId={row.id} version={row.version} />
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      {(guard.adjustments || []).length > 0 && <div>
        <h3>Refund and credit review</h3>
        <p className="muted">No automatic pro-rata formula. Approve a specific integer amount after fresh authentication. A submitted refund is not succeeded.</p>
        {(guard.adjustments || []).map(adjustment => <div key={adjustment.id}>
          <p>{adjustment.kind} · {adjustment.status} · {formatGbp(adjustment.amountMinor)}</p>
          {adjustment.kind === "REFUND" && adjustment.status === "REQUESTED" && <ApproveRefundForm adjustmentId={adjustment.id} />}
        </div>)}
      </div>}
      {(guard.reminders || []).length > 0 && <div>
        <h3>Included reminder readiness</h3>
        <p className="muted">Reminder records are Admin-visible only. Step 11 delivery remains disabled, so no reminder email is sent.</p>
        {(guard.reminders || []).map(reminder => <p key={reminder.id}>Coverage {reminder.coverageId} · {reminder.offsetDays} days · due {ukDate(reminder.dueAt)}</p>)}
      </div>}
    </section>
  </section>
}
