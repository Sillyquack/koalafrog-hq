export const intelligenceActionKinds = ['Analyze', 'Recommend', 'Summarize', 'Predict', 'Compare', 'Review', 'Explain'] as const
export type IntelligenceActionKind = typeof intelligenceActionKinds[number]

export interface IntelligenceAction {
  id: string
  label: string
  kind: IntelligenceActionKind
  description?: string
}

export interface ModuleIntelligenceConfiguration {
  module: string
  actions: readonly IntelligenceAction[]
  agentIds: readonly string[]
}
