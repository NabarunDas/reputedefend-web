"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { CommandForm, Reason } from "../../../records/forms"
import { Badge } from "../../../ui"
import {
  MAX_EVIDENCE_BYTES, allowedFileAccept, evidenceActions, fileTypeLabel, formatBytes, mimeFromFilename, type EvidenceActionState, type EvidenceDocument,
  type EvidenceRequest, type EvidenceVersionRow,
} from "@/lib/evidence/model"
import {
  PACK_APPROVAL_WARNING, PACK_CONFIRMATION, PACK_PUBLISH_CONFIRMATION, PACK_PUBLISH_WARNING, PACK_STALE_WARNING, packStatusTone,
  type EligiblePackVersion, type PreparedPack, type PreparedPackCase,
} from "@/lib/packs/model"

const endpoint = "/api/evidence/command"
const time = (form: FormData, name: string) => form.get(name) ? new Date(`${form.get(name)}:00Z`).toISOString() : null

export function CreateRequestForm({ caseId }: { caseId: string }) {
  return <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Create request" payload={form => ({
    operation: "create_request", caseId, title: form.get("title"), requestText: form.get("requestText"), dueAt: time(form, "dueAt"),
  })}>
    <p>Creating this request records what is needed. It does not contact the customer.</p>
    <p>Creating an evidence request records the requirement only. It does not send an email.</p>
    <label>Title<input name="title" required maxLength={200} /></label>
    <label>Request text<textarea name="requestText" required maxLength={4000} rows={4} /></label>
    <label>Due date (UTC, optional)<input name="dueAt" type="datetime-local" /></label>
  </CommandForm>
}

export function RequestStatusForm({ caseId, request, prominentFulfil = false }: { caseId: string; request: EvidenceRequest; prominentFulfil?: boolean }) {
  const fulfil = <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Mark fulfilled" submitName={`Mark fulfilled ${request.title}`} payload={form => ({
    operation: "fulfill_request", caseId, requestId: request.id, version: request.version, note: form.get("note"),
  })}>
    <Reason name="note" label="Supporting note" />
  </CommandForm>
  return <div className="evidence-request-actions">
    {prominentFulfil ? fulfil : <details><summary>Mark fulfilled</summary>{fulfil}</details>}
    <details><summary>Cancel request</summary>
      <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Cancel request" submitName={`Cancel request ${request.title}`} payload={form => ({
        operation: "cancel_request", caseId, requestId: request.id, version: request.version, note: form.get("note"),
      })}>
        <Reason name="note" label="Reason for cancelling" />
      </CommandForm>
    </details>
  </div>
}

export function ScanRefreshForm({ caseId, versionId, context }: { caseId: string; versionId: string; context?: string }) {
  return <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Refresh scan status" submitName={context ? `Refresh scan status for ${context}` : undefined} payload={() => ({
    operation: "refresh_scan", caseId, versionId,
  })} />
}

export function AccessButtons({ caseId, versionId, actions, context }: { caseId: string; versionId: string; actions: EvidenceActionState; context?: string }) {
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
    <button type="button" disabled={!actions.view} title={actions.viewHint || undefined} aria-label={context ? `View ${context}` : undefined} aria-describedby={!actions.view && actions.viewHint ? `view-hint-${versionId}` : undefined} onClick={() => open("view")}>View</button>
    <button type="button" className="secondary" disabled={!actions.download} aria-label={context ? `Download ${context}` : undefined} onClick={() => open("download")}>Download</button>
    {message && <p role="status">{message}</p>}
  </div>
}

export function ReviewForms({ caseId, version, actions, context }: { caseId: string; version: EvidenceVersionRow; actions: EvidenceActionState; context?: string }) {
  const name = context ? `${context}` : `version ${version.versionNumber}`
  return <div className="evidence-review">
    {actions.accept && <details><summary aria-label={`Accept ${name}`}>Accept</summary>
      <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Accept version" submitName={`Accept ${name}`} payload={form => ({
        operation: "accept", caseId, versionId: version.id, recordVersion: version.recordVersion, note: form.get("note"),
      })}>
        <p>Accepting records the review only. A clean scan is not approval. Accepting does not make this file customer visible, and it does not fulfil an evidence request.</p>
        <Reason name="note" label="Review note" maxLength={2000} />
      </CommandForm>
    </details>}
    {actions.reject && <details><summary aria-label={`Reject ${name}`}>Reject</summary>
      <CommandForm actionUrl={endpoint} endpoint="command" submitLabel="Reject version" submitName={`Reject ${name}`} payload={form => ({
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
      <p>Customer visibility is required before a pack containing this file can be published. It does not publish the file by itself. Marking a file for future customer visibility does not mean a current customer portal exposes it. No current customer portal exposes this file.</p>
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
      {mode === "new" && openRequests.length > 0 && <label>Which evidence request does this file answer?
        <select name="evidenceRequestId" defaultValue="">
          <option value="">Not linked to a request</option>
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

export function CreateDraftPackForm({ caseId, intent = "create" }: { caseId: string; intent?: "create" | "replacement" }) {
  const replacement = intent === "replacement"
  return <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel={replacement ? "Prepare a replacement draft" : "Create new draft pack"} submitClass={replacement ? "secondary" : undefined} payload={() => ({
    operation: "create", caseId,
  })}>
    {replacement
      ? <p className="pack-secondary-note">Use this if the approved documents need correcting. The approved pack stays as it is.</p>
      : <p>{PACK_APPROVAL_WARNING}</p>}
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
      <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Add to pack" payload={form => {
        const role = form.get("role")
        return {
          operation: "add_item", caseId, packId: pack.id, recordVersion: pack.recordVersion, versionId: version.versionId,
          ...(role === "DELIVERABLE" || role === "EVIDENCE" || role === "INSTRUCTIONS" ? { role } : {}),
        }
      }}>
        <label>Role in the Guided pack
          <select name="role" defaultValue="DELIVERABLE">
            <option value="DELIVERABLE">Completed statement</option>
            <option value="EVIDENCE">Supporting evidence</option>
            <option value="INSTRUCTIONS">Customer submission instructions</option>
          </select>
        </label>
      </CommandForm>
    </div>
  </li>
}

function packRoleLabel(role: PreparedPack["items"][number]["role"]) {
  if (role === "DELIVERABLE") return "Completed statement"
  if (role === "EVIDENCE") return "Supporting evidence"
  if (role === "INSTRUCTIONS") return "Customer submission instructions"
  return null
}

function PackFileInventory({ pack }: { pack: PreparedPack }) {
  const count = pack.items.length
  return <>
    <p><strong>{count} file{count === 1 ? "" : "s"}.</strong></p>
    <ol className="pack-inventory">
      {pack.items.map(item => {
        const role = packRoleLabel(item.role)
        return <li key={item.id}>
          <strong>{item.documentTitle}</strong>
          <span className="pack-filename">File name: {item.originalFilename}</span>
          {role && <span className="pack-role">Role: {role}</span>}
        </li>
      })}
    </ol>
  </>
}

export function ApprovePackForm({ caseId, pack }: { caseId: string; pack: PreparedPack }) {
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (open) heading.current?.focus() }, [open])
  if (!open) return <button type="button" aria-expanded="false" onClick={() => setOpen(true)}>Review and approve pack</button>
  return <div className="pack-review" role="region" aria-label="Review pack before approval">
    <h4 ref={heading} tabIndex={-1}>Approve this draft</h4>
    <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Approve prepared pack" payload={form => ({
      operation: "approve", caseId, packId: pack.id, recordVersion: pack.recordVersion, note: form.get("note"), confirmed: form.get("confirmed") === "true",
    })}>
      <p>{PACK_APPROVAL_WARNING}</p>
      <PackFileInventory pack={pack} />
      <Reason name="note" label="Approval note" maxLength={2000} />
      <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />{PACK_CONFIRMATION}</label>
    </CommandForm>
  </div>
}

function packPublishable(pack: PreparedPack) {
  return pack.status === "APPROVED" && pack.items.length > 0 && pack.items.every(item => item.customerVisible !== false)
}

const PACK_FILE_CONFIRMATION = "I confirm these exact files are suitable for this customer to access."

export function PublishPackForm({ caseId, pack }: { caseId: string; pack: PreparedPack }) {
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (open) heading.current?.focus() }, [open])
  if (!open) return <button type="button" aria-expanded="false" onClick={() => setOpen(true)}>Review and publish pack</button>
  return <div className="pack-review" role="region" aria-label="Review pack before publishing">
    <h4 ref={heading} tabIndex={-1}>Files that will be shared</h4>
    <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Publish pack" payload={form => ({
      operation: "publish", caseId, packId: pack.id, recordVersion: pack.recordVersion, note: form.get("note"), confirmed: form.get("confirmed") === "true",
    })}>
      <PackFileInventory pack={pack} />
      <p className="notice-warning">Check every file in this list. This screen does not decide whether a file name is safe to share.</p>
      {!packPublishable(pack) && <p className="notice-danger">Every included version must be accepted, clean, valid and customer-visible before publication.</p>}
      <p>{PACK_PUBLISH_WARNING}</p>
      <Reason name="note" label="Publication note" maxLength={2000} />
      <label className="checkbox"><input type="checkbox" name="filesSuitable" value="true" required />{PACK_FILE_CONFIRMATION}</label>
      <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />{PACK_PUBLISH_CONFIRMATION}</label>
    </CommandForm>
  </div>
}

export function UnpublishPackForm({ caseId, pack }: { caseId: string; pack: PreparedPack }) {
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (open) heading.current?.focus() }, [open])
  if (!open) return <button type="button" className="secondary" aria-expanded="false" onClick={() => setOpen(true)}>Unpublish pack</button>
  return <div className="pack-review" role="region" aria-label="Unpublish pack">
    <h4 ref={heading} tabIndex={-1}>Remove customer access</h4>
    <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Unpublish pack" submitClass="secondary" payload={form => ({
      operation: "unpublish", caseId, packId: pack.id, recordVersion: pack.recordVersion, reason: form.get("reason"), confirmed: form.get("confirmed") === "true",
    })}>
      <p>The customer will lose access immediately. Publishing again later requires a new explicit publish.</p>
      <Reason name="reason" label="Reason for unpublishing" maxLength={2000} />
      <label className="checkbox"><input type="checkbox" name="confirmed" value="true" required />I confirm this pack should no longer be published.</label>
    </CommandForm>
  </div>
}

export function RecoverPackEmailForm({ caseId, pack }: { caseId: string; pack: { packId: string; recordVersion: number } }) {
  return <CommandForm actionUrl={packEndpoint} endpoint="command" submitLabel="Send pack-ready email" payload={() => ({
    operation: "send_pack_email", caseId, packId: pack.packId, recordVersion: pack.recordVersion,
  })}>
    <p>The pack is already in the portal. This queues the notification that was not sent. It does not publish the pack again, and it does not send another copy if the provider has already accepted one.</p>
  </CommandForm>
}

function PackSummary({ pack }: { pack: PreparedPack }) {
  const count = `${pack.items.length} file${pack.items.length === 1 ? "" : "s"}`
  if (pack.published) {
    return <>
      <p className="pack-status">Published — available in the customer portal</p>
      <p>{count}. The customer can open this pack in the portal. That does not by itself prove an email was delivered.</p>
      <p>This does not confirm payment, permission or submission to Google.</p>
    </>
  }
  if (pack.status === "APPROVED") {
    return <>
      <p className="pack-status">Approved — not yet shared with customer</p>
      <p>{count}. Next: review these files and publish the pack for customer access. This does not send an email by itself.</p>
      <p>This does not confirm payment, permission or submission to Google.</p>
    </>
  }
  if (pack.status === "DRAFT") {
    return <>
      <p className="pack-status">{pack.items.length ? "Draft — add documents, then approve" : "Draft — add the accepted documents"}</p>
      <p>{pack.items.length
        ? `${count}. Add any remaining accepted documents, then approve the pack. Approval does not share it with the customer.`
        : "Next: add accepted documents. An empty draft cannot be approved."}</p>
    </>
  }
  if (pack.status === "STALE") return <p className="pack-status">Stale — do not publish this pack</p>
  return <>
    <p className="pack-status">Superseded — read-only history</p>
    <p>This pack was replaced by a later pack. It cannot be changed or published.</p>
  </>
}

export function PreparedPackPanel({ caseId, packs }: { caseId: string; packs: PreparedPackCase }) {
  const draft = packs.packs.find(pack => pack.status === "DRAFT")
  const inDraft = new Set(draft?.items.map(item => item.versionId) ?? [])
  const eligible = packs.eligible.filter(version => !inDraft.has(version.versionId))
  const replacementId = draft ? null : (
    packs.packs.find(pack => pack.status === "APPROVED" && !pack.published)?.id
    ?? packs.packs.find(pack => pack.published)?.id
    ?? null
  )
  return <section className="panel">
    <h2>Prepared submission pack</h2>
    {!packs.packs.length && <>
      <p>No prepared pack yet. Create a draft, add the accepted documents, then approve it.</p>
      <CreateDraftPackForm caseId={caseId} />
    </>}
    {packs.packs.map(pack => <article key={pack.id} className="evidence-document">
      <h3>Pack #{pack.packNumber}</h3>
      <p className="badge-row"><Badge tone={pack.published ? "success" : packStatusTone(pack.status)}>{pack.published ? "Published" : pack.status}</Badge></p>
      <div className="pack-actions">
        <PackSummary pack={pack} />
        {pack.status === "STALE" && <p className="notice-danger">{PACK_STALE_WARNING}</p>}
        {pack.approvalNote && <p className="preserve-lines">Approval note: {pack.approvalNote}</p>}
        {pack.publicationNote && <p className="preserve-lines">Publication note: {pack.publicationNote}</p>}
        <div className="pack-action-row">
          {pack.status === "DRAFT" && pack.items.length > 0 && <ApprovePackForm caseId={caseId} pack={pack} />}
          {pack.status === "APPROVED" && !pack.published && <PublishPackForm caseId={caseId} pack={pack} />}
          {pack.published && <UnpublishPackForm caseId={caseId} pack={pack} />}
        </div>
        {pack.id === replacementId && <CreateDraftPackForm caseId={caseId} intent="replacement" />}
      </div>
      {!pack.items.length && pack.status === "DRAFT" && <p className="muted">This draft is empty. Add accepted evidence below.</p>}
      {pack.items.length > 0 && <ol className="task-list">{pack.items.map((item, index) => <li key={item.id}>
        <strong>{item.documentTitle}</strong> · {item.originalFilename} · {fileTypeLabel(item.contentType)} · {formatBytes(item.sizeBytes)} · version {item.versionNumber}
        <PackItemActions caseId={caseId} pack={pack} item={item} index={index} last={index === pack.items.length - 1} />
      </li>)}</ol>}
      {pack.status === "DRAFT" && <>
        <h4>Eligible accepted evidence</h4>
        {!eligible.length && <p className="muted">No further accepted, clean and valid versions are available to add.</p>}
        <ul className="task-list">{eligible.map(version => <EligibleVersionRow key={version.versionId} caseId={caseId} pack={pack} version={version} />)}</ul>
      </>}
    </article>)}
    {!draft && packs.packs.length > 0 && !replacementId && <div className="pack-actions">
      <p>Next: create a new draft from the accepted documents.</p>
      <CreateDraftPackForm caseId={caseId} />
    </div>}
  </section>
}
