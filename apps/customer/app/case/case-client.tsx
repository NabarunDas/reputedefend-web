"use client"
import { useState } from "react"
import {
  allowedFileAccept, canDownloadItem, canViewItem, fileTypeLabel, formatBytes, submissionLabel,
  type CustomerCasePack, type CustomerEvidenceRequest, type CustomerSubmissionStatus,
} from "@/lib/case/model"

export function CaseClient({ data }: { data: CustomerCasePack }) {
  const pack = data.pack
  return <section>
    <h1>Case documents</h1>
    <p>{data.caseReference} · {data.businessName}{data.locationName ? ` · ${data.locationName}` : ""}</p>
    <p className="muted">Signed in as {data.maskedEmail}. This session is short-lived and only covers this case.</p>
    {!pack && <p>No case documents are currently published.</p>}
    {pack && <>
      <p>Published pack #{pack.packNumber}</p>
      <ol className="document-list">
        {pack.items.map(item => <li key={item.versionId}>
          <strong>{item.documentTitle}</strong> · {item.originalFilename} · {fileTypeLabel(item.contentType)} · {formatBytes(item.sizeBytes)}
          <FileButtons versionId={item.versionId} view={canViewItem(item)} download={canDownloadItem(item)} />
        </li>)}
      </ol>
    </>}
    <EvidenceRequests requests={data.evidenceRequests} />
  </section>
}

function EvidenceRequests({ requests }: { requests: CustomerEvidenceRequest[] }) {
  return <section>
    <h2>Evidence requests</h2>
    {!requests.length && <p>No open evidence requests.</p>}
    {!!requests.length && <ul className="document-list">
      {requests.map(request => <EvidenceRequestRow key={request.requestId} request={request} />)}
    </ul>}
  </section>
}

function EvidenceRequestRow({ request }: { request: CustomerEvidenceRequest }) {
  const [status, setStatus] = useState<CustomerSubmissionStatus>(request.submissionStatus)
  const [filename, setFilename] = useState(request.filename)
  const [message, setMessage] = useState("")
  const submitted = status === "AWAITING_REVIEW"
  return <li>
    <strong>{request.title}</strong>
    <p className="preserve-lines">{request.requestText}</p>
    {request.dueAt && <p className="muted">Due {formatDue(request.dueAt)}</p>}
    <p>{submissionLabel(status)}{filename ? ` · ${filename}` : ""}</p>
    {status === "UPLOAD_PENDING" && <p className="muted">Choose the same file to resume, or another permitted file to start again.</p>}
    {!submitted && <UploadEvidence requestId={request.requestId} onUploaded={(name) => { setStatus("AWAITING_REVIEW"); setFilename(name); setMessage("Uploaded — awaiting security review") }} onMessage={setMessage} />}
    {message && <p role="status">{message}</p>}
  </li>
}

function UploadEvidence({
  requestId, onUploaded, onMessage,
}: {
  requestId: string
  onUploaded: (filename: string) => void
  onMessage: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  async function choose(file: File | undefined) {
    if (!file || busy) return
    setBusy(true)
    onMessage("")
    const beginKey = crypto.randomUUID()
    try {
      const begun = await fetch("/api/case/evidence/upload", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": beginKey },
        body: JSON.stringify({
          operation: "begin",
          evidenceRequestId: requestId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      })
      const start = await begun.json() as { message?: string; versionId?: string; upload?: { url: string; fields: Record<string, string> } }
      if (!begun.ok || !start.versionId || !start.upload?.url || !start.upload.fields) {
        onMessage(start.message || "That file cannot be uploaded.")
        return
      }
      const body = new FormData()
      for (const [field, value] of Object.entries(start.upload.fields)) body.append(field, value)
      body.append("file", file)
      const stored = await fetch(start.upload.url, { method: "POST", body })
      if (!stored.ok) {
        onMessage("The file could not be stored. Try again.")
        return
      }
      const finished = await fetch("/api/case/evidence/upload", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ operation: "finalize", versionId: start.versionId }),
      })
      const result = await finished.json() as { message?: string }
      if (!finished.ok) {
        onMessage(result.message || "That upload cannot be completed.")
        return
      }
      onUploaded(file.name)
    } catch {
      onMessage("We couldn’t upload that file. Reload this page and try again.")
    } finally {
      setBusy(false)
    }
  }
  return <label>
    Upload evidence
    <input type="file" accept={allowedFileAccept} disabled={busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = "" }} />
  </label>
}

function FileButtons({ versionId, view, download }: { versionId: string; view: boolean; download: boolean }) {
  const [message, setMessage] = useState("")
  async function open(operation: "view" | "download") {
    setMessage("")
    const tab = window.open("about:blank", "_blank")
    if (!tab) {
      setMessage("Your browser blocked the new tab. Allow pop-ups and try again.")
      return
    }
    try { tab.opener = null } catch { /* Ignore browsers that already severed opener. */ }
    try {
      const response = await fetch("/api/case/evidence/access", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ operation, versionId }),
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
      setMessage("We couldn’t open that file. Reload this page and try again.")
    }
  }
  return <div className="button-row">
    <button type="button" disabled={!view} onClick={() => open("view")}>View</button>
    <button type="button" className="secondary" disabled={!download} onClick={() => open("download")}>Download</button>
    {message && <p role="status">{message}</p>}
  </div>
}

function formatDue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
