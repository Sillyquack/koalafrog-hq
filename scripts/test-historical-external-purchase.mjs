// Local/disposable DB only. Never reads linked project settings or credentials.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
const database = 'koalafrog_issue98'
const dockerArgs = ['exec','-i','supabase_db_koalafrog-hq','psql','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1']
const sql = text => execFileSync('docker',dockerArgs,{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const json = value => `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
const owner = randomUUID(), workspace = randomUUID(), otherOwner = randomUUID(), otherWorkspace = randomUUID(), supplier = randomUUID()
let assertions = 0
const equal = (actual,expected,label) => {assert.deepEqual(actual,expected,label); assertions++}
const rejected = (query,error,label) => {
  let failure
  try {sql(query)} catch (e) {failure=String(e.stderr)}
  assert.match(failure??'SQL unexpectedly succeeded',new RegExp(error),label); assertions++
}
const authenticated = (query,actor=owner) => `begin; set local role authenticated; set local "request.jwt.claim.sub"='${actor}'; ${query}; commit;`
const rpc = (name,payload,key=randomUUID(),actor=owner,ws=workspace) => authenticated(`select public.${name}('${ws}','${key}',${json(payload)})`,actor)
const map = (payload,key,actor,ws) => rpc('accept_owner_reviewed_supplier_product_mapping',payload,key,actor,ws)
const reconcile = (payload,key,actor,ws) => rpc('reconcile_historical_external_purchase',payload,key,actor,ws)
const counts = () => JSON.parse(sql(`select jsonb_build_object(
 'orders',(select count(*) from public.purchase_orders where workspace_id='${workspace}'),
 'confirmations',(select count(*) from public.purchase_order_confirmations where workspace_id='${workspace}'),
 'shipments',(select count(*) from public.purchase_order_shipments where workspace_id='${workspace}'),
 'commands',(select count(*) from public.historical_purchase_command_receipts where workspace_id='${workspace}'))`))
const noDownstream = () => {
 for(const table of ['purchase_order_receipts','purchase_order_receipt_lines','inventory_quarantine_intakes','inventory_quality_release_reviews','inventory_lots','inventory_movements','production_procurement_rounds','production_procurement_requirements','purchase_plans']) {
  equal(sql(`select count(*) from public.${table} where workspace_id='${workspace}'`),'0',`${table} remains untouched`)
 }
}
sql(`insert into auth.users(id,email) values('${owner}','${owner}@example.invalid'),('${otherOwner}','${otherOwner}@example.invalid');
insert into public.workspaces(id,owner_id,name,lifecycle_state) values('${workspace}','${owner}','Issue98 disposable','active'),('${otherWorkspace}','${otherOwner}','Other disposable','active');
insert into public.suppliers(id,workspace_id,owner_id,legal_name,supplier_type,status,internal_notes,is_preferred) values('${supplier}','${workspace}','${owner}','Generic test supplier','raw_material','active','',false);
insert into public.ingredients(workspace_id,owner_id,id,common_name,inci_name,category,functions,description,default_unit,notes,status,created_at,updated_at)
select '${workspace}','${owner}',id,id,'Test INCI','other','{}','','g','','active',now(),now() from unnest(array['ingredient-a','ingredient-b']) id;
insert into public.supplier_products(workspace_id,owner_id,id,ingredient_id,supplier_id,supplier_name,product_name,package_quantity,package_unit,price,currency,notes,is_preferred,created_at,updated_at,declared_inci,grade)
values('${workspace}','${owner}','product-a','ingredient-a','${supplier}','Generic test supplier','Current catalogue identity',250,'g',999,'NOK','',false,now(),now(),'Test INCI','Cosmetic');`)
const mapping = {supplierProductId:'product-a',ingredientId:'ingredient-a',evidenceReference:'owner-document-1',acceptanceNote:'Identity reviewed against container and purchase evidence.'}
const mapKey = randomUUID()
rejected(map({...mapping,ingredientId:'ingredient-b'}),'CANONICAL_INGREDIENT_MISMATCH','cannot reassign identity')
rejected(map({...mapping,evidenceReference:' '}),'MAPPING_EVIDENCE_AND_NOTE_REQUIRED','mapping evidence required')
rejected(map({...mapping,acceptanceNote:''}),'MAPPING_EVIDENCE_AND_NOTE_REQUIRED','mapping note required')
rejected(map(mapping,undefined,otherOwner),'WORKSPACE_UNAVAILABLE','wrong mapping owner')
rejected(map(mapping,undefined,owner,otherWorkspace),'WORKSPACE_UNAVAILABLE','wrong mapping workspace')
const accepted = JSON.parse(sql(map(mapping,mapKey)))
equal(accepted.status,'accepted','accepted')
equal(accepted.acceptanceMethod,'owner_direct_identity_review','truthful method')
equal(JSON.parse(sql(map(mapping,mapKey))),accepted,'mapping replay same receipt')
rejected(map({...mapping,acceptanceNote:'changed'},mapKey),'IDEMPOTENCY_CONFLICT','mapping key conflict')
equal(JSON.parse(sql(`select compatibility_snapshot from public.supplier_product_ingredient_mappings where id='${accepted.mappingId}'`)),{inci:'Test INCI',grade:'Cosmetic',supplierGrade:null,tradeIdentity:'Current catalogue identity',packageUnit:'g'},'identity snapshot')
sql(`update public.supplier_product_ingredient_mappings set ingredient_id='ingredient-b' where id='${accepted.mappingId}'`)
rejected(map(mapping),'AMBIGUOUS_ACCEPTED_MAPPING','conflicting accepted mapping')
sql(`update public.supplier_product_ingredient_mappings set ingredient_id='ingredient-a' where id='${accepted.mappingId}'`)
rejected(authenticated(`select public.accept_supplier_product_ingredient_mapping('${randomUUID()}','product-a',1,'note')`),'REQUIREMENT_UNAVAILABLE','original requirement gate remains')
const line = {lineKey:'one',supplierProductId:'product-a',productIdentity:'Historical documented product',sku:'HIST-1',packageSize:100,packageUnit:'g',packageCount:2,unitPrice:10,lineTotal:20}
function payload() {
 return {acknowledgement:'already_completed_external_purchase',supplierId:supplier,supplierOrderNumber:`external-${randomUUID()}`,customerReference:`customer-${randomUUID()}`,externalOrderDate:'2025-02-03T12:00:00Z',currency:'GBP',merchandiseSubtotal:20,grandTotal:25,shipping:5,evidenceType:'invoice',evidenceReference:'local-order-document',evidenceNote:'Historical test evidence.',lines:[{...line}],
 confirmation:{supplierConfirmationReference:`confirm-${randomUUID()}`,supplierConfirmationDate:'2025-02-03T14:00:00Z',confirmedCurrency:'GBP',confirmedMerchandiseSubtotal:20,confirmedGrandTotal:25,confirmedShipping:5,evidenceType:'supplier_confirmation',evidenceReference:'local-confirmation-document',evidenceNote:'All lines independently transcribed.',lines:[{...line,quantity:200}]},
 shipment:{supplierShipmentReference:`shipment-${randomUUID()}`,status:'delivery_reported',dispatchDate:'2025-02-04T10:00:00Z',reportedAt:'2025-02-08T11:00:00Z',carrier:'Test carrier',trackingNumber:'TEST123',evidenceType:'carrier_delivery',evidenceReference:'local-carrier-document',evidenceNote:'Carrier reported delivery only.',lines:[{lineKey:'one',packageCount:2,quantity:200}]}}
}
function negative(change,error,label) {
 const input=payload(); change(input); const before=counts()
 rejected(reconcile(input),error,label)
 equal(counts(),before,`${label}: atomic rollback`)
}
negative(p=>delete p.acknowledgement,'HISTORICAL_ACKNOWLEDGEMENT_REQUIRED','acknowledgement mandatory')
for(const field of ['evidenceType','evidenceReference','evidenceNote','externalOrderDate','supplierOrderNumber']) negative(p=>delete p[field],'HISTORICAL_REQUIRED_FIELD',`${field} mandatory`)
negative(p=>p.lines=[],'ORDER_LINES_REQUIRED','empty order')
negative(p=>p.lines[0].packageCount=null,'LINE_VALUE_REQUIRED','null quantity')
negative(p=>p.lines[0].lineTotal=21,'LINE_TOTAL_MISMATCH','line arithmetic')
negative(p=>p.merchandiseSubtotal=21,'MERCHANDISE_SUBTOTAL_MISMATCH','subtotal arithmetic')
negative(p=>p.supplierId=randomUUID(),'SUPPLIER_UNAVAILABLE','unknown supplier')
negative(p=>p.lines[0].supplierProductId='missing','SUPPLIER_PRODUCT_UNAVAILABLE','unknown product')
for(const field of ['unitPrice','lineTotal','packageSize','packageCount','quantity']) negative(p=>p.confirmation.lines[0][field]+=0.001,'CONFIRMATION_NOT_EXACT',`exact ${field}, no tolerance`)
for(const field of ['supplierProductId','productIdentity','sku','packageUnit']) negative(p=>p.confirmation.lines[0][field]='different','CONFIRMATION_NOT_EXACT',`exact ${field}`)
negative(p=>p.confirmation.lines=[],'CONFIRMATION_NOT_EXACT','confirmation complete coverage')
negative(p=>p.confirmation.confirmedGrandTotal=26,'CONFIRMATION_NOT_EXACT','exact grand total')
negative(p=>delete p.confirmation.evidenceReference,'CONFIRMATION_REQUIRED_FIELD','confirmation evidence')
negative(p=>delete p.confirmation,'SHIPMENT_REQUIRES_CONFIRMATION','shipment needs confirmation')
negative(p=>p.shipment.status='physically_received','HISTORICAL_SHIPMENT_STATUS_INVALID','physical receipt forbidden')
negative(p=>delete p.shipment.reportedAt,'DELIVERY_EVIDENCE_DATE_REQUIRED','delivery date mandatory')
negative(p=>delete p.shipment.evidenceReference,'SHIPMENT_REQUIRED_FIELD','shipment evidence')
negative(p=>p.shipment.lines[0].quantity=201,'SHIPMENT_QUANTITY_INVALID','shipment arithmetic')
negative(p=>p.shipment.lines[0]={lineKey:'one',packageCount:3,quantity:300},'SHIPMENT_QUANTITY_INVALID','cannot ship above confirmed')
negative(p=>p.shipment.lines.push({...p.shipment.lines[0]}),'SHIPMENT_QUANTITY_EXCEEDS_CONFIRMED|duplicate key','duplicate shipment line')
rejected(reconcile(payload(),undefined,otherOwner),'WORKSPACE_UNAVAILABLE','wrong reconciliation owner')
rejected(reconcile(payload(),undefined,owner,otherWorkspace),'WORKSPACE_UNAVAILABLE','wrong reconciliation workspace')
const input=payload(),key=randomUUID(),result=JSON.parse(sql(reconcile(input,key)))
equal(result.recordOrigin,'historical_external','origin')
equal(result.confirmationState,'accepted_exact','exact confirmation')
equal(result.shipmentState,'delivery_reported','pre receipt terminal state')
equal(result.receivingCreated,false,'boundary result')
equal(JSON.parse(sql(reconcile(input,key))),result,'purchase replay identical IDs and state')
rejected(reconcile({...input,evidenceNote:'changed'},key),'IDEMPOTENCY_CONFLICT','purchase changed replay')
rejected(reconcile({...input,customerReference:'new'}),'EXTERNAL_ORDER_REFERENCE_CONFLICT','duplicate supplier reference')
const po=JSON.parse(sql(`select to_jsonb(o) from public.purchase_orders o where id='${result.purchaseOrderId}'`))
for(const field of ['source_purchase_plan_id','source_purchase_plan_revision','source_purchase_plan_basket_id','source_scenario_id','source_round_id','actual_vat','actual_import_vat','actual_duty','actual_customs','actual_handling','placed_by','placed_at']) equal(po[field],null,`${field} truthful null`)
equal(po.supplier_order_number,input.supplierOrderNumber,'supplier order retained')
equal(po.order_reference,input.customerReference,'customer reference retained')
equal(po.actual_grand_total,25,'historical price')
const ol=JSON.parse(sql(`select to_jsonb(l) from public.purchase_order_lines l where purchase_order_id='${po.id}'`))
equal(ol.actual_unit_price,10,'not catalogue price 999')
equal(ol.shipping_allocation,null,'no shipping allocation')
equal(ol.source_purchase_plan_line_id,null,'no fake plan line')
noDownstream()
rejected(`update public.purchase_orders set record_origin='planned' where id='${po.id}'`,'purchase_orders_origin_lineage','planned cannot lose lineage')
rejected(`update public.purchase_orders set source_purchase_plan_revision=1 where id='${po.id}'`,'purchase_orders_origin_lineage','historical cannot acquire contradictory lineage')
rejected(`update public.purchase_order_lines set record_origin='planned' where id='${ol.id}'`,'purchase_order_lines_origin_lineage','planned line cannot have null lineage')
rejected(`update public.purchase_order_lines set source_purchase_plan_line_id='${randomUUID()}' where id='${ol.id}'`,'purchase_order_lines_origin_lineage','historical line cannot carry plan lineage')
rejected(authenticated(`insert into public.purchase_orders(workspace_id,owner_id,supplier_id,created_by) values('${workspace}','${owner}','${supplier}','${owner}')`),'permission denied','no direct client inserts')
rejected(`set role anon; select public.reconcile_historical_external_purchase('${workspace}','${randomUUID()}',${json(input)})`,'permission denied','anonymous execute denied')
const orderOnly=payload(); delete orderOnly.confirmation; delete orderOnly.shipment
const only=JSON.parse(sql(reconcile(orderOnly)))
equal([only.purchaseOrderState,only.confirmationId,only.shipmentId],['placed',null,null],'order only supported')
const confirmed=payload(); delete confirmed.shipment
const confirmationOnly=JSON.parse(sql(reconcile(confirmed)))
equal([confirmationOnly.purchaseOrderState,confirmationOnly.confirmationState,confirmationOnly.shipmentId],['supplier_confirmed','accepted_exact',null],'confirmation only supported')
// Two real concurrent calls race on the same stable command key.
const concurrentInput=payload(),concurrentKey=randomUUID(),concurrentSql=reconcile(concurrentInput,concurrentKey)
const concurrentCall=()=>new Promise((resolve,reject)=>{const child=spawn('docker',dockerArgs);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>code?reject(new Error(err)):resolve(JSON.parse(out.trim())));child.stdin.end(concurrentSql)})
const [first,second]=await Promise.all([concurrentCall(),concurrentCall()]);equal(first,second,'concurrent retry single chain')
noDownstream()
const receipt=sql(authenticated(`select public.create_purchase_order_receipt('${po.id}',${result.purchaseOrderRevision},'${randomUUID()}',${json({shipmentIds:[result.shipmentId],physicalReceiptDate:'2025-02-10T09:00:00Z',packageCountReceived:1,receivingLocation:'Local test bench',evidenceReference:'separate-physical-receipt'})})`))
assert.match(receipt,/^[0-9a-f-]{36}$/);assertions++
equal(sql(`select status from public.purchase_order_shipments where id='${result.shipmentId}'`),'physically_received','only authoritative receiving transitions shipment')
equal(sql(`select count(*) from public.inventory_lots where workspace_id='${workspace}'`),'0','receipt still does not create stock')
equal(JSON.parse(sql(reconcile(input,key))),result,'replay remains original receipt after receiving')
// Planned regression: original creator, placement, confirmation, shipment and receipt.
const planId=randomUUID(),planLineId=randomUUID()
sql(`insert into public.purchase_plans(id,workspace_id,owner_id,title,supplier_id,currency,status) values('${planId}','${workspace}','${owner}','Planned regression','${supplier}','GBP','draft');
insert into public.purchase_plan_lines(id,workspace_id,owner_id,purchase_plan_id,inventory_domain,supplier_product_id,description,planned_quantity,unit,pack_count,pack_size,estimated_unit_price,estimated_line_total,currency)
values('${planLineId}','${workspace}','${owner}','${planId}','raw_material','product-a','Planned material',100,'g',1,100,10,10,'GBP');`)
rejected(authenticated(`select public.create_purchase_order_from_plan('${planId}','${randomUUID()}')`),'PURCHASE_PLAN_NOT_ELIGIBLE','draft plan cannot create PO')
sql(`update public.purchase_plans set status='approved' where id='${planId}'`)
const planned=sql(authenticated(`select public.create_purchase_order_from_plan('${planId}','${randomUUID()}')`))
equal(sql(`select record_origin||':'||source_purchase_plan_id::text from public.purchase_orders where id='${planned}'`),`planned:${planId}`,'planned creator keeps lineage')
const plannedLine=sql(`select id from public.purchase_order_lines where purchase_order_id='${planned}'`)
rejected(`update public.purchase_orders set source_purchase_plan_id=null where id='${planned}'`,'purchase_orders_origin_lineage','planned null plan rejected')
rejected(`update public.purchase_orders set source_purchase_plan_revision=null where id='${planned}'`,'purchase_orders_origin_lineage','planned null revision rejected')
rejected(`update public.purchase_order_lines set source_purchase_plan_line_id=null where id='${plannedLine}'`,'purchase_order_lines_origin_lineage','planned null line rejected')
rejected(`update public.purchase_order_lines set record_origin='historical_external',source_purchase_plan_line_id=null where id='${plannedLine}'`,'purchase_order_lines_order_origin_fk','line origin must match parent')
rejected(`update public.purchase_order_lines set purchase_order_id='${planned}' where id='${ol.id}'`,'purchase_order_lines_order_origin_fk','historical line cannot leak into planned PO')
sql(authenticated(`select public.record_purchase_order_placement('${planned}',1,'planned-${randomUUID()}','2025-02-01')`))
// Legacy placement does not have actual line snapshots; provide the same snapshots
// produced by verified placement before testing the unchanged downstream RPCs.
sql(`update public.purchase_orders set placement_revision=1,actual_currency='GBP',actual_grand_total=10 where id='${planned}';
update public.purchase_order_lines set actual_package_count=1,actual_unit_price=10,actual_line_subtotal=10 where id='${plannedLine}'`)
const pc=sql(authenticated(`select public.record_purchase_order_supplier_confirmation('${planned}',2,'${randomUUID()}',${json({supplierConfirmationReference:`planned-confirm-${randomUUID()}`,supplierConfirmationDate:'2025-02-01',confirmedCurrency:'GBP',confirmedGrandTotal:10,evidenceReference:'planned-confirm-evidence',lines:[{purchaseOrderLineId:plannedLine,confirmedProductIdentity:'Planned material',confirmedPackageSize:100,confirmedPackageUnit:'g',confirmedPackageCount:1,confirmedQuantity:100,confirmedUnitPrice:10,confirmedLineSubtotal:10,availabilityState:'confirmed'}]})})`))
sql(authenticated(`select public.decide_purchase_order_confirmation('${pc}',1,'accepted_exact','Exact','[]')`))
const pcl=sql(`select id from public.purchase_order_confirmation_lines where confirmation_id='${pc}'`)
const ps=sql(authenticated(`select public.create_purchase_order_shipment('${planned}','${pc}',3,'${randomUUID()}',${json({supplierShipmentReference:`planned-ship-${randomUUID()}`,evidenceReference:'planned-shipment-evidence',lines:[{confirmationLineId:pcl,shippedPackageCount:1,shippedQuantity:100}]})})`))
sql(authenticated(`select public.record_purchase_order_shipment_status('${ps}',1,'delivery_reported',${json({reportedAt:'2025-02-04',evidenceReference:'planned-delivery-evidence'})},'${randomUUID()}')`))
const plannedReceipt=sql(authenticated(`select public.create_purchase_order_receipt('${planned}',4,'${randomUUID()}',${json({shipmentIds:[ps],packageCountReceived:1,receivingLocation:'Local bench',evidenceReference:'planned-physical-evidence'})})`))
assert.match(plannedReceipt,/^[0-9a-f-]{36}$/);assertions++
equal(sql(`select count(*) from public.purchase_order_audit_events where purchase_order_id='${planned}' and source_purchase_plan_id is null`),'0','planned downstream audit retains plan')
sql(`update public.workspaces set lifecycle_state='failed' where id='${workspace}'`)
rejected(reconcile(input,key),'WORKSPACE_UNAVAILABLE','inactive workspace replay denied')
rejected(map(mapping,mapKey),'WORKSPACE_UNAVAILABLE','inactive mapping replay denied')
console.log(JSON.stringify({status:'PASS',assertions,database,productionWrites:0}))
