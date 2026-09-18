import { afterEach,beforeEach,describe,expect,it,vi } from "vitest"
import { NextRequest } from "next/server"
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock("@/lib/auth/backend",async original=>({...await original<typeof import("@/lib/auth/backend")>(),backend:()=>mocks}))
import { POST as create } from "@/app/api/enquiries/create/route"
import { POST as triage } from "@/app/api/enquiries/triage/route"
import { POST as convert } from "@/app/api/enquiries/convert/route"
import { GET as options } from "@/app/api/enquiries/options/route"
import { sessionCookie } from "@/lib/auth/config"
import { enquiryArgs } from "./validation"
import { enquiryFilters } from "./model"
const origin="https://admin.profilerelaunch.com",id="22222222-2222-4222-8222-222222222222",key="33333333-3333-4333-8333-333333333333"
const manual={fullName:"Alex",email:"",phone:"07123456789",businessName:"Bakery",subject:"Profile issue",details:"The profile is missing.",note:"Caller spoke to us this morning."}
const triageBody={id,version:1,status:"waiting",assigned:true,nextAction:"Call tomorrow",due:"2026-09-20T12:00:00Z",note:"Waiting for the caller to confirm details."}
const conversion={id,version:1,kind:"PROFILE_RECOVERY",customerId:key,locationId:key,termsAt:null,note:"Checked the customer and location."}
function req(body:unknown,headers:Record<string,string>={}){return new NextRequest(`${origin}/api/enquiries/create`,{method:"POST",headers:{origin,"content-type":"application/json","idempotency-key":key,cookie:`${sessionCookie}=${"a".repeat(64)}`,...headers},body:JSON.stringify(body)})}
beforeEach(()=>{vi.stubEnv("ADMIN_AUTH_ENABLED","true");vi.stubEnv("ADMIN_ORIGIN",origin);vi.stubEnv("SUPABASE_URL","https://example.supabase.co");vi.stubEnv("SUPABASE_SECRET_KEY","test");vi.stubEnv("SUPABASE_PUBLISHABLE_KEY","test");mocks.rpc.mockReset().mockResolvedValue({status:"success",id})})
afterEach(()=>vi.unstubAllEnvs())
describe("enquiry commands without proxy",()=>{
 it.each([[create,manual,"admin_enquiry_create_v1"],[triage,triageBody,"admin_enquiry_triage_v1"],[convert,conversion,"admin_enquiry_convert_v1"]] as const)("uses a fixed RPC and validates session at the database",async(handler,body,name)=>{expect((await handler(req(body))).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith(name,expect.objectContaining({p_token:expect.stringMatching(/^[a-f0-9]{64}$/)}));expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))})
 it.each([create,triage,convert])("rejects forged origin, invalid cookies and payload fields",async handler=>{expect((await handler(req(manual,{origin:"https://evil.example"}))).status).toBe(403);expect((await handler(req(manual,{cookie:""}))).status).toBe(401);expect((await handler(req({...manual,actor:"owner"}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()})
 it("bounds the body and requires an idempotency key",async()=>{expect((await create(req("x".repeat(32769)))).status).toBe(413);expect((await create(req(manual,{"idempotency-key":""}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()})
 it.each([["unauthorized",401],["conflict",409],["denied",403],["invalid",400],["unknown",503]])("maps result %s",async(status,code)=>{mocks.rpc.mockResolvedValue({status});expect((await triage(req(triageBody))).status).toBe(code)})
 it("hides raw provider details",async()=>{mocks.rpc.mockRejectedValue(new Error("private error"));const r=await create(req(manual));expect(r.status).toBe(503);expect(await r.text()).not.toContain("private error")})
 it("search endpoint bounds results, denies expired sessions and rejects unknown record types",async()=>{
  const get=(query:string)=>new NextRequest(`${origin}/api/enquiries/options?${query}`,{headers:{cookie:`${sessionCookie}=${"a".repeat(64)}`}})
  mocks.rpc.mockResolvedValue(null);expect((await options(get("entity=client&q=Alex"))).status).toBe(401)
  mocks.rpc.mockResolvedValue(Array.from({length:51},(_,i)=>({id:i})));const r=await options(get("entity=location&q=Bakery"));expect((await r.json()).rows).toHaveLength(50);expect(r.headers.get("cache-control")).toContain("no-store")
  expect((await options(get("entity=admin_identity"))).status).toBe(400)
 })
})
describe("triage validation",()=>{
 it("requires a next action and date for waiting, and real terms acceptance for monitoring",()=>{expect(enquiryArgs("triage",{...triageBody,due:null})).toBeNull();expect(enquiryArgs("triage",{...triageBody,nextAction:""})).toBeNull();expect(enquiryArgs("convert",{...conversion,kind:"MONITORING"})).toBeNull()})
 it("does not accept missing contact methods or forged ownership fields",()=>{expect(enquiryArgs("create",{...manual,phone:""})).toBeNull();expect(enquiryArgs("convert",{...conversion,owner:true})).toBeNull()})
 it("validates compound cursors, timezone timestamps and filters",()=>{expect(enquiryFilters({time:"2026-09-17T12:00:00Z"})).toBeNull();expect(enquiryFilters({before:id,time:"not-date"})).toBeNull();expect(enquiryFilters({state:"__proto__"})).toBeNull();expect(enquiryFilters({time:"2026-09-17T12:00:00.123456+00:00",before:id})).not.toBeNull()})
})
