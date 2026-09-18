import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { getEnquiry } from "@/lib/enquiries/queries"
import { enquiryStates,emailStates } from "@/lib/enquiries/model"
import { ukDate } from "@/lib/admin/activity"
import { safeWebUrl } from "@/lib/records/model"
import { AdminNav } from "../../admin-nav"
import { TriageForm,ConversionForm } from "../forms"
export default async function Enquiry({params}:{params:Promise<{id:string}>}){
 await requireStaff();const {id}=await params,e=await getEnquiry(id),p=e.payload
 return <section className="panel workspace"><AdminNav current="enquiries"/><Link href="/enquiries">Back to enquiries</Link><h1>{p.subject || "General enquiry"}</h1><p>{enquiryStates[e.status]} · {e.assigned?"Assigned to admin":"Unassigned"} · {ukDate(e.createdAt)}</p><dl><dt>Name</dt><dd>{p.fullName}</dd><dt>Email</dt><dd>{p.email || "Not recorded"}</dd><dt>Phone</dt><dd>{p.phone || "Not recorded"}</dd><dt>Business</dt><dd>{p.businessName || "Not recorded"}</dd></dl><p className="preserve-lines">{p.details}</p>
 {([['Website',p.websiteUrl],['Business Profile',p.businessProfileUrl],['Review',p.reviewUrl]] as const).map(([label,value])=>{const url=safeWebUrl(value);return url?<p key={label}><a href={url} target="_blank" rel="noopener noreferrer">Open {label} (new tab)</a></p>:null})}
 <section className="record-section"><h2>Email status</h2><p>Internal notification: {emailStates[e.internalStatus]}<br/>Customer acknowledgement: {emailStates[e.ackStatus]}</p><p className="muted">The enquiry is saved regardless of email delivery. “Accepted” means the provider accepted the message, not that it reached the inbox. Check unconfirmed outcomes before sending another message.</p></section>
 <section className="record-section"><h2>Follow-up</h2><p>{e.nextAction || "No next action recorded."}{e.nextActionAt && <> · {ukDate(e.nextActionAt)}</>}</p>{e.status!=="converted" && <TriageForm key={e.version} enquiry={e}/>}</section>
 {e.status==="converted"?<section className="record-section"><h2>Linked work</h2><p>{e.caseRef?<Link href={`/cases/${e.caseId}`}>Case {e.caseRef}</Link>:`Relaunch Guard request ${e.monitoringId}`}</p><p>Continue this work through the case or monitoring workflow. This enquiry stays linked for its history.</p></section>:['new','open','waiting'].includes(e.status) && <details className="record-section"><summary>Create work from this enquiry</summary><ConversionForm key={e.version} enquiry={e}/></details>}
 <section className="record-section"><h2>History</h2><p className="muted">Latest 100 events, newest first.</p><ol>{e.events.map(event=><li key={event.id}><strong>{event.event==='received'?'Enquiry received':event.event==='triaged'?'Triage updated':'Converted to work'}</strong> · {ukDate(event.createdAt)}{event.note && <p className="preserve-lines">{event.note}</p>}</li>)}</ol></section></section>
}
