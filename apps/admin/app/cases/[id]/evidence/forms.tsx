"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { CommandForm, Reason } from "../../../records/forms"
import { Badge } from "../../../ui"
import {
  MAX_EVIDENCE_BYTES, allowedFileAccept, evidenceActions, fileTypeLabel, formatBytes, mimeFromFilename, type EvidenceActionState, type EvidenceDocument,
  type EvidenceRequest, type EvidenceVersionRow,
} from "@/lib/evidence/model"
import {
  PACK_APPROVAL_WARNING, PACK_CONFIRMATION, PACK_STALE_WARNING, packStatusTone,
  type EligiblePackVersion, type PreparedPack, type PreparedPackCase,
} from "@/lib/packs/model"

const endpoint = "/api/evidence/command"
const time = (form: FormData, name: string) => form.get(name) ? new Date(`${form.get(name)}:00Z`).toISOString() : null

export function CreateRequestForm({ caseId }: { caseId: string }) {
  return <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Create request" payload={form => ({
    operation: "create_request", caseId, title: form.get("title"), requestText: form.get("requestText"), dueAt: time(form, "dueAt"),
  })}>
    <p>Creating an evidence request records the requirement only. It does not send an email.</p>
    <label>Title<input name="title" required maxLength={200} /></label>
    <label>Request text<textarea name="requestText" required maxLength={4000} rows={4} /></label>
    <label>Due date (UTC, optional)<input name="dueAt" type="datetime-local" /></label>
  </CommandForm>
}

export function RequestStatusForm({ caseId, request }: { caseId: string; request: EvidenceRequest }) {
  return <div className="evidence-request-actions">
    <details><summary>Fulfill</summary>
      <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Mark fulfilled" payload={form => ({
        operation: "fulfill_request", caseId, requestId: request.id, version: request.version, note: form.get("note"),
      })}>
        <Reason name="note" label="Supporting note" />
      </CommandForm>
    </details>
    <details><summary>Cancel</summary>
      <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Cancel request" payload={form => ({
        operation: "cancel_request", caseId, requestId: request.id, version: request.version, note: form.get("note"),
      })}>
        <Reason name="note" label="Reason for cancelling" />
      </CommandForm>
    </details>
  </div>
}

export function ScanRefreshForm({ caseId, versionId }: { caseId: string; versionId: string }) {
  return <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Refresh scan status" payload={() => ({
    operation: "refresh_scan", caseId, versionId,
  })} />
}

export function AccessButtons({ caseId, versionId, actions }: { caseId: string; versionId: string; actions: EvidenceActionState }) {
  const [message, setMessage] = useState("")
  async function open(operation: "view" | "download") {
    setMessage("")
    const tab = window.open("about:blank", "_blank")
    if (!tab) {
      setMessage("Your browser blocked the new tab. Allow pop-ups for the Admin Portal and try again.")
      return
    }
    try { tab.opener = null } catch { /* Ignore browsers that already severed opener. */ }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ operation, caseId, versionId }),
      })
      const result = await response.json() as { message?: string; url?: string }
      if (response.ok && typeof result.url === "string" && result.url.startsWith("https://")) {
        tab.location.replace(result.url)
        setMessage(result.message || "")
        return
      }
      tab.close()
      setMessage(result.message || "That file cannot be opened.")
    } catch {
      tab.close()
      setMessage("We couldn’t open that file. Reload the case before trying again.")
    }
  }
  return <div className="evidence-access">
    <button type="button" disabled={!actions.view} title={actions.viewHint || undefined} aria-describedby={!actions.view && actions.viewHint ? `view-hint-${versionId}` : undefined} onClick={() => open("view")}>View</button>
    <button type="button" className="secondary" disabled={!actions.download} onClick={() => open("download")}>Download</button>
    {message && <p role="status">{message}</p>}
  </div>
}

export function ReviewForms({ caseId, version, actions }: { caseId: string; version: EvidenceVersionRow; actions: EvidenceActionState }) {
  return <div className="evidence-review">
    {actions.accept && <details><summary>Accept</summary>
      <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Accept version" payload={form => ({
        operation: "accept", caseId, versionId: version.id, recordVersion: version.recordVersion, note: form.get("note"),
      })}>
        <p>Accepting records the review only. It does not make this file customer visible.</p>
        <Reason name="note" label="Review note" maxLength={2000} />
      </CommandForm>
    </details>}
    {actions.reject && <details><summary>Reject</summary>
      <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Reject version" payload={form => ({
        operation: "reject", caseId, versionId: version.id, recordVersion: version.recordVersion, note: form.get("note"),
      })}>
        {version.reviewStatus === "ACCEPTED" && <label className="checkbox"><input type="checkbox" required />I confirm I want to reject a previously accepted version.</label>}
        <Reason name="note" label="Review note" maxLength={2000} />
      </CommandForm>
    </details>}
  </div>
}

export function VisibilityForm({ caseId, version }: { caseId: string; version: EvidenceVersionRow }) {
  return <details><summary>Customer visibility</summary>
    <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Save visibility" payload={form => ({
      operation: "set_visibility", caseId, versionId: version.id, recordVersion: version.recordVersion,
      note: form.get("note"), customerVisible: form.get("customerVisible") === "true",
    })}>
      <p>Customer visibility is recorded for future customer access. No customer portal currently exposes this file.</p>
      <label>Future customer visibility
        <select name="customerVisible" defaultValue={version.customerVisible ? "true" : "false"}>
          <option value="false">Not visible</option>
          <option value="true">Visible later</option>
        </select>
      </label>
      <label className="checkbox"><input type="checkbox" required />I confirm this visibility change. It does not publish a customer download.</label>
      <Reason name="note" label="Reason for this visibility change" maxLength={2000} />
    </CommandForm>
  </details>
}

export function UploadEvidenceForm({ caseId, documents, openRequests }: { caseId: string; documents: EvidenceDocument[]; openRequests: EvidenceRequest[] }) {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<"new" | "version">("new")
  const commandKey = useRef<string | null>(null)
  const router = useRouter()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get("file")
    if (!(file instanceof File) || file.size < 1) { setMessage("Choose a file to upload."); return }
    if (file.size > MAX_EVIDENCE_BYTES) { setMessage("Maximum file size 10 MB."); return }
    const contentType = mimeFromFilename(file.name, file.type)
    if (!contentType) { setMessage("Use a PDF, JPG, JPEG, PNG, WebP or DOCX file."); return }
    const title = String(data.get("title") || "").trim()
    if (!title) { setMessage("Enter a document title."); return }
    const documentId = mode === "version" ? String(data.get("documentId") || "") : null
    const evidenceRequestId = mode === "new" && data.get("evidenceRequestId") ? String(data.get("evidenceRequestId")) : null
    commandKey.current ||= crypto.randomUUID()
    setBusy(true); setMessage("Preparing a private upload…")
    try {
      const begin = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify({
          operation: "begin", caseId, documentId, filename: file.name, contentType, size: file.size, title,
          evidenceRequestId: evidenceRequestId || null,
        }),
      })
      const prepared = await begin.json() as { message?: string; versionId?: string; upload?: { url: string; fields: Record<string, string> } }
      if (!begin.ok || !prepared.upload || !prepared.versionId) {
        setMessage(prepared.message || "The upload could not be prepared.")
        if (begin.status < 500 && begin.status !== 409) commandKey.current = null
        return
      }
      const body = new FormData()
      for (const [field, value] of Object.entries(prepared.upload.fields)) body.append(field, value)
      body.append("file", file)
      setMessage("Uploading to private storage…")
      const uploaded = await fetch(prepared.upload.url, { method: "POST", body })
      if (!uploaded.ok) {
        setMessage("The file was not accepted by storage. Check the type and size and try again.")
        commandKey.current = null
        return
      }
      const finalizeKey = crypto.randomUUID()
      const finalized = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": finalizeKey },
        body: JSON.stringify({ operation: "finalize", caseId, versionId: prepared.versionId }),
      })
      const result = await finalized.json() as { message?: string }
      setMessage(finalized.ok ? "Waiting for security scan." : (result.message || "The upload could not be finalized."))
      if (finalized.ok) { commandKey.current = null; form.reset(); setMode("new"); router.refresh() }
    } catch {
      setMessage("We couldn’t confirm the upload. Reload the case before trying again.")
    } finally {
      setBusy(false)
    }
  }

  return <form className="record-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <label>Upload as
        <select name="mode" value={mode} onChange={event => setMode(event.target.value === "version" ? "version" : "new")}>
          <option value="new">New logical document</option>
          <option value="version" disabled={!documents.length}>New version of an existing document</option>
        </select>
      </label>
      {mode === "version" && <label>Existing document
        <select name="documentId" required>
          {documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}
        </select>
      </label>}
      {mode === "new" && openRequests.length > 0 && <label>Link to an open evidence request (optional)
        <select name="evidenceRequestId" defaultValue="">
          <option value="">Not linked</option>
          {openRequests.map(request => <option key={request.id} value={request.id}>{request.title}</option>)}
        </select>
      </label>}
      <label>Document title<input name="title" required maxLength={200} /></label>
      <label>File<input name="file" type="file" required accept={allowedFileAccept} /></label>
      <p className="muted">Accepted: .pdf .jpg .jpeg .png .webp .docx. Maximum file size 10 MB.</p>
      <button type="submit">{busy ? "Uploading…" : "Upload"}</button>
    </fieldset>
    <p role="status">{message}</p>
  </form>
}

const packEndpoint = "/api/packs/command"

export function CreateDraftPackForm({ caseId }: { caseId: string }) {
  return <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Create new draft pack" payload={() => ({
    operation: "create", caseId,
  })}>
    <p>{PACK_APPROVAL_WARNING}</p>
  </CommandForm>
}

function PackItemActions({ caseId, pack, item, index, last }: { caseId: string; pack: PreparedPack; item: PreparedPack["items"][number]; index: number; last: boolean }) {
  const actions = evidenceActions({
    uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED",
    contentType: item.contentType,
  })
  return <div className="evidence-actions">
    <AccessButtons caseId={caseId} versionId={item.versionId} actions={actions} />
    {pack.status === "DRAFT" && <>
      <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Remove" payload={() => ({
        operation: "remove_item", caseId, packId: pack.id, recordVersion: pack.recordVersion, versionId: item.versionId,
      })} />
      {index > 0 && <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Move up" payload={() => ({
        operation: "move_item", caseId, packId: pack.id, recordVersion: pack.recordVersion, versionId: item.versionId, direction: "up",
      })} />}
      {!last && <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Move down" payload={() => ({
        operation: "move_item", caseId, packId: pack.id, recordVersion: pack.recordVersion, versionId: item.versionId, direction: "down",
      })} />}
    </>}
  </div>
}

function EligibleVersionRow({ caseId, pack, version }: { caseId: string; pack: PreparedPack; version: EligiblePackVersion }) {
  const actions = evidenceActions({
    uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED",
    contentType: version.contentType,
  })
  return <li>
    <strong>{version.documentTitle}</strong> · {version.originalFilename} · {fileTypeLabel(version.contentType)} · {formatBytes(version.sizeBytes)} · version {version.versionNumber}
    <div className="evidence-actions">
      <AccessButtons caseId={caseId} versionId={version.versionId} actions={actions} />
      <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Add to pack" payload={() => ({
        operation: "add_item", caseId, packId: pack.id, recordVersion: pack.recordVersion, versionId: version.versionId,
      })} />
    </div>
  </li>
}

export function ApprovePackForm({ caseId, pack }: { caseId: string; pack: PreparedPack }) {
  return <details><summary>Approve pack</summary>
    <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Approve prepared pack" payload={form => ({
      operation: "approve", caseId, packId: pack.id, recordVersion: pack.recordVersion, note: form.get("note"), confirmed: form.get("confirmed") === "true",
    })}>
      <p>{PACK_APPROVAL_WARNING}</p>
      <Reason name="note" label="Approval note" maxLength={2000} />
      <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />{PACK_CONFIRMATION}</label>
    </CommandForm>
  </details>
}

export function PreparedPackPanel({ caseId, packs }: { caseId: string; packs: PreparedPackCase }) {
  const draft = packs.packs.find(pack => pack.status === "DRAFT")
  const inDraft = new Set(draft?.items.map(item => item.versionId) ?? [])
  const eligible = packs.eligible.filter(version => !inDraft.has(version.versionId))
  return <section className="panel">
    <h2>Prepared submission pack</h2>
    <p>{PACK_APPROVAL_WARNING}</p>
    {!packs.packs.length && <p className="muted">No prepared packs recorded.</p>}
    {packs.packs.map(pack => <article key={pack.id} className="evidence-document">
      <h3>Pack #{pack.packNumber} · {pack.status}</h3>
      <p className="badge-row"><Badge tone={packStatusTone(pack.status)}>{pack.status}</Badge></p>
      {pack.status === "STALE" && <p className="notice-danger">{PACK_STALE_WARNING}</p>}
      {pack.status === "SUPERSEDED" && <p className="muted">This pack was replaced by a later approved pack. It is read-only history.</p>}
      {pack.status === "APPROVED" && <p className="muted">This pack is a read-only snapshot of the approved evidence versions. It does not confirm payment, permission or submission to Google.</p>}
      {pack.approvalNote && <p className="preserve-lines">Approval note: {pack.approvalNote}</p>}
      {!pack.items.length && <p className="muted">This draft is empty. Add accepted evidence below.</p>}
      <ol className="task-list">{pack.items.map((item, index) => <li key={item.id}>
        <strong>{item.documentTitle}</strong> · {item.originalFilename} · {fileTypeLabel(item.contentType)} · {formatBytes(item.sizeBytes)} · version {item.versionNumber}
        <PackItemActions caseId={caseId} pack={pack} item={item} index={index} last={index === pack.items.length - 1} />
      </li>)}</ol>
      {pack.status === "DRAFT" && <>
        <h4>Eligible accepted evidence</h4>
        {!eligible.length && <p className="muted">No further accepted, clean and valid versions are available to add.</p>}
        <ul className="task-list">{eligible.map(version => <EligibleVersionRow key={version.versionId} caseId={caseId} pack={pack} version={version} />)}</ul>
        {pack.items.length > 0 && <ApprovePackForm caseId={caseId} pack={pack} />}
      </>}
    </article>)}
    {!draft && <CreateDraftPackForm caseId={caseId} />}
  </section>
}
