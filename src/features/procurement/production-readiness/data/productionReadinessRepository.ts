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
export interface DurableRoundAggregate {round:DurableRound;products:DurableRoundProduct[];requirements:DurableRequirement[];gaps:DurableGap[];specifications:DurablePurchasingSpecification[];candidates:DurableSupplierCandidate[];matches:DurableSupplierMatch[];supplierProducts:DurableSupplierProductSummary[]}
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
  return {
    round:numeric(roundResult.data,['revision']) as unknown as DurableRound,
    products:(productsResult.data??[]).map(row=>numeric(row,['planned_batch_count','batch_size','overage_percentage','expected_yield'])) as unknown as DurableRoundProduct[],
    requirements,
    gaps:(gapsResult.data??[]).map(row=>numeric(row,['on_hand_quantity','quarantined_quantity','expired_quantity','unavailable_quantity','reserved_quantity','allocated_quantity','usable_quantity','incoming_unreceived_quantity','net_usable_quantity','purchasing_gap'])) as unknown as DurableGap[],
    specifications:(specificationsResult.data??[]).map(row=>numeric(row,['revision'])) as unknown as DurablePurchasingSpecification[],
    candidates:(candidatesResult.data??[]).map(row=>numeric(row,['score'])) as unknown as DurableSupplierCandidate[],
    matches:(matchesResult.data??[]).map(row=>numeric(row,['match_score','selected_package_size','estimated_package_count','expected_purchased_quantity','expected_surplus','revision'])) as unknown as DurableSupplierMatch[],
    supplierProducts:(supplierProductsResult.data??[]).map(row=>numeric(row,['package_quantity','price'])) as unknown as DurableSupplierProductSummary[],
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
