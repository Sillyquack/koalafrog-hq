import { products } from './mockData'
import type { FormulaState } from '../types/domain'
import { inventoryLots, inventoryMovements, supplierProducts } from './inventorySeed'
import { ingredients } from './mockData'
import { labBatchAllocations, labBatchLines, labBatches, labObservations, processSteps, testers, testResponses, testSessions, testTemplates } from './labSeed'
import { costLines, productionProcessSteps, productionRunAllocations, productionRunLines, productionRuns } from './productionSeed'
import { finishedGoodsBatches,finishedGoodsMovements,packagingAllocations,packagingComponents,packagingInventoryLots,packagingInventoryMovements,packagingSpecifications,packagingSpecificationLines,packagingSpecificationVersions,packagingSupplierProducts } from './packagingSeed'
import { claimEvidence,claims,complianceDocuments,complianceDossiers,cpnpRecords,cpsrRecords,inciDrafts,labelArtworkVersions,labelReviewItems,launchDecisions,launchMilestones,launchPlans,pifSections,readinessIssues,regulatoryReviews,regulatorySources,responsiblePersons,safetyEffectRecords } from './complianceSeed'

type SeedLine = readonly [string, number, string, string]
const baseLines: readonly SeedLine[] = [
  ['i1', 60, 'Phase A', 'Primary lightweight carrier'],
  ['i2', 25, 'Phase A', 'Dry slip and finish'],
  ['i9', 10, 'Phase A', 'Body and controlled glide'],
  ['i10', 4, 'Fragrance', 'Internal development scent blend'],
  ['i5', 1, 'Final Additions', 'Add after main blend'],
] as const

const linesFor = (versionId: string, percentages: readonly SeedLine[] = baseLines) => percentages.map(([ingredientId, percentage, phase, notes], index) => ({ id: `fl-${versionId}-${index + 1}`, formulaVersionId: versionId, ingredientId, percentage, phase, sortOrder: index + 1, notes }))

export const formulaSeed: FormulaState = {
  beardStudio:{revision:0,profiles:[],lengthMaps:[],tools:[],recipes:[],sessions:[],logs:[]},
  ingredientKnowledgeProfiles:[],ingredientKnowledgeRoles:[],ingredientKnowledgeCompatibility:[],ingredientKnowledgeEvidence:[],
  productStudioConcepts:[],
  products,
  formulas: [
    { id: 'f-bo-original', productId: 'p1', name: 'Original Formula', description: 'Core dry-touch beard oil development formula.', createdAt: '2026-03-02', updatedAt: '2026-07-14' },
    { id: 'f-bo-summer', productId: 'p1', name: 'Summer Lightweight Formula', description: 'A lighter seasonal direction with quicker absorption.', createdAt: '2026-06-10', updatedAt: '2026-07-10' },
    { id: 'f-bb-original', productId: 'p2', name: 'Original Butter Formula', description: 'Controlled-melt beard butter texture study.', createdAt: '2026-04-18', updatedAt: '2026-07-12' },
  ],
  formulaVersions: [
    { id: 'fv-bo-01', formulaId: 'f-bo-original', version: 'v0.1', status: 'Retired', description: 'First balanced carrier study.', targetCharacteristics: 'Medium glide, clean finish, subtle woody profile.', createdAt: '2026-03-02', updatedAt: '2026-04-10' },
    { id: 'fv-bo-02', formulaId: 'f-bo-original', version: 'v0.2', status: 'Approved', description: 'Reduced perceived heaviness and refined scent load.', targetCharacteristics: 'Dry touch within five minutes; calm woody-spice trail.', processInstructions: 'Combine Phase A with gentle stirring. Add fragrance and final additions below 35°C.', developmentNotes: 'Development/demo approval status only. Not a safety, compliance, or commercial approval.', approvedAt:'2026-07-14', createdAt: '2026-04-11', updatedAt: '2026-07-14', derivedFromVersionId: 'fv-bo-01' },
    { id: 'fv-bo-s-01', formulaId: 'f-bo-summer', version: 'v0.1', status: 'Draft', description: 'Early lightweight seasonal study.', targetCharacteristics: 'Very light wear and restrained scent.', createdAt: '2026-06-10', updatedAt: '2026-07-10' },
    { id: 'fv-bb-01', formulaId: 'f-bb-original', version: 'v0.4', status: 'Draft', description: 'Cooling curve and butter-ratio iteration.', targetCharacteristics: 'Soft scoop, clean melt, minimal wax drag.', createdAt: '2026-07-01', updatedAt: '2026-07-12' },
  ],
  formulaLines: [
    ...linesFor('fv-bo-01'),
    ...linesFor('fv-bo-02'),
    ...linesFor('fv-bo-s-01', [['i1', 68, 'Phase A', ''], ['i2', 25, 'Phase A', ''], ['i10', 5, 'Fragrance', ''], ['i5', 1, 'Final Additions', '']]),
    ...linesFor('fv-bb-01', [['i1', 32, 'Phase A', ''], ['i3', 45, 'Phase A', ''], ['i4', 15, 'Phase B', ''], ['i6', 4, 'Fragrance', ''], ['i5', 1, 'Cool Down', '']]),
  ],
  ingredients,
  supplierProducts,
  inventoryLots,
  inventoryMovements,
  labBatches, labBatchLines, labBatchAllocations, processSteps, labObservations, testers, testTemplates, testSessions, testResponses,
  productionRuns, productionRunLines, productionRunAllocations, productionProcessSteps, costLines,
  packagingComponents,packagingSupplierProducts,packagingInventoryLots,packagingInventoryMovements,packagingSpecifications,packagingSpecificationVersions,packagingSpecificationLines,packagingAllocations,finishedGoodsBatches,finishedGoodsMovements,
  responsiblePersons,complianceDossiers,complianceDocuments,regulatorySources,regulatoryReviews,pifSections,cpsrRecords,labelArtworkVersions,labelReviewItems,inciDrafts,claims,claimEvidence,cpnpRecords,readinessIssues,launchPlans,launchMilestones,launchDecisions,safetyEffectRecords,
}
