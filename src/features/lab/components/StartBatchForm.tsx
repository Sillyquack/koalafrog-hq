import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InventoryUnit } from '../../../types/domain'
import { useFormulaData } from '../../formulas/state/FormulaDataContext'

export function StartBatchForm({ onClose }: { onClose: () => void }) {
  const data = useFormulaData(); const navigate = useNavigate()
  const [productId, setProductId] = useState<string | undefined>(data.products[0]?.id)
  const [formulaId, setFormulaId] = useState<string | undefined>(data.formulas.find((formula) => formula.productId === productId)?.id)
  const [error, setError] = useState('')
  const formulas = data.formulas.filter((formula) => formula.productId === productId)
  const effectiveFormula = formulas.some((formula) => formula.id === formulaId) ? formulaId : formulas[0]?.id
  const versions = data.formulaVersions.filter((version) => version.formulaId === effectiveFormula && version.status !== 'Retired')
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { const batch = data.createLabBatch({ productId: String(form.get('productId')), formulaId: String(form.get('formulaId')), formulaVersionId: String(form.get('formulaVersionId')), plannedBatchSize: Number(form.get('size')), plannedBatchUnit: String(form.get('unit')) as InventoryUnit, purpose: String(form.get('purpose')), notes: String(form.get('notes')) }); onClose(); navigate(`/lab/${batch.id}`) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create batch.') } }
  return <div className="modal-backdrop"><form className="workspace-modal" onSubmit={submit}><span className="eyebrow">Formula to execution snapshot</span><h2>Start Lab Batch</h2><div className="form-grid">
    <label>Product<select name="productId" value={productId} onChange={(event) => { setProductId(event.target.value); setFormulaId(data.formulas.find((formula) => formula.productId === event.target.value)?.id) }}>{data.products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
    <label>Formula<select name="formulaId" value={effectiveFormula} onChange={(event) => setFormulaId(event.target.value)}>{formulas.map((formula) => <option value={formula.id} key={formula.id}>{formula.name}</option>)}</select></label>
    <label>Formula version<select name="formulaVersionId">{versions.map((version) => <option value={version.id} key={version.id}>{version.version} — {version.status}</option>)}</select></label>
    <label>Planned size<input name="size" type="number" min="0.000001" step="any" required /></label><label>Unit<select name="unit" defaultValue="g"><option>mg</option><option>g</option><option>kg</option></select></label><label className="span-2">Purpose<input name="purpose" required /></label><label className="span-2">Notes<textarea name="notes" /></label>
  </div><p className="modal-intro">Creating the batch copies execution lines. It does not consume inventory.</p>{error && <p className="form-error">{error}</p>}<footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Create planned batch</button></footer></form></div>
}
