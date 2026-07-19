import{execFileSync}from'node:child_process'
import{existsSync,readFileSync,unlinkSync}from'node:fs'
import{runtimePath}from'./globalSetup'

export default function globalTeardown(){
 if(!existsSync(runtimePath))return
 const owner=JSON.parse(readFileSync(runtimePath,'utf8'))as{userId:string}
 execFileSync('node',['scripts/browser-test-owner.mjs','delete',owner.userId],{stdio:'inherit'})
 unlinkSync(runtimePath)
}
