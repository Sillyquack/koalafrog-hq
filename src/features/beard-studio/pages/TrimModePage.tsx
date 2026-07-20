import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, Pause, Play, SkipForward } from 'lucide-react'
import { useBeardStudio } from '../data/beardStudioRepository'
import { progressTrimSession, startTrim } from '../domain/beardStudio'

export function TrimModePage() {
  const {state,update}=useBeardStudio()
  const navigate=useNavigate()
  const activeRecipe=state.recipes.find(item=>item.status==='Active'&&state.profiles.some(profile=>profile.id===item.profileId&&profile.status==='Active'))
  const session=[...state.sessions].reverse().find(item=>item.recipeId===activeRecipe?.id&&['in_progress','paused'].includes(item.status))
  const completedSession=[...state.sessions].reverse().find(item=>item.recipeId===activeRecipe?.id&&item.status==='completed'&&!state.logs.some(log=>log.sessionId===item.id))
  const recipe=session?state.recipes.find(item=>item.id===session.recipeId):activeRecipe
  if(!recipe)return <section className="panel empty-state trim-empty"><h2>No Active Trim Recipe</h2><p>Activate a recipe before starting Trim Mode.</p><Link className="button primary" to="/grooming/beard-studio/recipes">Choose recipe</Link></section>
  if(!session&&completedSession)return <section className="panel trim-start"><Check size={42}/><h2>Trim complete</h2><p>Your procedure is finished. Record ratings and notes while the result is fresh.</p><button className="button primary touch-button" onClick={()=>navigate('/grooming/beard-studio/log')}>Create Beard Log entry</button></section>
  if(!session)return <section className="panel trim-start"><span className="eyebrow">Focused workflow</span><h2>{recipe.name}</h2><p>{recipe.steps.length} steps · about {recipe.estimatedDurationMinutes} minutes</p><p>{recipe.preparationInstructions}</p><button className="button primary touch-button" onClick={()=>update(current=>startTrim(current,recipe.id))}><Play/>Start Trim</button></section>
  const step=recipe.steps[session.currentStepIndex]
  const tool=state.tools.find(item=>item.id===step?.toolId)
  const attachment=tool?.attachments.find(item=>item.id===step?.attachmentId)
  const act=(action:Parameters<typeof progressTrimSession>[2])=>{
    if(action==='exit'&&!window.confirm('Exit Trim Mode? This session will be recorded as abandoned.'))return
    void update(current=>({...current,sessions:current.sessions.map(item=>item.id===session.id?progressTrimSession(item,recipe,action):item)}))
  }
  if(session.status==='paused')return <section className="panel trim-start"><Pause size={38}/><h2>Trim paused</h2><p>Step {session.currentStepIndex+1} of {recipe.steps.length} is saved.</p><button className="button primary touch-button" onClick={()=>act('resume')}><Play/>Resume Trim</button><button className="button ghost touch-button" onClick={()=>act('exit')}>Exit session</button></section>
  return (
    <div className="trim-mode">
      <header><div><span>Step {session.currentStepIndex+1} of {recipe.steps.length}</span><strong>{Math.round((session.currentStepIndex/recipe.steps.length)*100)}% complete</strong></div><progress value={session.currentStepIndex} max={recipe.steps.length}/></header>
      <article className="trim-step panel">
        <span className="step-number">{session.currentStepIndex+1}</span><h2>{step.title}</h2>
        <dl><div><dt>Zone</dt><dd>{step.zones.join(', ')||'Whole-beard preparation'}</dd></div><div><dt>Target</dt><dd>{step.targetLengthMm===null?'Not applicable':`${step.targetLengthMm} mm`}</dd></div><div><dt>Tool</dt><dd>{tool?.name??'Hands / visual inspection'}</dd></div><div><dt>Attachment</dt><dd>{attachment?.name??'None'}</dd></div><div><dt>Direction</dt><dd>{step.trimDirection??'Not applicable'}</dd></div><div><dt>Technique</dt><dd>{step.technique}</dd></div></dl>
        <section><h3>Instruction</h3><p>{step.instruction}</p></section>
        {recipe.preferredProducts.length>0&&step.order===recipe.steps.length&&<section className="trim-products"><h3>Preferred products</h3>{recipe.preferredProducts.map(product=><p key={`${product.productId}-${product.role}`}><strong>{product.nameSnapshot}</strong> · {product.role}</p>)}</section>}
        {step.caution&&<aside role="note"><strong>Caution</strong><p>{step.caution}</p></aside>}
      </article>
      <div className="trim-controls"><button className="button touch-button" disabled={session.currentStepIndex===0} onClick={()=>act('previous')}><ChevronLeft/>Previous</button><button className="button primary touch-button" onClick={()=>act('next')}><Check/>{session.currentStepIndex===recipe.steps.length-1?'Complete Trim':'Complete / Next'}</button><button className="button touch-button" onClick={()=>act('skip')}><SkipForward/>Skip</button><button className="button touch-button" onClick={()=>act('pause')}><Pause/>Pause</button><button className="button ghost touch-button" onClick={()=>act('exit')}>Exit</button></div>
    </div>
  )
}
