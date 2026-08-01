import {useMemo,useRef,useState,type FormEvent} from 'react'
import type {ProcurementDocumentState,Supplier,SupplierOfferCreateInput,SupplierProductSource} from '../domain/procurement'
import {availableOfferSources,buildSupplierOfferInput,initialSupplierOfferFormValues,supplierOfferDocumentStates,supplierProductSourceKey,supplierProductSourceSummary,type OfferFormValues} from './supplierOfferFormState'

const label=(value:string)=>value.replaceAll('_',' ')

export function SupplierOfferForm({requestedItemId,suppliers,sources,onSubmit,onCancel}:{requestedItemId:string;suppliers:Supplier[];sources:SupplierProductSource[];onSubmit:(input:SupplierOfferCreateInput)=>Promise<void>;onCancel:()=>void}){
 const[values,setValues]=useState<OfferFormValues>(initialSupplierOfferFormValues),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const submissionLock=useRef(false)
 const sourceOptions=useMemo(()=>availableOfferSources(sources,values.supplierId),[sources,values.supplierId])
 const selectedSource=values.sourceKey?sourceOptions.find(source=>supplierProductSourceKey(source)===values.sourceKey):undefined
 const selectedSupplier=suppliers.find(supplier=>supplier.id===values.supplierId)
 const setValue=<K extends keyof OfferFormValues>(key:K,value:OfferFormValues[K])=>setValues(current=>({...current,[key]:value}))
 const chooseSupplier=(supplierId:string)=>setValues(current=>{
  const currentSource=current.sourceKey?sources.find(source=>supplierProductSourceKey(source)===current.sourceKey):undefined
  return{...current,supplierId,sourceKey:currentSource?.supplier_id===supplierId?current.sourceKey:''}
 })
 const chooseSource=(key:string)=>{
  setError('')
  if(!key){setValue('sourceKey','');return}
  const source=sourceOptions.find(candidate=>supplierProductSourceKey(candidate)===key)
  if(!source){setError('The selected Supplier Product is no longer available for this Supplier.');return}
  setValues(current=>({...current,
   sourceKey:key,
   productTitle:source.product_name,
   productUrl:source.product_url??current.productUrl,
   countryCode:source.country_code??current.countryCode,
   packageQuantity:source.package_quantity==null?current.packageQuantity:String(source.package_quantity),
   packageUnit:source.package_unit??current.packageUnit,
   itemPrice:source.price==null?current.itemPrice:String(source.price),
   currency:source.currency??current.currency,
  }))
 }
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault()
  if(submissionLock.current)return
  submissionLock.current=true
  setError('')
  try{
   const input=buildSupplierOfferInput(requestedItemId,values,selectedSource)
   setBusy(true)
   await onSubmit(input)
  }catch(cause){setError(cause instanceof Error?cause.message:'Offer persistence could not be confirmed. Review the entered values and retry.')}finally{submissionLock.current=false;setBusy(false)}
 }
 const sourceUnavailable=Boolean(values.sourceKey&&!selectedSource)
 return <form className="panel procurement-detail-form offer-entry" aria-busy={busy} onSubmit={submit}>
  <header><div><span className="eyebrow">Dated commercial evidence</span><h3>Supplier offer</h3><p>The canonical Supplier Product identifies the source. These editable fields remain the researched Offer snapshot.</p></div></header>
  <fieldset disabled={busy}><legend className="visually-hidden">Supplier Offer details</legend>
   <label>Supplier<select name="supplier_id" required value={values.supplierId} onChange={event=>chooseSupplier(event.target.value)}><option value="">Select supplier</option>{suppliers.filter(supplier=>!supplier.archived_at).map(supplier=><option key={supplier.id} value={supplier.id}>{supplier.trading_name||supplier.legal_name}</option>)}</select></label>
   <label>Supplier Product source, optional<select name="supplier_product_source" value={values.sourceKey} onChange={event=>chooseSource(event.target.value)} disabled={!values.supplierId}><option value="">Manual Offer — no canonical source</option>{sourceUnavailable?<option value={values.sourceKey}>Previously selected source unavailable</option>:null}{sourceOptions.map(source=><option key={supplierProductSourceKey(source)} value={supplierProductSourceKey(source)}>{supplierProductSourceSummary(source)} · {label(source.domain)}</option>)}</select><small>{values.supplierId?'Only usable Supplier Products linked to this Supplier are shown.':'Choose a Supplier first.'}</small></label>
   {selectedSource?<section className="supplier-offer-source" aria-label="Selected Supplier Product identity"><span className="eyebrow">Stable canonical source</span><h4>{selectedSource.product_name}</h4><p>{supplierProductSourceSummary(selectedSource)}</p><dl><div><dt>Domain</dt><dd>{label(selectedSource.domain)}</dd></div><div><dt>Stable ID</dt><dd className="receipt-id">{selectedSource.id}</dd></div><div><dt>SKU</dt><dd>{selectedSource.supplier_sku||'Not recorded'}</dd></div></dl></section>:null}
   <label>Product title<input name="product_title" required value={values.productTitle} onChange={event=>setValue('productTitle',event.target.value)}/></label>
   <label>Product URL<input name="product_url" type="url" value={values.productUrl} onChange={event=>setValue('productUrl',event.target.value)}/></label>
   <label>Country<input name="country_code" maxLength={2} placeholder="NO" value={values.countryCode} onChange={event=>setValue('countryCode',event.target.value.toUpperCase())}/></label>
   <label>Package quantity<input name="package_quantity" type="number" min="0.0001" step="any" required value={values.packageQuantity} onChange={event=>setValue('packageQuantity',event.target.value)}/></label>
   <label>Package unit<input name="package_unit" required value={values.packageUnit} onChange={event=>setValue('packageUnit',event.target.value)}/></label>
   <label>Item price<input name="item_price" type="number" min="0" step="any" required value={values.itemPrice} onChange={event=>setValue('itemPrice',event.target.value)}/></label>
   <label>Currency<input name="currency" maxLength={3} required value={values.currency} onChange={event=>setValue('currency',event.target.value.toUpperCase())}/></label>
   <label>MOQ (packages)<input name="moq" type="number" min="0.0001" step="any" value={values.moq} onChange={event=>setValue('moq',event.target.value)}/></label>
   <label>Shipping cost<input name="shipping_cost" type="number" min="0" step="any" value={values.shippingCost} onChange={event=>setValue('shippingCost',event.target.value)}/></label>
   <label>Tax/duty estimate<input name="tax_duty_estimate" type="number" min="0" step="any" value={values.taxDutyEstimate} onChange={event=>setValue('taxDutyEstimate',event.target.value)}/></label>
   <label>Delivery estimate (days)<input name="delivery_estimate_days" type="number" min="0" step="1" value={values.deliveryEstimateDays} onChange={event=>setValue('deliveryEstimateDays',event.target.value)}/></label>
   <label>Stock<select name="stock_status" value={values.stockStatus} onChange={event=>setValue('stockStatus',event.target.value as OfferFormValues['stockStatus'])}><option>unknown</option><option>in_stock</option><option>limited</option><option>backorder</option><option>out_of_stock</option></select></label>
   <label>COA<select name="coa" value={values.coa} onChange={event=>setValue('coa',event.target.value as ProcurementDocumentState)}>{supplierOfferDocumentStates.map(state=><option key={state}>{state}</option>)}</select></label>
   <label>SDS<select name="sds" value={values.sds} onChange={event=>setValue('sds',event.target.value as ProcurementDocumentState)}>{supplierOfferDocumentStates.map(state=><option key={state}>{state}</option>)}</select></label>
   <label>Technical documents<select name="technical" value={values.technical} onChange={event=>setValue('technical',event.target.value as ProcurementDocumentState)}>{supplierOfferDocumentStates.map(state=><option key={state}>{state}</option>)}</select></label>
   <label>Organic/certification claims<input name="certifications" placeholder="Unverified claims, comma separated" value={values.certifications} onChange={event=>setValue('certifications',event.target.value)}/></label>
   <label>First-order discount<input name="first_order_discount" type="number" min="0" step="any" value={values.firstOrderDiscount} onChange={event=>setValue('firstOrderDiscount',event.target.value)}/></label>
   <label>Date checked<input name="date_checked" type="date" required value={values.dateChecked} onChange={event=>setValue('dateChecked',event.target.value)}/></label>
   <label>Confidence<select name="confidence" value={values.confidence} onChange={event=>setValue('confidence',event.target.value as OfferFormValues['confidence'])}><option>unknown</option><option>low</option><option>medium</option><option>high</option></select></label>
   <label className="wide">Notes<textarea name="notes" value={values.notes} onChange={event=>setValue('notes',event.target.value)}/></label>
   <section className="supplier-offer-review wide" aria-label="Offer review summary"><span className="eyebrow">Review before saving</span><h4>{values.productTitle||'Product title not entered'}</h4><dl><div><dt>Supplier</dt><dd>{selectedSupplier?.trading_name||selectedSupplier?.legal_name||'Not selected'}</dd></div><div><dt>Canonical source</dt><dd>{selectedSource?supplierProductSourceSummary(selectedSource):'Manual Offer — no linked Supplier Product'}</dd></div><div><dt>Snapshot package</dt><dd>{values.packageQuantity||'—'} {values.packageUnit}</dd></div><div><dt>Snapshot price</dt><dd>{values.itemPrice||'—'} {values.currency||'Currency unknown'}</dd></div><div><dt>Checked</dt><dd>{values.dateChecked||'Not recorded'}</dd></div></dl><p>Saving records one commercial observation. It does not recommend, order, receive, own, or add inventory.</p></section>
  </fieldset>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  <footer><button className="button ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Confirming persistence…':'Confirm and save Offer'}</button></footer>
 </form>
}
