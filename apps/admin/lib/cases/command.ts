import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { caseArgs } from "./validation"
const reply=(message:string,status:number,id?:string)=>NextResponse.json({message,...(id?{id}:{})},{status,headers:privateResponseHeaders})
export async function caseCommand(request:NextRequest) {
 const config=authConfig()
 if(!config) return reply("The workspace is unavailable. Please try again shortly.",503)
 if(request.headers.get("origin")!==config.origin || request.nextUrl.origin!==config.origin) return reply("Reload this page and try again.",403)
 if(request.headers.get("content-type")?.split(";")[0]!=="application/json") return reply("Reload this page and try again.",415)
 const token=request.cookies.get(sessionCookie)?.value, key=request.headers.get("idempotency-key")
 if(!validToken(token)) return reply("Please sign in again.",401)
 if(!isUuid(key)) return reply("Reload the form and try again.",400)
 try {
  const reader=request.body?.getReader(),decoder=new TextDecoder();let raw="",size=0
  if(reader) for(;;){const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>32768){await reader.cancel();return reply("That request is too large.",413)}raw+=decoder.decode(value,{stream:true})}
  raw+=decoder.decode();let body:unknown
  try {body=JSON.parse(raw)}catch{return reply("Please check the form and try again.",400)}
  const args=caseArgs(body)
  if(!args) return reply("Check the fields, follow-up date and supporting note before saving.",400)
  const result=await backend().rpc<{status:string;id?:string}>("admin_case_command_v1",{...args,p_token:tokenHash(token),p_request:key})
  switch(result.status){
   case "success":return reply("Saved. The case history has been updated.",200,result.id)
   case "unauthorized":return reply("Your session has ended. Please sign in again.",401)
   case "conflict":return reply("This case has changed. Reload it before trying again.",409)
   case "denied":return reply("This action is not available at the current case stage. Reload and check the case.",403)
   case "prerequisite":return reply("This step needs the payment, permission or document approval workflow. It is not available yet.",409)
   case "open_work":return reply("Resolve open tasks and outstanding submission attempts before continuing.",409)
   case "invalid":return reply("Check the form, dates and required supporting information.",400)
   default:return reply("We couldn’t confirm the change. Reload the case before trying again.",503)
  }
 }catch{return reply("We couldn’t confirm the change. Reload the case before trying again.",503)}
}
