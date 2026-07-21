import{useEffect,useRef,useState}from'react'
import type{AuthChangeEvent,Session}from'@supabase/supabase-js'
import{isSupabaseConfigured,supabase}from'../supabase/client'
import{authViewAfterEvent,completePasswordRecovery,initialAuthView,recoveryLinkError,submitPasswordRecovery,validateRecoveredPassword}from'./passwordRecovery'
import type{AuthView}from'./passwordRecovery'

export function SecureLogoutButton(){const client=supabase;if(!client)return null;return <button className="account-logout" onClick={()=>client.auth.signOut()}>Secure logout</button>}

export function AuthGate({children}:{children:React.ReactNode}){
 const linkError=recoveryLinkError(window.location.search)
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(isSupabaseConfigured),[view,setView]=useState<AuthView>(initialAuthView(window.location.pathname)),[error,setError]=useState(linkError),[notice,setNotice]=useState(''),[requesting,setRequesting]=useState(false)
 const recoveryRequestInFlight=useRef(false)
 useEffect(()=>{
  if(!supabase)return
  supabase.auth.getSession().then(({data,error:sessionError})=>{setSession(data.session);if(sessionError)setError('The authentication session could not be checked. Please return to owner login and try again.');setLoading(false)})
  const{data}=supabase.auth.onAuthStateChange((event:AuthChangeEvent,next)=>{setSession(next);setView(current=>authViewAfterEvent(event,current));if(event==='PASSWORD_RECOVERY')setError('');setLoading(false)})
  return()=>data.subscription.unsubscribe()
 },[])
 if(!isSupabaseConfigured)return <>{children}</>
 if(loading)return <main className="auth-screen"><div><span className="eyebrow">Secure owner workspace</span><h1>Checking session…</h1></div></main>
 if(view==='recovery'){
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=new FormData(e.currentTarget),password=String(form.get('password')),confirmation=String(form.get('confirmation')),validation=validateRecoveredPassword(password,confirmation);setError(validation);setNotice('');if(validation)return;if(!session){setError('This password recovery link is invalid or has expired. Return to owner login and request a fresh email.');return}const result=await completePasswordRecovery(supabase!,password);if(result.error){setError(result.error.message);return}window.history.replaceState({},'', '/');setSession(null);setView('login');setNotice('Password updated. Sign in with your new password.')}
  return <main className="auth-screen"><form onSubmit={submit}><span className="eyebrow">Owner account recovery</span><h1>Choose a new password</h1><p>Enter a new password for the Koalafrog owner account.</p><label>New password<input name="password" type="password" minLength={12} autoComplete="new-password" required/></label><label>Confirm new password<input name="confirmation" type="password" minLength={12} autoComplete="new-password" required/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary">Update password</button><button className="button ghost" type="button" onClick={()=>{window.history.replaceState({},'', '/');setView('login');setError('')}}>Return to owner login</button></form></main>
 }
 if(!session){
  if(view==='request'){
   const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const email=String(new FormData(e.currentTarget).get('email'));await submitPasswordRecovery(supabase!,email,window.location.origin,recoveryRequestInFlight,state=>{setRequesting(state.pending);setError(state.error);setNotice(state.notice)})}
   return <main className="auth-screen"><form onSubmit={submit}><span className="eyebrow">Owner account recovery</span><h1>Reset password</h1><p>Request a private recovery email for the existing owner account.</p><label>Email<input name="email" type="email" autoComplete="email" disabled={requesting} required/></label>{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-success" role="status" aria-live="polite">{notice}</p>}<button className="button primary" disabled={requesting} aria-busy={requesting}>{requesting?'Requesting…':'Send reset email'}</button><button className="button ghost" type="button" disabled={requesting} onClick={()=>{setView('login');setError('');setNotice('')}}>Return to owner login</button></form></main>
  }
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=new FormData(e.currentTarget),email=String(form.get('email')),password=String(form.get('password'));setError('');setNotice('');const result=await supabase!.auth.signInWithPassword({email,password});if(result.error)setError(result.error.message)}
  return <main className="auth-screen"><form onSubmit={submit}><span className="eyebrow">Private owner access</span><h1>Koalafrog HQ</h1><p>Sign in with the owner account created in Supabase Auth. Public registration is disabled.</p><label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label>{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-success" role="status">{notice}</p>}<button className="button primary">Sign in</button><button className="button ghost" type="button" onClick={()=>{setView('request');setError('');setNotice('')}}>Forgot password?</button></form></main>
 }
 return <>{children}</>
}
