import { ukDate } from "@/lib/admin/activity"
import { loadGuard } from "@/lib/guard/queries"
import { billingStateLabel, coverageStateLabel, requestProgressLabel } from "@/lib/guard/model"
import { Badge, EmptyState, PageHeader } from "../ui"
import {
  AcknowledgeExceptionForm, CoverageActionForm, CreateDirectCoverageForm, CreateIncludedOfferForm,
  IdentifyLocationForm, IssuePermissionForm, MappingActionForm, RecordBaselineForm, RevokePermissionForm,
} from "./forms"

export const metadata = { title: "Guard" }

export default async function GuardPage() {
  const guard = await loadGuard()
  return <section className="page">
    <PageHeader title="Guard" description="Per-location onboarding, permission, baseline, rota and activation. A monitoring request is intake history only. Live monitoring, Stripe subscriptions and twice-daily checks are not enabled. There is no Mark Guard paid control." />
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
              {row.coverageBasis === "DIRECT_GUARD" && <p className="muted">Pending until Step 16 provider entitlement. No Mark paid.</p>}
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
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </section>
}
