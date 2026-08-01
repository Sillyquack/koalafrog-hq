import{createClient}from'@supabase/supabase-js'
import{owner}from'./ingredientKnowledge.helpers'

async function localOwnerClient(){
 const actor=owner()
 if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(actor.url))throw new Error('Commercial provenance E2E refuses non-local Supabase.')
 const client=createClient(actor.url,actor.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const signedIn=await client.auth.signInWithPassword({email:actor.email,password:actor.password})
 if(signedIn.error)throw signedIn.error
 return{actor,client}
}

export interface CommercialProvenanceFixture{requestId:string;itemId:string;supplierId:string;sourceId:string;supplierName:string;productName:string;sku:string}

export async function seedCommercialProvenanceFixture(label:string):Promise<CommercialProvenanceFixture>{
 const{actor,client}=await localOwnerClient(),runId=crypto.randomUUID()
 const workspace=await client.from('workspaces').select('id').eq('owner_id',actor.userId).single()
 if(workspace.error)throw workspace.error
 const owned={workspace_id:workspace.data.id,owner_id:actor.userId},supplierName=`${label} Source Supplier ${runId.slice(0,8)}`,productName=`${label} Jojoba Oil`,sku=`E2E-${runId.slice(0,8)}`,sourceId=`supplier-product-commercial-provenance-${runId}`
 const supplier=await client.from('suppliers').insert({...owned,legal_name:supplierName,supplier_type:'raw_material',status:'research',country_code:'NO',default_currency:'NOK',verification_state:'unknown',internal_notes:'',is_preferred:false}).select('id').single()
 if(supplier.error)throw supplier.error
 const request=await client.from('procurement_requests').insert({...owned,title:`${label} Commercial provenance ${runId.slice(0,8)}`,status:'identified',category:'raw_material',priority:'normal',notes:''}).select('id').single()
 if(request.error)throw request.error
 const item=await client.from('procurement_requested_items').insert({...owned,procurement_request_id:request.data.id,name:`${label} Jojoba requirement`,category:'raw_material',requirement_type:'raw_material',requested_quantity:2,unit:'L',intended_product_ids:[],intended_formula_ids:[],required_specifications:['Cosmetic grade'],acceptable_substitutes:[],priority:'normal',notes:'',display_order:0,status:'identified'}).select('id').single()
 if(item.error)throw item.error
 const now=new Date().toISOString(),ingredientId=`ingredient-commercial-provenance-${runId}`
 const ingredient=await client.from('ingredients').insert({...owned,id:ingredientId,common_name:`${label} Jojoba`,inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Oil',functions:['Emollient'],description:'Local-only commercial provenance fixture.',default_unit:'ml',notes:'',status:'Research',created_at:now,updated_at:now})
 if(ingredient.error)throw ingredient.error
 const product=await client.from('supplier_products').insert({...owned,id:sourceId,ingredient_id:ingredientId,supplier_id:supplier.data.id,supplier_name:supplierName,product_name:productName,supplier_sku:sku,package_quantity:1,package_unit:'L',price:249,currency:'NOK',product_url:'https://example.test/e2e-jojoba',country_code:'NO',notes:'Local-only test fixture.',is_preferred:false,lifecycle_status:'candidate',price_state:'recorded',product_status:'research',discontinued:false,created_at:now,updated_at:now})
 if(product.error)throw product.error
 return{requestId:request.data.id,itemId:item.data.id,supplierId:supplier.data.id,sourceId,supplierName,productName,sku}
}
