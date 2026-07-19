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
  targetLaunchDate?: string
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
export interface FormulaPhaseDefinition {code:string;name:string;order:number;targetTemperature?:number;minimumTemperature?:number;maximumTemperature?:number;instructions?:string;notes?:string}
export interface FormulaProcessStep {order:number;title:string;instruction:string;phaseCode?:string;targetTemperature?:number;minimumTemperature?:number;maximumTemperature?:number;durationMinutes?:number;mixingMethod?:string;mixingIntensity?:string;completionCriteria?:string;critical:boolean;operatorNote?:string}
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
  phaseDefinitions?: FormulaPhaseDefinition[]
  manufacturingProcess?: FormulaProcessStep[]
}

export interface FormulaLine {
  id: string
  formulaVersionId: string
  ingredientId: string
  percentage: number
  phase: string
  sortOrder: number
  notes: string
  formulationRole?: string
}

export type ProductStudioType='beard_oil'|'beard_butter'|'natural_deodorant'
export type ProductStudioIntent='make_today'|'design'
export interface ProductStudioSelection {ingredientId:string;role:string;essential:boolean}
export interface ProductStudioConcept {
  id:string;name:string;productType:ProductStudioType;intentMode:ProductStudioIntent;desiredProperties:string[]
  selectedIngredients:ProductStudioSelection[];scentDirections:string[];candidateSubstitutes:Record<string,string[]>
  notes:string;analysis:Record<string,unknown>;generatedProductId?:string;generatedFormulaId?:string
  generatedFormulaVersionId?:string;procurementPlanId?:string;createdAt:string;updatedAt:string
}

export interface FormulaState {
  ingredientKnowledgeProfiles: IngredientKnowledgeProfile[]
  ingredientKnowledgeRoles: IngredientKnowledgeRole[]
  ingredientKnowledgeCompatibility: IngredientKnowledgeCompatibility[]
  ingredientKnowledgeEvidence: IngredientKnowledgeEvidence[]
  productStudioConcepts:ProductStudioConcept[]
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

export type KnowledgeState = 'known'|'unknown'|'not_applicable'|'review_required'
export type KnowledgeConfidence = 'verified'|'supported'|'observed'|'assumed'|'unknown'|'conflicting'
export type EvidenceSourceType = 'supplier_document'|'scientific_literature'|'patent'|'regulatory_document'|'internal_lab'|'internal_observation'|'external_observation'|'user_note'|'unknown'
export type KnowledgeProvenance = 'reference'|'supplier_specific'|'internal'|'user'
export interface KnowledgeValue<T>{state:KnowledgeState;value?:T;sourceReference?:string;confidence:KnowledgeConfidence;notes?:string;unit?:string;lowerBound?:number;upperBound?:number}
export interface MeasuredKnowledgeValue extends KnowledgeValue<number>{unit?:string;lowerBound?:number;upperBound?:number}
export type IngredientPhysicalForm='liquid'|'semi_solid'|'solid'|'powder'|'wax'|'paste'|'granules'|'unknown'
export type IngredientKnowledgeRoleName='structuring_wax'|'soft_structurant'|'liquid_emollient'|'occlusive'|'absorbent_powder'|'deodorant_active'|'slip_modifier'|'texture_modifier'|'film_former'|'antioxidant'|'fragrance'|'preservative'|'solvent'|'humectant'|'surfactant'|'emulsifier'|'active'|'colourant'|'other'
export type IngredientKnowledgeRoleLevel='primary'|'secondary'|'optional'|'context_dependent'
export type CompatibilityRating='excellent'|'good'|'acceptable'|'avoid'|'unknown'|'review_required'
export type CompatibilityTargetType='ingredient'|'formulation_archetype'|'product_template'|'packaging_material'
export type SensoryDimension='slip'|'drag'|'grip'|'greasy_feel'|'powder_feel'|'gloss'|'dryness'|'richness'|'spreadability'|'absorption'|'occlusion'|'film_forming'|'payoff'|'tackiness'|'residue'
export type PredictionInputName='hardness_contribution'|'slip_contribution'|'gloss_contribution'|'powder_contribution'|'cooling_contribution'|'payoff_contribution'|'residue_contribution'|'oxidation_contribution'|'drag_contribution'|'structure_contribution'
export interface IngredientKnowledgeIdentity {commercialName:KnowledgeValue<string>;inci:KnowledgeValue<string>;casNumber:KnowledgeValue<string>;ecNumber:KnowledgeValue<string>;botanicalSource:KnowledgeValue<string>;plantPart:KnowledgeValue<string>;extractionMethod:KnowledgeValue<string>;processingStatus:KnowledgeValue<string>;origin:KnowledgeValue<string>;supplier:KnowledgeValue<string>;supplierSku:KnowledgeValue<string>;supplierProductRevision:KnowledgeValue<string>;documentRevision:KnowledgeValue<string>;documentationStatus:KnowledgeValue<string>;veganStatus:KnowledgeValue<boolean>;organicStatus:KnowledgeValue<boolean>;cosmosStatus:KnowledgeValue<string>;rspoStatus:KnowledgeValue<string>}
export interface IngredientKnowledgePhysicalProperties {physicalForm:KnowledgeValue<IngredientPhysicalForm>;density:MeasuredKnowledgeValue;meltingRange:MeasuredKnowledgeValue;softeningRange:MeasuredKnowledgeValue;flashPoint:MeasuredKnowledgeValue;heatSensitivity:KnowledgeValue<string>;oxidationSensitivity:KnowledgeValue<string>;volatility:KnowledgeValue<string>;waterSolubility:KnowledgeValue<string>;oilSolubility:KnowledgeValue<string>;alcoholSolubility:KnowledgeValue<string>;colour:KnowledgeValue<string>;odour:KnowledgeValue<string>;particleForm:KnowledgeValue<string>;hygroscopicity:KnowledgeValue<string>}
export type IngredientKnowledgeSensory=Record<SensoryDimension,KnowledgeValue<number>>
export type IngredientKnowledgePredictionInputs=Record<PredictionInputName,KnowledgeValue<number>>
export interface IngredientKnowledgeProfile {id:string;ingredientId:string;identity:IngredientKnowledgeIdentity;physicalProperties:IngredientKnowledgePhysicalProperties;sensoryProfile:IngredientKnowledgeSensory;predictionInputs:IngredientKnowledgePredictionInputs;createdAt:string;updatedAt:string;lastEditedSource?:KnowledgeProvenance}
export interface IngredientKnowledgeRole {id:string;ingredientKnowledgeProfileId:string;role:IngredientKnowledgeRoleName;level:IngredientKnowledgeRoleLevel;context:string;evidenceIds:string[];confidence:KnowledgeConfidence;notes:string;createdAt:string;updatedAt:string}
export interface IngredientKnowledgeCompatibility {id:string;ingredientKnowledgeProfileId:string;targetType:CompatibilityTargetType;targetId?:string;targetLabel:string;context:string;rating:CompatibilityRating;evidenceIds:string[];confidence:KnowledgeConfidence;notes:string;createdAt:string;updatedAt:string}
export interface IngredientKnowledgeEvidence {id:string;ingredientKnowledgeProfileId:string;sourceType:EvidenceSourceType;provenance:KnowledgeProvenance;title:string;documentId?:string;documentRevision?:string;externalUrl?:string;evidenceDate?:string;authorOrOrganisation?:string;summary:string;notes:string;confidence:KnowledgeConfidence;createdAt:string;updatedAt:string}

export type IngredientStatus = 'Active' | 'Research' | 'Archived'
export type InventoryUnit = 'mg' | 'g' | 'kg' | 'ml' | 'L' | 'pcs'
export interface Ingredient {
  id: string
  commonName: string
  inciName: string
  category: string
  functions: string[]
  cosingFunctions?: string[]
  cosingVerificationStatus?: 'unverified'|'verified_from_cosing'|'needs_review'
  cosingVerifiedAt?: string
  cosingSourceReference?: string
  referenceEntryId?: string
  adoptedReferenceVersion?: number
  adoptedReferenceSnapshot?: Record<string,unknown>
  referenceAdoptionKey?: string
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
  notes: string; operationalNotes?:string; verificationNotes?:string; isPreferred: boolean; supplierId?:string
  grade?:string; supplierGrade?:string; declaredInci?:string; categorySnapshot?:string; defaultInventoryUnit?:InventoryUnit
  cosingFunctionsSnapshot?:string[]; researchProfileSnapshot?:string; referenceEntryId?:string
  countryCode?:string; origin?:string; extractionMethod?:string; processingMethod?:string
  shelfLifeMonths?:number; storageRequirements?:string; productStatus?:'research'|'reviewing'|'verified_operational'|'inactive'|'discontinued'
  verification?:SupplierProductVerification
  createdAt: string; updatedAt: string
}
export type OperationalReviewState='unknown'|'needs_review'|'reviewed'|'not_applicable'
export interface SupplierProductVerification {inci:OperationalReviewState;supplierSpecification:OperationalReviewState;sds:OperationalReviewState;coa:OperationalReviewState;allergenInformation:OperationalReviewState;shelfLife:OperationalReviewState;origin:OperationalReviewState;extractionMethod:OperationalReviewState;processingMethod:OperationalReviewState;ifra:OperationalReviewState;cosing:OperationalReviewState}
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
export interface LabBatch { id:string; batchNumber:string; productId:string; formulaId:string; formulaVersionId:string; status:LabBatchStatus; plannedBatchSize:number; plannedBatchUnit:InventoryUnit; startedAt?:string; completedAt?:string; actualYield?:number; yieldUnit?:InventoryUnit; fillCount?:number;packagingUsed?:string;deviations?:string;finalTextureObservations?:string;createdAt:string; updatedAt:string; purpose:string; notes:string; summary:string; targetCharacteristics:string }
export type LabBatchLineStatus = 'Pending' | 'Weighed' | 'Skipped'
export interface LabBatchLine { id:string; labBatchId:string; formulaLineId:string; ingredientId:string; ingredientNameSnapshot:string; phase:string; plannedPercentage:number; plannedQuantity:number; actualQuantity?:number; unit:InventoryUnit; variance?:number; notes:string; status:LabBatchLineStatus }
export interface LabBatchAllocation { id:string; labBatchLineId:string; inventoryLotId?:string; quantity:number; unit:InventoryUnit; inventoryMovementId?:string }
export type ProcessStepStatus = 'Pending' | 'Completed' | 'Skipped'
export interface BatchProcessStep {id:string;labBatchId:string;stepNumber:number;title?:string;instruction:string;phaseCode?:string;targetTemperature?:number;minimumTemperature?:number;maximumTemperature?:number;actualTemperature?:number;durationMinutes?:number;mixingMethod?:string;mixingIntensity?:string;completionCriteria?:string;critical?:boolean;operatorNote?:string;status:ProcessStepStatus;completedAt?:string;notes:string}
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
export interface PackagingSupplierProduct { id:string;packagingComponentId:string;supplierName:string;productName:string;supplierSku?:string;packageQuantity:number;packageUnit:InventoryUnit;price:number;currency:string;productUrl?:string;notes:string;isPreferred:boolean;supplierId?:string;createdAt:string;updatedAt:string }
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
