export type ProductStage = 'Idea' | 'Research' | 'Formulation' | 'Testing' | 'Validation' | 'Compliance' | 'Production Ready' | 'Launched'
export type ProductStatus = 'Active' | 'On hold' | 'Archived'

export interface Product {
  id: string
  name: string
  category: string
  status: ProductStatus
  developmentStage: ProductStage
  description: string
  currentDevelopmentFormulaVersionId?: string
  currentApprovedFormulaVersionId?: string
  scentProfile: string
  targetLaunchDate: string
  createdAt: string
  updatedAt: string
}

export interface Formula {
  id: string
  productId: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export type FormulaVersionStatus = 'Draft' | 'Candidate' | 'Approved' | 'Retired'
export interface FormulaVersion {
  id: string
  formulaId: string
  version: string
  status: FormulaVersionStatus
  description: string
  targetCharacteristics: string
  processInstructions?: string
  developmentNotes?: string
  approvedAt?: string
  createdAt: string
  updatedAt: string
  derivedFromVersionId?: string
}

export interface FormulaLine {
  id: string
  formulaVersionId: string
  ingredientId: string
  percentage: number
  phase: string
  sortOrder: number
  notes: string
}

export interface FormulaState {
  products: Product[]
  formulas: Formula[]
  formulaVersions: FormulaVersion[]
  formulaLines: FormulaLine[]
  ingredients: Ingredient[]
  supplierProducts: SupplierProduct[]
  inventoryLots: InventoryLot[]
  inventoryMovements: InventoryMovement[]
  labBatches: LabBatch[]
  labBatchLines: LabBatchLine[]
  labBatchAllocations: LabBatchAllocation[]
  processSteps: BatchProcessStep[]
  labObservations: LabObservation[]
  testers: Tester[]
  testTemplates: TestTemplate[]
  testSessions: TestSession[]
  testResponses: TestResponse[]
  productionRuns: ProductionRun[]
  productionRunLines: ProductionRunLine[]
  productionRunAllocations: ProductionRunAllocation[]
  productionProcessSteps: ProductionProcessStep[]
  costLines: CostLine[]
  packagingComponents: PackagingComponent[]
  packagingSupplierProducts: PackagingSupplierProduct[]
  packagingInventoryLots: PackagingInventoryLot[]
  packagingInventoryMovements: PackagingInventoryMovement[]
  packagingSpecifications: PackagingSpecification[]
  packagingSpecificationVersions: PackagingSpecificationVersion[]
  packagingSpecificationLines: PackagingSpecificationLine[]
  packagingAllocations: PackagingAllocation[]
  finishedGoodsBatches: FinishedGoodsBatch[]
  finishedGoodsMovements: FinishedGoodsMovement[]
  responsiblePersons: ResponsiblePerson[]
  complianceDossiers: ComplianceDossier[]
  complianceDocuments: ComplianceDocument[]
  regulatorySources: RegulatorySource[]
  regulatoryReviews: RegulatoryReview[]
  pifSections: PifSection[]
  cpsrRecords: CpsrRecord[]
  labelArtworkVersions: LabelArtworkVersion[]
  labelReviewItems: LabelReviewItem[]
  inciDrafts: InciDraft[]
  claims: ComplianceClaim[]
  claimEvidence: ClaimEvidence[]
  cpnpRecords: CpnpRecord[]
  readinessIssues: ReadinessIssue[]
  launchPlans: LaunchPlan[]
  launchMilestones: LaunchMilestone[]
  launchDecisions: LaunchDecision[]
  safetyEffectRecords: SafetyEffectRecord[]
}

export type IngredientStatus = 'Active' | 'Research' | 'Archived'
export type InventoryUnit = 'g' | 'kg' | 'ml' | 'L' | 'pcs'
export interface Ingredient {
  id: string
  commonName: string
  inciName: string
  category: string
  functions: string[]
  description: string
  defaultUnit: InventoryUnit
  reorderThreshold?: number
  notes: string
  status: IngredientStatus
  createdAt: string
  updatedAt: string
}

export interface SupplierProduct {
  id: string; ingredientId: string; supplierName: string; productName: string; supplierSku?: string
  packageQuantity: number; packageUnit: InventoryUnit; price: number; currency: string; productUrl?: string
  notes: string; isPreferred: boolean; createdAt: string; updatedAt: string
}
export type InventoryLotStatus = 'Active' | 'Quarantined' | 'Exhausted' | 'Expired' | 'Disposed'
export interface InventoryLot {
  id: string; ingredientId: string; supplierProductId?: string; internalLotNumber: string; supplierLotNumber?: string
  receivedDate: string; openingQuantity: number; unit: InventoryUnit; expiryDate?: string; bestBeforeDate?: string
  location: string; status: InventoryLotStatus; notes: string; totalAcquisitionCost?: number; acquisitionCostCurrency?: string; costNotes?: string; createdAt: string; updatedAt: string
}
export type InventoryMovementType = 'Receipt' | 'Consumption' | 'Waste' | 'Sample' | 'Adjustment'
export interface InventoryMovement {
  id: string; inventoryLotId: string; type: InventoryMovementType; quantity: number; unit: InventoryUnit
  reason: string; referenceType?: string; referenceId?: string; notes: string; occurredAt: string; createdAt: string
}

export type LabBatchStatus = 'Planned' | 'In Progress' | 'Completed' | 'Aborted' | 'Archived'
export interface LabBatch { id:string; batchNumber:string; productId:string; formulaId:string; formulaVersionId:string; status:LabBatchStatus; plannedBatchSize:number; plannedBatchUnit:InventoryUnit; startedAt?:string; completedAt?:string; actualYield?:number; yieldUnit?:InventoryUnit; createdAt:string; updatedAt:string; purpose:string; notes:string; summary:string; targetCharacteristics:string }
export type LabBatchLineStatus = 'Pending' | 'Weighed' | 'Skipped'
export interface LabBatchLine { id:string; labBatchId:string; formulaLineId:string; ingredientId:string; ingredientNameSnapshot:string; phase:string; plannedPercentage:number; plannedQuantity:number; actualQuantity?:number; unit:InventoryUnit; variance?:number; notes:string; status:LabBatchLineStatus }
export interface LabBatchAllocation { id:string; labBatchLineId:string; inventoryLotId?:string; quantity:number; unit:InventoryUnit; inventoryMovementId?:string }
export type ProcessStepStatus = 'Pending' | 'Completed' | 'Skipped'
export interface BatchProcessStep { id:string; labBatchId:string; stepNumber:number; instruction:string; status:ProcessStepStatus; completedAt?:string; notes:string }
export interface LabObservation { id:string; labBatchId:string; observationType:string; targetDate?:string; observedAt?:string; appearance:string; texture:string; scent:string; stability:string; packaging:string; notes:string; rating?:number; createdAt:string }
export type TesterStatus = 'Active' | 'Inactive'
export interface Tester { id:string; displayName:string; notes:string; status:TesterStatus; createdAt:string; updatedAt:string }
export type TestQuestionType = 'Numeric Rating' | 'Yes / No' | 'Single Choice' | 'Free Text'
export interface TestQuestion { id:string; prompt:string; type:TestQuestionType; sortOrder:number; choices?:string[] }
export interface TestTemplate { id:string; name:string; description:string; questions:TestQuestion[]; createdAt:string; updatedAt:string }
export type TestSessionStatus = 'Planned' | 'Active' | 'Completed' | 'Archived'
export interface TestSession { id:string; labBatchId:string; testTemplateId:string; name:string; status:TestSessionStatus; createdAt:string; dueDate?:string; completedAt?:string; notes:string }
export interface TestAnswer { questionId:string; value:string | number | boolean }
export interface TestResponse { id:string; testSessionId:string; testerId:string; answers:TestAnswer[]; overallNotes:string; submittedAt:string }

export type ProductionRunStatus = 'Planned' | 'In Progress' | 'Completed' | 'Aborted' | 'Archived'
export interface ProductionRun { id:string; productionRunNumber:string; productId:string; formulaId:string; formulaVersionId:string; status:ProductionRunStatus; plannedBatchSize:number; plannedBatchUnit:InventoryUnit; plannedUnits?:number; actualYield?:number; actualYieldUnit?:InventoryUnit; actualUnitsProduced?:number; startedAt?:string; completedAt?:string; createdAt:string; updatedAt:string; purpose:string; notes:string; summary:string }
export type ProductionRunLineStatus = 'Pending' | 'Weighed' | 'Skipped'
export interface ProductionRunLine { id:string; productionRunId:string; formulaLineId:string; ingredientId:string; ingredientNameSnapshot:string; phase:string; plannedPercentage:number; plannedQuantity:number; actualQuantity?:number; unit:InventoryUnit; variance?:number; notes:string; status:ProductionRunLineStatus }
export interface ProductionRunAllocation { id:string; productionRunLineId:string; inventoryLotId?:string; quantity:number; unit:InventoryUnit; inventoryMovementId?:string; unitCostSnapshot?:number; costCurrencySnapshot?:string }
export interface ProductionProcessStep { id:string; productionRunId:string; stepNumber:number; instruction:string; status:ProcessStepStatus; completedAt?:string; notes:string }
export type CostLineScope = 'ProductionRun' | 'Product' | 'FormulaVersion'
export type CostLineCategory = 'Packaging' | 'Labels' | 'Labour' | 'Freight' | 'Overhead' | 'Equipment' | 'Other'
export interface CostLine { id:string; scope:CostLineScope; referenceId:string; category:CostLineCategory; description:string; amount:number; currency:string; quantity:number; notes:string; createdAt:string; updatedAt:string }

export type PackagingComponentStatus='Active'|'Research'|'Archived'
export interface PackagingComponent { id:string;name:string;category:string;description:string;defaultUnit:InventoryUnit;colour:string;material:string;capacity?:number;capacityUnit?:InventoryUnit;notes:string;status:PackagingComponentStatus;reorderThreshold?:number;createdAt:string;updatedAt:string }
export interface PackagingSupplierProduct { id:string;packagingComponentId:string;supplierName:string;productName:string;supplierSku?:string;packageQuantity:number;packageUnit:InventoryUnit;price:number;currency:string;productUrl?:string;notes:string;isPreferred:boolean;createdAt:string;updatedAt:string }
export type PackagingInventoryLotStatus='Active'|'Quarantined'|'Exhausted'|'Disposed'|'Archived'
export interface PackagingInventoryLot { id:string;packagingComponentId:string;packagingSupplierProductId?:string;internalLotNumber:string;supplierLotNumber?:string;receivedDate:string;openingQuantity:number;unit:InventoryUnit;location:string;status:PackagingInventoryLotStatus;notes:string;totalAcquisitionCost?:number;acquisitionCostCurrency?:string;costNotes?:string;createdAt:string;updatedAt:string }
export type PackagingMovementType='Receipt'|'Consumption'|'Waste'|'Sample'|'Adjustment'
export interface PackagingInventoryMovement { id:string;packagingInventoryLotId:string;type:PackagingMovementType;quantity:number;unit:InventoryUnit;reason:string;referenceType?:string;referenceId?:string;notes:string;occurredAt:string;createdAt:string }
export interface PackagingSpecification { id:string;productId:string;name:string;description:string;createdAt:string;updatedAt:string }
export type PackagingSpecificationStatus='Draft'|'Candidate'|'Approved'|'Retired'
export interface PackagingSpecificationVersion { id:string;packagingSpecificationId:string;version:string;status:PackagingSpecificationStatus;description:string;notes:string;createdAt:string;updatedAt:string;derivedFromVersionId?:string }
export interface PackagingSpecificationLine { id:string;packagingSpecificationVersionId:string;packagingComponentId:string;quantityPerUnit:number;unit:InventoryUnit;sortOrder:number;purpose:string;notes:string }
export interface PackagingAllocation { id:string;finishedGoodsBatchId:string;packagingSpecificationLineId:string;packagingInventoryLotId?:string;quantity:number;unit:InventoryUnit;packagingInventoryMovementId?:string;unitCostSnapshot?:number;costCurrencySnapshot?:string }
export type FinishedGoodsStatus='Active'|'Quarantined'|'Exhausted'|'Archived'
export interface FinishedGoodsBatch { id:string;finishedGoodsBatchNumber:string;productionRunId:string;productId:string;formulaVersionId:string;packagingSpecificationVersionId?:string;status:FinishedGoodsStatus;productionDate:string;initialQuantity:number;unit:InventoryUnit;notes:string;createdAt:string;updatedAt:string;productionCostPerUnitSnapshot?:number;packagingCostSnapshot?:number;costCurrencySnapshot?:string }
export type FinishedGoodsMovementType='ProductionReceipt'|'Sample'|'Tester'|'Sale'|'Waste'|'InternalUse'|'Adjustment'
export interface FinishedGoodsMovement { id:string;finishedGoodsBatchId:string;type:FinishedGoodsMovementType;quantity:number;unit:InventoryUnit;reason:string;referenceType?:string;referenceId?:string;notes:string;occurredAt:string;createdAt:string }

export interface ResponsiblePerson { id:string;legalName:string;organisationName:string;physicalAddress:string;country:string;email:string;phone:string;status:'Draft'|'Active'|'Historical';notes:string;createdAt:string;updatedAt:string }
export type DossierStatus='Draft'|'Evidence Gathering'|'External Review'|'Ready for Internal Release Decision'|'Internally Released'|'Blocked'|'Superseded'|'Archived'
export interface ComplianceCompositionLine { formulaLineId:string;ingredientId:string;ingredientNameSnapshot:string;inciNameSnapshot:string;concentration:number }
export interface ComplianceDossier { id:string;productId:string;formulaVersionId:string;packagingSpecificationVersionId?:string;labelArtworkVersionId?:string;responsiblePersonId?:string;targetMarket:string;targetLanguage:string;status:DossierStatus;internalOwner:string;notes:string;compositionSnapshot:ComplianceCompositionLine[];derivedFromDossierId?:string;createdAt:string;updatedAt:string }
export interface ComplianceDocument { id:string;documentType:string;title:string;version:string;status:string;linkedEntityType:string;linkedEntityId:string;issuedBy:string;author:string;issueDate?:string;reviewDate?:string;expiryDate?:string;fileName?:string;externalReference?:string;externalUrl?:string;notes:string;createdAt:string;updatedAt:string }
export interface RegulatorySource { id:string;title:string;authority:string;sourceType:string;jurisdiction:string;externalUrl:string;publicationDate?:string;effectiveDate?:string;versionOrConsolidationDate?:string;lastReviewedAt?:string;notes:string;status:'Current Review Source'|'Historical'|'Needs Review' }
export type RegulatoryConclusion='Not Reviewed'|'No Issue Identified in Recorded Review'|'Restriction Identified'|'Additional Evidence Required'|'Blocked Pending Review'|'Unknown'
export interface RegulatoryReview { id:string;subjectType:string;subjectId:string;complianceDossierId:string;sourceIds:string[];reviewedAt?:string;reviewedBy:string;conclusion:RegulatoryConclusion;restrictionSummary:string;actionRequired:string;notes:string;createdAt:string;updatedAt:string }
export type EvidenceStatus='Not Started'|'In Progress'|'Evidence Recorded'|'External Review Required'|'External Review Complete'|'Blocked'|'Not Applicable'|'Needs Review'
export interface PifSection { id:string;complianceDossierId:string;area:string;status:EvidenceStatus;documentIds:string[];owner:string;reviewedAt?:string;notes:string;missingItemsSummary:string }
export interface CpsrRecord { id:string;complianceDossierId:string;status:'Not Started'|'Preparing Evidence'|'Sent to Safety Assessor'|'Questions Outstanding'|'Issued'|'Superseded'|'Blocked';assessorName:string;assessorOrganisation:string;credentialDocumentId?:string;cpsrDocumentId?:string;assessedFormulaVersionId:string;assessedPackagingSpecificationVersionId?:string;issuedDate?:string;restrictions:string;reviewNotes:string }
export interface LabelArtworkVersion { id:string;productId:string;formulaVersionId:string;packagingSpecificationVersionId?:string;market:string;language:string;version:string;status:'Draft'|'Internal Review'|'External Review'|'Approved for Internal Release Configuration'|'Superseded'|'Archived';artworkDocumentId?:string;createdAt:string;updatedAt:string;notes:string }
export interface LabelReviewItem { id:string;complianceDossierId:string;item:string;status:'Not Reviewed'|'Present'|'Missing'|'Needs Review'|'Not Applicable';notes:string }
export interface InciDraft { id:string;complianceDossierId:string;version:string;workingText:string;finalTextSnapshot?:string;unresolvedItems:string[];status:'Working Draft'|'Needs Review'|'Reviewed Snapshot';createdAt:string;updatedAt:string }
export interface ComplianceClaim { id:string;productId:string;complianceDossierId?:string;claimText:string;market:string;channel:string;status:'Draft'|'Evidence Missing'|'Evidence Linked'|'Needs Review'|'Reviewed for Internal Use'|'Rejected'|'Superseded';evidenceSummary:string;createdAt:string;updatedAt:string }
export interface ClaimEvidence { id:string;claimId:string;documentId?:string;evidenceType:string;relevanceNotes:string;reviewedBy:string;reviewedAt?:string }
export interface CpnpRecord { id:string;complianceDossierId:string;responsiblePersonId?:string;status:'Not Started'|'Preparing'|'Submitted'|'Confirmation Recorded'|'Needs Update Review'|'Superseded';notificationDate?:string;externalReference?:string;confirmationDocumentId?:string;notes:string;lastReviewedAt?:string }
export interface ReadinessIssue { id:string;complianceDossierId:string;category:string;severity:'Blocking'|'Important'|'Advisory';title:string;description:string;sourceEntityType?:string;sourceEntityId?:string;status:'Open'|'Resolved'|'Accepted for Internal Review'|'Not Applicable';resolvedAt?:string;notes:string }
export interface LaunchPlan { id:string;productId:string;complianceDossierId:string;targetMarket:string;targetLaunchDate:string;status:'Planning'|'Blocked'|'Preparing'|'Ready for Internal Go/No-Go'|'Launched'|'Paused'|'Cancelled';owner:string;notes:string;createdAt:string;updatedAt:string }
export interface LaunchMilestone { id:string;launchPlanId:string;title:string;kind:'Compliance Blocker'|'Commercial Task';status:'Not Started'|'In Progress'|'Complete'|'Blocked';notes:string }
export interface LaunchDecision { id:string;launchPlanId:string;decision:'Go'|'No-Go'|'Conditional Go'|'Deferred';decidedAt:string;decidedBy:string;complianceDossierId:string;unresolvedBlockingIssues:string[];acknowledgedRisks:string;notes:string }
export interface SafetyEffectRecord { id:string;productId:string;finishedGoodsBatchId?:string;reportedAt:string;description:string;reporterReference:string;seriousnessStatus:'Not Assessed'|'Non-Serious'|'Potentially Serious'|'Serious — Externally Assessed';internalReviewStatus:string;externalNotificationReference?:string;correctiveActionNotes:string;createdAt:string;updatedAt:string }

export type BatchStatus = 'Planned' | 'In progress' | 'Observing' | 'Complete'
export interface Batch {
  id: string
  batchNumber: string
  productId: string
  formulaVersion: string
  date: string
  status: BatchStatus
  targetYield: number
  actualYield?: number
  notes: string
  observations: string[]
}

export interface ScentProfile { id: string; name: string; direction: string; notes: string[]; maturity: number }
export interface ScentMaterial { id: string; name: string; family: string; character: string }
export interface Accord { id: string; name: string; materials: string[]; status: string }
export interface Activity { id: string; title: string; detail: string; timestamp: string; type: string }
export interface TestingActivity { id: string; title: string; product: string; date: string; type: string }
export interface ModuleDefinition { path: string; name: string; eyebrow: string; description: string; capabilities: string[] }
