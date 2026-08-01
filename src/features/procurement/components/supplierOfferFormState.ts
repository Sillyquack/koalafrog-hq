import type {ProcurementDocumentState,SupplierOfferCreateInput,SupplierOfferSourceLink,SupplierProductSource} from '../domain/procurement'

export const supplierOfferDocumentStates:ProcurementDocumentState[]=['unknown','available','partial','unavailable']
const unsupportedLifecycle=new Set(['discontinued','rejected'])
const unsupportedProductStatus=new Set(['inactive','discontinued'])

export const supplierProductSourceKey=(source:Pick<SupplierProductSource,'domain'|'id'>)=>`${source.domain}:${source.id}`

export function availableOfferSources(sources:SupplierProductSource[],supplierId:string){
 return sources
  .filter(source=>Boolean(supplierId)&&source.supplier_id===supplierId&&['raw_material','packaging'].includes(source.domain)&&!source.discontinued&&!unsupportedLifecycle.has(source.lifecycle_status)&&!unsupportedProductStatus.has(source.product_status??''))
  .sort((left,right)=>left.product_name.localeCompare(right.product_name)||left.domain.localeCompare(right.domain)||left.id.localeCompare(right.id))
}

export function supplierProductSourceSummary(source:SupplierProductSource){
 const packageLabel=source.package_quantity==null||!source.package_unit?'Package unknown':`${source.package_quantity} ${source.package_unit}`
 return `${source.product_name} · ${source.supplier_name} · ${packageLabel} · ${source.supplier_sku||'No SKU'}`
}

export interface OfferFormValues{
 supplierId:string;sourceKey:string;productTitle:string;productUrl:string;countryCode:string;packageQuantity:string;packageUnit:string;itemPrice:string;currency:string;moq:string;shippingCost:string;taxDutyEstimate:string;deliveryEstimateDays:string
 stockStatus:SupplierOfferCreateInput['stock_status'];coa:ProcurementDocumentState;sds:ProcurementDocumentState;technical:ProcurementDocumentState
 certifications:string;firstOrderDiscount:string;notes:string;dateChecked:string;confidence:SupplierOfferCreateInput['confidence']
}

export const initialSupplierOfferFormValues=():OfferFormValues=>({supplierId:'',sourceKey:'',productTitle:'',productUrl:'',countryCode:'',packageQuantity:'',packageUnit:'',itemPrice:'',currency:'NOK',moq:'',shippingCost:'',taxDutyEstimate:'',deliveryEstimateDays:'',stockStatus:'unknown',coa:'unknown',sds:'unknown',technical:'unknown',certifications:'',firstOrderDiscount:'',notes:'',dateChecked:new Date().toISOString().slice(0,10),confidence:'unknown'})

const nullableNumber=(value:string)=>value.trim()===''?null:Number(value)
const split=(value:string)=>value.split(/[,\n]/).map(item=>item.trim()).filter(Boolean)

function validateHttpUrl(value:string){
 if(!value)return null
 try{const url=new URL(value);if(url.protocol!=='http:'&&url.protocol!=='https:')throw new Error();return url.toString()}
 catch{throw new Error('Product URL must be an absolute HTTP or HTTPS URL.')}
}

export function buildSupplierOfferInput(requestedItemId:string,values:OfferFormValues,source:SupplierProductSource|undefined):SupplierOfferCreateInput{
 const productTitle=values.productTitle.trim(),packageQuantity=Number(values.packageQuantity),itemPrice=Number(values.itemPrice),countryCode=values.countryCode.trim().toUpperCase(),currency=values.currency.trim().toUpperCase()
 if(!values.supplierId)throw new Error('Choose a Supplier before saving the Offer.')
 if(values.sourceKey&&(!source||source.supplier_id!==values.supplierId))throw new Error('The selected Supplier Product is no longer available for this Supplier. Choose it again.')
 if(!productTitle)throw new Error('Product title is required.')
 if(!Number.isFinite(packageQuantity)||packageQuantity<=0)throw new Error('Package quantity must be greater than zero.')
 if(!values.packageUnit.trim())throw new Error('Package unit is required.')
 if(!Number.isFinite(itemPrice)||itemPrice<0)throw new Error('Item price must be zero or greater.')
 if(!/^[A-Z]{3}$/.test(currency))throw new Error('Currency must be three uppercase letters.')
 if(countryCode&&!/^[A-Z]{2}$/.test(countryCode))throw new Error('Country must be two uppercase letters.')
 const sourceLink:SupplierOfferSourceLink=source?{source_supplier_product_domain:source.domain,source_supplier_product_id:source.id}:{source_supplier_product_domain:null,source_supplier_product_id:null}
 return{...sourceLink,requested_item_id:requestedItemId,supplier_id:values.supplierId,product_title:productTitle,product_url:validateHttpUrl(values.productUrl.trim()),country_code:countryCode||null,package_quantity:packageQuantity,package_unit:values.packageUnit.trim(),item_price:itemPrice,currency,moq:nullableNumber(values.moq),shipping_cost:nullableNumber(values.shippingCost),tax_duty_estimate:nullableNumber(values.taxDutyEstimate),delivery_estimate_days:nullableNumber(values.deliveryEstimateDays),stock_status:values.stockStatus,coa_availability:values.coa,sds_availability:values.sds,technical_document_availability:values.technical,certification_claims:split(values.certifications),first_order_discount:nullableNumber(values.firstOrderDiscount),notes:values.notes.trim(),date_checked:values.dateChecked,confidence:values.confidence}
}
