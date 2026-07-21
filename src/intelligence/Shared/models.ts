export type IntelligenceModule = string

export interface EntityReference {
  entityType: string
  entityId: string
  label?: string
}

export interface ContextEntity extends EntityReference {
  data: Readonly<Record<string, unknown>>
}

export interface IntelligenceImage {
  id: string
  uri: string
  capturedAt?: string
  description?: string
}

export interface IntelligenceLog {
  id: string
  occurredAt: string
  message: string
  entity?: EntityReference
}

export interface UserPreferences {
  locale?: string
  units?: Record<string, string>
  [key: string]: unknown
}

export interface IntelligenceContext {
  workspace: Readonly<Record<string, unknown>>
  currentModule: IntelligenceModule
  relevantEntities: readonly ContextEntity[]
  historicalEntities: readonly ContextEntity[]
  relatedImages: readonly IntelligenceImage[]
  recentLogs: readonly IntelligenceLog[]
  currentSelections: Readonly<Record<string, unknown>>
  userPreferences: Readonly<UserPreferences>
}

export type Confidence = number

export interface Observation {
  id: string
  description: string
  confidence: Confidence
  relatedEntities: readonly EntityReference[]
  observedAt: string
  source: string
}

export type InsightSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface Insight {
  id: string
  title: string
  description: string
  confidence: Confidence
  severity: InsightSeverity
  relatedEntities: readonly EntityReference[]
  createdAt: string
  dismissed: boolean
  resolved: boolean
  sourceAgent: string
}

export type RecommendationPriority = 'low' | 'medium' | 'high'

export interface Recommendation {
  id: string
  reason: string
  confidence: Confidence
  priority: RecommendationPriority
  expectedBenefit: string
  supportingObservations: readonly string[]
  accepted: boolean
  dismissed: boolean
  sourceAgent: string
  createdAt: string
}

export interface HistoryPoint {
  timestamp: string
  value: number
}

export interface IntelligenceResult {
  provenance: 'mock' | 'provider' | 'computed'
  summary?: string
  observations?: readonly Observation[]
  insights?: readonly Insight[]
  recommendations?: readonly Recommendation[]
  history?: readonly HistoryPoint[]
}
