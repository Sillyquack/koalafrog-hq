import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useBeardStudio } from '../data/beardStudioRepository'
import type { GroomingTool } from '../domain/beardStudio'
import { beardStudioId, beardStudioNow } from '../utils/beardStudioFormat'

const blankTool = (): GroomingTool => ({ id: beardStudioId(), name: '', brand: '', model: '', type: 'beard trimmer', minimumLengthMm: 0, maximumLengthMm: 20, adjustmentIncrementMm: .5, attachments: [], washable: false, notes: '', primary: false, status: 'active', createdAt: beardStudioNow(), updatedAt: beardStudioNow() })

export function GroomingToolsPage() {
  const { state, update } = useBeardStudio()
  const [editing,setEditing]=useState<GroomingTool|null>(null)
  const [attachmentNames,setAttachmentNames]=useState('')
  const save=(event:FormEvent)=>{
    event.preventDefault()
    if(!editing?.name.trim())return
    const tool:GroomingTool={...editing,attachments:attachmentNames.split(',').map(value=>value.trim()).filter(Boolean).map((name,index)=>({id:editing.attachments[index]?.id??beardStudioId(),name})),updatedAt:beardStudioNow()}
    void update(current=>({...current,tools:[...current.tools.filter(item=>item.id!==tool.id).map(item=>tool.primary&&item.type===tool.type?{...item,primary:false}:item),tool]}))
    setEditing(null)
  }
  const edit=(tool:GroomingTool)=>{setEditing(structuredClone(tool));setAttachmentNames(tool.attachments.map(item=>item.name).join(', '))}
  return (
    <div className="studio-stack">
      <section className="section-heading"><div><h2>Tools and trimmer profiles</h2><p>Recorded capabilities drive Length Map warnings; they are not inferred.</p></div><button className="button primary" onClick={()=>{setEditing(blankTool());setAttachmentNames('')}}><Plus size={16}/>Add Tool</button></section>
      {editing&&<form className="panel studio-form" onSubmit={save}><div className="form-grid">
        <label>Tool name<input required value={editing.name} onChange={event=>setEditing({...editing,name:event.target.value})}/></label>
        <label>Brand<input value={editing.brand} onChange={event=>setEditing({...editing,brand:event.target.value})}/></label>
        <label>Model<input value={editing.model} onChange={event=>setEditing({...editing,model:event.target.value})}/></label>
        <label>Type<select value={editing.type} onChange={event=>setEditing({...editing,type:event.target.value as GroomingTool['type']})}>{['beard trimmer','detail trimmer','foil shaver','razor','scissors','comb','brush','other'].map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Minimum supported<div className="input-unit"><input type="number" min="0" step=".1" value={editing.minimumLengthMm??''} onChange={event=>setEditing({...editing,minimumLengthMm:event.target.value===''?null:Number(event.target.value)})}/><span>mm</span></div></label>
        <label>Maximum supported<div className="input-unit"><input type="number" min="0" step=".1" value={editing.maximumLengthMm??''} onChange={event=>setEditing({...editing,maximumLengthMm:event.target.value===''?null:Number(event.target.value)})}/><span>mm</span></div></label>
        <label>Adjustment increment<div className="input-unit"><input type="number" min="0" step=".1" value={editing.adjustmentIncrementMm??''} onChange={event=>setEditing({...editing,adjustmentIncrementMm:event.target.value===''?null:Number(event.target.value)})}/><span>mm</span></div></label>
        <label className="wide">Attachments, comma separated<input value={attachmentNames} onChange={event=>setAttachmentNames(event.target.value)}/></label>
        <label className="check-label"><input type="checkbox" checked={editing.primary} onChange={event=>setEditing({...editing,primary:event.target.checked})}/>Primary {editing.type}</label>
        <label className="check-label"><input type="checkbox" checked={editing.washable} onChange={event=>setEditing({...editing,washable:event.target.checked})}/>Washable (recorded)</label>
        <label className="wide">Notes<textarea value={editing.notes} onChange={event=>setEditing({...editing,notes:event.target.value})}/></label>
      </div><div className="form-actions"><button type="button" className="button ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="button primary">Save tool</button></div></form>}
      <div className="record-grid">{state.tools.map(tool=><article className="panel record-card" key={tool.id}>{tool.primary&&<span className="status-badge active">Primary</span>}<h3>{tool.name}</h3><p>{tool.brand} {tool.model}</p><small>{tool.minimumLengthMm??'Unknown'}–{tool.maximumLengthMm??'Unknown'} mm · {tool.type}</small><ul>{tool.attachments.map(item=><li key={item.id}>{item.name}</li>)}</ul><div className="card-actions"><button className="button small" onClick={()=>edit(tool)}>Edit</button><button className="button small" onClick={()=>update(current=>({...current,tools:current.tools.map(item=>item.id===tool.id?{...item,status:item.status==='active'?'retired':'active',primary:false}:item)}))}>{tool.status==='active'?'Retire':'Restore'}</button></div></article>)}</div>
      {!state.tools.length&&<section className="panel empty-state"><h3>No grooming tools</h3><p>Add a tool to validate zone lengths and make Trim Mode specific.</p></section>}
    </div>
  )
}
