"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { TelloyaSalesWorkspace } from "@/lib/commercial/telloya-sales-context"
import { TelloyaOfferActions, type TelloyaOfferPanel } from "./telloya-offer-actions"

function newKey() {
  return crypto.randomUUID()
}

export function TelloyaOfferWorkspace({
  enquiryId,
  workspace,
  offer,
}: {
  enquiryId: string
  workspace: TelloyaSalesWorkspace
  offer: TelloyaOfferPanel
}) {
  const router = useRouter()
  const key = useRef(newKey())
  const [status, setStatus] = useState<"working" | "done" | "error">(workspace.needsReconciliation ? "working" : "done")
  const [message, setMessage] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (!workspace.needsReconciliation) return
    let active = true
    void (async () => {
      try {
        const response = await fetch("/api/enquiries/telloya-sales-context", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key.current,
          },
          body: JSON.stringify({ enquiryId }),
        })
        const body = await response.json().catch(() => ({ message: "We couldn’t prepare the offer workspace." }))
        if (!active) return
        if (!response.ok) {
          setStatus("error")
          setMessage(typeof body.message === "string" ? body.message : "We couldn’t prepare the offer workspace.")
          return
        }
        setStatus("done")
        setMessage(typeof body.message === "string" ? body.message : null)
        router.refresh()
      } catch {
        if (!active) return
        setStatus("error")
        setMessage("We couldn’t prepare the offer workspace. Reload the enquiry before trying again.")
      }
    })()
    return () => { active = false }
  }, [enquiryId, router, workspace.needsReconciliation, retryToken])

  function resume() {
    key.current = newKey()
    setMessage(null)
    setStatus("working")
    setRetryToken(value => value + 1)
  }

  return <section className="panel workspace" aria-labelledby="telloya-offer-workspace-title">
    <p className="eyebrow">Telloya offer</p>
    <h2 id="telloya-offer-workspace-title">Personalised offer workspace</h2>
    <p>Product {workspace.product}. Plan interest {workspace.planInterest}. This workspace reuses the existing commercial records. It does not send email, open Stripe, or contact Retell.</p>
    <dl>
      <dt>Customer</dt><dd>{workspace.customerSummary}</dd>
      <dt>Business</dt><dd>{workspace.businessSummary}</dd>
      <dt>Voice location</dt><dd>{workspace.voiceLocationSummary}</dd>
      <dt>Guard</dt><dd>{workspace.guardInterestSummary}</dd>
      <dt>Catalogue preview</dt><dd>{workspace.illustrativeMonthly || "No illustrative total until a plan preference is confirmed. Illustrative only — not an approved price."}</dd>
    </dl>
    {workspace.illustrativeMonthly && <p className="muted">Illustrative catalogue amounts are not approved prices, consent, or a sendable offer.</p>}
    {workspace.exceptions.length > 0 && <div className="notice notice-warning" role="status">
      <p><strong>Needs attention</strong></p>
      <ul>{workspace.exceptions.map(item => <li key={item.code}>{item.message}</li>)}</ul>
    </div>}
    {workspace.blockers.length > 0 && <div className="notice notice-blocked" role="status">
      <p><strong>Not sendable yet</strong></p>
      <ul>{workspace.blockers.map(item => <li key={item.code}>{item.message}</li>)}</ul>
    </div>}
    {status === "working" && <p role="status">Preparing the offer workspace from the completed demonstration…</p>}
    {status === "error" && message && <div className="notice notice-warning" role="alert"><p>{message}</p><p><button type="button" onClick={resume}>Retry sales-context preparation</button></p></div>}
    {status === "done" && message && <p className="muted">{message}</p>}
    <p><strong>{workspace.primaryLabel}</strong></p>
    {!workspace.sendable && <p><button type="button" disabled>Send offer</button></p>}
    <TelloyaOfferActions offer={offer} />
  </section>
}
