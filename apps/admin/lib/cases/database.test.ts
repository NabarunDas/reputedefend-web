import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync,readdirSync } from "node:fs"
const db=new PGlite(),uid="11111111-1111-4111-8111-111111111111",customer="22222222-2222-4222-8222-222222222222",business="33333333-3333-4333-8333-333333333333",location="44444444-4444-4444-8444-444444444444",token="a".repeat(64)
const key=()=>crypto.randomUUID(),note="Reviewed the caller’s request and confirmed the details."
// Heterogeneous database JSON results are intentionally inspected in this SQL integration harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(name:string,args:unknown[]=[]){return (await db.query<{value:any}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) as value`,args)).rows[0].value}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
 const dir=new URL("../../../../supabase/migrations/",import.meta.url),read=(name:string)=>readFileSync(new URL(name,dir),"utf8")
 // Native UUID-backed random bytes substitute only for pgcrypto, which PGlite does not ship.
 await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';"))
 for(const name of ["20260916000000_relaunch_guard_data_foundation_v1.sql","20260917080553_single_admin_auth_v1.sql","20260917160740_admin_audit_foundation_v1.sql","20260917183422_admin_client_workspace_v1.sql",readdirSync(dir).find(n=>n.endsWith("_admin_enquiry_triage_v1.sql"))!,readdirSync(dir).find(n=>n.endsWith("_admin_case_workflows_v1.sql"))!])await db.exec(read(name))
},30000)
afterAll(async()=>{await db.close()})
beforeEach(async()=>{
 await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
 truncate public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts,public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.customers,public.businesses,public.locations,auth.users cascade;
 alter table public.admin_audit_events enable trigger admin_audit_immutable;
 insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
 insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
 insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
 insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
 insert into public.businesses(id,display_name) values('${business}','Bakery');
 insert into public.locations(id,business_id,country) values('${location}','${business}','UK');`)
})

const caseId="55555555-5555-4555-8555-555555555555"
beforeEach(async()=>{await db.exec(`insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');`)})
const detail=()=>rpc('admin_case_detail_v1',[token,caseId,null])
const command=async(operation:string,data:Record<string,unknown>,version?:number,request=key())=>rpc('admin_case_command_v1',[token,request,caseId,version??(await detail()).version,operation,{note,...data}])
const plan=(track='GUIDED')=>command('plan',{track,priority:'NORMAL',assigned:true,nextAction:'Review the request',due:null,firstResponseDue:null})
const move=(target:string)=>command('transition',{target,nextAction:'Follow up with customer',due:'2026-12-01T12:00:00Z'})
const task={title:'Call the customer',owner:'ADMIN',kind:'COMPLAINT',due:'2026-01-01T12:00:00Z',source:'Agreed on the phone',timezone:'Europe/London'}
const submission={submittedAt:'2026-02-01T12:00:00Z',reference:'GOOGLE-123',channel:'Google appeals tool',evidence:'Submission receipt reviewed and referenced',confirmed:true}
async function toSelection(track='GUIDED'){await plan(track);expect((await move('ASSESSMENT_READY')).status).toBe('success');expect((await move('SERVICE_SELECTION')).status).toBe('success')}
describe('case workflow SQL',()=>{
 it('preserves references and denies anonymous sessions and table access',async()=>{
  const c=await detail();expect(c.reference).toMatch(/^PR-/);expect(c.stage).toBe('INITIAL_REVIEW');
  expect(await rpc('admin_case_detail_v1',['bad',caseId,null])).toBeNull();
  expect(await rpc('admin_case_command_v1',['bad',key(),caseId,1,'note',{note,visibility:'CUSTOMER'}])).toEqual({status:'unauthorized'});
  for(const role of ['anon','authenticated','service_role']){const r=await db.query<{ok:boolean}>("select has_table_privilege($1,'public.case_work_events','SELECT') as ok",[role]);expect(r.rows[0].ok).toBe(false)}
 })
 it('enforces the transition matrix and Guided/Managed gates',async()=>{
  expect((await move('SUBMITTED')).status).toBe('denied');await toSelection();expect((await move('AUTHORIZATION_REQUIRED')).status).toBe('denied');expect((await move('PAYMENT_REQUIRED')).status).toBe('success');expect((await move('PREPARATION')).status).toBe('prerequisite');expect((await plan('MANAGED')).status).toBe('denied');
 })
 it('requires a follow-up for waiting stages and creates a task',async()=>{
  expect((await command('transition',{target:'EVIDENCE_COLLECTION',nextAction:'',due:null})).status).toBe('invalid');expect((await move('EVIDENCE_COLLECTION')).status).toBe('success');const c=await detail();expect(c.tasks).toHaveLength(1);expect(c.tasks[0].owner).toBe('CUSTOMER');expect(c.status).toBe('AWAITING_CUSTOMER');
 })
 it('rejects stale edits and deduplicates committed retries',async()=>{
  const k=key(),data={visibility:'INTERNAL'};expect((await command('note',data,1,k)).status).toBe('success');expect((await command('note',data,1,k)).status).toBe('success');expect((await command('note',data,1)).status).toBe('conflict');expect((await command('note',{visibility:'CUSTOMER'},1,k)).status).toBe('conflict');expect((await detail()).events).toHaveLength(1);
 })
 it('keeps internal notes and contact details out of customer preview',async()=>{
  await command('note',{visibility:'INTERNAL',note:'Internal private assessment text'});await command('note',{visibility:'CUSTOMER',note:'We have reviewed your request.'});const c=await detail();expect(c.customerPreview.notes).toEqual(['We have reviewed your request.']);expect(JSON.stringify(c.customerPreview)).not.toContain('Internal');expect(Object.keys(c.customerPreview).sort()).toEqual(['notes','reference','summary','type']);
 })
 it('blocks closure with unresolved complaints, then reopens with a new task',async()=>{
  await command('task',task);expect((await command('close',{outcome:'WITHDRAWN',summary:'Customer chose to withdraw the request.'})).status).toBe('open_work');const t=(await detail()).tasks[0];expect((await command('resolve_task',{taskId:t.id,status:'DONE'})).status).toBe('success');expect((await command('close',{outcome:'WITHDRAWN',summary:'Customer chose to withdraw the request.'})).status).toBe('success');expect((await command('note',{visibility:'INTERNAL'})).status).toBe('denied');expect((await command('reopen',task)).status).toBe('success');const c=await detail();expect(c.stage).toBe('FURTHER_REVIEW');expect(c.outcome).toBeNull();expect(c.tasks.filter((t:{status:string})=>t.status==='OPEN')).toHaveLength(1);expect(c.events[0].details.previousOutcome).toBe('WITHDRAWN');
 })
 for(const track of ['GUIDED','MANAGED'])it(`records ${track} external submissions without a second active attempt`,async()=>{
  await toSelection(track);expect((await command('submission',{...submission,confirmed:false})).status).toBe('invalid');expect((await command('submission',submission)).status).toBe('success');let c=await detail();expect(c.submissions[0].actor).toBe(track==='GUIDED'?'CUSTOMER':'ADMIN');await move('WAITING_GOOGLE');await move('FURTHER_REVIEW');expect((await command('submission',submission)).status).toBe('open_work');expect((await command('resolve_submission',{submissionId:c.submissions[0].id,result:'DECIDED'})).status).toBe('success');expect((await command('submission',{...submission,reference:'GOOGLE-456'})).status).toBe('success');c=await detail();expect(c.submissions).toHaveLength(2);
 })
 it('requires an appropriate outcome, outcome review, and resolved attempts',async()=>{
  expect((await command('close',{outcome:'RESTORED',summary:'The profile is visible again.'})).status).toBe('denied');await toSelection();await command('submission',submission);await move('OUTCOME_REVIEW');expect((await command('close',{outcome:'REMOVED',summary:'The profile is visible again.'})).status).toBe('invalid');expect((await command('close',{outcome:'RESTORED',summary:'The profile is visible again.'})).status).toBe('open_work');const c=await detail();await command('resolve_submission',{submissionId:c.submissions[0].id,result:'DECIDED'});expect((await command('close',{outcome:'RESTORED',summary:'The profile is visible again.'})).status).toBe('success');
 })
 it('does not invent approval when changing stages',async()=>{await toSelection('MANAGED');expect((await move('AUTHORIZATION_REQUIRED')).status).toBe('success');expect((await move('PREPARATION')).status).toBe('prerequisite');expect((await detail()).stage).toBe('AUTHORIZATION_REQUIRED')})
 it('validates deadlines, guessed task IDs and future submissions',async()=>{
  expect((await command('note',{visibility:'INTERNAL',note:'x'.repeat(1001)})).status).toBe('invalid');expect((await command('task',{...task,timezone:'Mars/Nowhere'})).status).toBe('invalid');expect((await command('resolve_task',{taskId:key(),status:'DONE'})).status).toBe('conflict');await toSelection();expect((await command('submission',{...submission,submittedAt:'2999-01-01T00:00:00Z'})).status).toBe('invalid');
 })
 it('filters and pages tasks by deadline without losing equal timestamps',async()=>{
  for(let i=0;i<52;i++)await command('task',task);const first=await rpc('admin_task_list_v1',[token,'overdue',null,null]);expect(first).toHaveLength(51);const last=first[49];const next=await rpc('admin_task_list_v1',[token,'overdue',last.due,last.id]);expect(next).toHaveLength(2);expect(new Set([...first.slice(0,50),...next].map(t=>t.id)).size).toBe(52);
 })
 it('rolls back task and version changes if audit fails',async()=>{
  await db.exec("CREATE FUNCTION public.reject_case_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit offline'; END $$; CREATE TRIGGER reject_case_audit BEFORE INSERT ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_case_audit();");
  try{await expect(command('task',task)).rejects.toThrow();expect((await detail()).tasks).toHaveLength(0);expect((await detail()).version).toBe(1)}finally{await db.exec('DROP TRIGGER reject_case_audit ON public.admin_audit_events; DROP FUNCTION public.reject_case_audit();')}
 })
})
