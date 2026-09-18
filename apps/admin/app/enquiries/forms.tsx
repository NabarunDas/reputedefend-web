"use client"
import { useState } from "react"
import { CommandForm, Reason } from "../records/forms"
import { enquiryStates,type EnquiryDetail } from "@/lib/enquiries/model"
import type { RecordItem } from "@/lib/records/model"
const destination=(id:string)=>`/enquiries/${id}`
function iso(value:FormDataEntryValue|null){return typeof value==="string" && value?new Date(`${value}:00Z`).toISOString():null}
export function PhoneEnquiryForm(){
 return <CommandForm endpoint="create" actionUrl="/api/enquiries/create" destination={destination} payload={f=>Object.fromEntries(["fullName","email","phone","businessName","subject","details","note"].map(k=>[k,f.get(k)]))}>
  <p>Record a phone enquiry after speaking with the caller. This form does not send email or create a client account.</p>
  <label>Caller’s name<input name="fullName" required maxLength={100}/></label><label>Email address (optional)<input name="email" type="email" maxLength={254}/></label><label>Phone number<input name="phone" type="tel" required minLength={7} maxLength={40}/></label><label>Business name (optional)<input name="businessName" maxLength={160}/></label><label>Subject<input name="subject" required maxLength={64}/></label><label>What does the caller need?<textarea name="details" required maxLength={5000} rows={6}/></label><Reason name="note" label="Call date and intake note"/>
 </CommandForm>
}
export function TriageForm({enquiry:e}:{enquiry:EnquiryDetail}){
 const [status,setStatus]=useState(e.status)
 return <CommandForm endpoint="triage" actionUrl="/api/enquiries/triage" payload={f=>({id:e.id,version:e.version,status:f.get("status"),assigned:f.get("assigned")==="on",nextAction:f.get("nextAction"),due:iso(f.get("due")),note:f.get("note")})}>
  <label>Status<select name="status" value={status} onChange={event=>setStatus(event.target.value as typeof status)}>{Object.entries(enquiryStates).filter(([key])=>key!=="converted").map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label className="checkbox"><input name="assigned" type="checkbox" defaultChecked={e.assigned}/>Assigned to admin@profilerelaunch.com</label>
  <label>Next action<textarea name="nextAction" maxLength={1000} defaultValue={e.nextAction} required={status==="waiting"}/></label>
  <label>Follow-up date and time (UTC)<input name="due" type="datetime-local" defaultValue={e.nextActionAt?new Date(e.nextActionAt).toISOString().slice(0,16):""} required={status==="waiting"}/></label>
  <Reason name="note" label="What changed?"/>
 </CommandForm>
}
function RecordPicker({entity,name,query,label}:{entity:"client"|"location";name:string;query:string;label:string}){
 const [q,setQ]=useState(query),[rows,setRows]=useState<RecordItem[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false)
 async function search(){setBusy(true);setRows([]);setMessage("");try{const response=await fetch(`/api/enquiries/options?${new URLSearchParams({entity,q})}`);const result=await response.json();if(!response.ok)setMessage(result.message);else{setRows(result.rows);setMessage(result.more?"Showing the first 50 matches. Narrow your search if needed.":result.rows.length?"Choose the correct record below.":"No matching records. Add the record in Clients & businesses, then search again.")}}catch{setMessage("Search is unavailable. Please try again.")}finally{setBusy(false)}}
 return <div><label>{label}<input value={q} onChange={e=>setQ(e.target.value)} maxLength={100}/></label><button type="button" className="secondary" disabled={busy} onClick={search}>{busy?"Searching…":`Find ${entity}`}</button><p role="status">{message}</p><label>Select {entity}<select name={name} required key={JSON.stringify(rows.map(r=>r.id))} defaultValue=""><option value="">Choose a {entity}</option>{rows.map(r=><option key={r.id} value={r.id}>{r.name || "Unnamed location"} — {entity==="client"?r.email:`${r.businessName}, ${r.country}`}</option>)}</select></label></div>
}
export function ConversionForm({enquiry:e}:{enquiry:EnquiryDetail}){
 const [kind,setKind]=useState("PROFILE_RECOVERY")
 return <CommandForm endpoint="convert" actionUrl="/api/enquiries/convert" destination={destination} payload={f=>({id:e.id,version:e.version,kind:f.get("kind"),customerId:f.get("customerId"),locationId:f.get("locationId"),termsAt:kind==="MONITORING"?iso(f.get("termsAt")):null,note:f.get("note")})}>
  <p>This creates a new work record. Check existing work in Clients &amp; businesses first so you don’t create a second record for the same issue.</p>
  <label>Work type<select name="kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="PROFILE_RECOVERY">Business Profile recovery</option><option value="REVIEW_PROTECTION">Review protection</option><option value="MONITORING">Relaunch Guard setup request</option></select></label>
  <RecordPicker entity="client" name="customerId" label="Find the client by name or email" query={e.payload.email || e.payload.fullName}/><RecordPicker entity="location" name="locationId" label="Find the business location" query={e.payload.businessName}/>
  {kind==="MONITORING" && <><label>When did the customer accept the monitoring terms? (UTC)<input name="termsAt" type="datetime-local" required/></label><p>Record the actual acceptance date and evidence below. The new request covers the selected location and starts as Requested. It does not activate monitoring or take payment.</p></>}
  <Reason name="note" label={kind==="MONITORING"?"Terms-acceptance evidence and reason for conversion":"Reason for conversion"}/>
  <label className="checkbox"><input type="checkbox" required/>I checked the client and location, reviewed existing work and have the information needed to create this record.</label>
 </CommandForm>
}
