export async function runResearchWithRefresh(
 run:()=>Promise<unknown>,
 refresh:()=>Promise<void>,
){
 let failure:unknown
 try{
  await run()
 }catch(cause){
  failure=cause
 }
 try{
  await refresh()
 }catch(cause){
  if(failure===undefined)throw cause
 }
 if(failure!==undefined)throw failure
}
