import { useState } from 'react'
import { Calculator } from 'lucide-react'
import type { FormulaLine } from '../../../types/domain'
import { scaleFormula } from '../domain/formulaLogic'
import { useFormulaData } from '../state/FormulaDataContext'

export function BatchScaler({ lines }: { lines: FormulaLine[] }) {
  const { ingredients } = useFormulaData(); const [target, setTarget] = useState(500); const scaled = scaleFormula([...lines].sort((a,b) => a.sortOrder-b.sortOrder), Math.max(0, target))
  return <section className="panel batch-scaler"><div className="scaler-heading"><span><Calculator size={17} /></span><div><h2>Batch scaling calculator</h2><p>Planning only—no batch or stock movement will be created.</p></div><label>Target batch<div><input type="number" min="0" step="10" value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target batch size" /><span>g</span></div></label></div><div className="scaled-list">{scaled.map((line) => <div key={line.id}><span>{ingredients.find((item) => item.id === line.ingredientId)?.commonName}</span><small>{line.percentage}%</small><strong>{line.calculatedWeight} g</strong></div>)}</div><footer><span>Calculated target</span><strong>{target} g</strong></footer></section>
}
