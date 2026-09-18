import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('@/lib/auth/backend',async original=>({...await original<typeof import('@/lib/auth/backend')>(),backend:()=>mocks}))
import {POST} from '@/app/api/cases/command/route'
import {sessionCookie} from '@/lib/auth/config'
import {caseArgs} from './validation'
import {filters} from './model'
const origin='https://admin.profilerelaunch.com',id='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333',body={id,version:1,operation:'note',data:{note:'Reviewed this request today.',visibility:'INTERNAL'}}
const req=(b:unknown=body,headers:Record<string,string>={})=>new NextRequest(`${origin}/api/cases/command`,{method:'POST',headers:{origin,'content-type':'application/json','idempotency-key':key,cookie:`${sessionCookie}=${'a'.repeat(64)}`,...headers},body:JSON.stringify(b)})
beforeEach(()=>{vi.stubEnv('ADMIN_AUTH_ENABLED','true');vi.stubEnv('ADMIN_ORIGIN',origin);vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_SECRET_KEY','test');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','test');mocks.rpc.mockReset().mockResolvedValue({status:'success',id})})
afterEach(()=>vi.unstubAllEnvs())
describe('case commands without proxy',()=>{
 it('uses one scoped RPC with a hashed token and exact payload',async()=>{expect((await POST(req())).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('admin_case_command_v1',{p_case:id,p_version:1,p_operation:'note',p_data:body.data,p_request:key,p_token:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe('a'.repeat(64))})
 it('rejects invalid origin, cookie, type, key and large payload',async()=>{expect((await POST(req(body,{origin:'https://evil.example'}))).status).toBe(403);expect((await POST(req(body,{cookie:''}))).status).toBe(401);expect((await POST(req(body,{'content-type':'text/plain'}))).status).toBe(415);expect((await POST(req(body,{'idempotency-key':''}))).status).toBe(400);expect((await POST(req('x'.repeat(32769)))).status).toBe(413);expect(mocks.rpc).not.toHaveBeenCalled()})
 it.each([['unauthorized',401],['conflict',409],['denied',403],['prerequisite',409],['open_work',409],['invalid',400],['unknown',503]])('maps %s safely',async(status,code)=>{mocks.rpc.mockResolvedValue({status});expect((await POST(req())).status).toBe(code)})
 it('rejects forged actor fields and operation names',async()=>{expect((await POST(req({...body,actor:'admin'}))).status).toBe(400);expect((await POST(req({...body,operation:'__proto__'}))).status).toBe(400);expect((await POST(req({...body,data:{...body.data,approved:true}}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()})
 it('keeps provider errors private',async()=>{mocks.rpc.mockRejectedValue(new Error('secret'));const r=await POST(req());expect(r.status).toBe(503);expect(await r.text()).not.toContain('secret')})
 it('validates dates, versions and compound cursors',()=>{expect(caseArgs({...body,version:0})).toBeNull();expect(caseArgs({...body,operation:'transition',data:{note:body.data.note,target:'OWNER_ACTION',nextAction:'Call',due:'tomorrow'}})).toBeNull();expect(filters({before:id})).toBeNull();expect(filters({time:'2026-09-18T12:00:00Z',before:id})).not.toBeNull();expect(filters({filter:'all'},true)).toBeNull()})
})
