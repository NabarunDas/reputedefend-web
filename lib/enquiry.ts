export type EnquiryInput={name:string;email:string;business?:string;issue:string;details:string;website?:string}
export type EnquiryResult={ok:boolean;message:string}
const limits={name:100,email:254,business:160,issue:120,details:5000,website:200}
function normalize(value:string){return value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"")}
export function validateEnquiry(raw:EnquiryInput):{valid:boolean;data?:EnquiryInput;error?:string}{
 const data=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,normalize(String(value??""))])) as EnquiryInput
 if(data.website) return {valid:false,error:"Unable to process this enquiry."}
 if(!data.name||data.name.length>limits.name) return {valid:false,error:"Please enter your name."}
 if(!/^\S+@\S+\.\S+$/.test(data.email)||data.email.length>limits.email) return {valid:false,error:"Please enter a valid email address."}
 if(!data.issue||data.issue.length>limits.issue) return {valid:false,error:"Please choose an enquiry type."}
 if(!data.details||data.details.length>limits.details) return {valid:false,error:"Please add a little more detail, within 5,000 characters."}
 for(const [key,max] of Object.entries(limits)){const value=data[key as keyof EnquiryInput] ?? "";if(value.length>max)return {valid:false,error:`Please keep ${key} within ${max} characters.`}}
 return {valid:true,data}
}
export async function deliverEnquiry(data:EnquiryInput):Promise<EnquiryResult>{
 if(process.env.ENQUIRY_PROVIDER_URL){return {ok:false,message:"Enquiries are temporarily unavailable. Please try again shortly."}}
 if(process.env.NODE_ENV!=="production") return {ok:true,message:"Development enquiry recorded. In production, this will only confirm after delivery."}
 return {ok:false,message:"Enquiries are temporarily unavailable. Please try again shortly."}
}
