export type ProductStage = 'Idea' | 'Research' | 'Formulation' | 'Testing' | 'Validation' | 'Compliance' | 'Production Ready' | 'Launched'
export type ProductStatus = 'Active' | 'On hold' | 'Archived'

export interface Product {
  id: string
  name: string
  category: string
  status: ProductStatus
  developmentStage: ProductStage
  description: string
  currentFormulaVersion: string
  scentProfile: string
  targetLaunchDate: string
  createdAt: string
  updatedAt: string
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
