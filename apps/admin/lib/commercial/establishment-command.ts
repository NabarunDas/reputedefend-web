import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { privateResponseHeaders } from "../access"
import { devEstablishmentEditorEnabled } from "./dev-establishment-gate"

const reply = (message: string, status: number) => NextResponse.json({message}, {status, headers: privateResponseHeaders})

/** No caller-supplied actor/approver, country override, or supersede path. */
export function validateDevEstablishment(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const x = raw as Record<string,unknown>
  const keys = ["businessId","countryCode","legalName","evidenceType","evidenceReference","verificationStatus","confirmed"]
  if (Object.keys(x).length !== keys.length || !keys.every(k=>Object.hasOwn(x,k))) return null
  if (typeof x.businessId !== "string" || !isUuid(x.businessId)
    || x.countryCode !== "GB"
    || typeof x.legalName !== "string" || x.legalName.trim().length < 2 || x.legalName.trim().length > 200
    || !["COMPANIES_HOUSE","REGISTRY_EXTRACT","OTHER"].includes(String(x.evidenceType))
    || typeof x.evidenceReference !== "string" || x.evidenceReference.trim().length < 20 || x.evidenceReference.trim().length > 500
    || x.verificationStatus !== "VERIFIED" || x.confirmed !== true) return null
  return {businessId: x.businessId, countryCode: "GB", legalName: x.legalName.trim(),
    evidenceType: x.evidenceType, evidenceReference: x.evidenceReference.trim(), verificationStatus:"VERIFIED"}
}
export async function recordDevBusinessEstablishment(request: NextRequest) {
  if (!devEstablishmentEditorEnabled()) return reply("Unavailable.",404)
  const config=authConfig()
  if (!config) return reply("Workspace unavailable.",503)
  if (request.headers.get("origin")!==config.origin || request.nextUrl.origin!==config.origin)
    return reply("Reload the page and try again.",403)
  if (request.headers.get("content-type")?.split(";")[0]!=="application/json") return reply("Expected JSON.",415)
  const token=request.cookies.get(sessionCookie)?.value
  const key=request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Sign in again.",401)
  if (!isUuid(key)) return reply("Reload and try again.",400)
  try {
    const reader=request.body?.getReader();const decoder=new TextDecoder()
    let raw="",size=0
    if(reader) for(;;) {
      const {done,value}=await reader.read()
      if(done) break
      size+=value.byteLength
      if(size>8192) {await reader.cancel();return reply("Request too large.",413)}
      raw+=decoder.decode(value,{stream:true})
    }
    raw+=decoder.decode()
    let input:unknown
    try{input=JSON.parse(raw)}catch{return reply("Invalid JSON.",400)}
    const payload=validateDevEstablishment(input)
    if (!payload) return reply("Provide genuine verified UK establishment details and evidence.",400)
    const store=backend();const hash=tokenHash(token)
    const session=await store.rpc<{userId?:string;createdAt?:string}|null>("admin_session_v1",{p_token:hash})
    const start=session?.createdAt?Date.parse(session.createdAt):NaN
    if(!session?.userId||!Number.isFinite(start)||start>Date.now()+60000||Date.now()-start>300000)
      return reply("Sign out and sign in again, then record this within five minutes.",403)
    const result=await store.rpc<{status?:string}>("admin_record_business_establishment_v1",{
      p_token:hash,p_request:key,p_payload:payload
    })
    if(result.status==="success"||result.status==="replay")return reply("Verified UK establishment recorded.",200)
    if(result.status==="unauthorised")return reply("Session expired.",401)
    if(result.status==="conflict")return reply("Existing business establishment conflict. Review before retrying.",409)
    if(result.status==="invalid")return reply("Evidence or business details were rejected.",400)
    return reply("Could not confirm the record. Reload before retrying.",503)
  }catch{return reply("Could not confirm the record. Reload before retrying.",503)}
}
