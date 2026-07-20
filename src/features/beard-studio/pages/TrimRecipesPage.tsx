import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Save } from 'lucide-react'
import { BeardStudioEmptyState } from '../components/BeardStudioEmptyState'
import { GroomingProductSelector } from '../components/GroomingProductSelector'
import { useBeardStudio } from '../data/beardStudioRepository'
import { activateRecipe, createStarterWorkspace, deriveRecipeDraft, type TrimRecipe } from '../domain/beardStudio'
import { beardStudioNow } from '../utils/beardStudioFormat'

export function TrimRecipesPage() {
  const {state,update}=useBeardStudio()
  const profile=state.profiles.find(item=>item.status==='Active')
  const [editing,setEditing]=useState<TrimRecipe|null>(null)
  if(!profile)return <BeardStudioEmptyState/>
  const save=()=>{
    if(!editing?.name.trim()||!editing.steps.length)return
    void update(current=>({...current,recipes:[...current.recipes.filter(item=>item.id!==editing.id),{...editing,updatedAt:beardStudioNow()}]}))
    setEditing(null)
  }
  const recipes=state.recipes.filter(item=>item.profileId===profile.id).sort((a,b)=>b.version-a.version)
  return (
    <div className="studio-stack">
      <section className="section-heading"><div><h2>Trim Recipes</h2><p>Ordered, reusable procedures. Derive a new Draft to change an established version.</p></div>{recipes[0]&&<button className="button primary" onClick={()=>setEditing(deriveRecipeDraft(recipes[0]))}><Plus size={16}/>New version</button>}</section>
      {editing&&<section className="panel recipe-editor">
        <label>Recipe name<input value={editing.name} onChange={event=>setEditing({...editing,name:event.target.value})}/></label>
        <p className="template-note">Version {editing.version} · Editable starting procedure, not authoritative professional advice.</p>
        <GroomingProductSelector legend="Preferred Koalafrog Products" value={editing.preferredProducts} onChange={preferredProducts=>setEditing({...editing,preferredProducts})}/>
        <div className="recipe-steps">{editing.steps.sort((a,b)=>a.order-b.order).map((step,index)=><article key={step.id}><span>{index+1}</span><div>
          <label>Step title<input value={step.title} onChange={event=>setEditing({...editing,steps:editing.steps.map(item=>item.id===step.id?{...item,title:event.target.value}:item)})}/></label>
          <label>Instruction<textarea value={step.instruction} onChange={event=>setEditing({...editing,steps:editing.steps.map(item=>item.id===step.id?{...item,instruction:event.target.value}:item)})}/></label>
          <div className="split-fields">
            <label>Target length<div className="input-unit"><input type="number" step=".1" value={step.targetLengthMm??''} onChange={event=>setEditing({...editing,steps:editing.steps.map(item=>item.id===step.id?{...item,targetLengthMm:event.target.value===''?null:Number(event.target.value)}:item)})}/><span>mm</span></div></label>
            <label>Technique<select value={step.technique} onChange={event=>setEditing({...editing,steps:editing.steps.map(item=>item.id===step.id?{...item,technique:event.target.value as typeof step.technique}:item)})}>{['full pass','light pass','flick-out','blend','define line','detail','freehand','scissors'].map(value=><option key={value}>{value}</option>)}</select></label>
          </div>
        </div></article>)}</div>
        <div className="form-actions"><button className="button ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="button primary" onClick={save}><Save size={15}/>Save Draft</button></div>
      </section>}
      <div className="record-grid">{recipes.map(recipe=><article className="panel record-card" key={recipe.id}><span className={`status-badge ${recipe.status.toLowerCase()}`}>{recipe.status}</span><h3>{recipe.name}</h3><p>Version {recipe.version} · {recipe.steps.length} ordered steps · about {recipe.estimatedDurationMinutes} min</p><small>{recipe.notes}</small>{recipe.preferredProducts.length>0&&<small>{recipe.preferredProducts.map(product=>`${product.nameSnapshot} · ${product.role}`).join(' | ')}</small>}<div className="card-actions">{recipe.status==='Draft'&&<button className="button small" onClick={()=>setEditing(structuredClone(recipe))}>Edit</button>}{recipe.status!=='Active'&&recipe.status!=='Archived'&&<button className="button small primary" onClick={()=>update(current=>activateRecipe(current,recipe.id))}>Activate</button>}<Link className="button small" to="/grooming/beard-studio/trim">Open Trim Mode</Link></div></article>)}</div>
      {!recipes.length&&<section className="panel empty-state"><h3>No Trim Recipes</h3><p>The editable starter setup can create a complete first procedure.</p><button className="button primary" onClick={()=>update(()=>createStarterWorkspace())}>Create starter setup</button></section>}
    </div>
  )
}
