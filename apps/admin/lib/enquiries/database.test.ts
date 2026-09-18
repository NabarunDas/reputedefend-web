import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync,readdirSync } from "node:fs"
const db=new PGlite(),uid="11111111-1111-4111-8111-111111111111",customer="22222222-2222-4222-8222-222222222222",business="33333333-3333-4333-8333-333333333333",location="44444444-4444-4444-8444-444444444444",token="a".repeat(64)
const key=()=>crypto.randomUUID(),note="Reviewed the caller’s request and confirmed the details."
const payload={fullName:"Alex Morgan",email:"alex@example.com",phone:"07123456789",businessName:"Example Bakery",country:"UK",service:"general",subject:"general-question",details:"I need help with my business profile.",websiteUrl:"",businessProfileUrl:"",reviewUrl:"",informationAccurate:false,privacyAccepted:false,source:"contact"}
// Heterogeneous database JSON results are intentionally inspected in this SQL integration harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(name:string,args:unknown[]=[]){return (await db.query<{value:any}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) as value`,args)).rows[0].value}
const create=(id=key(),data=payload,ack=false)=>rpc("create_general_enquiry_v1",[id,data,ack])
const detail=(id:string)=>rpc("admin_enquiry_detail_v1",[token,id])
const convert=(id:string,kind="PROFILE_RECOVERY",version=1)=>rpc("admin_enquiry_convert_v1",[token,id,version,kind,customer,location,kind==="MONITORING"?"2026-01-01T12:00:00Z":null,note,key()])
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
 const dir=new URL("../../../../supabase/migrations/",import.meta.url),read=(name:string)=>readFileSync(new URL(name,dir),"utf8")
 // Native UUID-backed random bytes substitute only for pgcrypto, which PGlite does not ship.
 await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';"))
 for(const name of ["20260916000000_relaunch_guard_data_foundation_v1.sql","20260917080553_single_admin_auth_v1.sql","20260917160740_admin_audit_foundation_v1.sql","20260917183422_admin_client_workspace_v1.sql",readdirSync(dir).find(n=>n.endsWith("_admin_enquiry_triage_v1.sql"))!])await db.exec(read(name))
},30000)
afterAll(async()=>{await db.close()})
beforeEach(async()=>{
 await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
 truncate public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.customers,public.businesses,public.locations,auth.users cascade;
 alter table public.admin_audit_events enable trigger admin_audit_immutable;
 insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
 insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
 insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
 insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
 insert into public.businesses(id,display_name) values('${business}','Bakery');
 insert into public.locations(id,business_id,country) values('${location}','${business}','UK');`)
})
describe("durable enquiries and triage",()=>{
 it("persists before notification, deduplicates retries and rejects changed content",async()=>{
  const submission=key(),e=await create(submission)
  expect(e).toMatchObject({status:"created",sendAck:false})
  expect(await create(submission)).toEqual({status:"existing"})
  expect(await create(submission,{...payload,email:"other@example.com"})).toEqual({status:"conflict"})
  expect((await detail(e.id)).internalStatus).toBe("SENDING")
  expect((await db.query<{n:number}>("select count(*)::int as n from public.enquiries")).rows[0].n).toBe(1)
  expect((await db.query<{n:number}>("select count(*)::int as n from public.cases")).rows[0].n).toBe(0)
 })
 it("does not let formal assessments enter the general enquiry RPC",async()=>{
  expect(await create(key(),{...payload,source:"get-help"})).toEqual({status:"invalid"})
 })
 it("records failed email without losing the enquiry and does not enable a disabled acknowledgement",async()=>{
  const e=await create()
  expect(await rpc("finish_general_enquiry_notification_v1",[e.id,e.attempt,"FAILED","SENT"])).toBe(true)
  expect(await detail(e.id)).toMatchObject({internalStatus:"FAILED",ackStatus:"SKIPPED",status:"new"})
  expect(await rpc("finish_general_enquiry_notification_v1",[e.id,e.attempt,"SENT","SENT"])).toBe(false)
 })
 it("rejects wrong notification claims and records unknown provider outcomes",async()=>{
  const e=await create(key(),payload,true)
  expect(await rpc("finish_general_enquiry_notification_v1",[e.id,key(),"SENT","SENT"])).toBe(false)
  expect(await rpc("finish_general_enquiry_notification_v1",[e.id,e.attempt,"UNKNOWN","SENT"])).toBe(true)
  expect(await detail(e.id)).toMatchObject({internalStatus:"UNKNOWN",ackStatus:"SENT"})
 })
 it("captures a phone-only enquiry once without sending email or granting ownership",async()=>{
  const submission=key(),data={...payload,source:"phone",email:""}
  const first=await rpc("admin_enquiry_create_v1",[token,submission,data,note])
  expect(first.status).toBe("success")
  expect(await rpc("admin_enquiry_create_v1",[token,submission,data,note])).toEqual(first)
  expect(await detail(first.id)).toMatchObject({source:"phone",assigned:true,internalStatus:"SKIPPED",ackStatus:"SKIPPED"})
  expect((await db.query("select * from public.business_memberships")).rows).toHaveLength(0)
 })
 it("records assignment, notes, follow-up and optimistic conflicts",async()=>{
  const e=await create()
  const args=[token,e.id,1,"waiting",true,"Call the customer","2026-01-01T12:00:00Z",note,key()]
  expect((await rpc("admin_enquiry_triage_v1",args)).status).toBe("success")
  expect((await rpc("admin_enquiry_triage_v1",args)).status).toBe("conflict")
  expect(await detail(e.id)).toMatchObject({status:"waiting",version:2,assigned:true,nextAction:"Call the customer"})
  expect(await rpc("admin_enquiry_list_v1",[token,"active","",null,null,"overdue"])).toHaveLength(1)
  expect((await rpc("admin_enquiry_triage_v1",[token,e.id,2,"waiting",true,"",null,note,key()])).status).toBe("invalid")
 })
 it("supports close, spam and reopen without deleting history",async()=>{
  const e=await create()
  for(const [version,status] of [[1,"closed"],[2,"open"],[3,"spam"],[4,"new"]])expect((await rpc("admin_enquiry_triage_v1",[token,e.id,version,status,false,"",null,note,key()])).status).toBe("success")
  expect((await detail(e.id)).events).toHaveLength(5)
 })
 it.each(["PROFILE_RECOVERY","REVIEW_PROTECTION","MONITORING"])("converts once to %s while preserving record links and receipt semantics",async kind=>{
  const e=await create()
  expect((await convert(e.id,kind)).status).toBe("success")
  expect((await convert(e.id,kind)).status).toBe("success")
  const d=await detail(e.id)
  expect(d.status).toBe("converted")
  if(kind==="MONITORING"){
   const rows=(await db.query("select customer_id,business_id,location_id,status,source,terms_accepted_at from public.monitoring_requests")).rows
   expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({customer_id:customer,business_id:business,location_id:location,status:"REQUESTED",source:"ADMIN_ENQUIRY"})
   expect(d.caseId).toBeNull()
  }else{
   expect(d.caseRef).toMatch(kind==="PROFILE_RECOVERY"?/^PR-\d{2}-[A-HJ-NP-Z2-9]{6}$/:/^RV-\d{2}-[A-HJ-NP-Z2-9]{6}$/)
   const rows=(await db.query("select customer_id,business_id,location_id,status,privacy_accepted_at,information_accurate_at from public.cases")).rows
   expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({customer_id:customer,business_id:business,location_id:location,status:"RECEIVED",privacy_accepted_at:null,information_accurate_at:null})
  }
  expect((await db.query("select * from public.communications")).rows).toHaveLength(0)
  expect((await rpc("admin_enquiry_triage_v1",[token,e.id,2,"open",true,"",null,note,key()])).status).toBe("denied")
 })
 it("rejects different conversions, missing terms, future consent and guessed target records",async()=>{
  const e=await create()
  for(const terms of [null,"2999-01-01T12:00:00Z"])expect((await rpc("admin_enquiry_convert_v1",[token,e.id,1,"MONITORING",customer,location,terms,note,key()])).status).toBe("invalid")
  expect((await rpc("admin_enquiry_convert_v1",[token,e.id,1,"PROFILE_RECOVERY",key(),location,null,note,key()])).status).toBe("denied")
  await convert(e.id)
  expect((await convert(e.id,"REVIEW_PROTECTION")).status).toBe("conflict")
 })
 it("rolls conversion back when audit insertion fails",async()=>{
  const e=await create()
  await db.exec("alter table public.admin_audit_events add constraint simulate_audit_failure check(action<>'ENQUIRY_CONVERTED')")
  try{await expect(convert(e.id)).rejects.toThrow(/simulate_audit_failure/);expect((await detail(e.id)).status).toBe("new");expect((await db.query("select * from public.cases")).rows).toHaveLength(0)}finally{await db.exec("alter table public.admin_audit_events drop constraint simulate_audit_failure")}
 })
 it("paginates equal timestamps without dropping or repeating enquiries",async()=>{
  await db.exec(`insert into public.enquiries(submission_key,fingerprint,source,payload,internal_status,ack_status,created_at) select gen_random_uuid(),'test','contact','${JSON.stringify(payload)}'::jsonb,'FAILED','SKIPPED','2026-01-01T12:00:00Z' from generate_series(1,55)`)
  const first=await rpc("admin_enquiry_list_v1",[token]),last=first[49]
  const next=await rpc("admin_enquiry_list_v1",[token,"active","",last.createdAt,last.id])
  expect(first).toHaveLength(51);expect(next).toHaveLength(5)
  expect(new Set([...first.slice(0,50),...next].map(x=>x.id)).size).toBe(55)
 })
 it("blocks browser roles and fails closed on revoked admin access",async()=>{
  const e=await create()
  for(const role of ["anon","authenticated","service_role"]){await db.exec(`set role ${role}`);try{await expect(db.query("select * from public.enquiries")).rejects.toThrow(/permission denied/);if(role!=="service_role"){await expect(create()).rejects.toThrow(/permission denied/);await expect(detail(e.id)).rejects.toThrow(/permission denied/)}else{expect(await rpc("admin_enquiry_list_v1",["invalid"])).toBeNull()}}finally{await db.exec("reset role")}}
  await db.exec("update public.admin_sessions set revoked_at=now()")
  expect(await detail(e.id)).toBeNull();expect((await convert(e.id)).status).toBe("unauthorized")
 })
})
