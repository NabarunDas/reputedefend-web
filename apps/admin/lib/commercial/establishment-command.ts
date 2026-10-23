import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { privateResponseHeaders } from "../access"
import { buildPurchaserRecord, purchaserCommandMessage, type EstablishmentCommandResult } from "./purchaser"

const reply = (message: string, status: number) => NextResponse.json({message}, {status, headers: privateResponseHeaders})

// Only purchaser-establishment recording uses this recent-login window.
// A valid, non-revoked Admin session and all existing case/identity checks
// remain mandatory; this does not extend session inactivity or lifetime.
const PURCHASER_SIGN_IN_WINDOW_MS = 30 * 60 * 1000

export async function recordBusinessEstablishment(request: NextRequest) {
  const config=authConfig()
  if (!config) return reply("Workspace unavailable.",503)
  // Same rule as the other Admin commands: the browser Origin must be this
  // request's own origin, and that origin must be on the audited allowlist.
  // Preview has both the deployment URL and the stable branch URL. Production
  // lists only the canonical Admin domain, never a webhook-only hostname.
  const requestOrigin = request.nextUrl.origin
  if (request.headers.get("origin") !== requestOrigin || !config.allowedOrigins.includes(requestOrigin))
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
    const built=buildPurchaserRecord(input)
    if (!built.ok) return reply(built.message,400)
    const payload=built.payload
    const store=backend();const hash=tokenHash(token)
    const session=await store.rpc<{userId?:string;createdAt?:string}|null>("admin_session_v1",{p_token:hash})
    const start=session?.createdAt?Date.parse(session.createdAt):NaN
    if(!session?.userId||!Number.isFinite(start)||start>Date.now()+60000||Date.now()-start>PURCHASER_SIGN_IN_WINDOW_MS)
      return reply("Your 30-minute security window has expired. Sign out and sign in again to record the purchasing establishment.",403)
    const result=await store.rpc<EstablishmentCommandResult>("admin_record_business_establishment_v1",{
      p_token:hash,p_request:key,p_payload:payload
    })
    const outcome=purchaserCommandMessage(payload,result??{})
    return reply(outcome.message,outcome.httpStatus)
  }catch{return reply("Could not confirm the record. Reload before retrying.",503)}
}
