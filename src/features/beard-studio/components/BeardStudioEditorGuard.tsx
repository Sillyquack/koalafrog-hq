import{useUnsavedIngredientKnowledgeGuard}from'../../ingredients/useUnsavedIngredientKnowledgeGuard'

export function BeardStudioEditorGuard({dirty,onDiscard}:{dirty:boolean;onDiscard:()=>void}){
 const blocker=useUnsavedIngredientKnowledgeGuard(dirty)
 if(blocker.state!=='blocked')return null
 return <div className="modal-backdrop knowledge-leave-backdrop"><div className="workspace-modal knowledge-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="beard-leave-title"><span className="eyebrow">Unsaved Beard Studio work</span><h2 id="beard-leave-title">Leave without saving?</h2><p>Your current editor changes will be discarded. Canonical workspace records are unchanged until Save succeeds.</p><footer><button className="button ghost" onClick={()=>blocker.reset()}>Stay and continue editing</button><button className="button danger" onClick={()=>{onDiscard();blocker.proceed()}}>Discard changes and leave</button></footer></div></div>
}
