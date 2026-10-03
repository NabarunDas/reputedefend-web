"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { allowedFileAccept, fileExtension, mimeExtensions } from "@/lib/case/model"
import { declaredUpload } from "@/lib/case/validation"
import { UPLOAD_CONSTRAINTS } from "@/lib/portal/documents/model"

const CHECK_FILE = "Check the file type and size. Use a PDF, JPEG, PNG, WebP or DOCX up to 10 MB."
const RETRY = "We couldn't upload that file. Please try again shortly."

function contentTypeFor(file: File): string {
  if (file.type) return file.type
  const extension = fileExtension(file.name)
  const match = Object.entries(mimeExtensions).find(([, extensions]) => extensions.includes(extension))
  return match?.[0] ?? ""
}

export function EvidenceUploadForm({ reference, selector }: { reference: string; selector: string }) {
  const router = useRouter()
  const inputId = useId()
  const hintId = useId()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const lock = useRef(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    const form = event.currentTarget
    const file = form.elements.namedItem("evidence")
    if (!(file instanceof HTMLInputElement) || !file.files?.[0]) {
      setError(CHECK_FILE)
      setStatus("")
      return
    }
    const chosen = file.files[0]
    const declared = declaredUpload(chosen.name, contentTypeFor(chosen), chosen.size)
    if (!declared) {
      setError(CHECK_FILE)
      setStatus("")
      return
    }
    lock.current = true
    setBusy(true)
    setError("")
    setStatus("Uploading evidence.")
    try {
      const begun = await fetch("/api/portal/evidence", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          operation: "begin",
          reference,
          selector,
          filename: declared.filename,
          contentType: declared.contentType,
          size: declared.size,
        }),
      })
      const start = await begun.json() as { message?: string; upload?: { url?: string; fields?: Record<string, string> } }
      if (!begun.ok || !start.upload?.url || !start.upload.fields) {
        setError(typeof start.message === "string" ? start.message : RETRY)
        setStatus("")
        return
      }
      const payload = new FormData()
      for (const [name, value] of Object.entries(start.upload.fields)) payload.append(name, value)
      payload.append("file", chosen)
      const posted = await fetch(start.upload.url, { method: "POST", body: payload })
      if (!posted.ok) {
        setError(RETRY)
        setStatus("")
        return
      }
      const finalized = await fetch("/api/portal/evidence", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ operation: "finalize", reference, selector }),
      })
      const done = await finalized.json() as { message?: string }
      if (!finalized.ok) {
        setError(typeof done.message === "string" ? done.message : RETRY)
        setStatus("")
        return
      }
      setStatus(typeof done.message === "string" ? done.message : "We've received your file. It still needs to be checked.")
      setError("")
      form.reset()
      router.refresh()
    } catch {
      setError(RETRY)
      setStatus("")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return (
    <form className="evidence-upload" onSubmit={onSubmit}>
      <p id={hintId}>{UPLOAD_CONSTRAINTS}</p>
      <label htmlFor={inputId}>Choose a file</label>
      <input id={inputId} name="evidence" type="file" accept={allowedFileAccept} aria-describedby={hintId} disabled={busy} required />
      <button type="submit" disabled={busy}>{busy ? "Uploading evidence" : "Upload evidence"}</button>
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  )
}
