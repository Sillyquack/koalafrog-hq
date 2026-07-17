import { useState } from 'react'
import type { InventoryUnit } from '../../../types/domain'
import { useFormulaData } from '../../formulas/state/FormulaDataContext'

export function ReceiveStockForm({ ingredientId, onClose }: { ingredientId?: string; onClose: () => void }) {
  const data = useFormulaData()
  const [selected, setSelected] = useState(ingredientId ?? data.ingredients[0]?.id)
  const [error, setError] = useState('')
  const suppliers = data.supplierProducts.filter((product) => product.ingredientId === selected)
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      data.receiveStock({ ingredientId: String(form.get('ingredientId')), supplierProductId: String(form.get('supplierProductId')) || undefined, supplierLotNumber: String(form.get('supplierLotNumber')) || undefined, receivedDate: String(form.get('receivedDate')), openingQuantity: Number(form.get('quantity')), unit: String(form.get('unit')) as InventoryUnit, expiryDate: String(form.get('expiryDate')) || undefined, bestBeforeDate: String(form.get('bestBeforeDate')) || undefined, location: String(form.get('location')), notes: String(form.get('notes')), totalAcquisitionCost:Number(form.get('totalAcquisitionCost'))||undefined,acquisitionCostCurrency:Number(form.get('totalAcquisitionCost'))?'NOK':undefined,costNotes:String(form.get('costNotes'))||undefined })
      onClose()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not receive stock.') }
  }
  return <div className="modal-backdrop"><form className="workspace-modal" onSubmit={submit}>
    <span className="eyebrow">Physical inventory</span><h2>Receive stock</h2><p className="modal-intro">Create a physical lot and its authoritative Receipt movement. Stored decimal precision does not prove that the available scale can physically measure the quantity.</p>
    <div className="form-grid">
      <label>Ingredient<select name="ingredientId" value={selected} onChange={(event) => setSelected(event.target.value)}>{data.ingredients.filter((item) => item.status !== 'Archived').map((item) => <option value={item.id} key={item.id}>{item.commonName}</option>)}</select></label>
      <label>Supplier product<select name="supplierProductId"><option value="">Not recorded</option>{suppliers.map((product) => <option value={product.id} key={product.id}>{product.supplierName} — {product.productName}</option>)}</select></label>
      <label>Opening quantity<input name="quantity" type="number" min="0.000001" step="any" required /></label>
      <label>Unit<select name="unit" defaultValue={data.ingredients.find((item) => item.id === selected)?.defaultUnit}>{['mg','g','kg','ml','L','pcs'].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
      <label>Supplier lot<input name="supplierLotNumber" /></label><label>Received date<input name="receivedDate" type="date" defaultValue="2026-07-14" required /></label>
      <label>Total acquisition cost<input name="totalAcquisitionCost" type="number" min="0" step=".01"/><small>Workspace base currency: NOK</small></label><label>Cost notes<input name="costNotes" placeholder="Receipt or transaction context"/></label>
      <label>Expiry date<input name="expiryDate" type="date" /></label><label>Best before<input name="bestBeforeDate" type="date" /></label>
      <label className="span-2">Storage location<input name="location" defaultValue="Raw Materials / Shelf A" required /></label><label className="span-2">Notes<textarea name="notes" /></label>
    </div>{error && <p className="form-error">{error}</p>}<footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Receive physical stock</button></footer>
  </form></div>
}
