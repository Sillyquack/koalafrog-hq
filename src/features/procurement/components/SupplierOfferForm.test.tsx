import {renderToStaticMarkup} from 'react-dom/server'
import {describe,expect,it,vi} from 'vitest'
import type {Supplier,SupplierProductSource} from '../domain/procurement'
import {SupplierOfferForm} from './SupplierOfferForm'
import {availableOfferSources,buildSupplierOfferInput,supplierProductSourceSummary,type OfferFormValues} from './supplierOfferFormState'

const supplier:Supplier={id:'supplier-a',legal_name:'Canonical Supplier',trading_name:null,supplier_type:'raw_material',status:'research',website_url:null,country_code:'NO',default_currency:'NOK',default_lead_time_days:null,default_payment_terms:null,default_incoterm:null,minimum_order_value:null,internal_rating:null,internal_notes:'',is_preferred:false,verification_state:'unknown',archived_at:null,revision:1,created_at:'2026-08-01T08:00:00Z',updated_at:'2026-08-01T08:00:00Z'}
const source=(overrides:Partial<SupplierProductSource>={}):SupplierProductSource=>({domain:'raw_material',id:'source-stable-id',supplier_id:supplier.id,supplier_name:supplier.legal_name,product_name:'Jojoba Oil',supplier_sku:'JOJOBA-1L',package_quantity:1,package_unit:'L',price:249,currency:'NOK',product_url:'https://example.test/jojoba',country_code:'NO',lifecycle_status:'candidate',product_status:'research',discontinued:false,updated_at:'2026-08-01T08:00:00Z',...overrides})
const values=(overrides:Partial<OfferFormValues>={}):OfferFormValues=>({supplierId:supplier.id,sourceKey:'raw_material:source-stable-id',productTitle:'Observed Jojoba Oil',productUrl:'https://example.test/current-jojoba',countryCode:'NO',packageQuantity:'2',packageUnit:'L',itemPrice:'475',currency:'NOK',moq:'1',shippingCost:'75',taxDutyEstimate:'',deliveryEstimateDays:'5',stockStatus:'in_stock',coa:'available',sds:'available',technical:'partial',certifications:'Organic, COSMOS',firstOrderDiscount:'10',notes:'Dated observation.',dateChecked:'2026-08-01',confidence:'high',...overrides})

describe('SupplierOfferForm',()=>{
 it('filters the stable-ID selector by canonical Supplier, supported domain and usable lifecycle',()=>{const candidates=[source(),source({id:'packaging',domain:'packaging',product_name:'Bottle'}),source({id:'wrong-supplier',supplier_id:'supplier-b'}),source({id:'discontinued',discontinued:true}),source({id:'rejected',lifecycle_status:'rejected'}),source({id:'inactive',product_status:'inactive'}),source({id:'product-discontinued',product_status:'discontinued'})];expect(availableOfferSources(candidates,supplier.id).map(item=>item.id)).toEqual(['packaging','source-stable-id'])})

 it('labels canonical source identity with Supplier, package and SKU',()=>{expect(supplierProductSourceSummary(source())).toBe('Jojoba Oil · Canonical Supplier · 1 L · JOJOBA-1L')})

 it('keeps canonical source identity while accepting edited snapshot fields',()=>{const input=buildSupplierOfferInput('requested-item',values(),source());expect(input).toMatchObject({requested_item_id:'requested-item',supplier_id:supplier.id,source_supplier_product_domain:'raw_material',source_supplier_product_id:'source-stable-id',product_title:'Observed Jojoba Oil',package_quantity:2,item_price:475,date_checked:'2026-08-01'})})

 it('supports a genuine manual Offer and rejects a stale selected source',()=>{expect(buildSupplierOfferInput('requested-item',values({sourceKey:''}),undefined)).toMatchObject({source_supplier_product_domain:null,source_supplier_product_id:null});expect(()=>buildSupplierOfferInput('requested-item',values(),undefined)).toThrow(/no longer available/i)})

 it('renders an accessible, keyboard-native form with review and no arbitrary source ID input',()=>{const html=renderToStaticMarkup(<SupplierOfferForm requestedItemId="requested-item" suppliers={[supplier]} sources={[source()]} onSubmit={vi.fn()} onCancel={vi.fn()}/>);expect(html).toContain('Supplier Product source, optional');expect(html).toContain('Manual Offer — no canonical source');expect(html).toContain('aria-label="Offer review summary"');expect(html).toContain('Confirm and save Offer');expect(html).not.toContain('name="source_supplier_product_id"')})
})
