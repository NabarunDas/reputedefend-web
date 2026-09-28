"use client"
import { useState } from "react"
import { canDownloadItem, canViewItem, fileTypeLabel, formatBytes, type CustomerCasePack } from "@/lib/case/model"

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
  </section>
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
