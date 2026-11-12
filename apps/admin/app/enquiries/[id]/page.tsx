import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { getEnquiry, getInvitationMail, getOnboarding, getTelloyaDemo } from "@/lib/enquiries/queries"
import { invitationDispatchEnabled } from "@/lib/commercial/invitation-dispatch"
import { enquiryStates, emailStates } from "@/lib/enquiries/model"
import { ukDate } from "@/lib/admin/activity"
import { safeWebUrl } from "@/lib/records/model"
import { TriageForm, ConversionForm } from "../forms"
import { OnboardingPanel } from "../onboarding"
import { TelloyaEnquiryInterest } from "../telloya-interest"
import { TelloyaJourney } from "../telloya-journey"
import { Badge, PageHeader } from "../../ui"

export const metadata = { title: "Enquiry" }
export default async function Enquiry({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff(); const { id } = await params, e = await getEnquiry(id), onboarding = await getOnboarding(id), p = e.payload
  const dispatchEnabled = invitationDispatchEnabled()
  const demo = p.source === "telloya" ? await getTelloyaDemo(id) : { availability: "closed" as const }
  const invitationMail = dispatchEnabled && onboarding.supported && onboarding.invitationReady && !onboarding.emailVerified
    ? await getInvitationMail(id)
    : null
  return <section className="page">
    <Link className="back-link" href="/enquiries">Back to enquiries</Link>
    <PageHeader 
      title={e.enquiryRef || p.subject || "General enquiry"} 
      description={<>{e.enquiryRef && `${p.subject || "General enquiry"} · `}{enquiryStates[e.status]} · {e.assigned ? "Assigned to administrator" : "Unassigned"} · {ukDate(e.createdAt)}</>} 
    />
    <section className="panel">
      <dl>
        <dt>Name</dt><dd>{p.fullName}</dd>
        <dt>Email</dt><dd>{p.email || "Not recorded"}</dd>
        <dt>Phone</dt><dd>{p.phone || "Not recorded"}</dd>
        <dt>Business</dt><dd>{p.businessName || "Not recorded"}</dd>
        {p.country && <><dt>Country</dt><dd>{p.country}</dd></>}
        {p.source === "telloya" && p.trade && <><dt>Trade or service</dt><dd>{p.trade}</dd></>}
      </dl>
      <p className="preserve-lines">{p.details}</p>
      {([["Website", p.websiteUrl], ["Business Profile", p.businessProfileUrl], ["Review", p.reviewUrl]] as const).map(([label, value]) => { const url = safeWebUrl(value); return url ? <p key={label}><a href={url} target="_blank" rel="noopener noreferrer">Open {label} (new tab)</a></p> : null })}
    </section>
    <TelloyaEnquiryInterest payload={p} enquiryRef={e.enquiryRef} />
    <TelloyaJourney snapshot={{
      source: p.source,
      requestIntent: p.requestIntent,
      planTier: p.planTier,
      guardLocationCount: p.guardLocationCount,
      assigned: e.assigned,
      nextAction: e.nextAction,
      nextActionAt: e.nextActionAt,
    }} demo={demo} />
    <section className="panel">
      <h2>Email status</h2>
      <p>Internal notification: {emailStates[e.internalStatus]}<br />Customer acknowledgement: {emailStates[e.ackStatus]}</p>
      <p className="muted">The enquiry is saved regardless of email delivery. “Accepted” means the provider accepted the message, not that it reached the inbox. Check unconfirmed outcomes before sending another message.</p>
    </section>
    <section className="panel">
      <h2>Follow-up</h2>
      <p>{e.nextAction || "No next action recorded."}{e.nextActionAt && <> · {ukDate(e.nextActionAt)}</>}</p>
      {e.status !== "converted" && <TriageForm key={e.version} enquiry={e} />}
    </section>
    {onboarding.supported && <OnboardingPanel view={onboarding} enquiryId={e.id} open={["new", "open", "waiting"].includes(e.status)} businessName={p.businessName} country={p.country} dispatchEnabled={dispatchEnabled} invitationMail={invitationMail} />}
    {e.status === "converted" ? <section className="panel"><h2>Linked work</h2><p>{e.caseRef ? <Link href={`/cases/${e.caseId}`}>Case {e.caseRef}</Link> : `Relaunch Guard request ${e.monitoringId}`}</p><p>Continue this work through the case or monitoring workflow. This enquiry stays linked for its history.</p></section> : !onboarding.supported && ["new", "open", "waiting"].includes(e.status) && <details className="panel"><summary>Create work from this enquiry</summary><ConversionForm key={e.version} enquiry={e} /></details>}
    <section className="panel">
      <h2>History</h2>
      <p className="muted">Latest 100 events, newest first.</p>
      <ol className="history-list">{e.events.map(event => <li key={event.id}><Badge tone="neutral">{event.event === "received" ? "Enquiry received" : event.event === "triaged" ? "Triage updated" : "Converted to work"}</Badge> · {ukDate(event.createdAt)}{event.note && <p className="preserve-lines">{event.note}</p>}</li>)}</ol>
    </section>
  </section>
}
