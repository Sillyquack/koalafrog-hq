import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { routeScrollDecision } from './routeScrollDecision'

const positions=new Map<string,number>()
const currentTop=()=>document.scrollingElement?.scrollTop??window.scrollY
const scrollTop=(top:number)=>window.scrollTo({top,left:0,behavior:'auto'})

export function RouteScrollRestoration(){
 const location=useLocation(),navigationType=useNavigationType()
 useLayoutEffect(()=>{if('scrollRestoration'in window.history)window.history.scrollRestoration='manual'},[])
 useLayoutEffect(()=>{
  const decision=routeScrollDecision({navigationType,hash:location.hash,savedTop:positions.get(location.key)})
  let frame:number|undefined
  if(decision.kind==='restore')scrollTop(decision.top)
  else if(decision.kind==='top')scrollTop(0)
  else{
   scrollTop(0)
   const rawId=decision.hash.slice(1)
   let id=rawId
   try{id=decodeURIComponent(rawId)}catch{id=rawId}
   const scrollToTarget=()=>{const target=document.getElementById(id);if(target)target.scrollIntoView({behavior:'auto',block:'start'});return!!target}
   if(!scrollToTarget())frame=window.requestAnimationFrame(scrollToTarget)
  }
  return()=>{positions.set(location.key,currentTop());if(frame!=null)window.cancelAnimationFrame(frame)}
 },[location.key,location.pathname,location.search,location.hash,navigationType])
 return null
}
