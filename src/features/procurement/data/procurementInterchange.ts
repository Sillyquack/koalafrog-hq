import type { ProcurementCartScenario, ProcurementCartScenarioItem, ProcurementData, ProcurementRecommendation, ProcurementRequest, RequestedItem, SupplierDiscount, SupplierOffer, SupplierShippingRule } from '../domain/procurement'

export const PROCUREMENT_EXPORT_VERSION=1
export interface ProcurementExport{version:1;exportedAt:string;requests:ProcurementRequest[];requestedItems:RequestedItem[];offers:SupplierOffer[];recommendations:ProcurementRecommendation[];supplierDiscounts:SupplierDiscount[];supplierShippingRules:SupplierShippingRule[];cartScenarios:ProcurementCartScenario[];cartScenarioItems:ProcurementCartScenarioItem[]}
export function exportProcurement(data:ProcurementData):ProcurementExport{return{version:PROCUREMENT_EXPORT_VERSION,exportedAt:new Date().toISOString(),requests:data.requests,requestedItems:data.requestedItems,offers:data.offers,recommendations:data.recommendations,supplierDiscounts:data.supplierDiscounts,supplierShippingRules:data.supplierShippingRules,cartScenarios:data.cartScenarios,cartScenarioItems:data.cartScenarioItems}}
const safeUrl=(value:unknown)=>{if(value==null||value==='')return true;try{const url=new URL(String(value));return url.protocol==='https:'||url.protocol==='http:'}catch{return false}}
export function parseProcurementJson(text:string):ProcurementExport{
 const value=JSON.parse(text) as Partial<ProcurementExport>
 if(value.version!==1||!Array.isArray(value.requests)||!Array.isArray(value.requestedItems)||!Array.isArray(value.offers)||!Array.isArray(value.recommendations))throw new Error('Unsupported or invalid Procurement JSON.')
 value.supplierDiscounts??=[]
 value.supplierShippingRules??=[]
 value.cartScenarios??=[]
 value.cartScenarioItems??=[]
 const requestIds=new Set(value.requests.map(x=>x.id)),itemIds=new Set(value.requestedItems.map(x=>x.id)),offerIds=new Set(value.offers.map(x=>x.id))
 const discountIds=new Set(value.supplierDiscounts.map(x=>x.id)),ruleIds=new Set(value.supplierShippingRules.map(x=>x.id)),scenarioIds=new Set(value.cartScenarios.map(x=>x.id))
 if(value.requests.some(x=>!x.id||!x.title||!['identified','researching','specification_required','quote_requested','planned','ready_to_order','ordered','partially_received','received','cancelled','rejected'].includes(x.status))||value.requestedItems.some(x=>!x.id||!requestIds.has(x.procurement_request_id)||!x.name||(x.requested_quantity!=null&&!(Number(x.requested_quantity)>0))||((x.requested_quantity==null)!=(x.unit==null)))||value.offers.some(x=>!x.id||!itemIds.has(x.requested_item_id)||!x.supplier_id||!x.product_title||!(Number(x.package_quantity)>0)||!safeUrl(x.product_url))||value.recommendations.some(x=>!x.id||!requestIds.has(x.procurement_request_id)||!itemIds.has(x.requested_item_id)||!offerIds.has(x.supplier_offer_id))||value.supplierDiscounts.some(x=>!x.id||!x.supplier_id||!safeUrl(x.source_url))||value.supplierShippingRules.some(x=>!x.id||!x.supplier_id||!safeUrl(x.source_url))||value.cartScenarios.some(x=>!x.id||!x.supplier_id||(x.discount_id!=null&&!discountIds.has(x.discount_id))||(x.shipping_rule_id!=null&&!ruleIds.has(x.shipping_rule_id)))||value.cartScenarioItems.some(x=>!x.id||!scenarioIds.has(x.scenario_id)||!offerIds.has(x.supplier_offer_id)||!itemIds.has(x.requested_item_id)))throw new Error('Procurement JSON contains invalid or disconnected records.')
 return value as ProcurementExport
}
const escape=(value:unknown)=>{const text=Array.isArray(value)?value.join('|'):value==null?'':String(value);return `"${text.replaceAll('"','""')}"`}
export function offersToCsv(offers:SupplierOffer[]){const keys=['requested_item_id','supplier_id','source_supplier_product_domain','source_supplier_product_id','product_title','product_url','country_code','package_quantity','package_unit','item_price','currency','moq','shipping_cost','tax_duty_estimate','delivery_estimate_days','stock_status','coa_availability','sds_availability','technical_document_availability','certification_claims','first_order_discount','notes','date_checked','confidence'] as const;return[keys.join(','),...offers.map(offer=>keys.map(key=>escape(offer[key])).join(','))].join('\n')}
export function parseCsv(text:string){const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++}else if(char==='"')quoted=!quoted;else if(char===','&&!quoted){row.push(cell);cell=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=char}row.push(cell);if(row.some(Boolean))rows.push(row);if(rows.length<2)return[];const headers=rows[0];return rows.slice(1).map(values=>Object.fromEntries(headers.map((key,index)=>[key,values[index]??''])))}

export function sourceLinkFromCsvRow(row:Record<string,string>){
 const domain=(row.source_supplier_product_domain??'').trim(),id=(row.source_supplier_product_id??'').trim()
 if(Boolean(domain)!==Boolean(id))throw new Error('CSV Supplier Product source domain and ID must be provided together.')
 if(!domain)return{source_supplier_product_domain:null,source_supplier_product_id:null} as const
 if(domain!=='raw_material'&&domain!=='packaging')throw new Error(`CSV contains unsupported Supplier Product source domain "${domain}".`)
 return{source_supplier_product_domain:domain,source_supplier_product_id:id} as const
}
