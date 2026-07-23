import{createClient}from'npm:@supabase/supabase-js@2'
import{authenticatedUserClientOptions}from'./authenticatedUserClient.ts'

const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message)}

Deno.test('authenticated user client forwards one exact bearer header',async()=>{
 let observedAuthorization=''
 const fakeFetch:typeof fetch=async(_input,init)=>{
  observedAuthorization=new Headers(init?.headers).get('authorization')??''
  return new Response(JSON.stringify({id:'test-user'}),{status:200,headers:{'content-type':'application/json'}})
 }
 const client=createClient(
  'https://example.supabase.co',
  'legacy-anon-jwt',
  authenticatedUserClientOptions('Bearer test-user-jwt',fakeFetch),
 )

 await client.auth.getUser()

 assert(observedAuthorization==='Bearer test-user-jwt','The user bearer header was duplicated, replaced, or malformed.')
})
