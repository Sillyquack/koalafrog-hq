import {
  supplierStatuses,
  supplierTypes,
  supplierVerificationStates,
  type Supplier,
  type SupplierCreateInput,
  type SupplierOffer,
  type SupplierOfferCreateInput,
  type SupplierProductSource,
  type SupplierProductSourceDomain,
} from './procurement'

const countryPattern=/^[A-Z]{2}$/
const currencyPattern=/^[A-Z]{3}$/
const datePattern=/^\d{4}-\d{2}-\d{2}$/
const supportedSourceDomains:SupplierProductSourceDomain[]=['raw_material','packaging']
const stockStates=['unknown','in_stock','limited','backorder','out_of_stock'] as const
const documentStates=['unknown','available','unavailable','partial'] as const
const confidenceStates=['low','medium','high','unknown'] as const

const requiredText=(value:unknown,label:string)=>{
  const normalized=String(value??'').trim()
  if(!normalized)throw new Error(`${label} is required.`)
  return normalized
}

const optionalText=(value:unknown)=>{
  const normalized=String(value??'').trim()
  return normalized||null
}

const absoluteHttpUrl=(value:unknown,label:string)=>{
  const normalized=optionalText(value)
  if(!normalized)return null
  try{
    const parsed=new URL(normalized)
    if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname)throw new Error()
  }catch{
    throw new Error(`${label} must be an absolute http or https URL.`)
  }
  return normalized
}

const allowed=<T extends string>(value:unknown,values:readonly T[],label:string,defaultValue?:T)=>{
  const normalized=(value??defaultValue) as T
  if(!values.includes(normalized))throw new Error(`${label} is not supported.`)
  return normalized
}

const optionalNumber=(value:unknown,label:string,options:{minimum?:number;exclusiveMinimum?:number;integer?:boolean}={})=>{
  if(value===null||value===undefined||value==='')return null
  const normalized=Number(value)
  if(!Number.isFinite(normalized))throw new Error(`${label} must be a number.`)
  if(options.integer&&!Number.isInteger(normalized))throw new Error(`${label} must be a whole number.`)
  if(options.minimum!==undefined&&normalized<options.minimum)throw new Error(`${label} must be at least ${options.minimum}.`)
  if(options.exclusiveMinimum!==undefined&&normalized<=options.exclusiveMinimum)throw new Error(`${label} must be greater than ${options.exclusiveMinimum}.`)
  return normalized
}

export function normalizeSupplierCreateInput(input:SupplierCreateInput):SupplierCreateInput{
  const country=optionalText(input.country_code)?.toUpperCase()??null
  const currency=optionalText(input.default_currency)?.toUpperCase()??null
  if(country&&!countryPattern.test(country))throw new Error('Country code must be two uppercase letters.')
  if(currency&&!currencyPattern.test(currency))throw new Error('Default currency must be three uppercase letters.')
  return{
    legal_name:requiredText(input.legal_name,'Legal name'),
    trading_name:optionalText(input.trading_name),
    supplier_type:allowed(input.supplier_type,supplierTypes,'Supplier type'),
    status:allowed(input.status,supplierStatuses,'Supplier status','research'),
    website_url:absoluteHttpUrl(input.website_url,'Website'),
    country_code:country,
    default_currency:currency,
    verification_state:allowed(input.verification_state,supplierVerificationStates,'Verification state','unknown'),
    internal_notes:String(input.internal_notes??'').trim(),
    is_preferred:input.is_preferred===true,
  }
}

export function normalizeSupplierOfferCreateInput(input:SupplierOfferCreateInput):SupplierOfferCreateInput{
  const sourceDomain=input.source_supplier_product_domain??null
  const sourceId=optionalText(input.source_supplier_product_id)
  if((sourceDomain===null)!=(sourceId===null))throw new Error('Supplier Product source domain and ID must be recorded together.')
  if(sourceDomain!==null&&!supportedSourceDomains.includes(sourceDomain))throw new Error('Supplier Product source domain is not supported.')
  const country=optionalText(input.country_code)?.toUpperCase()??null
  const currency=optionalText(input.currency)?.toUpperCase()??null
  if(country&&!countryPattern.test(country))throw new Error('Offer country code must be two uppercase letters.')
  if(currency&&!currencyPattern.test(currency))throw new Error('Offer currency must be three uppercase letters.')
  const checked=requiredText(input.date_checked,'Checked date')
  if(!datePattern.test(checked)||Number.isNaN(Date.parse(`${checked}T00:00:00.000Z`))||new Date(`${checked}T00:00:00.000Z`).toISOString().slice(0,10)!==checked)throw new Error('Checked date must be a valid calendar date.')
  const packageQuantity=optionalNumber(input.package_quantity,'Package quantity',{exclusiveMinimum:0})
  if(packageQuantity===null)throw new Error('Package quantity is required.')
  return{
    requested_item_id:requiredText(input.requested_item_id,'Requested item'),
    supplier_id:requiredText(input.supplier_id,'Supplier'),
    source_supplier_product_domain:sourceDomain,
    source_supplier_product_id:sourceId,
    product_title:requiredText(input.product_title,'Product title'),
    product_url:absoluteHttpUrl(input.product_url,'Product URL'),
    country_code:country,
    package_quantity:packageQuantity,
    package_unit:requiredText(input.package_unit,'Package unit'),
    item_price:optionalNumber(input.item_price,'Item price',{minimum:0}),
    currency,
    moq:optionalNumber(input.moq,'MOQ',{exclusiveMinimum:0}),
    shipping_cost:optionalNumber(input.shipping_cost,'Shipping cost',{minimum:0}),
    tax_duty_estimate:optionalNumber(input.tax_duty_estimate,'Tax and duty estimate',{minimum:0}),
    delivery_estimate_days:optionalNumber(input.delivery_estimate_days,'Delivery estimate',{minimum:0,integer:true}),
    stock_status:allowed(input.stock_status,stockStates,'Stock status','unknown'),
    coa_availability:allowed(input.coa_availability,documentStates,'COA availability','unknown'),
    sds_availability:allowed(input.sds_availability,documentStates,'SDS availability','unknown'),
    technical_document_availability:allowed(input.technical_document_availability,documentStates,'Technical document availability','unknown'),
    certification_claims:(input.certification_claims??[]).map(value=>String(value).trim()).filter(Boolean),
    first_order_discount:optionalNumber(input.first_order_discount,'First-order discount',{minimum:0}),
    notes:String(input.notes??'').trim(),
    date_checked:checked,
    confidence:allowed(input.confidence,confidenceStates,'Confidence','unknown'),
  } as SupplierOfferCreateInput
}

const collapsed=(value:unknown)=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en')
const comparableCountry=(value:unknown)=>String(value??'').trim().toUpperCase()
const identityCompatible=(row:Record<string,unknown>,input:SupplierCreateInput)=>{
  const legalMatches=collapsed(row.legal_name)===collapsed(input.legal_name)
  const trading=collapsed(input.trading_name)
  const tradingMatches=Boolean(trading)&&collapsed(row.trading_name)===trading
  const rowCountry=comparableCountry(row.country_code),inputCountry=comparableCountry(input.country_code)
  return(legalMatches||tradingMatches)&&(!rowCountry||!inputCountry||rowCountry===inputCountry)
}

const supplierFields:ReadonlyArray<keyof SupplierCreateInput>=[
  'legal_name','trading_name','supplier_type','status','website_url','country_code',
  'default_currency','verification_state','internal_notes','is_preferred',
]

export function supplierFingerprintMatches(row:Record<string,unknown>,input:SupplierCreateInput){
  return supplierFields.every(field=>(row[field]??null)===(input[field]??null))
}

export type SupplierIdentityClassification=
  |{classification:'new'}
  |{classification:'exact_existing';existingId:string}
  |{classification:'normalized_conflict';candidateIds:string[]}

export function classifySupplierIdentity(rows:Record<string,unknown>[],input:SupplierCreateInput):SupplierIdentityClassification{
  const candidates=rows.filter(row=>identityCompatible(row,input))
  const exact=candidates.filter(row=>supplierFingerprintMatches(row,input))
  if(exact.length===1&&candidates.length===1)return{classification:'exact_existing',existingId:requiredText(exact[0].id,'Existing Supplier ID')}
  if(candidates.length)return{classification:'normalized_conflict',candidateIds:candidates.map(row=>requiredText(row.id,'Existing Supplier ID')).sort()}
  return{classification:'new'}
}

const requiredPersisted=(row:Record<string,unknown>,field:string)=>requiredText(row[field],`Persisted ${field.replaceAll('_',' ')}`)

export function assertSupplierReadback(row:Record<string,unknown>,workspaceId:string,ownerId:string,input:SupplierCreateInput):Supplier{
  if(row.workspace_id!==workspaceId||row.owner_id!==ownerId)throw new Error('Supplier readback did not belong to the active owner workspace.')
  requiredPersisted(row,'id')
  requiredPersisted(row,'created_at')
  if(!supplierFingerprintMatches(row,input))throw new Error('Supplier readback did not match every submitted field. Refresh before trying again; no success receipt was issued.')
  return row as unknown as Supplier
}

const offerFields:ReadonlyArray<keyof SupplierOfferCreateInput>=[
  'requested_item_id','supplier_id','source_supplier_product_domain','source_supplier_product_id',
  'product_title','product_url','country_code','package_quantity','package_unit','item_price',
  'currency','moq','shipping_cost','tax_duty_estimate','delivery_estimate_days','stock_status',
  'coa_availability','sds_availability','technical_document_availability','certification_claims',
  'first_order_discount','notes','date_checked','confidence',
]

export function offerFingerprintMatches(row:Record<string,unknown>,input:SupplierOfferCreateInput){
  return offerFields.every(field=>field==='certification_claims'
    ?JSON.stringify(row[field]??[])===JSON.stringify(input[field]??[])
    :(row[field]??null)===(input[field]??null))
}

export function assertOfferReadback(row:Record<string,unknown>,workspaceId:string,ownerId:string,input:SupplierOfferCreateInput):SupplierOffer{
  if(row.workspace_id!==workspaceId||row.owner_id!==ownerId)throw new Error('Offer readback did not belong to the active owner workspace.')
  requiredPersisted(row,'id')
  requiredPersisted(row,'created_at')
  if(!offerFingerprintMatches(row,input))throw new Error('Offer readback did not match the submitted snapshot and source relationships. Refresh before trying again; no success receipt was issued.')
  return row as unknown as SupplierOffer
}

export function supplierProductSourceUsable(source:Pick<SupplierProductSource,'discontinued'|'lifecycle_status'|'product_status'>){
  return!source.discontinued&&!['discontinued','rejected'].includes(source.lifecycle_status)&&!['inactive','discontinued'].includes(source.product_status??'')
}

export function supplierProductSourceTable(domain:SupplierProductSourceDomain){
  return domain==='raw_material'?'supplier_products':'packaging_supplier_products'
}
