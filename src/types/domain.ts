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
}

export interface Ingredient {
  id: string
  commonName: string
  inciName: string
  category: string
  function: string
  supplier: string
  quantityOnHand: number
  unit: string
  reorderLevel: number
  cost: number
  notes: string
}

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
