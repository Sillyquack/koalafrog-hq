import { useState } from 'react'
import { Calculator } from 'lucide-react'
import type { FormulaLine } from '../../../types/domain'
import { batchPlanningTarget, scaleFormula } from '../domain/formulaLogic'
import { useFormulaData } from '../state/FormulaDataContext'

export function BatchScaler({ lines }: { lines: FormulaLine[] }) {
  const { ingredients } = useFormulaData(); const [target, setTarget] = useState(500),[fill,setFill]=useState(0),[containers,setContainers]=useState(0),[overage,setOverage]=useState(0)
  const plan=batchPlanningTarget(target,fill,containers,overage),scaled = scaleFormula([...lines].sort((a,b) => a.sortOrder-b.sortOrder), plan.targetGrams)
  return <section className="panel batch-scaler"><div className="scaler-heading"><span><Calculator size={17} /></span><div><h2>Batch planning calculator</h2><p>Planning only—no Lab Batch, reservation, procurement, or inventory movement is created.</p></div><label>Direct target mass<div><input type="number" min="0" step="10" value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target batch size" /><span>g</span></div></label></div><div className="fill-planning"><label>Target fill mass (g)<input type="number" min="0" step="any" value={fill||''} onChange={e=>setFill(Number(e.target.value))}/></label><label>Containers<input type="number" min="0" step="1" value={containers||''} onChange={e=>setContainers(Number(e.target.value))}/></label><label>Process loss / overage (%)<input type="number" min="0" step=".1" value={overage||''} onChange={e=>setOverage(Number(e.target.value))}/></label><p>Optional. Enter mass per fill explicitly; no density or volume conversion is inferred.</p></div><div className="scaled-list">{scaled.map((line) => <div key={line.id}><span>{ingredients.find((item) => item.id === line.ingredientId)?.commonName}</span><small>{line.percentage}%</small><strong>{line.calculatedWeight} g</strong></div>)}</div><footer><span>Target total batch mass</span><strong>{plan.targetGrams} g</strong><span>Estimated fills</span><strong>{plan.estimatedFills??'Unknown'}</strong></footer></section>
}
