const encoder=new TextEncoder()
const safeEqual=(left:Uint8Array,right:Uint8Array)=>{
 if(left.length!==right.length)return false
 let difference=0
 for(let index=0;index<left.length;index++)difference|=left[index]^right[index]
 return difference===0
}
const decodeBase64=(value:string):Uint8Array<ArrayBuffer>=>{
 const decoded=atob(value),buffer=new ArrayBuffer(decoded.length),bytes=new Uint8Array(buffer)
 for(let index=0;index<decoded.length;index++)bytes[index]=decoded.charCodeAt(index)
 return bytes
}

export async function verifyOpenAIWebhook(
 body:string,
 headers:Headers,
 secret:string,
 nowSeconds=Math.floor(Date.now()/1000),
){
 const id=headers.get('webhook-id')?.trim()
 const timestamp=headers.get('webhook-timestamp')?.trim()
 const signatures=headers.get('webhook-signature')?.split(/\s+/)??[]
 const numericTimestamp=Number(timestamp)
 if(!id||!timestamp||!Number.isInteger(numericTimestamp)||Math.abs(nowSeconds-numericTimestamp)>300)return false
 const keyMaterial=secret.startsWith('whsec_')?secret.slice(6):secret
 let keyBytes:Uint8Array<ArrayBuffer>
 try{keyBytes=decodeBase64(keyMaterial)}catch{return false}
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const expected=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${id}.${timestamp}.${body}`)))
 return signatures.some(signature=>{
  const encoded=signature.startsWith('v1,')?signature.slice(3):''
  try{return safeEqual(expected,decodeBase64(encoded))}catch{return false}
 })
}

export function parseOpenAIResponseEvent(value:unknown){
 if(!value||typeof value!=='object')return null
 const event=value as Record<string,unknown>,data=event.data
 if(typeof event.id!=='string'||!/^evt_[A-Za-z0-9_-]+$/.test(event.id)
  ||!['response.completed','response.failed','response.incomplete','response.cancelled'].includes(String(event.type))
  ||!data||typeof data!=='object')return null
 const responseId=(data as Record<string,unknown>).id
 if(typeof responseId!=='string'||!/^resp_[A-Za-z0-9_-]+$/.test(responseId))return null
 return{id:event.id,type:String(event.type),responseId}
}
