import { NextRequest,NextResponse } from "next/server"
import { backend,tokenHash,validToken } from "@/lib/auth/backend"
import { sessionCookie } from "@/lib/auth/config"
import { privateResponseHeaders } from "@/lib/access"
export async function GET(request:NextRequest){
 const token=request.cookies.get(sessionCookie)?.value
 if(!validToken(token)) return NextResponse.json({message:"Please sign in again."},{status:401,headers:privateResponseHeaders})
 const entity=request.nextUrl.searchParams.get("entity"),q=request.nextUrl.searchParams.get("q")||""
 if(!["client","location"].includes(entity||"") || q.length>100) return NextResponse.json({message:"Check your search."},{status:400,headers:privateResponseHeaders})
 try {
  const rows=await backend().rpc<unknown[]|null>("admin_records_list_v1",{p_token:tokenHash(token),p_entity:entity,p_search:q,p_before:null,p_business:null})
  if(rows===null) return NextResponse.json({message:"Please sign in again."},{status:401,headers:privateResponseHeaders})
  return NextResponse.json({rows:rows.slice(0,50),more:rows.length>50},{headers:privateResponseHeaders})
 }catch{return NextResponse.json({message:"Search is unavailable. Please try again."},{status:503,headers:privateResponseHeaders})}
}
