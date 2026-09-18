import 'server-only'
import {cookies} from 'next/headers'
import {notFound,redirect} from 'next/navigation'
import {requireStaff} from '../require-staff'
import {backend,tokenHash} from '../auth/backend'
import {sessionCookie} from '../auth/config'
import {isUuid} from '../records/model'
import type {CaseDetail,CaseRow,Task,filters} from './model'
async function read<T>(name:string,args:Record<string,unknown>):Promise<T>{await requireStaff();const token=(await cookies()).get(sessionCookie)!.value;const result=await backend().rpc<T|null>(name,{...args,p_token:tokenHash(token)});if(result===null)redirect('/login');return result}
export function listCases(f:NonNullable<ReturnType<typeof filters>>){return read<CaseRow[]>('admin_case_list_v1',{p_query:f.q,p_filter:f.filter,p_before_time:f.time,p_before_id:f.before})}
export function listTasks(f:NonNullable<ReturnType<typeof filters>>){return read<Task[]>('admin_task_list_v1',{p_filter:f.filter,p_before_time:f.time,p_before_id:f.before})}
export async function getCase(id:string,before?:string){if(!isUuid(id)||(before!==undefined&&(!/^[1-9]\d{0,18}$/.test(before)||BigInt(before)>BigInt("9223372036854775807"))))notFound();const result=await read<CaseDetail|{missing:true}>('admin_case_detail_v1',{p_id:id,p_before:before||null});if('missing' in result)notFound();return result}
