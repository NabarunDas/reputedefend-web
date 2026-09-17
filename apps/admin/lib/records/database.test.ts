import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111", c1 = "22222222-2222-4222-8222-222222222222", c2 = "33333333-3333-4333-8333-333333333333", b1 = "44444444-4444-4444-8444-444444444444", b2 = "55555555-5555-4555-8555-555555555555", l1 = "66666666-6666-4666-8666-666666666666"
const token = "a".repeat(64), reason = "Checked source documents on 17 September."
const request = () => crypto.randomUUID()
// SQL RPCs have heterogeneous JSON return contracts in this integration harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(name: string, args: unknown[] = []) { return (await db.query<{ value: any }>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) as value`, args)).rows[0].value }
const save = (entity: string, id: string | null, version: number, data: object, key = request()) => rpc("admin_record_save_v1", [token,entity,id,version,data,reason,key])
const verify = (id=c1,version=1,channel="email") => rpc("admin_contact_verify_v1",[token,id,version,channel,reason,request()])
const membership = (id=c1,business=b1,version=0,status="verified") => rpc("admin_membership_save_v1",[token,id,business,version,status,reason,request()])
const detail = (entity="client",id=c1) => rpc("admin_record_detail_v1",[token,entity,id])
beforeAll(async () => {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
 const dir=new URL("../../../../supabase/migrations/",import.meta.url)
 const read=(name:string)=>readFileSync(new URL(name,dir),"utf8")
 // PGlite lacks pgcrypto. UUIDs are native; case references below are supplied explicitly.
 await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';"))
 await db.exec(read("20260916000000_relaunch_guard_data_foundation_v1.sql"))
 await db.exec(read("20260917080553_single_admin_auth_v1.sql"))
 await db.exec(read("20260917160740_admin_audit_foundation_v1.sql"))
 await db.exec(read(readdirSync(dir).find(n=>n.endsWith("_admin_client_workspace_v1.sql"))!))
},30000)
afterAll(async()=>{await db.close()})
beforeEach(async()=>{
 await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
 truncate public.admin_audit_events,public.admin_auth_events,public.admin_identity,public.admin_sessions,public.customers,public.businesses,public.locations,public.cases,public.monitoring_requests,public.business_memberships,public.customer_contact_verifications,admin_private.record_command_receipts,auth.users cascade;
 alter table public.admin_audit_events enable trigger admin_audit_immutable;
 insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
 insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
 insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
 insert into public.customers(id,full_name,email,phone) values('${c1}','Alex Smith','alex@example.com','07123456789'),('${c2}','Alex Smith','second@example.com',null);
 insert into public.businesses(id,display_name) values('${b1}','Example Dental'),('${b2}','Example Dental');
 insert into public.locations(id,business_id,location_name,country) values('${l1}','${b1}','Swindon','UK');`)
})
describe("client workspace database",()=>{
 it("lists existing records and bounds literal searches without SQL wildcard expansion",async()=>{
   expect(await rpc("admin_records_list_v1",[token,"client","alex"])).toHaveLength(2)
   expect(await rpc("admin_records_list_v1",[token,"client","%"])).toHaveLength(0)
   expect(await rpc("admin_records_list_v1",[token,"client","",c1])).toHaveLength(1)
   await db.exec("insert into public.customers(full_name,email) select 'Client', 'client'||n||'@example.com' from generate_series(1,60) n")
   expect(await rpc("admin_records_list_v1",[token,"client"])).toHaveLength(51)
   await expect(rpc("admin_records_list_v1",[token,"forged"])).rejects.toThrow(/Invalid search/)
 })
 it("creates records, retries once without duplicates and rejects reused keys with different payload",async()=>{
   const key=request(), data={name:"New Business",website:"https://example.com"}
   const first=await save("business",null,0,data,key)
   expect(first.status).toBe("success")
   expect(await save("business",null,0,data,key)).toEqual(first)
   expect((await save("business",null,0,{...data,name:"Different"},key)).status).toBe("conflict")
   expect((await db.query("select * from public.businesses where display_name='New Business'")).rows).toHaveLength(1)
   expect((await db.query("select * from public.admin_audit_events")).rows).toHaveLength(1)
   expect((await save("client",null,0,{name:"New Client",email:"new@example.com",phone:""})).status).toBe("success")
   expect((await save("location",null,0,{name:"Second branch",country:"UK",profileUrl:"",businessId:b1})).status).toBe("success")
 })
 it("updates with optimistic concurrency and rejects duplicate email",async()=>{
   const payload={name:"Alex Jones",email:"alex@example.com",phone:"07123456789"}
   expect(await save("client",c1,1,payload)).toMatchObject({status:"success",version:2})
   expect((await save("client",c1,1,payload)).status).toBe("conflict")
   expect((await save("client",c1,2,{...payload,email:"second@example.com"})).status).toBe("conflict")
   expect((await detail()).record.email).toBe("alex@example.com")
   const audit=await db.query<{details:unknown}>("select details from public.admin_audit_events")
   expect(JSON.stringify(audit.rows)).not.toContain("alex@example.com")
   expect(JSON.stringify(audit.rows)).not.toContain("07123456789")
 })
 it("uses a new record version after marketing/direct updates too",async()=>{
   await db.exec(`update public.customers set full_name='Marketing update' where id='${c1}'`)
   expect((await save("client",c1,1,{name:"Stale",email:"alex@example.com",phone:""})).status).toBe("conflict")
 })
 it("permanently invalidates contact proof on change, even if later changed back",async()=>{
   expect((await verify()).status).toBe("success")
   expect((await detail()).record).toMatchObject({emailVerified:true,version:2})
   await db.exec(`update public.customers set email='changed@example.com' where id='${c1}'; update public.customers set email='alex@example.com' where id='${c1}'`)
   expect((await detail()).record.emailVerified).toBe(false)
 })
 it("email recovery cannot silently carry verified business authority to a new contact",async()=>{
   await verify();await membership()
   await db.exec(`set role service_role; update public.customers set email='replacement@example.com' where id='${c1}'; reset role`)
   const changed=await detail()
   expect(changed.record.email).toBe("replacement@example.com")
   expect(changed.record.emailVerified).toBe(false)
   expect(changed.memberships[0].status).toBe("pending")
   expect(changed.memberships[0].version).toBe(2)
   await verify(c1,changed.record.version)
   expect((await db.query("select admin_private.customer_business_projection_v1($1,$2) as value",[c1,b1])).rows[0]).toEqual({value:null})
 })
 it("does not create verified authority from a submission or an unverified contact",async()=>{
   await db.exec(`insert into public.cases(public_ref,case_type,customer_id,business_id,location_id,issue_description) values('PR-26-ABCDEF','PROFILE_RECOVERY','${c1}','${b1}','${l1}','Example issue')`)
   const d=await detail()
   expect(d.submittedBusinesses).toEqual([{id:b1,name:"Example Dental"}])
   expect(d.memberships).toEqual([])
   expect((await membership()).status).toBe("denied")
   expect((await db.query("select admin_private.customer_business_projection_v1($1,$2) as value",[c1,b1])).rows[0]).toEqual({value:null})
 })
 it("supports many verified contacts per business and multiple businesses/locations per client",async()=>{
   await verify();await verify(c2)
   expect((await membership()).status).toBe("success")
   expect((await membership(c2)).status).toBe("success")
   expect((await membership(c1,b2)).status).toBe("success")
   expect((await detail()).memberships).toHaveLength(2)
   expect((await detail("business",b1)).memberships).toHaveLength(2)
   expect((await save("location",null,0,{name:"Branch 2",country:"UK",businessId:b1,profileUrl:""})).status).toBe("success")
   expect(await rpc("admin_records_list_v1",[token,"location","",null,b1])).toHaveLength(2)
 })
 it("customer projection allows only verified membership plus current email proof, with an explicit field list",async()=>{
   await verify();await membership()
   const projection=await db.query("select admin_private.customer_location_projection_v1($1,$2) as value",[c1,l1])
   expect(projection.rows[0]).toEqual({value:{id:l1,businessId:b1,name:"Swindon",country:"UK",profileUrl:null}})
   expect((await db.query("select admin_private.customer_location_projection_v1($1,$2) as value",[c2,l1])).rows[0]).toEqual({value:null})
   expect((await membership(c1,b1,1,"revoked")).status).toBe("success")
   expect((await db.query("select admin_private.customer_location_projection_v1($1,$2) as value",[c1,l1])).rows[0]).toEqual({value:null})
 })
 it("detects stale membership changes and contact verifications",async()=>{
   await verify();await membership()
   expect((await verify()).status).toBe("conflict")
   expect((await membership()).status).toBe("conflict")
 })
 it("requires fresh OTP for verification, relationship changes and an existing email change",async()=>{
   await db.exec("update public.admin_sessions set created_at=now()-interval '6 minutes'")
   expect((await verify()).status).toBe("reauth_required")
   expect((await membership()).status).toBe("reauth_required")
   expect((await save("client",c1,1,{name:"Alex",email:"new@example.com",phone:""})).status).toBe("reauth_required")
   expect((await detail()).record.email).toBe("alex@example.com")
 })
 it("blocks a location move that would corrupt existing case relationships",async()=>{
   expect((await save("location",l1,1,{name:"Moved",country:"UK",profileUrl:"",businessId:b2})).status).toBe("conflict")
   expect((await detail("location",l1)).record.businessId).toBe(b1)
 })
 it.each([{name:"A",email:"bad",phone:""},{name:"A",email:"a@example.com",phone:"",role:"owner"},{name:"A",email:"a@example.com"}])("validates SQL input independent of HTTP %j",async data=>{
   expect((await save("client",c1,1,data)).status).toBe("invalid")
 })
 it("denies unsafe website protocols in SQL",async()=>{
   expect((await save("business",b1,1,{name:"Unsafe",website:"javascript:alert(1)"})).status).toBe("invalid")
 })
 it("duplicate preview preserves case, monitoring and relationship references",async()=>{
   await db.exec(`insert into public.cases(public_ref,case_type,customer_id,business_id,location_id,issue_description) values('PR-26-ABCDEF','PROFILE_RECOVERY','${c1}','${b1}','${l1}','Example issue');
   insert into public.monitoring_requests(submission_key,customer_id,business_id,location_id,number_of_locations,terms_accepted_at) values(gen_random_uuid(),'${c1}','${b1}','${l1}',1,now())`)
   const preview=await rpc("admin_duplicate_preview_v1",[token,"client",c1,c2])
   expect(preview).toMatchObject({readOnly:true,leftCases:1,rightCases:0,leftMonitoring:1,rightMonitoring:0})
   expect(preview.left.work.some((w:{reference:string})=>w.reference==="PR-26-ABCDEF")).toBe(true)
   expect((await db.query("select customer_id,business_id,location_id,public_ref from public.cases")).rows).toEqual([{customer_id:c1,business_id:b1,location_id:l1,public_ref:"PR-26-ABCDEF"}])
   expect((await detail()).duplicates).toEqual([{id:c2,name:"Alex Smith"}])
 })
 it("rolls back record edits and receipts if audit insertion fails",async()=>{
   await db.exec("alter table public.admin_audit_events add constraint simulate_audit_failure check(action<>'RECORD_UPDATED')")
   try { await expect(save("business",b1,1,{name:"Changed",website:""})).rejects.toThrow(/simulate_audit_failure/)
    expect((await detail("business",b1)).record.name).toBe("Example Dental")
    expect((await db.query("select * from admin_private.record_command_receipts")).rows).toHaveLength(0)
   } finally {await db.exec("alter table public.admin_audit_events drop constraint simulate_audit_failure")}
 })
 it("checks revoked/disabled identities on every read and command",async()=>{
   await db.exec("update public.admin_identity set enabled=false")
   expect(await detail()).toBeNull()
   expect(await rpc("admin_records_list_v1",[token,"client"])).toBeNull()
   expect((await save("business",b1,1,{name:"Changed",website:""})).status).toBe("unauthorized")
   expect((await verify()).status).toBe("unauthorized")
   expect((await membership()).status).toBe("unauthorized")
 })
 it("keeps browser roles and service role away from proofs/private projections; narrow RPCs require sessions",async()=>{
   for(const role of ["anon","authenticated","service_role"]) {
    await db.exec(`set role ${role}`)
    try {
     await expect(db.query("select * from public.business_memberships")).rejects.toThrow(/permission denied/)
     await expect(db.query("select * from public.customer_contact_verifications")).rejects.toThrow(/permission denied/)
     await expect(db.query("select admin_private.customer_business_projection_v1($1,$2)",[c1,b1])).rejects.toThrow(/permission denied/)
     if(role!=="service_role") {await expect(detail()).rejects.toThrow(/permission denied/);await expect(verify()).rejects.toThrow(/permission denied/);await expect(membership()).rejects.toThrow(/permission denied/)}
     else {expect(await rpc("admin_records_list_v1",["invalid","client"])).toBeNull();expect((await detail()).record.id).toBe(c1)}
    } finally {await db.exec("reset role")}
   }
 })
})
