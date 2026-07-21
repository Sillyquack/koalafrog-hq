export const PASSWORD_RECOVERY_PATH='/auth/recovery'
export type AuthView='login'|'request'|'recovery'

type RecoveryAuth={
 resetPasswordForEmail(email:string,options:{redirectTo:string}):Promise<{error:{message:string}|null}>
 updateUser(attributes:{password:string}):Promise<{error:{message:string}|null}>
 signOut():Promise<{error:{message:string}|null}>
}
type RecoveryClient={auth:RecoveryAuth}
export type PasswordRecoveryRequestState={pending:boolean;error:string;notice:string}
type InFlightGuard={current:boolean}

export function passwordRecoveryRedirectUrl(origin:string){
 return new URL(PASSWORD_RECOVERY_PATH,origin).toString()
}

export function initialAuthView(pathname:string):AuthView{return pathname===PASSWORD_RECOVERY_PATH?'recovery':'login'}
export function authViewAfterEvent(event:string,current:AuthView):AuthView{return event==='PASSWORD_RECOVERY'?'recovery':current}

export function recoveryLinkError(search:string){
 const params=new URLSearchParams(search),code=params.get('error_code')
 if(!code)return ''
 return code==='otp_expired'
  ? 'This password recovery link is invalid or has expired. Return to owner login and request a fresh email.'
  : 'This password recovery link could not be used. Return to owner login and request a fresh email.'
}

export function validateRecoveredPassword(password:string,confirmation:string){
 if(password.length<12)return 'Use at least 12 characters for the new password.'
 if(password!==confirmation)return 'Password confirmation does not match.'
 return ''
}

export async function requestPasswordRecovery(client:RecoveryClient,email:string,origin:string){
 return client.auth.resetPasswordForEmail(email,{redirectTo:passwordRecoveryRedirectUrl(origin)})
}

export async function submitPasswordRecovery(client:RecoveryClient,email:string,origin:string,guard:InFlightGuard,setState:(state:PasswordRecoveryRequestState)=>void){
 if(guard.current)return false
 guard.current=true
 setState({pending:true,error:'',notice:''})
 try{
  const result=await requestPasswordRecovery(client,email,origin)
  if(result.error)setState({pending:false,error:result.error.message,notice:''})
  else setState({pending:false,error:'',notice:'Password reset email requested. Use the newest email; earlier recovery links may expire.'})
 }catch{
  setState({pending:false,error:'Password reset could not be requested. Check the network connection and try again.',notice:''})
 }finally{
  guard.current=false
 }
 return true
}

export async function completePasswordRecovery(client:RecoveryClient,password:string){
 const updated=await client.auth.updateUser({password})
 if(updated.error)return updated
 const signedOut=await client.auth.signOut()
 return signedOut.error? signedOut:{error:null}
}
