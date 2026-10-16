"use client"
import { useRef, useState, type FormEvent } from "react"
export function DevEstablishmentForm({businessId,businessName}:{businessId:string;businessName:string}) {
  const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState("")
  const key=useRef<string|null>(null)
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(busy||done||uncertain)return
    const f=new FormData(event.currentTarget)
    key.current ||= crypto.randomUUID()
    setBusy(true);setMessage("")
    try {
      const response=await fetch("/api/operations/business-establishment",{
        method:"POST",headers:{"content-type":"application/json","idempotency-key":key.current},
        body:JSON.stringify({businessId,countryCode:"GB",legalName:f.get("legalName"),
          evidenceType:f.get("evidenceType"),evidenceReference:f.get("evidenceReference"),
          verificationStatus:"VERIFIED",confirmed:f.get("confirmed")==="yes"})
      })
      const result=await response.json() as {message?:string}
      setMessage(result.message||"Unable to confirm the change.")
      if(response.ok)setDone(true)
      else if(response.status>=500||response.status===409)setUncertain(true)
      else key.current=null
    }catch{setMessage("Uncertain result. Reload before trying again.");setUncertain(true)}
    finally{setBusy(false)}
  }
  return <form className="record-form" onSubmit={submit}>
    <p>This DEV-only operator action verifies the <strong>purchasing business establishment</strong>, not the Google listing&apos;s location.
      Only record genuine evidence of an authorised GB purchasing business. An enquiry or email alone is not proof.
      Sign in with a fresh Admin email code within the last five minutes.</p>
    <fieldset disabled={busy||done||uncertain}>
      <label>Legal name<input name="legalName" defaultValue={businessName} required minLength={2} maxLength={200}/></label>
      <label>Country<input readOnly value="GB — United Kingdom"/></label>
      <label>Evidence type<select name="evidenceType" defaultValue="OTHER">
        <option value="OTHER">Directly verified UK establishment</option>
        <option value="COMPANIES_HOUSE">Companies House record</option>
        <option value="REGISTRY_EXTRACT">Registry extract</option>
      </select></label>
      <label>Evidence and reference (20–500 characters)<textarea name="evidenceReference" required minLength={20} maxLength={500} rows={3}/></label>
      <label className="checkbox"><input type="checkbox" name="confirmed" value="yes" required/>
        I verified the genuine purchasing establishment and have supporting evidence.
      </label>
      <button type="submit">{busy?"Recording…":"Record verified UK establishment"}</button>
    </fieldset>
    <p role="status">{message}</p>
    {(done||uncertain)&&<button className="secondary" type="button" onClick={()=>window.location.reload()}>Reload business record</button>}
  </form>
}
