import type { Json } from '../../../../platform/supabase/generated/database.types'
import { supabase } from '../../../../platform/supabase/client'
import type { InventoryUnit } from '../../../../types/domain'
import type { ProductionCategory, ReadinessState } from '../domain/productionReadiness'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DurableRound {
  id:string;workspace_id:string;title:string;status:'draft'|'requirements_ready'|'blocked'|'cancelled';base_currency:string;notes:string
  calculation_versions:Record<string,string>;revision:number;last_calculated_at:string|null;locked_at:string|null;created_at:string;updated_at:string
}
export interface DurableRoundProduct {
  id:string;round_id:string;category:ProductionCategory;product_id:string|null;product_name_snapshot:string|null;product_category_snapshot:string|null
  formula_id:string|null;formula_version_id:string|null;formula_version_label_snapshot:string|null;planned_batch_count:number;batch_size:number
  batch_unit:InventoryUnit;overage_percentage:number;expected_yield:number|null;deodorant_structure:string|null
  formula_readiness_status:ReadinessState;formula_readiness_codes:string[];formula_readiness_reasons:string[]
}
export interface DurableRequirement {
  id:string;round_id:string;ingredient_id:string;ingredient_name_snapshot:string;purchasing_unit:InventoryUnit;required_quantity:number
  overage_quantity:number;total_planned_quantity:number;calculation_version:string;calculated_at:string;state:'ready'|'warning'|'blocked';warnings:string[]
}
export interface DurableGap {
  id:string;requirement_id:string;on_hand_quantity:number;quarantined_quantity:number;expired_quantity:number;unavailable_quantity:number
  reserved_quantity:number;allocated_quantity:number;usable_quantity:number;incoming_unreceived_quantity:number|null;net_usable_quantity:number
  purchasing_gap:number;unit:InventoryUnit;snapshot_at:string;calculation_version:string;warnings:string[]
}
export interface DurablePurchasingSpecification {id:string;requirement_id:string;ingredient_id:string;specification:Record<string,unknown>;provenance:Record<string,string>;calculation_version:string;revision:number}
export interface DurableSupplierCandidate {id:string;requirement_id:string;supplier_product_id:string;mapping_id:string|null;status:'available'|'rejected'|'needs_research';classification:string;score:number;match_reasons:string[];mismatch_reasons:string[];warnings:string[];package_snapshot:Record<string,unknown>;documentation_snapshot:Record<string,unknown>;freshness_snapshot:Record<string,unknown>;commercial_snapshot:Record<string,unknown>;rejection_reason:string|null;owner_note:string}
export interface DurableSupplierMatch {id:string;requirement_id:string;selected_candidate_id:string|null;selected_supplier_product_id:string|null;status:'unresolved'|'candidates_available'|'selected'|'blocked'|'needs_review';match_score:number|null;match_explanation:string[];selected_package_size:number|null;selected_package_unit:string|null;estimated_package_count:number|null;expected_purchased_quantity:number|null;expected_surplus:number|null;warnings:string[];unresolved_reason:string|null;owner_note:string;revision:number}
export interface DurableSupplierProductSummary {id:string;supplier_id:string|null;supplier_name:string;product_name:string;product_url:string|null;package_quantity:number;package_unit:string;price:number;currency:string;availability_status:string|null;last_verified_date:string|null;grade:string|null;declared_inci:string|null}
export interface DurableScenario {id:string;round_id:string;strategy:string;status:'draft'|'published'|'incomplete'|'blocked';feasibility:string;calculation_version:string;source_round_revision:number;generated_at:string;stale_at:string|null;base_currency:string;mixed_currency:boolean;total_known_minimum:number|null;total_confirmed:number|null;total_estimated:number|null;total_range_minimum:number|null;total_range_maximum:number|null;original_currency_totals:Record<string,number>;unknown_commercial_components:string[];supplier_count:number;line_count:number;warning_count:number;blocker_count:number;stale_data_count:number;ranking_score:number|null;ranking_explanation:string[];strategy_weights:Record<string,number>;revision:number;published_at:string|null}
export interface DurableScenarioBasket {id:string;scenario_id:string;supplier_id:string;supplier_name_snapshot:string;supplier_url_snapshot:string|null;currency:string;merchandise_subtotal:number;eligible_subtotal:number;confirmed_discount:number;estimated_discount:number;post_discount_subtotal:number;shipping:number|null;shipping_state:string;vat:number|null;vat_state:string;import_vat:number|null;import_vat_state:string;customs:number|null;customs_state:string;handling:number|null;handling_state:string;known_minimum:number;confirmed_total:number|null;estimated_total:number|null;range_minimum:number|null;range_maximum:number|null;free_shipping_progress:Record<string,unknown>;warnings:string[];freshness_states:Record<string,string>;assumption_snapshot:Record<string,unknown>}
export interface DurableScenarioLine {id:string;scenario_id:string;basket_id:string;requirement_id:string;supplier_product_id:string;supplier_product_name_snapshot:string;product_url_snapshot:string|null;ingredient_name_snapshot:string;required_quantity:number;required_unit:string;package_size:number;package_unit:string;package_count:number;moq_adjusted_count:number;purchased_quantity:number;surplus:number;unit_price:number;currency:string;merchandise_line_total:number;discount_eligibility:string;allocated_discount:number;allocated_shipping:number|null;effective_landed_cost:number|null;effective_cost_per_required_unit:number|null;uncertainty:string[];warnings:string[]}
export interface DurablePurchasePlan {id:string;production_procurement_round_id:string;source_scenario_id:string;plan_version:number;title:string;status:'verification_required'|'checkout_ready'|'superseded'|'cancelled';strategy:string;strategy_explanation:string[];base_currency:string;mixed_currency:boolean;supplier_count:number;line_count:number;known_minimum:number|null;confirmed_total:number|null;estimated_landed_total:number|null;range_minimum:number|null;range_maximum:number|null;unknown_component_count:number;warning_count:number;blocker_count:number;approved_by:string;approved_at:string;superseded_by:string|null;superseded_at:string|null;cancelled_at:string|null;cancellation_reason:string|null;verification_revision:number;revision:number;snapshot_version:string}
export interface DurablePlanBasket {id:string;purchase_plan_id:string;supplier_id:string;supplier_name_snapshot:string;supplier_url_snapshot:string|null;currency:string;merchandise_subtotal:number;confirmed_discount:number;estimated_discount:number;shipping:number|null;shipping_state:string;vat_state:string;import_vat_state:string;customs_state:string;handling_state:string;known_minimum:number;confirmed_total:number|null;estimated_total:number|null;range_minimum:number|null;range_maximum:number|null;commercial_warnings:string[];freshness_states:Record<string,string>;verification_required_count:number;verification_completed_count:number}
export interface DurablePlanLine {id:string;purchase_plan_id:string;purchase_plan_basket_id:string;source_scenario_line_id:string;canonical_ingredient_id:string;ingredient_name_snapshot:string;inci_snapshot:string;supplier_product_id:string;supplier_product_name_snapshot:string;product_url_snapshot:string|null;pack_size:number;unit:string;pack_count:number;moq_adjusted_pack_count:number;required_quantity:number;purchased_quantity:number;expected_surplus:number;estimated_unit_price:number;currency:string;estimated_line_total:number;allocated_discount:number;allocated_shipping:number|null;expected_landed_cost:number|null;effective_cost_per_unit:number|null;documentation_state:Record<string,unknown>;price_freshness:string|null;stock_freshness:string|null;snapshot_warnings:string[]}
export interface DurablePlanVerification {id:string;purchase_plan_id:string;plan_version:number;purchase_plan_basket_id:string|null;purchase_plan_line_id:string|null;supplier_id:string|null;category:string;field:string;expected_value:unknown;expected_unit_or_currency:string|null;severity:'required'|'advisory';requirement_reason:string;source_freshness:string|null;verification_state:string;verification_method:string|null;verified_value:unknown;verified_unit_or_currency:string|null;evidence_reference:string|null;note:string;verified_at:string|null;mismatch_classification:string;resolution_state:string;policy_version:string;revision:number}
export interface DurablePlanAuditEvent {id:string;purchase_plan_id:string;plan_version:number;event_type:string;actor_id:string;occurred_at:string;prior_state:string|null;new_state:string|null;reason:string;metadata:Record<string,unknown>}
export interface DurableDraftPurchaseOrder {id:string;supplier_id:string;source_purchase_plan_id:string;source_purchase_plan_version:number;source_purchase_plan_basket_id:string;status:'draft'|'cancelled'|'placed'|'confirmed'|'partially_fulfilled'|'fulfilled';currency:string;merchandise_subtotal:number|null;discount:number|null;shipping:number|null;tax:number|null;total:number|null;supplier_url_snapshot:string|null;handoff_policy_version:string;draft_created_at:string;cancelled_at:string|null;cancellation_reason:string|null;supplier_snapshot:Record<string,unknown>;commercial_snapshot:Record<string,unknown>;verification_snapshot:Record<string,unknown>;manual_checkout_checklist:string[];revision:number}
export interface DurableDraftPurchaseOrderLine {id:string;purchase_order_id:string;source_purchase_plan_line_id:string;source_purchase_plan_basket_id:string;product_name_snapshot:string;ingredient_name_snapshot:string;product_url_snapshot:string|null;ordered_package_count:number;ordered_quantity:number;ordered_unit:string;expected_unit_price:number|null;verified_unit_price:number|null;effective_unit_price:number|null;effective_value_source:'approved_snapshot'|'checkout_verification';currency:string;line_subtotal:number|null;verification_snapshot:Record<string,unknown>}
export interface DurablePurchaseOrderAuditEvent {id:string;purchase_order_id:string;event_type:string;prior_state:string|null;new_state:string|null;reason:string;metadata:Record<string,unknown>;occurred_at:string}
export interface DurableRoundAggregate {round:DurableRound;products:DurableRoundProduct[];requirements:DurableRequirement[];gaps:DurableGap[];specifications:DurablePurchasingSpecification[];candidates:DurableSupplierCandidate[];matches:DurableSupplierMatch[];supplierProducts:DurableSupplierProductSummary[];scenarios:DurableScenario[];scenarioBaskets:DurableScenarioBasket[];scenarioLines:DurableScenarioLine[];purchasePlans:DurablePurchasePlan[];planBaskets:DurablePlanBasket[];planLines:DurablePlanLine[];planVerifications:DurablePlanVerification[];planAuditEvents:DurablePlanAuditEvent[];draftOrders:DurableDraftPurchaseOrder[];draftOrderLines:DurableDraftPurchaseOrderLine[];draftOrderAuditEvents:DurablePurchaseOrderAuditEvent[]}
export interface RoundProductSelection {
  category:ProductionCategory;productId:string|null;formulaVersionId:string|null;batchCount:number;batchSize:number;batchUnit:InventoryUnit
  overagePercent:number;expectedYield:number|null;deodorantStructure:string|null
}

const client=():SupabaseClient=>{if(!supabase)throw new Error('Supabase is not configured.');return supabase as unknown as SupabaseClient}
const numeric=<T extends Record<string,unknown>>(row:T,fields:string[])=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,fields.includes(key)&&value!=null?Number(value):value])) as T

export async function listProductionRounds(workspaceId:string){
  const result=await client().from('production_procurement_rounds').select('*').eq('workspace_id',workspaceId).order('updated_at',{ascending:false})
  if(result.error)throw new Error(result.error.message)
  return (result.data??[]).map(row=>numeric(row,['revision'])) as unknown as DurableRound[]
}
export async function loadProductionRound(workspaceId:string,roundId:string):Promise<DurableRoundAggregate>{
  const database=client()
  const [roundResult,productsResult,requirementsResult]=await Promise.all([
    database.from('production_procurement_rounds').select('*').eq('workspace_id',workspaceId).eq('id',roundId).single(),
    database.from('production_procurement_round_products').select('*').eq('workspace_id',workspaceId).eq('round_id',roundId).order('category'),
    database.from('production_procurement_requirements').select('*').eq('workspace_id',workspaceId).eq('round_id',roundId).order('ingredient_name_snapshot'),
  ])
  if(roundResult.error)throw new Error(roundResult.error.message)
  if(productsResult.error)throw new Error(productsResult.error.message)
  if(requirementsResult.error)throw new Error(requirementsResult.error.message)
  const requirements=(requirementsResult.data??[]).map(row=>numeric(row,['required_quantity','overage_quantity','total_planned_quantity'])) as unknown as DurableRequirement[]
  const ids=requirements.map(item=>item.id)
  const [gapsResult,specificationsResult,candidatesResult,matchesResult]=ids.length?await Promise.all([
    database.from('production_procurement_inventory_gaps').select('*').eq('workspace_id',workspaceId).in('requirement_id',ids),
    database.from('production_purchasing_specifications').select('*').eq('workspace_id',workspaceId).in('requirement_id',ids),
    database.from('production_requirement_supplier_candidates').select('*').eq('workspace_id',workspaceId).in('requirement_id',ids).order('score',{ascending:false}).order('supplier_product_id'),
    database.from('production_requirement_supplier_matches').select('*').eq('workspace_id',workspaceId).in('requirement_id',ids),
  ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null},{data:[],error:null}]
  for(const result of [gapsResult,specificationsResult,candidatesResult,matchesResult])if(result.error)throw new Error(result.error.message)
  const supplierProductIds=[...new Set((candidatesResult.data??[]).map((row:Record<string,unknown>)=>String(row.supplier_product_id)))]
  const supplierProductsResult=supplierProductIds.length?await database.from('supplier_products').select('id,supplier_id,supplier_name,product_name,product_url,package_quantity,package_unit,price,currency,availability_status,last_verified_date,grade,declared_inci').eq('workspace_id',workspaceId).in('id',supplierProductIds):{data:[],error:null}
  if(supplierProductsResult.error)throw new Error(supplierProductsResult.error.message)
  const scenariosResult=await database.from('production_procurement_scenarios').select('*').eq('workspace_id',workspaceId).eq('round_id',roundId).order('generated_at',{ascending:false}).order('strategy')
  if(scenariosResult.error)throw new Error(scenariosResult.error.message)
  const scenarioIds=(scenariosResult.data??[]).map((row:Record<string,unknown>)=>String(row.id))
  const [scenarioBasketsResult,scenarioLinesResult]=scenarioIds.length?await Promise.all([
    database.from('production_procurement_scenario_baskets').select('*').eq('workspace_id',workspaceId).in('scenario_id',scenarioIds).order('supplier_name_snapshot'),
    database.from('production_procurement_scenario_lines').select('*').eq('workspace_id',workspaceId).in('scenario_id',scenarioIds).order('ingredient_name_snapshot'),
  ]):[{data:[],error:null},{data:[],error:null}]
  if(scenarioBasketsResult.error)throw new Error(scenarioBasketsResult.error.message)
  if(scenarioLinesResult.error)throw new Error(scenarioLinesResult.error.message)
  const plansResult=await database.from('purchase_plans').select('*').eq('workspace_id',workspaceId).eq('production_procurement_round_id',roundId).order('plan_version',{ascending:false})
  if(plansResult.error)throw new Error(plansResult.error.message)
  const planIds=(plansResult.data??[]).map((row:Record<string,unknown>)=>String(row.id))
  const [planBasketsResult,planLinesResult,planVerificationsResult,planAuditResult,draftOrdersResult]=planIds.length?await Promise.all([
    database.from('purchase_plan_baskets').select('*').eq('workspace_id',workspaceId).in('purchase_plan_id',planIds).order('supplier_name_snapshot'),
    database.from('purchase_plan_lines').select('*').eq('workspace_id',workspaceId).in('purchase_plan_id',planIds).order('ingredient_name_snapshot'),
    database.from('purchase_plan_verifications').select('*').eq('workspace_id',workspaceId).in('purchase_plan_id',planIds).order('category').order('field'),
    database.from('purchase_plan_audit_events').select('*').eq('workspace_id',workspaceId).in('purchase_plan_id',planIds).order('occurred_at',{ascending:false}),
    database.from('purchase_orders').select('*').eq('workspace_id',workspaceId).in('source_purchase_plan_id',planIds).not('source_purchase_plan_basket_id','is',null).order('draft_created_at'),
  ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null},{data:[],error:null},{data:[],error:null}]
  for(const result of [planBasketsResult,planLinesResult,planVerificationsResult,planAuditResult,draftOrdersResult])if(result.error)throw new Error(result.error.message)
  const orderIds=(draftOrdersResult.data??[]).map((row:Record<string,unknown>)=>String(row.id))
  const [draftLinesResult,draftAuditResult]=orderIds.length?await Promise.all([
    database.from('purchase_order_lines').select('*').eq('workspace_id',workspaceId).in('purchase_order_id',orderIds).order('ingredient_name_snapshot'),
    database.from('purchase_order_audit_events').select('*').eq('workspace_id',workspaceId).in('purchase_order_id',orderIds).order('occurred_at',{ascending:false}),
  ]):[{data:[],error:null},{data:[],error:null}]
  for(const result of [draftLinesResult,draftAuditResult])if(result.error)throw new Error(result.error.message)
  return {
    round:numeric(roundResult.data,['revision']) as unknown as DurableRound,
    products:(productsResult.data??[]).map(row=>numeric(row,['planned_batch_count','batch_size','overage_percentage','expected_yield'])) as unknown as DurableRoundProduct[],
    requirements,
    gaps:(gapsResult.data??[]).map(row=>numeric(row,['on_hand_quantity','quarantined_quantity','expired_quantity','unavailable_quantity','reserved_quantity','allocated_quantity','usable_quantity','incoming_unreceived_quantity','net_usable_quantity','purchasing_gap'])) as unknown as DurableGap[],
    specifications:(specificationsResult.data??[]).map(row=>numeric(row,['revision'])) as unknown as DurablePurchasingSpecification[],
    candidates:(candidatesResult.data??[]).map(row=>numeric(row,['score'])) as unknown as DurableSupplierCandidate[],
    matches:(matchesResult.data??[]).map(row=>numeric(row,['match_score','selected_package_size','estimated_package_count','expected_purchased_quantity','expected_surplus','revision'])) as unknown as DurableSupplierMatch[],
    supplierProducts:(supplierProductsResult.data??[]).map(row=>numeric(row,['package_quantity','price'])) as unknown as DurableSupplierProductSummary[],
    scenarios:(scenariosResult.data??[]).map(row=>numeric(row,['source_round_revision','total_known_minimum','total_confirmed','total_estimated','total_range_minimum','total_range_maximum','supplier_count','line_count','warning_count','blocker_count','stale_data_count','ranking_score','revision'])) as unknown as DurableScenario[],
    scenarioBaskets:(scenarioBasketsResult.data??[]).map(row=>numeric(row,['merchandise_subtotal','eligible_subtotal','confirmed_discount','estimated_discount','post_discount_subtotal','shipping','vat','import_vat','customs','handling','known_minimum','confirmed_total','estimated_total','range_minimum','range_maximum'])) as unknown as DurableScenarioBasket[],
    scenarioLines:(scenarioLinesResult.data??[]).map(row=>numeric(row,['required_quantity','package_size','package_count','moq_adjusted_count','purchased_quantity','surplus','unit_price','merchandise_line_total','allocated_discount','allocated_shipping','effective_landed_cost','effective_cost_per_required_unit'])) as unknown as DurableScenarioLine[],
    purchasePlans:(plansResult.data??[]).map(row=>numeric(row,['plan_version','supplier_count','line_count','known_minimum','confirmed_total','estimated_landed_total','range_minimum','range_maximum','unknown_component_count','warning_count','blocker_count','verification_revision','revision'])) as unknown as DurablePurchasePlan[],
    planBaskets:(planBasketsResult.data??[]).map(row=>numeric(row,['merchandise_subtotal','confirmed_discount','estimated_discount','shipping','known_minimum','confirmed_total','estimated_total','range_minimum','range_maximum','verification_required_count','verification_completed_count'])) as unknown as DurablePlanBasket[],
    planLines:(planLinesResult.data??[]).map(row=>numeric(row,['pack_size','pack_count','moq_adjusted_pack_count','required_quantity','purchased_quantity','expected_surplus','estimated_unit_price','estimated_line_total','allocated_discount','allocated_shipping','expected_landed_cost','effective_cost_per_unit'])) as unknown as DurablePlanLine[],
    planVerifications:(planVerificationsResult.data??[]).map(row=>numeric(row,['plan_version','revision'])) as unknown as DurablePlanVerification[],
    planAuditEvents:(planAuditResult.data??[]).map(row=>numeric(row,['plan_version'])) as unknown as DurablePlanAuditEvent[],
    draftOrders:(draftOrdersResult.data??[]).map(row=>numeric(row,['source_purchase_plan_version','merchandise_subtotal','discount','shipping','tax','total','revision'])) as unknown as DurableDraftPurchaseOrder[],
    draftOrderLines:(draftLinesResult.data??[]).map(row=>numeric(row,['ordered_package_count','ordered_quantity','expected_unit_price','verified_unit_price','effective_unit_price','line_subtotal'])) as unknown as DurableDraftPurchaseOrderLine[],
    draftOrderAuditEvents:(draftAuditResult.data??[]) as unknown as DurablePurchaseOrderAuditEvent[],
  }
}
export async function createProductionRound(workspaceId:string,title:string){
  const result=await client().rpc('create_production_procurement_round',{candidate_workspace_id:workspaceId,candidate_title:title,candidate_notes:'',candidate_base_currency:'NOK',idempotency_key:crypto.randomUUID()})
  if(result.error)throw new Error(result.error.message)
  return result.data as string
}
export async function saveProductionRound(round:DurableRound,title:string,notes:string,selections:RoundProductSelection[]){
  const result=await client().rpc('update_production_procurement_round_products',{target_round_id:round.id,expected_revision:round.revision,round_title:title,round_notes:notes,product_selections:selections as unknown as Json})
  if(result.error)throw new Error(result.error.message)
  return Number(result.data)
}
export async function regenerateProductionRound(round:DurableRound){
  const result=await client().rpc('regenerate_production_procurement_requirements',{target_round_id:round.id,expected_revision:round.revision})
  if(result.error)throw new Error(result.error.message)
  return Number(result.data)
}
export async function cancelProductionRound(round:DurableRound){
  const result=await client().rpc('cancel_production_procurement_round',{target_round_id:round.id,expected_revision:round.revision})
  if(result.error)throw new Error(result.error.message)
  return Number(result.data)
}
export async function generateRequirementCandidates(requirementId:string,round:DurableRound){
  const result=await client().rpc('generate_production_requirement_candidates',{target_requirement_id:requirementId,expected_round_revision:round.revision})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function acceptSupplierProductMapping(requirementId:string,supplierProductId:string,round:DurableRound,note=''){
  const result=await client().rpc('accept_supplier_product_ingredient_mapping',{target_requirement_id:requirementId,target_supplier_product_id:supplierProductId,expected_round_revision:round.revision,acceptance_note:note})
  if(result.error)throw new Error(result.error.message);return String(result.data)
}
export async function selectRequirementCandidate(requirementId:string,candidateId:string,round:DurableRound,matchRevision:number){
  const result=await client().rpc('select_production_requirement_supplier_product',{target_requirement_id:requirementId,target_candidate_id:candidateId,expected_round_revision:round.revision,expected_match_revision:matchRevision})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function rejectRequirementCandidate(candidateId:string,round:DurableRound,reason:string){
  const result=await client().rpc('reject_production_requirement_candidate',{target_candidate_id:candidateId,expected_round_revision:round.revision,rejection_note:reason})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function clearRequirementMatch(requirementId:string,round:DurableRound,matchRevision:number,reason?:string){
  const result=await client().rpc('clear_production_requirement_match',{target_requirement_id:requirementId,expected_round_revision:round.revision,expected_match_revision:matchRevision,unresolved_note:reason??null})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function generateProductionScenarios(round:DurableRound){
  const result=await client().rpc('generate_production_procurement_scenarios',{target_round_id:round.id,expected_round_revision:round.revision})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function publishProductionScenario(scenario:DurableScenario,round:DurableRound){
  const result=await client().rpc('publish_production_procurement_scenario',{target_scenario_id:scenario.id,expected_scenario_revision:scenario.revision,expected_round_revision:round.revision})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function deleteDraftProductionScenario(scenario:DurableScenario,round:DurableRound){
  const result=await client().rpc('delete_draft_production_procurement_scenario',{target_scenario_id:scenario.id,expected_scenario_revision:scenario.revision,expected_round_revision:round.revision})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function approveProductionScenario(scenario:DurableScenario,replacesPlanId?:string){
  const result=await client().rpc('approve_production_procurement_scenario',{target_scenario_id:scenario.id,expected_scenario_revision:scenario.revision,candidate_approval_key:crypto.randomUUID(),candidate_title:null,candidate_notes:null,target_replaces_plan_id:replacesPlanId??null})
  if(result.error)throw new Error(result.error.message);return String(result.data)
}
export async function recordPlanVerification(item:DurablePlanVerification,state:'confirmed'|'changed'|'unavailable'|'not_applicable',value:unknown,unit:string,note:string,evidence:string){
  const result=await client().rpc('record_purchase_plan_verification',{target_verification_id:item.id,expected_revision:item.revision,candidate_state:state,candidate_verified_value:value as Json,candidate_unit_or_currency:unit,candidate_method:'manual_owner_check',candidate_evidence:evidence,candidate_note:note})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function waivePlanVerification(item:DurablePlanVerification,reason:string){
  const result=await client().rpc('waive_purchase_plan_verification',{target_verification_id:item.id,expected_revision:item.revision,waiver_reason:reason})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function markPlanCheckoutReady(plan:DurablePurchasePlan){
  const result=await client().rpc('mark_purchase_plan_checkout_ready',{target_plan_id:plan.id,expected_verification_revision:plan.verification_revision})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function cancelInternalPlan(plan:DurablePurchasePlan,reason:string){
  const result=await client().rpc('cancel_internal_purchase_plan',{target_plan_id:plan.id,expected_revision:plan.revision,candidate_cancellation_reason:reason})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
export async function createDraftPurchaseOrders(plan:DurablePurchasePlan,handoffKey=crypto.randomUUID()){
  const result=await client().rpc('create_draft_purchase_orders_from_plan',{target_plan_id:plan.id,expected_plan_revision:plan.revision,candidate_handoff_key:handoffKey})
  if(result.error)throw new Error(result.error.message);return result.data as string[]
}
export async function cancelDraftPurchaseOrder(order:DurableDraftPurchaseOrder,reason:string){
  const result=await client().rpc('cancel_draft_purchase_order',{target_order_id:order.id,expected_revision:order.revision,candidate_reason:reason})
  if(result.error)throw new Error(result.error.message);return Number(result.data)
}
