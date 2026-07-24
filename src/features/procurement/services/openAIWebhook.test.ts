import{describe,expect,it}from'vitest'
import{parseOpenAIResponseEvent,verifyOpenAIWebhook}from'../../../../supabase/functions/_shared/openAIWebhook'

const encoder=new TextEncoder()
async function signature(body:string,id:string,timestamp:string,secret:string){
 const decoded=atob(secret.slice(6)),buffer=new ArrayBuffer(decoded.length),bytes=new Uint8Array(buffer)
 for(let index=0;index<decoded.length;index++)bytes[index]=decoded.charCodeAt(index)
 const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const value=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${id}.${timestamp}.${body}`)))
 return btoa(String.fromCharCode(...value))
}

describe('OpenAI webhook boundary',()=>{
 it('verifies a current Standard Webhooks signature and rejects tampering',async()=>{
  const secret=`whsec_${btoa('test-secret-value')}`,body='{"type":"response.completed"}',timestamp='1000',id='wh_test'
  const headers=new Headers({'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':`v1,${await signature(body,id,timestamp,secret)}`})
  await expect(verifyOpenAIWebhook(body,headers,secret,1000)).resolves.toBe(true)
  await expect(verifyOpenAIWebhook(`${body} `,headers,secret,1000)).resolves.toBe(false)
  await expect(verifyOpenAIWebhook(body,headers,secret,1401)).resolves.toBe(false)
 })

 it('accepts only supported response events with safe opaque ids',()=>{
  expect(parseOpenAIResponseEvent({id:'evt_123',type:'response.completed',data:{id:'resp_456'}})).toEqual({id:'evt_123',type:'response.completed',responseId:'resp_456'})
  expect(parseOpenAIResponseEvent({id:'evt_123',type:'other',data:{id:'resp_456'}})).toBeNull()
  expect(parseOpenAIResponseEvent({id:'evt_123',type:'response.completed',data:{id:'../unsafe'}})).toBeNull()
 })
})
