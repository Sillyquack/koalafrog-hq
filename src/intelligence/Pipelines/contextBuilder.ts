import type { ContextEntity, IntelligenceContext, IntelligenceImage, IntelligenceLog, UserPreferences } from '../Shared/models'

export interface IntelligenceContextSource {
  workspace: Readonly<Record<string, unknown>>
  currentModule: string
  relevantEntities?: readonly ContextEntity[]
  historicalEntities?: readonly ContextEntity[]
  relatedImages?: readonly IntelligenceImage[]
  recentLogs?: readonly IntelligenceLog[]
  currentSelections?: Readonly<Record<string, unknown>>
  userPreferences?: Readonly<UserPreferences>
}

function immutableCopy<T>(value: T): Readonly<T> {
  const cloned = structuredClone(value)
  const freeze = (item: unknown): unknown => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item
    for (const child of Object.values(item)) freeze(child)
    return Object.freeze(item)
  }
  return freeze(cloned) as Readonly<T>
}

const copy = <T,>(values: readonly T[] | undefined): readonly T[] => immutableCopy([...(values ?? [])])

export function buildIntelligenceContext(source: IntelligenceContextSource): IntelligenceContext {
  if (!source.currentModule.trim()) throw new Error('Intelligence context requires a current module.')
  return Object.freeze({
    workspace: immutableCopy(source.workspace),
    currentModule: source.currentModule,
    relevantEntities: copy(source.relevantEntities),
    historicalEntities: copy(source.historicalEntities),
    relatedImages: copy(source.relatedImages),
    recentLogs: copy(source.recentLogs),
    currentSelections: immutableCopy(source.currentSelections ?? {}),
    userPreferences: immutableCopy(source.userPreferences ?? {}),
  })
}
