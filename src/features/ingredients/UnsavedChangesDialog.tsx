import{useEffect,useRef}from'react'

export function UnsavedChangesDialog({open,onStay,onDiscard}:{open:boolean;onStay:()=>void;onDiscard:()=>void}){
 const dialog=useRef<HTMLDivElement>(null),stay=useRef<HTMLButtonElement>(null),returnFocus=useRef<HTMLElement|null>(null)
 useEffect(()=>{
  if(!open)return
  returnFocus.current=document.activeElement as HTMLElement|null
  stay.current?.focus()
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();onStay();return}
   if(event.key!=='Tab'||!dialog.current)return
   const controls=[...dialog.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(item=>!item.hasAttribute('disabled'))
   if(!controls.length)return
   const first=controls[0],last=controls.at(-1)!
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  document.addEventListener('keydown',keydown)
  return()=>{document.removeEventListener('keydown',keydown);returnFocus.current?.focus()}
 },[open,onStay])
 if(!open)return null
 return <div className="modal-backdrop knowledge-leave-backdrop"><div ref={dialog} className="workspace-modal knowledge-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-leave-title" aria-describedby="knowledge-leave-description">
  <span className="eyebrow">Unsaved Ingredient Knowledge</span><h2 id="knowledge-leave-title">Leave without saving?</h2>
  <p id="knowledge-leave-description">Your unsaved profile and child-record changes will be discarded. Nothing will be saved automatically. Press Escape to stay.</p>
  <footer><button ref={stay} type="button" className="button ghost" onClick={onStay}>Stay and continue editing</button><button type="button" className="button danger" onClick={onDiscard}>Discard changes and leave</button></footer>
 </div></div>
}
