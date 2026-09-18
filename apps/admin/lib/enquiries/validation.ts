import { isUuid } from "../records/model"
import { validTime } from "./model"
const obj=(x:unknown):x is Record<string,unknown>=>!!x && typeof x==="object" && !Array.isArray(x)
const keys=(x:Record<string,unknown>,expected:string[])=>Object.keys(x).length===expected.length && Object.keys(x).every(k=>expected.includes(k))
const text=(x:unknown,min:number,max:number):x is string=>typeof x==="string" && x.trim().length>=min && x.length<=max
const version=(x:unknown)=>typeof x==="number" && Number.isInteger(x) && x>0 && x<2147483647
export type EnquiryOperation="create"|"triage"|"convert"
export function enquiryArgs(operation:EnquiryOperation,body:unknown):Record<string,unknown>|null {
 if(!obj(body)) return null
 if(operation==="create") {
  if(!keys(body,["fullName","email","phone","businessName","subject","details","note"]) || !text(body.fullName,1,100) || !text(body.email,0,254) || !text(body.phone,0,40) || !text(body.businessName,0,160) || !text(body.subject,1,64) || !text(body.details,1,5000) || !text(body.note,10,1000) || (!body.email && body.phone.trim().length<7) || (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) return null
  return {p_data:{fullName:body.fullName.trim(),email:body.email.trim(),phone:body.phone.trim(),businessName:body.businessName.trim(),subject:body.subject.trim(),details:body.details.trim(),country:"",service:"general",websiteUrl:"",businessProfileUrl:"",reviewUrl:"",source:"phone"},p_note:body.note.trim()}
 }
 if(operation==="triage") {
  if(!keys(body,["id","version","status","assigned","nextAction","due","note"]) || !isUuid(body.id) || !version(body.version) || typeof body.status!=="string" || !["new","open","waiting","closed","spam"].includes(body.status) || typeof body.assigned!=="boolean" || !text(body.nextAction,0,1000) || (body.due!==null && !validTime(body.due)) || !text(body.note,10,1000) || (body.status==="waiting" && (!body.nextAction.trim() || !body.due)) || (body.due && !body.nextAction.trim())) return null
  return {p_id:body.id,p_version:body.version,p_status:body.status,p_assigned:body.assigned,p_next:body.nextAction.trim(),p_due:body.due,p_note:body.note.trim()}
 }
 if(!keys(body,["id","version","kind","customerId","locationId","termsAt","note"]) || !isUuid(body.id) || !version(body.version) || typeof body.kind!=="string" || !["PROFILE_RECOVERY","REVIEW_PROTECTION","MONITORING"].includes(body.kind) || !isUuid(body.customerId) || !isUuid(body.locationId) || (body.termsAt!==null && !validTime(body.termsAt)) || (body.kind==="MONITORING" && !body.termsAt) || !text(body.note,10,1000)) return null
 return {p_id:body.id,p_version:body.version,p_kind:body.kind,p_customer:body.customerId,p_location:body.locationId,p_terms_at:body.kind==="MONITORING"?body.termsAt:null,p_note:body.note.trim()}
}
