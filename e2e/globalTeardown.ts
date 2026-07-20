import{execFileSync}from'node:child_process'
import{existsSync,readFileSync,unlinkSync}from'node:fs'
import{runtimePath}from'./globalSetup'

export default async function globalTeardown(){
 if(!existsSync(runtimePath))return
 const owner=JSON.parse(readFileSync(runtimePath,'utf8'))as{userId:string}
 for(let attempt=1;attempt<=3;attempt++)try{
  execFileSync('node',['scripts/browser-test-owner.mjs','delete',owner.userId],{stdio:'inherit'})
  unlinkSync(runtimePath)
  return
 }catch(error){
  if(attempt===3)throw error
  await new Promise(resolve=>setTimeout(resolve,500*attempt))
 }
}
