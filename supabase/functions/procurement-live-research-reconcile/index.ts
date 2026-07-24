import{createClient}from'npm:@supabase/supabase-js@2'
import{reconcileProcurementBackgroundBatch}from'../_shared/procurementBackgroundReconciler.ts'

const headers={'content-type':'application/json'}
const reply=(status:number,body:Record<string,unknown>)=>
 new Response(JSON.stringify(body),{status,headers})
const safeEqual=(left:string,right:string)=>{
 if(left.length!==right.length)return false
 let difference=0
 for(let index=0;index<left.length;index++)difference|=left.charCodeAt(index)^right.charCodeAt(index)
 return difference===0
}

Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,{status:'method_not_allowed'})
 const expected=Deno.env.get('PROCUREMENT_RECONCILER_SECRET')
 const supplied=request.headers.get('x-procurement-reconciler-secret')??''
 if(!expected||!supplied||!safeEqual(expected,supplied))return reply(401,{status:'unauthorized'})
 const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 const providerKey=Deno.env.get('OPENAI_API_KEY')
 if(!url||!serviceKey||!providerKey)return reply(503,{status:'not_configured'})
 const database=createClient(url,serviceKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 })
 try{
  const result=await reconcileProcurementBackgroundBatch({database,providerKey})
  console.info(JSON.stringify({event:'procurement_reconciliation_batch',...result}))
  return reply(200,{
   status:'ok',processed:result.processed,
   expiredUnmatched:result.expiredUnmatched,sweepStatus:result.sweepStatus,
  })
 }catch{
  return reply(503,{status:'storage_error'})
 }
})
