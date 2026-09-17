import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock("@/lib/auth/backend",async original=>({...await original<typeof import("@/lib/auth/backend")>(),backend:()=>mocks}))
import { POST as save } from "@/app/api/records/save/route"
import { POST as verify } from "@/app/api/records/verify/route"
import { POST as membership } from "@/app/api/records/membership/route"
import { sessionCookie } from "@/lib/auth/config"
import { commandArgs } from "./validation"
import { safeWebUrl, searchFilters } from "./model"
const origin="https://admin.profilerelaunch.com", id="22222222-2222-4222-8222-222222222222", key="33333333-3333-4333-8333-333333333333"
const body={entity:"client",id:null,version:0,data:{name:"Alex",email:"alex@example.com",phone:""},reason:"Checked customer request."}
const verification={customerId:id,version:1,channel:"email",evidence:"Confirmed during the agreed contact check."}
const relation={customerId:id,businessId:key,version:0,status:"pending",evidence:"Awaiting business authority evidence."}
function request(data:unknown=body,headers:Record<string,string>={},url=origin){return new NextRequest(`${url}/api/records/save`,{method:"POST",headers:{origin,"content-type":"application/json","idempotency-key":key,cookie:`${sessionCookie}=${"a".repeat(64)}`,...headers},body:JSON.stringify(data)})}
beforeEach(()=>{vi.stubEnv("ADMIN_AUTH_ENABLED","true");vi.stubEnv("ADMIN_ORIGIN",origin);vi.stubEnv("SUPABASE_URL","https://example.supabase.co");vi.stubEnv("SUPABASE_SECRET_KEY","test");vi.stubEnv("SUPABASE_PUBLISHABLE_KEY","test");mocks.rpc.mockReset().mockResolvedValue({status:"success",id})})
afterEach(()=>vi.unstubAllEnvs())
describe("client command routes independent of proxy",()=>{
 it.each([[save,body,"admin_record_save_v1"],[verify,verification,"admin_contact_verify_v1"],[membership,relation,"admin_membership_save_v1"]] as const)("uses only the fixed RPC and hashes the session",async(handler,payload,rpc)=>{
  const response=await handler(request(payload))
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store")
  expect(mocks.rpc).toHaveBeenCalledWith(rpc,expect.objectContaining({p_request:key,p_token:expect.stringMatching(/^[a-f0-9]{64}$/)}))
  expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))
 })
 it.each([save,verify,membership])("requires same-origin, configured auth and a valid opaque cookie",async handler=>{
  expect((await handler(request(body,{origin:"https://evil.example"}))).status).toBe(403)
  expect((await handler(request(body,{},"https://evil.example"))).status).toBe(403)
  expect((await handler(request(body,{cookie:""}))).status).toBe(401)
  expect((await handler(request(body,{"content-type":"text/plain"}))).status).toBe(415)
  vi.stubEnv("ADMIN_AUTH_ENABLED","false")
  expect((await handler(request())).status).toBe(503)
  expect(mocks.rpc).not.toHaveBeenCalled()
 })
 it("rejects forged fields, missing idempotency keys and oversized bodies",async()=>{
  expect((await save(request({...body,actorId:id}))).status).toBe(400)
  expect((await save(request(body,{"idempotency-key":""}))).status).toBe(400)
  expect((await save(request("a".repeat(16385)))).status).toBe(413)
  expect(mocks.rpc).not.toHaveBeenCalled()
 })
 it.each([["unauthorized",401],["reauth_required",403],["conflict",409],["denied",403],["invalid",400],["unexpected",503]])("maps SQL outcome %s",async(status,expected)=>{
  mocks.rpc.mockResolvedValue({status});expect((await save(request())).status).toBe(expected)
 })
 it("hides raw provider errors on an uncertain commit",async()=>{
  mocks.rpc.mockRejectedValue(new Error("secret provider detail"))
  const response=await save(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("secret provider")
 })
})
describe("record payload boundaries",()=>{
 it.each([null,[],{...body,version:1},{...body,id,version:0},{...body,reason:"short"},{...body,data:{...body.data,role:"owner"}},{...body,data:{...body.data,email:"invalid"}}])("rejects malformed save %j",value=>{expect(commandArgs("save",value)).toBeNull()})
 it("validates authority and proof inputs",()=>{
  expect(commandArgs("membership",{...relation,status:"owner"})).toBeNull()
  expect(commandArgs("verify",{...verification,channel:"authUserId"})).toBeNull()
  expect(commandArgs("verify",verification)).not.toBeNull()
 })
 it("rejects unsafe external URLs and search parameters",()=>{
  expect(safeWebUrl("javascript:alert(1)")).toBeNull()
  expect(safeWebUrl("https://user:password@example.com")).toBeNull()
  expect(safeWebUrl("https://example.com")).toBe("https://example.com/")
  expect(commandArgs("save",{...body,entity:"business",data:{name:"Biz",website:"javascript:alert(1)"}})).toBeNull()
  expect(searchFilters({q:["one","two"]})).toBeNull()
  expect(searchFilters({q:"x".repeat(101)})).toBeNull()
  expect(searchFilters({after:"not-a-uuid"})).toBeNull()
 })
})
