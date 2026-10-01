import { ukDate } from "@/lib/admin/activity"
import type { IntegrationHealthView } from "@/lib/integrations/model"
import { EmptyState } from "../ui"

// Readiness surface only. The connect action stays unavailable until a
// separate activation decision turns every live condition on, so there is no
// button here that could look like it works.
export function IntegrationPanel({ health }: { health: IntegrationHealthView }) {
  return <section id="integrations" className="panel">
    <h2>Integrations</h2>
    <h3>{health.label}</h3>
    <ul>
      <li>Provider mode: {health.mode === "manual" ? "Manual" : "Google"}</li>
      <li>API capability: {health.capabilityText}</li>
      <li>Connection: {health.connectionText}</li>
      <li>Last successful check: {health.lastSuccessAt ? ukDate(health.lastSuccessAt) : "None recorded"}</li>
      <li>Last provider error: {health.lastErrorText ?? "None recorded"}</li>
      <li>Manual fallback: {health.manualFallbackActive ? "Active" : "Not active"}</li>
    </ul>
    {health.connectAvailable
      ? null
      : <EmptyState>{health.notice}</EmptyState>}
    {health.blockerText.length > 0 && <ul>
      {health.blockerText.map(text => <li key={text}>{text}</li>)}
    </ul>}
    <button type="button" disabled aria-disabled="true">Connect Google Business Profile</button>
    <p className="muted">
      Guard checks continue to be recorded manually by an Admin. Connecting a Google Business Profile account is
      not available yet and no Google request is made from this page. Client secrets, access tokens and refresh
      tokens are never shown here and are never returned to the browser.
    </p>
  </section>
}
