"use client"
import { useRef, useState, type FormEvent } from "react"
import { CommandForm, Reason } from "../../records/forms"
import {
  AGREEMENT_WORDING_NOTICE, AUTHORIZATION_READINESS_NOTE, LOST_LINK_NOTE, MANAGER_PASSWORD_WARNING,
  defaultExpiryIso, type CaseAuthorization,
} from "@/lib/authorization/model"
import { Badge } from "../../ui"

const authEndpoint = "/api/authorization/command"
const managerEndpoint = "/api/manager-access/command"

function CopyOnceLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return <p>
    <input readOnly value={url} aria-label="Secure customer action link" />
    <button type="button" className="secondary" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true) }}>Copy link</button>
    {copied && <span role="status"> Copied. {LOST_LINK_NOTE}</span>}
  </p>
}

function IssueActionForm({ caseId, operation, extra }: { caseId: string; operation: "create_agreement_action" | "create_revocation_action"; extra?: Record<string, string> }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [link, setLink] = useState<string | null>(null)
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || link) return
    const form = new FormData(event.currentTarget)
    commandKey.current ||= crypto.randomUUID()
    setBusy(true); setMessage("")
    try {
      const expiresAt = new Date(String(form.get("expiresAt") || "")).toISOString()
      const payload = operation === "create_agreement_action" ? {
        operation, caseId, kind: form.get("kind"), title: form.get("title"), bodyText: form.get("bodyText"),
        scopeText: form.get("scopeText"), expiresAt,
      } : { operation, caseId, authorizationId: extra?.authorizationId, expiresAt }
      const response = await fetch(authEndpoint, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as { message?: string; actionUrl?: string }
      setMessage(result.message || "")
      if (response.ok && result.actionUrl) setLink(result.actionUrl)
      else if (!response.ok) commandKey.current = null
    } catch { setMessage("We couldn’t confirm the change. Reload the case before trying again.") }
    finally { setBusy(false) }
  }
  return <form className="record-form" onSubmit={submit}>
    <fieldset disabled={busy || !!link}>
      {operation === "create_agreement_action" && <>
        <p className="notice-danger">{AGREEMENT_WORDING_NOTICE}</p>
        <label>Agreement kind
          <select name="kind" required>
            <option value="SERVICE_AGREEMENT">Service agreement</option>
            <option value="CASE_MANAGEMENT_PERMISSION">Case-management permission</option>
          </select>
        </label>
        <label>Title<input name="title" required minLength={1} maxLength={200} /></label>
        <label>Approved body text<textarea name="bodyText" required minLength={20} maxLength={50000} rows={8} /></label>
        <label>Scope<textarea name="scopeText" required minLength={10} maxLength={5000} rows={4} /></label>
      </>}
      <label>Link expiry<input name="expiresAt" type="datetime-local" required defaultValue={defaultExpiryIso().slice(0, 16)} /></label>
      <p className="muted">Internal security control. Maximum 7 days. Default 48 hours. This is not a customer service promise.</p>
      <button type="submit">{busy ? "Saving…" : operation === "create_agreement_action" ? "Create customer action" : "Issue revocation action"}</button>
    </fieldset>
    <p role="status">{message}</p>
    {link && <CopyOnceLink url={link} />}
  </form>
}

export function AuthorizationPanel({ caseId, data }: { caseId: string; data: CaseAuthorization }) {
  const ready = data.readiness
  return <section className="panel">
    <h2>Agreements & permissions</h2>
    <p>{AUTHORIZATION_READINESS_NOTE}</p>
    <p className="badge-row">
      <Badge tone={data.membershipStatus === "verified" ? "success" : "warning"}>Business authority · {data.membershipStatus}</Badge>
      <Badge tone={ready.customerEmailVerified ? "success" : "warning"}>Verified customer email · {data.emailMasked}</Badge>
      <Badge tone={ready.serviceAgreementAccepted ? "success" : "neutral"}>Service agreement · {ready.serviceAgreementAccepted ? "accepted" : "not accepted"}</Badge>
      <Badge tone={ready.caseManagementPermissionActive ? "success" : "neutral"}>Case-management permission · {ready.caseManagementPermissionActive ? "active" : "not active"}</Badge>
      <Badge tone={ready.managerAccessVerified ? "success" : "neutral"}>Manager access · {ready.managerAccessVerified ? "verified" : "not verified"}</Badge>
      <Badge tone={ready.authorizationReady ? "success" : "warning"}>Overall authorisation readiness · {ready.authorizationReady ? "ready" : "not ready"}</Badge>
    </p>
    <p className="muted">Marketing or setup consent cannot satisfy case-management permission. An approved pack is not permission.</p>
    {data.authorizations.map(row => <article key={row.id} className="evidence-document">
      <h3>{row.kind} · {row.status}</h3>
      <p>Accepted {row.acceptedAt} · {row.acceptedEmailMasked} · source {row.source}</p>
      {row.status === "ACTIVE" && <>
        <details><summary>Issue a customer revocation action</summary>
          <IssueActionForm caseId={caseId} operation="create_revocation_action" extra={{ authorizationId: row.id }} />
        </details>
        <details><summary>Admin emergency revocation</summary>
          <CommandForm actionUrl={authEndpoint} endpoint="command" submitLabel="Revoke authorisation" payload={form => ({
            operation: "admin_revoke_authorization", caseId, authorizationId: row.id, recordVersion: row.recordVersion,
            reason: form.get("reason"), confirmed: form.get("confirmed") === "true",
          })}>
            <p>Requires a fresh Admin sign-in within five minutes. This never rewrites the original customer acceptance and does not refund or cancel billing.</p>
            <Reason />
            <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />I confirm this Admin-recorded revocation.</label>
          </CommandForm>
        </details>
      </>}
    </article>)}
    <details><summary>Create service agreement or case-management permission action</summary>
      <IssueActionForm caseId={caseId} operation="create_agreement_action" />
    </details>
    {data.actions.filter(action => action.status === "OPEN").map(action => <details key={action.id}>
      <summary>Revoke open action {action.id.slice(0, 8)} · {action.kind}</summary>
      <CommandForm actionUrl={authEndpoint} endpoint="command" submitLabel="Revoke open action" payload={form => ({
        operation: "revoke_action", caseId, actionId: action.id, reason: form.get("reason"), confirmed: form.get("confirmed") === "true",
      })}>
        <p>{LOST_LINK_NOTE}</p>
        <Reason />
        <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />I confirm this open action should be revoked.</label>
      </CommandForm>
    </details>)}
    <h3>Google Manager access</h3>
    <p className="notice-danger">{MANAGER_PASSWORD_WARNING}</p>
    {data.managerAccess && <p>Current: {data.managerAccess.status} · {data.managerAccess.accessLevel}</p>}
    <details><summary>Record Manager access verified</summary>
      <CommandForm actionUrl={managerEndpoint} endpoint="command" submitLabel="Record Manager access" payload={form => ({
        operation: "verify", caseId, accessLevel: form.get("accessLevel"), evidence: form.get("reason"), confirmed: form.get("confirmed") === "true",
      })}>
        <p>Requires a fresh Admin sign-in within five minutes. This is not accepted by the customer through an agreement checkbox.</p>
        <label>Access level<select name="accessLevel" required><option value="MANAGER">Manager</option><option value="OWNER">Owner</option></select></label>
        <Reason label="Verification evidence" />
        <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />I confirm Manager access was verified without collecting a Google password or one-time code.</label>
      </CommandForm>
    </details>
    {data.managerAccess?.status === "VERIFIED" && <details><summary>Revoke Manager access</summary>
      <CommandForm actionUrl={managerEndpoint} endpoint="command" submitLabel="Revoke Manager access" payload={form => ({
        operation: "revoke", caseId, reason: form.get("reason"), confirmed: form.get("confirmed") === "true",
      })}>
        <Reason />
        <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />I confirm Manager access should be revoked.</label>
      </CommandForm>
    </details>}
  </section>
}
