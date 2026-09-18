import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { enquiryFilters,enquiryStates,emailStates } from "@/lib/enquiries/model"
import { listEnquiries } from "@/lib/enquiries/queries"
import { ukDate } from "@/lib/admin/activity"
import { AdminNav } from "../admin-nav"
export const metadata={title:"Enquiries"}
export default async function Enquiries({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await requireStaff()
 const filters=enquiryFilters(await searchParams)
 if(!filters)return <section className="panel"><AdminNav current="enquiries"/><h1>Check your enquiry filters</h1><Link href="/enquiries">Show active enquiries</Link></section>
 const rows=await listEnquiries(filters),visible=rows.slice(0,50),next=new URLSearchParams({state:filters.state,q:filters.q,filter:filters.filter})
 const last=visible.at(-1);if(last){next.set("time",last.createdAt);next.set("before",last.id)}
 return <section className="panel workspace"><AdminNav current="enquiries"/><h1>Enquiries</h1><p>Review new questions, record follow-ups and turn enquiries into work when the details are ready. Times are shown in UK time.</p><Link className="button-link" href="/enquiries/new">Record a phone enquiry</Link>
 <form method="get" className="filters"><label>Search<input name="q" maxLength={100} defaultValue={filters.q} placeholder="Name, email, phone or business"/></label><label>Status<select name="state" defaultValue={filters.state}><option value="active">Active enquiries</option><option value="all">All enquiries</option>{Object.entries(enquiryStates).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Show<select name="filter" defaultValue={filters.filter}><option value="all">All</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned to admin</option><option value="overdue">Follow-up overdue</option><option value="email">Email needs checking</option></select></label><button>Apply filters</button><Link href="/enquiries">Clear filters</Link></form>
 {!visible.length?<p className="notice">No enquiries match these filters.</p>:<div className="table-scroll" role="region" aria-label="Enquiry queue" tabIndex={0}><table><caption>Up to 50 enquiries, newest first</caption><thead><tr><th scope="col">Enquiry</th><th scope="col">Status</th><th scope="col">Follow-up</th><th scope="col">Internal email</th></tr></thead><tbody>{visible.map(e=><tr key={e.id}><td><Link href={`/enquiries/${e.id}`}>{e.name}</Link><br/>{e.subject || e.business || "General enquiry"}<br/><span className="muted">{ukDate(e.createdAt)} · {e.source==="phone"?"Phone":e.source==="contact"?"Contact form":"Homepage"}</span></td><td>{enquiryStates[e.status]}<br/>{e.assigned?"Assigned to admin":"Unassigned"}</td><td>{e.nextActionAt?ukDate(e.nextActionAt):"No date set"}</td><td>{emailStates[e.internalStatus]}</td></tr>)}</tbody></table></div>}
 <div className="pagination">{filters.before && <Link href={`/enquiries?${new URLSearchParams({state:filters.state,q:filters.q,filter:filters.filter})}`}>Back to newest</Link>}{rows.length>50 && <Link href={`/enquiries?${next}`}>Older enquiries</Link>}</div></section>
}
