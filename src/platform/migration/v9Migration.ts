import type { FormulaState } from '../../types/domain'
import { finishedGoodsBalance } from '../../features/finished-goods/domain/finishedGoodsLogic'
import { lotBalance } from '../../features/inventory/domain/inventoryLogic'
import { packagingLotBalance } from '../../features/packaging/domain/packagingLogic'
export type MigrationSeverity='blocking'|'warning'
export interface MigrationFinding {severity:MigrationSeverity;collection:string;recordId?:string;message:string}
const parentChecks:Array<[keyof FormulaState,keyof FormulaState,string,string]>=[['formulas','products','productId','id'],['formulaVersions','formulas','formulaId','id'],['formulaLines','formulaVersions','formulaVersionId','id'],['inventoryMovements','inventoryLots','inventoryLotId','id'],['productionRuns','formulaVersions','formulaVersionId','id'],['finishedGoodsBatches','productionRuns','productionRunId','id'],['complianceDossiers','products','productId','id'],['launchPlans','complianceDossiers','complianceDossierId','id']]
export function validateV9Workspace(state:FormulaState){const findings:MigrationFinding[]=[];let ready=0;for(const [name,records] of Object.entries(state)){if(!Array.isArray(records))continue;const ids=new Set<string>();for(const record of records as Array<{id?:string}>){if(!record.id){findings.push({severity:'blocking',collection:name,message:'Record is missing id.'});continue}if(ids.has(record.id))findings.push({severity:'blocking',collection:name,recordId:record.id,message:'Duplicate ID.'});ids.add(record.id);ready++}}
for(const [childKey,parentKey,fk,pk] of parentChecks){const parents=new Set((state[parentKey] as unknown as Array<Record<string,string>>).map(x=>x[pk]));for(const child of state[childKey] as unknown as Array<Record<string,string>>){if(child[fk]&&!parents.has(child[fk]))findings.push({severity:'blocking',collection:String(childKey),recordId:child.id,message:`Missing parent ${String(parentKey)}.${child[fk]}`})}}
const uniqueChecks:Array<[keyof FormulaState,string]>=[['inventoryLots','internalLotNumber'],['productionRuns','productionRunNumber'],['packagingInventoryLots','internalLotNumber'],['finishedGoodsBatches','finishedGoodsBatchNumber']];for(const [key,field] of uniqueChecks){const seen=new Set();for(const item of state[key] as unknown as Array<Record<string,string>>){if(seen.has(item[field]))findings.push({severity:'blocking',collection:String(key),recordId:item.id,message:`Duplicate ${field}.`});seen.add(item[field])}}
return{sourceVersion:'v9',recordsReady:ready,findings,blockingErrors:findings.filter(x=>x.severity==='blocking').length,warnings:findings.filter(x=>x.severity==='warning').length,state:findings.some(x=>x.severity==='blocking')?'Validation Failed':'Ready to Import' as const,entityCounts:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,Array.isArray(v)?v.length:0]))}}
export function reconciliationSnapshot(state:FormulaState){return{counts:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,Array.isArray(v)?v.length:0])),rawMaterialBalances:Object.fromEntries(state.inventoryLots.map(l=>[l.id,lotBalance(l,state.inventoryMovements)])),packagingBalances:Object.fromEntries(state.packagingInventoryLots.map(l=>[l.id,packagingLotBalance(l,state.packagingInventoryMovements)])),finishedGoodsBalances:Object.fromEntries(state.finishedGoodsBatches.map(b=>[b.id,finishedGoodsBalance(b,state.finishedGoodsMovements)])),complianceConfigurations:state.complianceDossiers.map(d=>[d.id,d.productId,d.formulaVersionId,d.packagingSpecificationVersionId]),launchReferences:state.launchPlans.map(p=>[p.id,p.complianceDossierId])}}
export function compareReconciliation(local:ReturnType<typeof reconciliationSnapshot>,remote:ReturnType<typeof reconciliationSnapshot>){const sections=Object.keys(local) as Array<keyof typeof local>;const results=sections.map(section=>({section,matched:JSON.stringify(local[section])===JSON.stringify(remote[section])}));return{results,complete:results.every(x=>x.matched)}}
export const migrationCollectionOrder: (keyof FormulaState)[] = [
  'products', 'ingredients', 'formulas', 'formulaVersions', 'formulaLines',
  'supplierProducts', 'inventoryLots', 'inventoryMovements',
  'labBatches', 'labBatchLines', 'labBatchAllocations', 'processSteps', 'labObservations',
  'testers', 'testTemplates', 'testSessions', 'testResponses',
  'productionRuns', 'productionRunLines', 'productionRunAllocations', 'productionProcessSteps', 'costLines',
  'packagingComponents', 'packagingSupplierProducts', 'packagingInventoryLots',
  'packagingInventoryMovements', 'packagingSpecifications', 'packagingSpecificationVersions',
  'packagingSpecificationLines', 'finishedGoodsBatches', 'packagingAllocations', 'finishedGoodsMovements',
  'responsiblePersons', 'regulatorySources', 'complianceDocuments', 'labelArtworkVersions',
  'complianceDossiers', 'regulatoryReviews', 'pifSections', 'cpsrRecords', 'labelReviewItems',
  'inciDrafts', 'claims', 'claimEvidence', 'cpnpRecords', 'readinessIssues',
  'launchPlans', 'launchMilestones', 'launchDecisions', 'safetyEffectRecords',
]
