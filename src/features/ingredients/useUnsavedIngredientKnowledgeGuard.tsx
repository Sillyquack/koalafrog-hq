import{useEffect}from'react'
import{useBlocker}from'react-router-dom'

export function useUnsavedIngredientKnowledgeGuard(dirty:boolean){
 const blocker=useBlocker(({currentLocation,nextLocation})=>dirty&&currentLocation.pathname+currentLocation.search!==nextLocation.pathname+nextLocation.search)
 useEffect(()=>{
  if(!dirty)return
  const beforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',beforeUnload)
  return()=>window.removeEventListener('beforeunload',beforeUnload)
 },[dirty])
 return blocker
}
